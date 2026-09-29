// The coach Worker entry: request validation, OpenRouter wiring and error shapes.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import coachWorker from '../worker'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/turn-request-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>
const post = (body: unknown, path = '/turn') => new Request(`https://fitty-coach${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const ENV = { OPENROUTER_API_KEY: 'sk-or-test', COACH_SERVICE_TIER: 'standard' }
const chatOk = (content: string) => new Response(JSON.stringify({ model: 'google/gemini-3.8-flash', choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 })

afterEach(() => { vi.unstubAllGlobals() })

describe('coach Worker', () => {
  it('asks Jev for an undecided message, then answers through OpenRouter with the generalist prompt', async () => {
    const f = vi.fn(async (url: string) => url.endsWith('/systemone')
      ? new Response(JSON.stringify({ answers: { pick: { type: 'choice', choice: 'coach', confidence: 0.8 } } }), { status: 200 })
      : chatOk('One session done. Next: upper body after work.'))
    vi.stubGlobal('fetch', f)
    const res = await coachWorker.fetch(post(FIXTURE), ENV)
    expect(await res.json()).toEqual({ ok: true, v: 1, kind: 'reply', agent: 'coach', text: 'One session done. Next: upper body after work.' })
    const calls = f.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/v1/systemone', '/api/v1/chat/completions'])
    expect(JSON.parse(calls[0][1].body as string).state).toBe('How is my week going?')
    const sent = JSON.parse(calls[1][1].body as string)
    expect(sent.messages[0].content).toBe(readFileSync(new URL('./__golden__/coach-prompt-seed.txt', import.meta.url), 'utf8'))
    expect(sent.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(['get_sleep', 'get_training', 'get_nutrition'])
  })

  it('refuses a bad version with 400, a missing key with 503 and anything else with 404', async () => {
    expect((await coachWorker.fetch(post({ ...FIXTURE, v: 9 }), ENV)).status).toBe(400)
    expect((await coachWorker.fetch(post(FIXTURE), {})).status).toBe(503)
    expect((await coachWorker.fetch(post(FIXTURE, '/other'), ENV)).status).toBe(404)
  })
})
