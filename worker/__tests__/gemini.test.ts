import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEMINI_MODEL, buildChatRequest, buildJsonRequest, geminiChat, geminiCheck, geminiJson, geminiModel, mapGeminiHttpError,
  parseGeminiResponse, toGeminiSchema, type FetchLike,
} from '../gemini'
import { BridgeError, type ChatRequest, type JsonRequest } from '../guard'

const okBody = (text: string, finishReason = 'STOP') => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }],
  modelVersion: 'gemini-3.8-flash',
})

// Exactly what Google returns for a bad key (captured from the live API with a placeholder key).
const badKeyBody = {
  error: {
    code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
  },
}

function caught(fn: () => unknown): BridgeError {
  try { fn() } catch (e) { if (e instanceof BridgeError) return e }
  throw new Error('expected a BridgeError')
}

describe('geminiModel', () => {
  it('falls back to the default for empty or odd values', () => {
    expect(geminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL)
    expect(geminiModel('  ')).toBe(DEFAULT_GEMINI_MODEL)
    expect(geminiModel('../../v1/files')).toBe(DEFAULT_GEMINI_MODEL)
    expect(geminiModel('models/gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite')
  })
})

describe('toGeminiSchema', () => {
  it('keeps the supported subset of a real app schema untouched', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['blood', 'other'] },
        report_date: { type: ['string', 'null'], description: 'YYYY-MM-DD as printed, or null' },
        markers: { type: 'array', minItems: 0, maxItems: 40, items: { type: 'object', properties: { value: { type: ['number', 'null'] } }, required: ['value'], additionalProperties: false } },
      },
      required: ['kind', 'report_date', 'markers'],
      additionalProperties: false,
    }
    expect(toGeminiSchema(schema)).toEqual(schema)
  })

  it('drops unsupported keywords at every level and does not mutate the input', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      default: {},
      examples: [{}],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-z]+$', default: 'x' },
        when: { type: 'string', format: 'date' },
        email: { type: 'string', format: 'email' },
        score: { type: 'number', minimum: 0, maximum: 1, exclusiveMinimum: 0, multipleOf: 0.1 },
        tags: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 2 } },
      },
      required: ['name', 'ghost'],
      patternProperties: { '^x-': { type: 'string' } },
      if: { properties: {} },
    }
    const copy = structuredClone(schema)
    expect(toGeminiSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        when: { type: 'string', format: 'date' },
        email: { type: 'string' },
        score: { type: 'number', minimum: 0, maximum: 1 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    })
    expect(schema).toEqual(copy)
  })

  it('turns const into an enum, filters enum values, and handles anyOf / $ref / $defs', () => {
    expect(toGeminiSchema({ const: 'fixed' })).toEqual({ enum: ['fixed'] })
    expect(toGeminiSchema({ type: ['string', 'null'], enum: ['a', null, 2, true] })).toEqual({ type: ['string', 'null'], enum: ['a', 2] })
    expect(toGeminiSchema({ enum: [null] })).toEqual({})
    expect(toGeminiSchema({
      $defs: { node: { type: 'object', properties: { next: { $ref: '#/$defs/node', description: 'dropped next to $ref' } }, not: {} } },
      anyOf: [{ type: 'string', pattern: 'x' }, { $ref: '#/$defs/node' }],
    })).toEqual({
      $defs: { node: { type: 'object', properties: { next: { $ref: '#/$defs/node' } } } },
      anyOf: [{ type: 'string' }, { $ref: '#/$defs/node' }],
    })
  })

  it('survives junk and runaway nesting', () => {
    expect(toGeminiSchema(null)).toEqual({})
    expect(toGeminiSchema(true)).toEqual({})
    expect(toGeminiSchema({ type: 'object', properties: 'nope', items: 3, required: 'x' })).toEqual({ type: 'object' })
    let deep: Record<string, unknown> = { type: 'string' }
    for (let i = 0; i < 200; i++) deep = { type: 'array', items: deep }
    expect(() => toGeminiSchema(deep)).not.toThrow()
  })
})

describe('request builders', () => {
  const chat: ChatRequest = {
    system: 'You are the coach.',
    turns: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'what is this?' }],
    attachments: [{ base64: 'QUJD', mediaType: 'image/jpeg' }],
  }
  const json: JsonRequest = {
    system: 'Extract.',
    prompt: 'Read the report.',
    schema: { type: 'object', properties: { a: { type: 'string', minLength: 1 } }, required: ['a'], additionalProperties: false },
    attachments: [{ base64: 'UERG', mediaType: 'application/pdf', name: 'report' }],
  }

  it('maps turns to user/model contents and puts files on the last message', () => {
    const body = buildChatRequest(chat, 'gemini-3.8-flash')
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are the coach.' }] })
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents[2].parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }, { text: 'what is this?' }])
    expect(body.generationConfig).toEqual({ maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'LOW' } })
  })

  it('leaves the thinking level off for models before Gemini 3 and in the fallback', () => {
    expect(buildChatRequest(chat, 'gemini-2.5-flash').generationConfig).toEqual({ maxOutputTokens: 2048 })
    expect(buildChatRequest(chat, 'gemini-3.8-flash', false).generationConfig).toEqual({ maxOutputTokens: 2048 })
    expect(buildChatRequest({ ...chat, system: ' ' }, 'gemini-3.8-flash').systemInstruction).toBeUndefined()
  })

  it('asks for JSON with the adapted schema, capped at 8192 tokens', () => {
    const body = buildJsonRequest(json, 'gemini-3.8-flash', true)
    expect(body.contents).toEqual([{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'UERG' } }, { text: 'Read the report.\n\nReturn the JSON object only.' }] }])
    expect(body.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false },
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'LOW' },
    })
  })

  it('falls back to JSON mode with the schema written into the prompt', () => {
    const body = buildJsonRequest(json, 'gemini-3.8-flash', false)
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', maxOutputTokens: 8192 })
    expect(body.contents[0].parts.at(-1)?.text).toContain(JSON.stringify(json.schema))
  })
})

describe('parseGeminiResponse', () => {
  it('joins text parts and skips thought parts', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Hello ' }, { text: 'there' }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' }
    expect(parseGeminiResponse(body)).toEqual({ text: 'Hello there', model: 'gemini-3.8-flash' })
  })

  it('reports a blocked prompt as a refusal', () => {
    const e = caught(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }))
    expect([e.kind, e.status]).toEqual(['refusal', 422])
    expect(caught(() => parseGeminiResponse({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' }, candidates: [] })).kind).toBe('refusal')
  })

  it('reports a filtered candidate as a refusal', () => {
    for (const reason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']) {
      expect(caught(() => parseGeminiResponse({ candidates: [{ finishReason: reason }] })).kind).toBe('refusal')
    }
  })

  it('reports MAX_TOKENS clearly, unless partial chat text is acceptable', () => {
    const e = caught(() => parseGeminiResponse(okBody('{"a":', 'MAX_TOKENS')))
    expect(e.kind).toBe('failed')
    expect(e.message).toMatch(/cut off/)
    expect(parseGeminiResponse(okBody('Half an answer', 'MAX_TOKENS'), { partialOk: true }).text).toBe('Half an answer')
    // Thinking used the whole budget: nothing to show, so it is still an error.
    expect(caught(() => parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] }, { partialOk: true })).message).toMatch(/cut off/)
  })

  it('reports empty and malformed bodies', () => {
    expect(caught(() => parseGeminiResponse({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] })).message).toMatch(/empty/)
    expect(caught(() => parseGeminiResponse(null)).kind).toBe('failed')
    expect(caught(() => parseGeminiResponse('<html>')).kind).toBe('failed')
  })
})

describe('mapGeminiHttpError', () => {
  it('maps statuses to kinds', () => {
    expect(mapGeminiHttpError(400, badKeyBody).kind).toBe('auth')
    expect(mapGeminiHttpError(401, null).kind).toBe('auth')
    expect(mapGeminiHttpError(403, { error: { status: 'PERMISSION_DENIED' } }).kind).toBe('auth')
    expect(mapGeminiHttpError(429, null).kind).toBe('busy')
    expect(mapGeminiHttpError(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad schema' } }).kind).toBe('failed')
    expect(mapGeminiHttpError(404, null).message).toMatch(/COACH_GEMINI_MODEL/)
    expect(mapGeminiHttpError(500, null).kind).toBe('failed')
    expect(mapGeminiHttpError(503, null).kind).toBe('failed')
    expect(mapGeminiHttpError(504, null).kind).toBe('timeout')
  })
  it('never forwards upstream text', () => {
    const e = mapGeminiHttpError(400, { error: { message: 'SECRET-UPSTREAM-DETAIL' } })
    expect(e.message).not.toContain('SECRET-UPSTREAM-DETAIL')
  })
})

describe('transport', () => {
  const chat: ChatRequest = { system: 's', turns: [{ role: 'user', content: 'hi' }], attachments: [] }
  const json: JsonRequest = { system: 's', prompt: 'p', schema: { type: 'object' }, attachments: [] }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  function recorder(responses: Response[]): { fetcher: FetchLike; calls: { url: string; init: RequestInit }[] } {
    const calls: { url: string; init: RequestInit }[] = []
    return { calls, fetcher: async (url, init) => { calls.push({ url, init: init ?? {} }); return responses.shift() ?? reply(500, null) } }
  }

  it('posts to generateContent with the key in a header, never in the URL', async () => {
    const { fetcher, calls } = recorder([reply(200, okBody('Hello'))])
    expect(await geminiChat('KEY-123', 'gemini-3.8-flash', chat, fetcher)).toEqual({ text: 'Hello', model: 'gemini-3.8-flash' })
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect(calls[0].url).not.toContain('KEY-123')
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY-123')
    expect(calls[0].init.method).toBe('POST')
  })

  it('retries a rejected schema once in plain JSON mode', async () => {
    const { fetcher, calls } = recorder([reply(400, { error: { status: 'INVALID_ARGUMENT' } }), reply(200, okBody('{"a":1}'))])
    expect((await geminiJson('k', 'gemini-3.8-flash', json, fetcher)).text).toBe('{"a":1}')
    expect(calls).toHaveLength(2)
    expect(JSON.parse(String(calls[0].init.body)).generationConfig.responseJsonSchema).toBeDefined()
    expect(JSON.parse(String(calls[1].init.body)).generationConfig.responseJsonSchema).toBeUndefined()
  })

  it('does not retry a bad key', async () => {
    const { fetcher, calls } = recorder([reply(400, badKeyBody)])
    await expect(geminiJson('k', 'gemini-3.8-flash', json, fetcher)).rejects.toMatchObject({ kind: 'auth' })
    expect(calls).toHaveLength(1)
  })

  it('maps 429 to busy and network failures to failed', async () => {
    await expect(geminiChat('k', 'm', chat, recorder([reply(429, null)]).fetcher)).rejects.toMatchObject({ kind: 'busy', status: 429 })
    await expect(geminiChat('k', 'm', chat, async () => { throw new TypeError('fetch failed') })).rejects.toMatchObject({ kind: 'failed' })
    await expect(geminiChat('k', 'm', chat, async () => { throw new DOMException('timed out', 'TimeoutError') })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('checks the key with a free models.get call', async () => {
    const { fetcher, calls } = recorder([reply(200, { name: 'models/gemini-3.8-flash' })])
    await geminiCheck('k', 'gemini-3.8-flash', fetcher)
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash')
    expect(calls[0].init.method).toBe('GET')
    await expect(geminiCheck('k', 'gemini-3.8-flash', recorder([reply(400, badKeyBody)]).fetcher)).rejects.toMatchObject({ kind: 'auth' })
  })
})
