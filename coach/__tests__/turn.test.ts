// One coach step with stubbed model calls (docs/PRD_COACH_CHAT.md §13).
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { COACH_CONTRACT_VERSION, type CoachTurnRequest, type CoachTurnTurn, type ToolCall } from '../contract'
import { CoachRequestError, coachTurn, parseCoachTurnRequest, type CoachDeps } from '../turn'

// A v1 request exactly as the app sends it (seed facts from src/engine/__tests__/fixtures.ts). If a coach change makes
// this fail, the deployed app would break: keep v1 working, or add v2 alongside it (COACH_CONTRACT_VERSION).
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/turn-request-v1.json', import.meta.url), 'utf8')) as Record<string, unknown>
const GOLDEN_SEED = readFileSync(new URL('./__golden__/coach-prompt-seed.txt', import.meta.url), 'utf8')

const request = (over: Partial<CoachTurnRequest> = {}): CoachTurnRequest => ({ ...parseCoachTurnRequest(FIXTURE, FIXTURE.turns as CoachTurnTurn[]), ...over })
const user = (content: string): CoachTurnTurn[] => [{ role: 'user', content }]

function deps(text = 'Two sessions done. Next: the upper-body session after work.', toolCalls: ToolCall[] = []) {
  const chat = vi.fn<CoachDeps['chat']>(async () => ({ text, toolCalls }))
  return { chat, decide: vi.fn<NonNullable<CoachDeps['decide']>>() }
}

describe('contract v1', () => {
  it('the fixture request builds exactly the golden generalist prompt', async () => {
    const d = deps()
    const res = await coachTurn(request(), { chat: d.chat })
    expect(res).toMatchObject({ v: COACH_CONTRACT_VERSION, kind: 'reply', agent: 'coach' })
    expect(d.chat.mock.calls[0][0]).toBe(GOLDEN_SEED)
  })

  it('rejects other versions and malformed facts', () => {
    expect(() => parseCoachTurnRequest({ ...FIXTURE, v: 2 }, [])).toThrow(CoachRequestError)
    expect(() => parseCoachTurnRequest({ ...FIXTURE, facts: {} }, [])).toThrow(CoachRequestError)
    expect(() => parseCoachTurnRequest({ ...FIXTURE, step: 4 }, [])).toThrow(CoachRequestError)
    expect(() => parseCoachTurnRequest({ ...FIXTURE, agent: 'lawyer' }, [])).toThrow(CoachRequestError)
  })

  it('ignores an unknown previous agent instead of failing', () => {
    expect(parseCoachTurnRequest({ ...FIXTURE, previousAgent: 'from_a_future_coach' }, []).previousAgent).toBeNull()
  })
})

describe('routing', () => {
  it('keyword rules decide without the decision model', async () => {
    const d = deps()
    const res = await coachTurn(request({ turns: user('What should I eat next?') }), d)
    expect(res.agent).toBe('nutrition')
    expect(d.decide).not.toHaveBeenCalled()
  })

  it('an undecided message asks the decision model with only that message', async () => {
    const d = deps()
    d.decide.mockResolvedValueOnce({ choice: 'training', confidence: 0.9 })
    const res = await coachTurn(request({ turns: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'x' }, ...user('should I eat before I train?')] }), d)
    expect(res.agent).toBe('training')
    expect(d.decide.mock.calls[0][0].state).toBe('should I eat before I train?')
  })

  it('a failed decision, or none available, means the generalist coach', async () => {
    const d = deps()
    d.decide.mockRejectedValueOnce(new Error('down'))
    expect((await coachTurn(request({ turns: user('should I eat before I train?') }), d)).agent).toBe('coach')
    expect((await coachTurn(request({ turns: user('should I eat before I train?') }), { chat: d.chat })).agent).toBe('coach')
  })

  it('steps 2 and 3 use the agent step 1 chose', async () => {
    const d = deps()
    expect((await coachTurn(request({ turns: user('what should I eat?'), agent: 'recovery', step: 2 }), d)).agent).toBe('recovery')
    expect(d.decide).not.toHaveBeenCalled()
  })
})

describe('tools and the reply check', () => {
  const call = [{ id: 'c1', name: 'get_sleep', arguments: '{"days":14}' }]

  it('passes tool calls back to the app, with the agent tools offered', async () => {
    const d = deps('', call)
    const res = await coachTurn(request({ turns: user('how did I sleep?') }), d)
    expect(res).toEqual({ v: 1, kind: 'tool_calls', agent: 'recovery', toolCalls: call })
    expect(d.chat.mock.calls[0][2].map((t) => t.name)).toEqual(['get_sleep'])
    expect(d.chat.mock.calls[0][3]).toBeUndefined()
  })

  it('the last step forces an answer, and agents without tools get none', async () => {
    const d = deps()
    await coachTurn(request({ turns: user('how did I sleep?'), agent: 'recovery', step: 3 }), d)
    expect(d.chat.mock.calls[0][3]).toBe('none')
    await coachTurn(request({ turns: user('my knee hurts'), step: 1 }), d)
    expect(d.chat.mock.calls[1][2]).toEqual([])
  })

  it('withholds a reply the check rejects, and counts tool results as received numbers', async () => {
    expect(await coachTurn(request({ turns: user('how did I sleep?') }), deps('Take 3 mg melatonin.'))).toMatchObject({ kind: 'withheld', reason: 'dose' })
    const turns: CoachTurnTurn[] = [...user('what did I eat?'), { role: 'assistant', content: '', toolCalls: call }, { role: 'tool', toolCallId: 'c1', content: '{"kcal":1840}' }]
    expect(await coachTurn(request({ turns, agent: 'nutrition', step: 2 }), deps('You averaged 1,840 kcal.'))).toMatchObject({ kind: 'reply' })
    expect(await coachTurn(request({ turns: user('what did I eat?'), agent: 'nutrition' }), deps('You averaged 1,840 kcal.'))).toMatchObject({ kind: 'withheld', reason: 'invented_number' })
  })
})
