import { describe, expect, it } from 'vitest'
import { BridgeError } from '../guard'
import { DEFAULT_OPENROUTER_MODEL, attachmentParts, buildChatRequest, buildJsonRequest, dataCollection, isOpenRouterKey, mapOpenRouterHttpError, openRouterChat, openRouterJson, openRouterModel, parseOpenRouterResponse } from '../openrouter'

const img = { base64: 'QUJD', mediaType: 'image/jpeg' as const }
const pdf = { base64: 'UERG', mediaType: 'application/pdf' as const, name: 'lipids' }

describe('openrouter helpers', () => {
  it('recognises OpenRouter keys by prefix', () => {
    expect(isOpenRouterKey('sk-or-v1-abc')).toBe(true)
    expect(isOpenRouterKey('  sk-or-v1-abc ')).toBe(true)
    expect(isOpenRouterKey('AIzaSyFake')).toBe(false)
    expect(isOpenRouterKey(undefined)).toBe(false)
  })

  it('validates model ids and defaults to Gemini Flash', () => {
    expect(openRouterModel(undefined)).toBe(DEFAULT_OPENROUTER_MODEL)
    expect(openRouterModel('anthropic/claude-sonnet-5')).toBe('anthropic/claude-sonnet-5')
    expect(openRouterModel('google/gemini-3.8-flash:batch')).toBe('google/gemini-3.8-flash:batch')
    expect(openRouterModel('../../etc')).toBe(DEFAULT_OPENROUTER_MODEL)
    expect(openRouterModel('no-slash')).toBe(DEFAULT_OPENROUTER_MODEL)
  })

  it('denies data collection unless explicitly allowed', () => {
    expect(dataCollection(undefined)).toBe('deny')
    expect(dataCollection('nonsense')).toBe('deny')
    expect(dataCollection('ALLOW')).toBe('allow')
  })

  it('sends images as data URLs and PDFs as file parts', () => {
    const parts = attachmentParts([img, pdf])
    expect(parts[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } })
    expect(parts[1]).toEqual({ type: 'file', file: { filename: 'lipids.pdf', file_data: 'data:application/pdf;base64,UERG' } })
  })

  it('builds a chat request with the system prompt first and attachments on the last user turn only', () => {
    const r = buildChatRequest({ system: 'S', turns: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }], attachments: [img] }, 'google/gemini-3.8-flash', 'deny')
    expect(r.messages[0]).toEqual({ role: 'system', content: 'S' })
    expect(r.messages[1].content).toBe('a')
    expect(Array.isArray(r.messages[3].content)).toBe(true)
    expect(r.provider).toEqual({ data_collection: 'deny' })
    expect(r.response_format).toBeUndefined()
  })

  it('requests strict json_schema output, with a plain JSON fallback that writes the schema into the prompt', () => {
    const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] }
    const strict = buildJsonRequest({ system: 'S', prompt: 'P', schema, attachments: [] }, 'm/x', 'deny', true)
    expect(strict.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } })
    const plain = buildJsonRequest({ system: 'S', prompt: 'P', schema, attachments: [] }, 'm/x', 'deny', false)
    expect(plain.response_format).toEqual({ type: 'json_object' })
    expect(String(plain.messages[1].content)).toContain('"required"')
  })

  it('parses replies and maps refusals, truncation and embedded errors', () => {
    expect(parseOpenRouterResponse({ model: 'g', choices: [{ finish_reason: 'stop', message: { content: ' hi ' } }] })).toEqual({ text: 'hi', model: 'g' })
    expect(() => parseOpenRouterResponse({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] })).toThrowError(BridgeError)
    expect(() => parseOpenRouterResponse({ choices: [{ finish_reason: 'length', message: { content: '{"a":' } }] })).toThrowError(/cut off/)
    expect(parseOpenRouterResponse({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }, { partialOk: true }).text).toBe('partial')
    expect(() => parseOpenRouterResponse({ error: { code: 402, message: 'secret upstream text' } })).toThrowError(/credits/)
    expect(() => parseOpenRouterResponse({ choices: [] })).toThrowError(/empty/)
  })

  it('maps HTTP errors to kinds without echoing the upstream body', () => {
    expect(mapOpenRouterHttpError(401, { error: { message: 'leak' } }).kind).toBe('auth')
    expect(mapOpenRouterHttpError(402, null).kind).toBe('auth')
    expect(mapOpenRouterHttpError(429, null).kind).toBe('busy')
    expect(mapOpenRouterHttpError(403, null).kind).toBe('refusal')
    expect(mapOpenRouterHttpError(503, null).kind).toBe('failed')
    expect(mapOpenRouterHttpError(401, { error: { message: 'leak' } }).message).not.toContain('leak')
  })
})

describe('openrouter transport', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  it('sends the key only in the Authorization header, never in the URL or body, and adds no referer', async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    const fetcher = async (url: string, init?: RequestInit) => { seen.push({ url, init }); return ok({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] }) }
    await openRouterChat('sk-or-v1-SECRET', 'google/gemini-3.8-flash', 'deny', { system: 'S', turns: [{ role: 'user', content: 'hi' }], attachments: [] }, fetcher)
    expect(seen[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen[0].url).not.toContain('SECRET')
    expect(String(seen[0].init?.body)).not.toContain('SECRET')
    const headers = seen[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-or-v1-SECRET')
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('http-referer')
  })

  it('retries a 400 once in plain JSON mode', async () => {
    let n = 0
    const fetcher = async () => (++n === 1 ? ok({ error: { code: 400 } }, 400) : ok({ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }] }))
    const r = await openRouterJson('k', 'm/x', 'deny', { system: 'S', prompt: 'P', schema: { type: 'object' }, attachments: [] }, fetcher)
    expect(n).toBe(2)
    expect(r.text).toBe('{"a":1}')
  })
})
