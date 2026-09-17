import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEAL_RECOGNITION_SCHEMA } from '../anthropic'
import {
  DEFAULT_GEMINI_MODEL,
  GeminiProvider,
  buildChatRequest,
  buildJsonRequest,
  buildPlainJsonRequest,
  geminiUrl,
  mapGeminiError,
  parseGeminiResponse,
  supportsThinkingLevel,
  toGeminiMimeType,
  toGeminiSchema,
} from '../gemini'
import { AIError, type JsonRequest } from '../types'

// No live calls: fetch is always a stub. 'test-key' is a placeholder, not a credential.
const KEY = 'test-key'

const okBody = (text: string, finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }] })

function stubFetch(...replies: { status: number; body: unknown }[]) {
  const fn = vi.fn()
  for (const r of replies) {
    fn.mockResolvedValueOnce({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

function sent(fn: ReturnType<typeof vi.fn>, call = 0): { url: string; init: RequestInit; body: Record<string, any> } {
  const [url, init] = fn.mock.calls[call] as [string, RequestInit]
  return { url, init, body: JSON.parse(init.body as string) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('geminiUrl', () => {
  it('targets v1beta generateContent and never carries the key', () => {
    expect(geminiUrl('gemini-3.8-flash')).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect(geminiUrl('models/gemini-3.8-flash')).toBe(geminiUrl('gemini-3.8-flash'))
    expect(geminiUrl('gemini-3.8-flash')).not.toMatch(/key=/)
  })

  it('escapes a hand-typed model name so it cannot change the path', () => {
    expect(geminiUrl('x/../../evil?a=b')).toContain('/models/x%2F..%2F..%2Fevil%3Fa%3Db:generateContent')
  })
})

describe('toGeminiSchema', () => {
  it('drops additionalProperties and other unsupported keywords at every depth', () => {
    const out = toGeminiSchema(MEAL_RECOGNITION_SCHEMA) as any
    expect(JSON.stringify(out)).not.toContain('additionalProperties')
    expect(out.type).toBe('object')
    expect(out.required).toEqual(['items', 'overall_confidence', 'notes'])
    expect(out.properties.items.items.properties.food_name).toEqual({ type: 'string', description: expect.any(String) })
    expect(out.properties.items.items.required).toContain('kcal')
  })

  it('keeps supported keywords, nullable type arrays and enums; drops pattern, default, const, $schema', () => {
    const out = toGeminiSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        date: { type: ['string', 'null'], pattern: '^\\d{4}', format: 'date', default: null },
        kind: { type: 'string', enum: ['a', 'b'], const: 'a' },
        list: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true, items: { type: 'number', minimum: 0, maximum: 9, multipleOf: 1 } },
        either: { anyOf: [{ type: 'string', minLength: 2 }, { type: 'null' }] },
      },
      required: ['kind'],
    })
    expect(out).toEqual({
      type: 'object',
      properties: {
        date: { type: ['string', 'null'], format: 'date' },
        kind: { type: 'string', enum: ['a', 'b'] },
        list: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'number', minimum: 0, maximum: 9 } },
        either: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['kind'],
    })
  })

  it('never mistakes a property NAME for a keyword', () => {
    const out = toGeminiSchema({ type: 'object', properties: { pattern: { type: 'string' }, default: { type: 'number' }, additionalProperties: { type: 'boolean' } } }) as any
    expect(Object.keys(out.properties)).toEqual(['pattern', 'default', 'additionalProperties'])
  })

  it('keeps a schema-valued additionalProperties (a dictionary) and leaves non-objects alone', () => {
    expect(toGeminiSchema({ type: 'object', additionalProperties: { type: 'number', default: 1 } })).toEqual({ type: 'object', additionalProperties: { type: 'number' } })
    expect(toGeminiSchema(null)).toBeNull()
    expect(toGeminiSchema('x')).toBe('x')
  })
})

describe('request builders', () => {
  it('chat: system instruction, user/model roles, leading assistant and empty turns dropped', () => {
    const req = buildChatRequest('You are the coach.', [
      { role: 'assistant', content: 'Welcome back.' },
      { role: 'user', content: 'How am I doing?' },
      { role: 'assistant', content: 'Well.' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'And sleep?' },
    ])
    expect(req.systemInstruction).toEqual({ parts: [{ text: 'You are the coach.' }] })
    expect(req.contents).toEqual([
      { role: 'user', parts: [{ text: 'How am I doing?' }] },
      { role: 'model', parts: [{ text: 'Well.' }] },
      { role: 'user', parts: [{ text: 'And sleep?' }] },
    ])
    expect(req.generationConfig).toEqual({ maxOutputTokens: 8192 })
  })

  it('chat: nothing to send is an AIError, not a request', () => {
    expect(() => buildChatRequest('sys', [{ role: 'assistant', content: 'hi' }])).toThrowError(AIError)
    expect(() => buildChatRequest('sys', [])).toThrowError(/Nothing to send/)
  })

  const JSON_REQ: JsonRequest = {
    system: 'Extract.',
    prompt: 'Read this report.',
    schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
    attachments: [
      { base64: 'data:application/pdf;base64,JVBERi0=', mediaType: 'application/pdf', name: 'report.pdf' },
      { base64: 'aGVsbG8=', mediaType: 'image/jpg' },
    ],
  }

  it('json: attachments become inlineData parts (raw base64, fixed mime type) ahead of the prompt', () => {
    const req = buildJsonRequest(JSON_REQ)
    expect(req.contents).toHaveLength(1)
    expect(req.contents[0].role).toBe('user')
    expect(req.contents[0].parts).toEqual([
      { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } },
      { text: 'Read this report.\n\nReturn the JSON object only.' },
    ])
  })

  it('json: asks for application/json with the adapted schema', () => {
    const req = buildJsonRequest(JSON_REQ)
    expect(req.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
      maxOutputTokens: 16384,
    })
    expect(buildJsonRequest(JSON_REQ, { maxOutputTokens: 8192, thinkingLevel: 'LOW' }).generationConfig).toMatchObject({
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'LOW' },
    })
  })

  it('plain fallback: no format options at all, the schema rides in the prompt', () => {
    const req = buildPlainJsonRequest(JSON_REQ)
    expect(req.generationConfig).toEqual({ maxOutputTokens: 16384 })
    const text = req.contents[0].parts[2].text ?? ''
    expect(text).toContain('ONLY one JSON object')
    expect(text).toContain(JSON.stringify(JSON_REQ.schema))
    expect(req.contents[0].parts).toHaveLength(3)
  })

  it('helpers', () => {
    expect(toGeminiMimeType(' IMAGE/JPG ')).toBe('image/jpeg')
    expect(toGeminiMimeType('image/heic')).toBe('image/heic')
    expect(toGeminiMimeType('')).toBe('image/jpeg')
    expect(supportsThinkingLevel('gemini-3.8-flash')).toBe(true)
    expect(supportsThinkingLevel('models/gemini-3-flash-preview')).toBe(true)
    expect(supportsThinkingLevel('gemini-2.5-flash')).toBe(false)
    expect(supportsThinkingLevel('gemini-flash-latest')).toBe(false)
  })
})

describe('parseGeminiResponse', () => {
  it('joins the text parts of the first candidate and skips thought parts', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }] }, finishReason: 'STOP' }] }
    expect(parseGeminiResponse(body)).toBe('{"a":1}')
  })

  it('blocked prompt → refusal', () => {
    const err = (() => { try { parseGeminiResponse({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }) } catch (e) { return e } })() as AIError
    expect(err).toBeInstanceOf(AIError)
    expect(err.kind).toBe('refusal')
    expect(err.message).toMatch(/prohibited content/)
  })

  it('finishReason SAFETY (and the other filtered reasons) → refusal', () => {
    for (const finishReason of ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']) {
      const err = (() => { try { parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason }] }) } catch (e) { return e } })() as AIError
      expect(err.kind).toBe('refusal')
    }
  })

  it('MAX_TOKENS → a clear cut-off error, with or without partial text', () => {
    expect(() => parseGeminiResponse(okBody('{"items":[', 'MAX_TOKENS'))).toThrowError(/cut off/)
    expect(() => parseGeminiResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toThrowError(/cut off/)
  })

  it('empty or malformed bodies → AIError(unknown)', () => {
    for (const body of [null, {}, { candidates: [] }, { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }, { candidates: [{ content: { parts: [{ text: '  ' }] } }] }]) {
      const err = (() => { try { parseGeminiResponse(body) } catch (e) { return e } })() as AIError
      expect(err).toBeInstanceOf(AIError)
      expect(err.kind).toBe('unknown')
      expect(err.message).toMatch(/empty reply/)
    }
  })
})

describe('mapGeminiError', () => {
  const invalidKey = { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }

  it('400 API_KEY_INVALID, 401 and 403 → auth', () => {
    expect(mapGeminiError(400, invalidKey).kind).toBe('auth')
    expect(mapGeminiError(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }).kind).toBe('auth')
    expect(mapGeminiError(401, {}).kind).toBe('auth')
    const denied = mapGeminiError(403, { error: { code: 403, message: 'Method doesn\'t allow unregistered callers.', status: 'PERMISSION_DENIED' } })
    expect(denied.kind).toBe('auth')
    expect(denied.message).toContain('unregistered callers')
  })

  it('429 → rate_limit, 5xx → network, other 400 → unknown with Google\'s reason, 404 → model hint', () => {
    expect(mapGeminiError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).kind).toBe('rate_limit')
    expect(mapGeminiError(503, null).kind).toBe('network')
    const bad = mapGeminiError(400, { error: { message: 'Invalid JSON payload received.' } })
    expect(bad.kind).toBe('unknown')
    expect(bad.message).toContain('Invalid JSON payload received.')
    expect(mapGeminiError(404, { error: { message: 'models/nope is not found' } }).message).toMatch(/model name/)
  })
})

describe('GeminiProvider', () => {
  it('is configured only with a key; defaults the model', () => {
    expect(new GeminiProvider('').isConfigured()).toBe(false)
    expect(new GeminiProvider('  ').isConfigured()).toBe(false)
    const p = new GeminiProvider(` ${KEY} `, '  ')
    expect(p.isConfigured()).toBe(true)
    expect(p.id).toBe('gemini')
    expect(p.model).toBe(DEFAULT_GEMINI_MODEL)
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash')
  })

  it('throws not_configured without touching the network', async () => {
    const fetchFn = stubFetch()
    const err = await new GeminiProvider('').coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
    expect((err as AIError).kind).toBe('not_configured')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('coachChat: POSTs with the key in the x-goog-api-key header only', async () => {
    const fetchFn = stubFetch({ status: 200, body: okBody(' ready ') })
    const reply = await new GeminiProvider(KEY).coachChat('Be brief.', [{ role: 'user', content: 'Reply with one word: ready' }])
    expect(reply).toBe('ready')
    const { url, init, body } = sent(fetchFn)
    expect(url).toBe(geminiUrl(DEFAULT_GEMINI_MODEL))
    expect(url).not.toContain(KEY)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': KEY })
    expect(init.body as string).not.toContain(KEY)
    expect(body.systemInstruction.parts[0].text).toBe('Be brief.')
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Reply with one word: ready' }] })
  })

  it('recognizeMeal: image + shared meal prompt and schema in, parsed MealRecognition out', async () => {
    const meal = { items: [{ food_name: 'Chicken rice', estimated_quantity_g: 350, serving_description: '1 plate', kcal: 600, protein_g: 30, carbs_g: 70, fat_g: 20, confidence_0_1: 0.7, uncertainty_reason: 'oil', source_hint: 'SG hawker' }], overall_confidence: 0.7, notes: 'ok' }
    const fetchFn = stubFetch({ status: 200, body: okBody(JSON.stringify(meal)) })
    const r = await new GeminiProvider(KEY).recognizeMeal({ base64: 'data:image/jpeg;base64,aGVsbG8=', mediaType: 'image/jpeg' }, { mealType: 'lunch', hint: 'no skin' })
    expect(r.items[0].food_name).toBe('Chicken rice')
    expect(r.overall_confidence).toBe(0.7)
    const { body } = sent(fetchFn)
    expect(body.systemInstruction.parts[0].text).toContain('estimate nutrition from a single meal photo')
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'aGVsbG8=' } })
    expect(body.contents[0].parts[1].text).toContain('Meal type: lunch.')
    expect(body.contents[0].parts[1].text).toContain('User note: no skin')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseJsonSchema.required).toEqual(['items', 'overall_confidence', 'notes'])
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' })
  })

  it('recognizeMeal: no thinkingLevel for a pre-Gemini-3 model', async () => {
    const fetchFn = stubFetch({ status: 200, body: okBody('{"items":[],"overall_confidence":0.2,"notes":"No food visible"}') })
    await new GeminiProvider(KEY, 'gemini-2.5-flash').recognizeMeal({ base64: 'aGVsbG8=', mediaType: 'image/png' }, {})
    expect(sent(fetchFn).url).toContain('/models/gemini-2.5-flash:generateContent')
    expect(sent(fetchFn).body.generationConfig.thinkingConfig).toBeUndefined()
  })

  it('completeJson: returns the parsed object', async () => {
    stubFetch({ status: 200, body: okBody('{"title":"Lipid panel"}') })
    const data = await new GeminiProvider(KEY).completeJson({ system: 's', prompt: 'p', schema: { type: 'object' } })
    expect(data).toEqual({ title: 'Lipid panel' })
  })

  it('completeJson: a rejected structured request (400) is retried once as a plain prompt-only request', async () => {
    const fetchFn = stubFetch(
      { status: 400, body: { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"', status: 'INVALID_ARGUMENT' } } },
      { status: 200, body: okBody('```json\n{"title":"ok"}\n```') },
    )
    const data = await new GeminiProvider(KEY).completeJson({ system: 's', prompt: 'p', schema: { type: 'object', properties: { title: { type: 'string' } } } })
    expect(data).toEqual({ title: 'ok' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sent(fetchFn, 0).body.generationConfig.responseJsonSchema).toBeDefined()
    expect(sent(fetchFn, 1).body.generationConfig).toEqual({ maxOutputTokens: 16384 })
  })

  it('an invalid key is never retried and maps to auth', async () => {
    const fetchFn = stubFetch({ status: 400, body: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } })
    const err = await new GeminiProvider(KEY).completeJson({ system: 's', prompt: 'p', schema: { type: 'object' } }).catch((e: unknown) => e)
    expect((err as AIError).kind).toBe('auth')
    expect((err as AIError).message).not.toContain(KEY)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('maps 429 to rate_limit and a safety block to refusal', async () => {
    stubFetch({ status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } })
    expect(((await new GeminiProvider(KEY).coachChat('s', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)) as AIError).kind).toBe('rate_limit')
    stubFetch({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } })
    expect(((await new GeminiProvider(KEY).coachChat('s', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)) as AIError).kind).toBe('refusal')
  })

  it('a network failure maps to network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')))
    const err = await new GeminiProvider(KEY).coachChat('s', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AIError)
    expect((err as AIError).kind).toBe('network')
  })

  it('invalid JSON from the model is a clear error', async () => {
    stubFetch({ status: 200, body: okBody('sorry, no') })
    const err = await new GeminiProvider(KEY).completeJson({ system: 's', prompt: 'p', schema: { type: 'object' } }).catch((e: unknown) => e)
    expect((err as AIError).message).toMatch(/not valid JSON/)
  })
})
