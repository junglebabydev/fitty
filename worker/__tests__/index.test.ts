// The fetch handler end to end under plain Node: web-standard Request/Response, a stub ASSETS binding and a
// stubbed upstream fetch. Each test imports a fresh copy of the module, i.e. a fresh "isolate".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../index'

const ORIGIN = 'https://fitty.example.workers.dev'
const PIN = 'a-long-enough-pin'
const GEMINI_KEY = 'TEST-ONLY-GEMINI-KEY'

type Handler = { fetch(request: Request, env: Env): Promise<Response> }

const assets = { fetch: vi.fn(async () => new Response('<!doctype html>', { status: 200 })) }
const env = (extra: Partial<Env> = {}): Env => ({ ASSETS: assets, COACH_BRIDGE_PIN: PIN, GEMINI_API_KEY: GEMINI_KEY, ...extra })

const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const geminiOk = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], modelVersion: 'gemini-3.8-flash' }), { status: 200 })

let worker: Handler

beforeEach(async () => {
  vi.resetModules()
  upstream.mockReset()
  assets.fetch.mockClear()
  vi.stubGlobal('fetch', upstream)
  worker = (await import('../index')).default
})
afterEach(() => { vi.unstubAllGlobals() })

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { headers })
}
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: JSON.stringify(body) })
}
const chatBody = { system: 'coach', turns: [{ role: 'user', content: 'hi' }] }

describe('routing', () => {
  it('hands everything outside /api/ai/ to the static assets', async () => {
    const res = await worker.fetch(get('/train'), env())
    expect(await res.text()).toBe('<!doctype html>')
    expect(assets.fetch).toHaveBeenCalledTimes(1)
    await worker.fetch(get('/api/other'), env())
    expect(assets.fetch).toHaveBeenCalledTimes(2)
  })

  it('answers unknown AI paths and wrong methods with JSON errors, only after the PIN', async () => {
    expect((await worker.fetch(post('/api/ai/nope', {}), env())).status).toBe(403)
    const unknown = await worker.fetch(post('/api/ai/nope', {}, { 'x-coach-pin': PIN }), env())
    expect([unknown.status, await unknown.json()]).toEqual([404, { ok: false, kind: 'bad_request', message: 'Unknown endpoint.' }])
    expect((await worker.fetch(get('/api/ai/chat', { 'x-coach-pin': PIN }), env())).status).toBe(405)
    expect((await worker.fetch(new Request(`${ORIGIN}/api/ai/chat`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env())).status).toBe(403)
  })
})

describe('health', () => {
  it('tells a caller without the PIN nothing about keys, providers or models', async () => {
    for (const e of [env(), env({ GEMINI_API_KEY: undefined })]) {
      const res = await worker.fetch(get('/api/ai/health'), e)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({
        ok: false, kind: 'forbidden', installed: true, version: 'fitty-worker/1', auth: 'unknown', model: '',
        message: 'PIN required. Enter it in Settings → AI.', pinRequired: true, pinOk: false, host: 'cloud',
      })
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('says so when the server has no usable PIN, again without touching the key', async () => {
    for (const pin of [undefined, '1234']) {
      const res = await worker.fetch(get('/api/ai/health', { 'x-coach-pin': '1234' }), env({ COACH_BRIDGE_PIN: pin }))
      const body = await res.json() as Record<string, unknown>
      expect(res.status).toBe(200)
      expect(body).toMatchObject({ ok: false, provider: null, pinRequired: true, pinOk: false, host: 'cloud', model: '' })
      expect(String(body.message)).toMatch(/COACH_BRIDGE_PIN/)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('verifies the key once with a free models.get call and caches the answer', async () => {
    upstream.mockResolvedValue(new Response('{}', { status: 200 }))
    const res = await worker.fetch(get('/api/ai/health?deep=1', { 'x-coach-pin': PIN }), env())
    expect(await res.json()).toEqual({
      ok: true, installed: true, version: 'fitty-worker/1', auth: 'ok', message: "Connected to Google Gemini through this site's server.",
      model: 'gemini-3.8-flash', pinRequired: true, pinOk: true, host: 'cloud', provider: 'gemini',
    })
    await worker.fetch(get('/api/ai/health', { 'x-coach-pin': PIN }), env())
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(upstream.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash')
  })

  it('reports a rejected key as signed_out and a missing key as not configured', async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 }))
    const bad = await (await worker.fetch(get('/api/ai/health', { 'x-coach-pin': PIN }), env())).json() as Record<string, unknown>
    expect(bad).toMatchObject({ ok: false, auth: 'signed_out', provider: 'gemini' })
    expect(String(bad.message)).not.toMatch(/\bpin\b/i)

    const none = await (await worker.fetch(get('/api/ai/health', { 'x-coach-pin': PIN }), env({ GEMINI_API_KEY: undefined }))).json() as Record<string, unknown>
    expect(none).toMatchObject({ ok: false, auth: 'signed_out', provider: null, model: '' })
  })

  it('uses Anthropic when only that key exists, or when COACH_PROVIDER says so', async () => {
    const e = env({ COACH_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'TEST-ONLY-ANTHROPIC-KEY', COACH_MODEL: 'claude-opus-5' })
    upstream.mockResolvedValue(new Response(JSON.stringify({ id: 'claude-opus-5', type: 'model' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const body = await (await worker.fetch(get('/api/ai/health', { 'x-coach-pin': PIN }), e)).json() as Record<string, unknown>
    expect(body).toMatchObject({ ok: true, provider: 'anthropic', model: 'claude-opus-5' })
  })
})

describe('security', () => {
  it('refuses AI calls without the PIN, with a wrong PIN, or when the server has none', async () => {
    const cases: [Record<string, string>, Env][] = [[{}, env()], [{ 'x-coach-pin': 'not-the-right-pin' }, env()], [{ 'x-coach-pin': PIN }, env({ COACH_BRIDGE_PIN: undefined })]]
    for (const [headers, e] of cases) {
      const res = await worker.fetch(post('/api/ai/chat', chatBody, headers), e)
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ ok: false, kind: 'forbidden' })
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('refuses cross-origin requests even with the right PIN, and sends no CORS headers', async () => {
    const res = await worker.fetch(post('/api/ai/chat', chatBody, { Origin: 'https://evil.example', 'x-coach-pin': PIN }), env())
    expect(res.status).toBe(403)
    expect([...res.headers.keys()].filter((k) => k.startsWith('access-control'))).toEqual([])
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('locks an address out after repeated wrong PINs, without affecting other addresses', async () => {
    const from = (ip: string, pin: string) => worker.fetch(post('/api/ai/chat', chatBody, { 'cf-connecting-ip': ip, 'x-coach-pin': pin }), env())
    for (let i = 0; i < 8; i++) expect((await from('203.0.113.9', `wrong-guess-${i}`)).status).toBe(403)
    const locked = await from('203.0.113.9', PIN)
    expect([locked.status, (await locked.json() as { kind: string }).kind]).toEqual([429, 'busy'])
    upstream.mockResolvedValue(geminiOk('Hello'))
    expect((await from('198.51.100.7', PIN)).status).toBe(200)
  })

  it('refuses oversized bodies before parsing them', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/ai/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-coach-pin': PIN, 'Content-Length': String(21 * 1024 * 1024) }, body: '{}',
    }), env())
    expect(res.status).toBe(413)
  })

  it('rate-limits AI calls per isolate', async () => {
    upstream.mockImplementation(async () => geminiOk('Hello'))
    const call = () => worker.fetch(post('/api/ai/chat', chatBody, { 'x-coach-pin': PIN }), env())
    for (let i = 0; i < 30; i++) expect((await call()).status).toBe(200)
    const limited = await call()
    expect([limited.status, (await limited.json() as { kind: string }).kind]).toEqual([429, 'busy'])
    expect(upstream).toHaveBeenCalledTimes(30)
  })

  it('never echoes the key, the PIN or upstream error text', async () => {
    upstream.mockResolvedValue(new Response(JSON.stringify({ error: { message: `bad thing involving ${GEMINI_KEY}` } }), { status: 500 }))
    const res = await worker.fetch(post('/api/ai/chat', chatBody, { 'x-coach-pin': PIN }), env())
    const text = await res.text()
    expect(res.status).toBe(502)
    expect(text).not.toContain(GEMINI_KEY)
    expect(text).not.toContain(PIN)
    expect(text).not.toContain('bad thing')
    expect(JSON.parse(text)).toMatchObject({ ok: false, kind: 'failed' })
  })
})

describe('chat and json', () => {
  it('answers chat through Gemini with the bridge reply shape', async () => {
    upstream.mockResolvedValue(geminiOk('Eat more protein.'))
    const res = await worker.fetch(post('/api/ai/chat', chatBody, { 'x-coach-pin': PIN }), env())
    const body = await res.json() as { ok: boolean; text: string; meta: Record<string, unknown> }
    expect(body).toMatchObject({ ok: true, text: 'Eat more protein.', meta: { costUsd: null, model: 'gemini-3.8-flash', provider: 'gemini' } })
    expect(typeof body.meta.durationMs).toBe('number')
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(GEMINI_KEY)
  })

  it('returns parsed JSON, ignores a client-chosen model, and honours COACH_GEMINI_MODEL', async () => {
    upstream.mockResolvedValue(geminiOk('```json\n{"items":[1,2]}\n```'))
    const req = post('/api/ai/json', { system: 's', prompt: 'p', schema: { type: 'object' }, model: 'gemini-ultra-expensive' }, { 'x-coach-pin': PIN })
    const res = await worker.fetch(req, env({ COACH_GEMINI_MODEL: 'gemini-3.5-flash-lite' }))
    expect(await res.json()).toMatchObject({ ok: true, data: { items: [1, 2] } })
    expect(upstream.mock.calls[0][0]).toContain('/models/gemini-3.5-flash-lite:generateContent')
  })

  it('reports invalid JSON, refusals and validation errors with the right kinds', async () => {
    const jsonReq = () => post('/api/ai/json', { system: 's', prompt: 'p', schema: { type: 'object' } }, { 'x-coach-pin': PIN })
    upstream.mockResolvedValueOnce(geminiOk('not json at all'))
    expect(await (await worker.fetch(jsonReq(), env())).json()).toMatchObject({ ok: false, kind: 'failed' })

    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }))
    const refused = await worker.fetch(jsonReq(), env())
    expect([refused.status, await refused.json()]).toEqual([422, { ok: false, kind: 'refusal', message: 'The AI declined to answer this request.' }])

    const bad = await worker.fetch(post('/api/ai/json', { prompt: 'p' }, { 'x-coach-pin': PIN }), env())
    expect([bad.status, (await bad.json() as { kind: string }).kind]).toEqual([400, 'bad_request'])

    const noKey = await worker.fetch(jsonReq(), env({ GEMINI_API_KEY: undefined }))
    expect([noKey.status, (await noKey.json() as { kind: string }).kind]).toEqual([503, 'auth'])
  })
})
