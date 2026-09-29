// The fitty Worker forwards coach turns to the coach Worker after its own checks (docs/PRD_COACH_CHAT.md §13).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../index'

const ORIGIN = 'https://fitty.example.workers.dev'
const PIN = 'a-long-enough-pin'
const assets = { fetch: vi.fn(async () => new Response('', { status: 200 })) }
const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
const post = (body: unknown, headers: Record<string, string> = { 'x-coach-pin': PIN }) =>
  new Request(`${ORIGIN}/api/ai/coach/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: JSON.stringify(body) })

let worker: { fetch(request: Request, env: Env): Promise<Response> }
beforeEach(async () => {
  vi.resetModules()
  upstream.mockReset()
  vi.stubGlobal('fetch', upstream)
  worker = (await import('../index')).default
})
afterEach(() => { vi.unstubAllGlobals() })

describe('/api/ai/coach/turn', () => {
  const turn = { v: 1, step: 1, turns: [{ role: 'user', content: 'hi' }] }

  it('forwards the body unchanged to the coach binding and returns its answer', async () => {
    const coach = { fetch: vi.fn(async (_r: Request) => new Response(JSON.stringify({ ok: true, v: 1, kind: 'reply', agent: 'coach', text: 'Hi.' }), { status: 200 })) }
    const res = await worker.fetch(post(turn), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, COACH: coach })
    expect([res.status, await res.json()]).toEqual([200, { ok: true, v: 1, kind: 'reply', agent: 'coach', text: 'Hi.' }])
    const forwarded = coach.fetch.mock.calls[0][0]
    expect(new URL(forwarded.url).pathname).toBe('/turn')
    expect(await forwarded.json()).toEqual(turn)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('needs the PIN, and never reaches the coach without it', async () => {
    const coach = { fetch: vi.fn() }
    const res = await worker.fetch(post(turn, {}), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, COACH: coach })
    expect(res.status).toBe(403)
    expect(coach.fetch).not.toHaveBeenCalled()
  })

  it('counts against the daily budget', async () => {
    const coach = { fetch: vi.fn() }
    const spent = { idFromName: () => 'id', get: () => ({ fetch: async () => new Response(null, { status: 429 }) }) }
    const res = await worker.fetch(post(turn), { ASSETS: assets, COACH_BRIDGE_PIN: PIN, COACH: coach, DAILY_BUDGET: spent })
    expect([res.status, (await res.json() as { kind: string }).kind]).toEqual([429, 'busy'])
    expect(coach.fetch).not.toHaveBeenCalled()
  })

  it('without the binding answers 503, so the app answers from local data', async () => {
    const res = await worker.fetch(post(turn), { ASSETS: assets, COACH_BRIDGE_PIN: PIN })
    expect([res.status, (await res.json() as { ok: boolean }).ok]).toEqual([503, false])
  })
})
