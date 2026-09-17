import { describe, expect, it } from 'vitest'
import {
  BridgeError, MAX_SYSTEM_CHARS, SlidingWindow, checkPin, extractJson, isSameOrigin, isSecureRequest, noKeyMessage, normalizeMediaType,
  parseAttachments, parseBody, parseChatRequest, parseJsonRequest, pickProvider, pinFailKey, pinMessage, readTextCapped, safeEqual, stripDataUrl,
} from '../guard'

function kindOf(fn: () => unknown): string {
  try { fn() } catch (e) { return e instanceof BridgeError ? `${e.kind}:${e.status}` : 'other' }
  return 'no error'
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close() } })
}

describe('PIN', () => {
  it('compares without caring about length or position', async () => {
    expect(await safeEqual('correct horse', 'correct horse')).toBe(true)
    expect(await safeEqual('correct horse', 'correct horsf')).toBe(false)
    expect(await safeEqual('correct horse', 'c')).toBe(false)
    expect(await safeEqual('', '')).toBe(true)
  })

  it('refuses when the server has no PIN, a short PIN, or the header is missing or wrong', async () => {
    expect(await checkPin(undefined, 'anything-at-all')).toBe('unset')
    expect(await checkPin('   ', 'anything-at-all')).toBe('unset')
    expect(await checkPin('1234', '1234')).toBe('too_short')
    expect(await checkPin('fifteen-chars-x', 'fifteen-chars-x')).toBe('too_short') // a bearer token, not a PIN: 16 or more
    expect(await checkPin('a-long-enough-pin', null)).toBe('missing')
    expect(await checkPin('a-long-enough-pin', '')).toBe('missing')
    expect(await checkPin('a-long-enough-pin', 'a-long-enough-pim')).toBe('wrong')
    expect(await checkPin('a-long-enough-pin', 'a-long-enough-pin')).toBe('ok')
  })

  it('keys wrong-PIN counting on the address for IPv4 and on the /64 for IPv6', () => {
    expect(pinFailKey('203.0.113.9')).toBe('203.0.113.9')
    expect(pinFailKey('2001:db8:12:34:aaaa:bbbb:cccc:dddd')).toBe(pinFailKey('2001:0db8:0012:0034::1'))
    expect(pinFailKey('2001:db8::1:2:3:4')).toBe(pinFailKey('2001:db8::ffff')) // "::" inside the first 64 bits
    expect(pinFailKey('2001:db8:12:34::1')).not.toBe(pinFailKey('2001:db8:12:35::1'))
    expect(pinFailKey('::ffff:203.0.113.9')).toBe('::ffff:203.0.113.9')
  })

  it('never mentions keys or providers to a caller without the PIN', () => {
    for (const state of ['unset', 'too_short', 'missing', 'wrong'] as const) {
      expect(pinMessage(state)).not.toMatch(/key|gemini|anthropic|claude/i)
    }
    expect(pinMessage('missing')).toMatch(/PIN required/)
  })
})

describe('isSameOrigin', () => {
  const url = 'https://fitty.example.workers.dev/api/ai/chat'
  it('accepts the same host and requests without an Origin', () => {
    expect(isSameOrigin(url, 'https://fitty.example.workers.dev')).toBe(true)
    expect(isSameOrigin(url, null)).toBe(true)
    expect(isSameOrigin(url, null, 'same-origin')).toBe(true)
    expect(isSameOrigin(url, null, 'none')).toBe(true)
  })
  it('refuses other hosts, other ports, opaque and malformed origins, and cross-site fetches', () => {
    expect(isSameOrigin(url, 'https://evil.example')).toBe(false)
    expect(isSameOrigin(url, 'https://fitty.example.workers.dev:8443')).toBe(false)
    expect(isSameOrigin(url, 'http://fitty.example.workers.dev')).toBe(false)
    expect(isSameOrigin(url, 'null')).toBe(false)
    expect(isSameOrigin(url, 'not a url')).toBe(false)
    expect(isSameOrigin(url, 'https://fitty.example.workers.dev', 'cross-site')).toBe(false)
    expect(isSameOrigin(url, null, 'same-site')).toBe(false)
  })
})

describe('isSecureRequest', () => {
  it('wants https, except on localhost (wrangler dev)', () => {
    expect(isSecureRequest('https://fitty.example.workers.dev/api/ai/chat')).toBe(true)
    expect(isSecureRequest('http://fitty.example.workers.dev/api/ai/chat')).toBe(false)
    expect(isSecureRequest('http://localhost:8787/api/ai/chat')).toBe(true)
    expect(isSecureRequest('http://127.0.0.1:8787/api/ai/chat')).toBe(true)
    expect(isSecureRequest('not a url')).toBe(false)
  })
})

describe('SlidingWindow', () => {
  it('allows `limit` hits per window and frees them as they age out', () => {
    const w = new SlidingWindow(3, 1000)
    expect([w.take('k', 0), w.take('k', 10), w.take('k', 20)]).toEqual([true, true, true])
    expect(w.take('k', 30)).toBe(false)
    expect(w.count('k', 30)).toBe(3)
    expect(w.take('other', 30)).toBe(true)
    expect(w.take('k', 1005)).toBe(true) // the hit at t=0 left the window
    expect(w.take('k', 1006)).toBe(false)
  })
  it('keeps a bounded number of keys', () => {
    const w = new SlidingWindow(1, 1000, 2)
    w.take('a', 0); w.take('b', 0); w.take('c', 0)
    expect(w.count('a', 1)).toBe(0)
    expect(w.count('c', 1)).toBe(1)
  })
})

describe('readTextCapped', () => {
  const bytes = (n: number) => new TextEncoder().encode('x'.repeat(n))
  it('reads a body under the cap, across chunk boundaries', async () => {
    const euro = new TextEncoder().encode('{"a":"€"}')
    expect(await readTextCapped(streamOf([euro.slice(0, 7), euro.slice(7)]), null, 100)).toBe('{"a":"€"}')
    expect(await readTextCapped(null, null, 100)).toBe('')
  })
  it('refuses on a declared Content-Length over the cap', async () => {
    await expect(readTextCapped(streamOf([bytes(1)]), '101', 100)).rejects.toMatchObject({ kind: 'bad_request', status: 413 })
  })
  it('refuses when the stream itself runs over the cap, whatever the header said', async () => {
    await expect(readTextCapped(streamOf([bytes(60), bytes(60)]), '10', 100)).rejects.toMatchObject({ kind: 'bad_request', status: 413 })
  })
})

describe('parseBody', () => {
  it('accepts a JSON object only', () => {
    expect(parseBody('{"a":1}')).toEqual({ a: 1 })
    expect(parseBody('')).toEqual({})
    expect(kindOf(() => parseBody('nope'))).toBe('bad_request:400')
    expect(kindOf(() => parseBody('[1]'))).toBe('bad_request:400')
  })
})

describe('attachments', () => {
  it('normalises media types and strips data: URLs', () => {
    expect(normalizeMediaType(' IMAGE/JPG ')).toBe('image/jpeg')
    expect(normalizeMediaType('application/pdf')).toBe('application/pdf')
    expect(normalizeMediaType('text/plain')).toBeNull()
    expect(normalizeMediaType('image/svg+xml')).toBeNull()
    expect(stripDataUrl('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(parseAttachments([{ base64: 'data:image/jpg;base64,QUJD', mediaType: 'image/jpg', name: 'meal' }]))
      .toEqual([{ base64: 'QUJD', mediaType: 'image/jpeg', name: 'meal' }])
    expect(parseAttachments(undefined)).toEqual([])
  })
  it('refuses more than four, unsupported types, empty files and non-arrays', () => {
    const one = { base64: 'QUJD', mediaType: 'image/png' }
    expect(parseAttachments([one, one, one, one])).toHaveLength(4)
    expect(kindOf(() => parseAttachments([one, one, one, one, one]))).toBe('bad_request:400')
    expect(kindOf(() => parseAttachments([{ base64: 'QUJD', mediaType: 'text/html' }]))).toBe('bad_request:400')
    expect(kindOf(() => parseAttachments([{ base64: '', mediaType: 'image/png' }]))).toBe('bad_request:400')
    expect(kindOf(() => parseAttachments('x'))).toBe('bad_request:400')
  })
})

describe('parseChatRequest', () => {
  it('keeps user/assistant turns, drops empty ones and leading assistant turns', () => {
    const req = parseChatRequest({
      system: 'be brief',
      turns: [{ role: 'assistant', content: 'hi' }, { role: 'user', content: ' one ' }, { role: 'assistant', content: '' }, { role: 'user', content: 'two' }],
    })
    expect(req.system).toBe('be brief')
    expect(req.turns).toEqual([{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }])
    expect(req.attachments).toEqual([])
  })
  it('cuts the system prompt at the limit', () => {
    const req = parseChatRequest({ system: 'x'.repeat(MAX_SYSTEM_CHARS + 50), turns: [{ role: 'user', content: 'hi' }] })
    expect(req.system).toHaveLength(MAX_SYSTEM_CHARS)
  })
  it('refuses missing turns, an assistant-last conversation and oversized conversations', () => {
    expect(kindOf(() => parseChatRequest({}))).toBe('bad_request:400')
    expect(kindOf(() => parseChatRequest({ turns: [] }))).toBe('bad_request:400')
    expect(kindOf(() => parseChatRequest({ turns: [{ role: 'assistant', content: 'hi' }] }))).toBe('bad_request:400')
    expect(kindOf(() => parseChatRequest({ turns: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }))).toBe('bad_request:400')
    expect(kindOf(() => parseChatRequest({ turns: [{ role: 'user', content: 'x'.repeat(200_001) }] }))).toBe('bad_request:400')
  })
})

describe('parseJsonRequest', () => {
  const schema = { type: 'object', properties: { a: { type: 'string' } } }
  it('needs a prompt and an object schema', () => {
    expect(parseJsonRequest({ system: 's', prompt: 'p', schema })).toEqual({ system: 's', prompt: 'p', schema, attachments: [] })
    expect(kindOf(() => parseJsonRequest({ prompt: 'p' }))).toBe('bad_request:400')
    expect(kindOf(() => parseJsonRequest({ prompt: '  ', schema }))).toBe('bad_request:400')
    expect(kindOf(() => parseJsonRequest({ prompt: 'p', schema: [] }))).toBe('bad_request:400')
    expect(kindOf(() => parseJsonRequest({ prompt: 'p', schema: 'x' }))).toBe('bad_request:400')
  })
  it('refuses oversized prompts and schemas', () => {
    expect(kindOf(() => parseJsonRequest({ prompt: 'x'.repeat(200_001), schema }))).toBe('bad_request:400')
    expect(kindOf(() => parseJsonRequest({ prompt: 'p', schema: { description: 'x'.repeat(50_001) } }))).toBe('bad_request:400')
  })
})

describe('extractJson', () => {
  it('reads bare JSON, fenced JSON and JSON inside prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(extractJson('Here you go: {"a":3} Enjoy.')).toEqual({ a: 3 })
    expect(() => extractJson('no json here')).toThrow()
  })
})

describe('pickProvider', () => {
  it('prefers COACH_PROVIDER, then Gemini, then Anthropic', () => {
    expect(pickProvider({})).toBeNull()
    expect(pickProvider({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toBe('gemini')
    expect(pickProvider({ ANTHROPIC_API_KEY: 'a' })).toBe('anthropic')
    expect(pickProvider({ GEMINI_API_KEY: '  ' })).toBeNull()
    expect(pickProvider({ COACH_PROVIDER: ' Anthropic ', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toBe('anthropic')
    expect(pickProvider({ COACH_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'a' })).toBeNull()
    expect(pickProvider({ COACH_PROVIDER: 'something-else', ANTHROPIC_API_KEY: 'a' })).toBe('anthropic')
  })
  it('explains what is missing without the word "pin" (the app keys its PIN prompt on that word)', () => {
    expect(noKeyMessage({})).toMatch(/GEMINI_API_KEY/)
    expect(noKeyMessage({ COACH_PROVIDER: 'anthropic' })).toMatch(/ANTHROPIC_API_KEY/)
    expect(noKeyMessage({})).not.toMatch(/\bpin\b/i)
  })
})
