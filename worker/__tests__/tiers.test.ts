// Flex tier with standard fallback, and the /decide route for the decision model (docs/PRD_COACH_CHAT.md §11.5–11.6).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError, parseDecideRequest } from '../guard'
import { DEFAULT_ROUTER_MODEL, openRouterChat, parseDecideResponse, routerModel, serviceTier } from '../openrouter'
import type { Env } from '../index'

const ok = (text: string) => new Response(JSON.stringify({ model: 'google/gemini-3.8-flash', choices: [{ message: { content: text }, finish_reason: 'stop' }] }), { status: 200 })
const status = (n: number) => new Response(JSON.stringify({ error: { code: n, message: 'x' } }), { status: n })
const chatReq = { system: 's', turns: [{ role: 'user' as const, content: 'hi' }], attachments: [] }
const sent = (f: ReturnType<typeof vi.fn>, i: number) => JSON.parse((f.mock.calls[i][1] as RequestInit).body as string) as Record<string, unknown>

describe('openRouterChat tiers', () => {
  it('flex that answers is used, with service_tier sent', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('from flex'))
    const r = await openRouterChat('k', 'm/x', 'deny', chatReq, f, 'flex')
    expect(r).toMatchObject({ text: 'from flex', tier: 'flex' })
    expect(sent(f, 0).service_tier).toBe('flex')
    expect(f).toHaveBeenCalledTimes(1)
  })

  for (const [what, flexReply] of [
    ['429 (flex capacity)', () => Promise.resolve(status(429))],
    ['503', () => Promise.resolve(status(503))],
    ['a timeout', () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))],
    ['a 200 carrying an upstream error (preempted)', () => Promise.resolve(new Response(JSON.stringify({ error: { code: 502 } }), { status: 200 }))],
  ] as const) {
    it(`flex ${what} retries once at standard, without service_tier`, async () => {
      const f = vi.fn().mockImplementationOnce(flexReply).mockResolvedValueOnce(ok('from standard'))
      const r = await openRouterChat('k', 'm/x', 'deny', chatReq, f, 'flex')
      expect(r).toMatchObject({ text: 'from standard', tier: 'standard' })
      expect(f).toHaveBeenCalledTimes(2)
      expect(sent(f, 1).service_tier).toBeUndefined()
    })
  }

  it('a bad key on flex is not retried', async () => {
    const f = vi.fn().mockResolvedValueOnce(status(401))
    await expect(openRouterChat('k', 'm/x', 'deny', chatReq, f, 'flex')).rejects.toMatchObject({ kind: 'auth' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('standard tier sends no service_tier', async () => {
    const f = vi.fn().mockResolvedValueOnce(ok('hi'))
    await openRouterChat('k', 'm/x', 'deny', chatReq, f, 'standard')
    expect(sent(f, 0).service_tier).toBeUndefined()
  })

  it('reads the tier and router settings', () => {
    expect(serviceTier(undefined)).toBe('flex')
    expect(serviceTier(' Standard ')).toBe('standard')
    expect(routerModel(undefined)).toBe(DEFAULT_ROUTER_MODEL)
    expect(routerModel('typesafe/jev-1.14')).toBe('typesafe/jev-1.14')
    expect(routerModel('not a model')).toBe(DEFAULT_ROUTER_MODEL)
  })
})

describe('decide request and response', () => {
  const req = { state: 'should I eat before I train?', instructions: 'Which coach?', options: { training: 'Sessions', nutrition: 'Food', other: 'None fit' } }

  it('validates the request', () => {
    expect(parseDecideRequest(req)).toEqual(req)
    const bad = [{ ...req, state: '' }, { ...req, state: 'x'.repeat(2001) }, { ...req, options: { only: 'one' } }, { ...req, options: { 'Bad-Key': 'x', b: 'y' } }]
    for (const b of bad) expect(() => parseDecideRequest(b)).toThrow(BridgeError)
  })

  it('accepts only an offered choice with a 0–1 confidence', () => {
    expect(parseDecideResponse({ model: 'typesafe/jev-1.13', answers: { pick: { type: 'choice', choice: 'nutrition', confidence: 0.82, probabilities: {} } } }, req))
      .toEqual({ choice: 'nutrition', confidence: 0.82, model: 'typesafe/jev-1.13' })
    expect(() => parseDecideResponse({ answers: { pick: { choice: 'sleep', confidence: 0.9 } } }, req)).toThrow(BridgeError)
    expect(() => parseDecideResponse({ answers: { pick: { choice: 'training', confidence: 2 } } }, req)).toThrow(BridgeError)
    expect(() => parseDecideResponse({}, req)).toThrow(BridgeError)
  })
})

describe('/api/ai/decide route', () => {
  const ORIGIN = 'https://fitty.example.workers.dev'
  const PIN = 'a-long-enough-pin'
  const assets = { fetch: vi.fn(async () => new Response('', { status: 200 })) }
  const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  let worker: { fetch(request: Request, env: Env): Promise<Response> }
  const post = (body: unknown) => new Request(`${ORIGIN}/api/ai/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-coach-pin': PIN }, body: JSON.stringify(body) })
  const body = { state: 'should I eat before I train?', instructions: 'Which coach?', options: { training: 'Sessions', nutrition: 'Food' } }

  beforeEach(async () => {
    vi.resetModules()
    upstream.mockReset()
    vi.stubGlobal('fetch', upstream)
    worker = (await import('../index')).default
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends only the message and the question to the System One endpoint with the pinned model', async () => {
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ model: 'typesafe/jev-1.13', answers: { pick: { type: 'choice', choice: 'nutrition', confidence: 0.9 } } }), { status: 200 }))
    const res = await worker.fetch(post(body), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, OPENROUTER_API_KEY: 'sk-or-test' })
    expect(await res.json()).toMatchObject({ ok: true, choice: 'nutrition', confidence: 0.9 })
    expect(upstream.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/systemone')
    const sentBody = JSON.parse(upstream.mock.calls[0][1]!.body as string)
    expect(sentBody).toEqual({ model: 'typesafe/jev-1.13', state: body.state, questions: { pick: { type: 'choice', instructions: 'Which coach?', criteria: body.options } } })
  })

  it('refuses without OpenRouter, so the app falls back to its generalist coach', async () => {
    const res = await worker.fetch(post(body), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, GEMINI_API_KEY: 'g' })
    expect([res.status, (await res.json() as { kind: string }).kind]).toEqual([400, 'bad_request'])
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('/api/ai/chat with tools', () => {
  const ORIGIN = 'https://fitty.example.workers.dev'
  const PIN = 'a-long-enough-pin'
  const assets = { fetch: vi.fn(async () => new Response('', { status: 200 })) }
  const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
  const tool = { name: 'get_sleep', description: 'Sleep.', parameters: { type: 'object' } }
  const post = (body: unknown) => new Request(`${ORIGIN}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'x-coach-pin': PIN }, body: JSON.stringify(body) })

  beforeEach(() => { upstream.mockReset(); vi.stubGlobal('fetch', upstream) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is refused on non-OpenRouter upstreams before any upstream call, and passes tool calls back on OpenRouter', async () => {
    vi.resetModules()
    const worker = (await import('../index')).default
    const body = { system: 's', turns: [{ role: 'user', content: 'sleep?' }], tools: [tool] }
    const refused = await worker.fetch(post(body), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, GEMINI_API_KEY: 'g' })
    expect(refused.status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()

    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_sleep', arguments: '{"days":7}' } }] } }] }), { status: 200 }))
    const res = await worker.fetch(post(body), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, OPENROUTER_API_KEY: 'sk-or-test' })
    expect(await res.json()).toMatchObject({ ok: true, text: '', toolCalls: [{ id: 'c1', name: 'get_sleep', arguments: '{"days":7}' }] })
  })
})
