import { describe, expect, it } from 'vitest'
import { PROGRAM_LIST, getProgram } from '../../../data/programs'
import type { ScreenAnswers } from '../../../domain/programs'
import type { WorkoutSession } from '../../../domain/types'
import { expandSessions } from '../../../engine'
import { weekShape } from '../ProgramCover'
import { pickHero, weekPills } from '../ProgramCard'
import { programMeta } from '../ProgramGallery'
import { standaloneSession, startNowPicks } from '../StartNowRow'
import { previewSafety } from '../WorkoutPreviewSheet'

const gym = getProgram('gym-strength')!
const running = getProgram('start-running')!
const postpartum = getProgram('postpartum')!
const hiit = getProgram('hiit')!

function row(id: number, scheduledDate: string, status: WorkoutSession['status'] = 'planned'): WorkoutSession {
  return {
    id, templateKey: `prog:gym-strength:w1d${id}`, name: 'x', type: 'strength', tier: 'minimum', scheduledDate, status, startedAt: null,
    completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
  }
}

const allNo = (p: typeof gym) => Object.fromEntries(p.screen.map((q) => [q.id, false]))
const saved = (p: typeof gym, answers: Record<string, boolean>, answeredAt = '2026-10-01T08:00:00.000Z'): ScreenAnswers => ({ programId: p.id, answers, answeredAt })

describe('weekShape', () => {
  it('has one bar per week, heights within 0.2–1, the heaviest week at 1', () => {
    for (const p of PROGRAM_LIST) {
      const bars = weekShape(p)
      expect(bars).toHaveLength(p.weeks)
      expect(bars.every((b) => b.height >= 0.2 && b.height <= 1)).toBe(true)
      expect(Math.max(...bars.map((b) => b.height))).toBe(1)
    }
  })

  it('shows gym deload weeks dipping and running minutes growing', () => {
    const g = weekShape(gym).map((b) => b.value)
    expect(g[0]).toBeLessThan(g[1])
    expect(g[5]).toBeLessThan(g[4])
    const r = weekShape(running).map((b) => b.value)
    expect(r[r.length - 1]).toBeGreaterThan(r[0])
    expect(r.every((v, i) => i === 0 || v >= r[i - 1])).toBe(true)
  })

  it('marks the first week of each later Postpartum stage', () => {
    const starts = weekShape(postpartum).filter((b) => b.stageStart).map((b) => b.week)
    expect(starts).toEqual((postpartum.stages ?? []).map((s) => s.weeks[0]).filter((w) => w > 1))
    expect(weekShape(gym).some((b) => b.stageStart)).toBe(false)
  })
})

describe('weekPills and pickHero', () => {
  const today = '2026-10-03'
  it('orders by date and marks done, today, coming and past', () => {
    const rows = [row(3, '2026-10-05'), row(1, '2026-10-01', 'completed'), row(2, today), row(4, '2026-10-02')]
    expect(weekPills(rows, today).map((p) => [p.id, p.state])).toEqual([[1, 'done'], [4, 'past'], [2, 'today'], [3, 'coming']])
  })

  it('leads with the session in progress, then today, then the next planned one, else null', () => {
    expect(pickHero([row(1, '2026-10-01', 'in_progress'), row(2, today)], today)?.id).toBe(1)
    expect(pickHero([row(1, '2026-10-01', 'completed'), row(2, today), row(3, '2026-10-05')], today)?.id).toBe(2)
    expect(pickHero([row(1, today, 'skipped'), row(3, '2026-10-06'), row(2, '2026-10-05')], today)?.id).toBe(2)
    expect(pickHero([row(1, '2026-10-01', 'completed'), row(2, '2026-10-02')], today)).toBeNull()
    expect(pickHero([], today)).toBeNull()
  })
})

describe('gallery and Start now', () => {
  it('says weeks and sessions a week, or stages', () => {
    expect(programMeta(gym)).toBe('12 weeks · 3 a week')
    expect(programMeta(postpartum)).toBe('16 weeks · in stages')
  })

  it('offers only ready programmes, every pick resolving to a session', () => {
    const picks = startNowPicks()
    expect(picks.length).toBeGreaterThan(0)
    expect(picks.every((p) => p.program.status === 'ready')).toBe(true)
    expect(picks.some((p) => p.program.id === 'postpartum' || p.program.id === 'hiit')).toBe(false)
    expect(picks.map((p) => p.pick.name)).toContain('Full Body A')
  })

  it('finds path-only sessions the standard weeks leave out', () => {
    expect(expandSessions(hiit).some((s) => s.key === 'w3d2-li')).toBe(false)
    expect(standaloneSession(hiit, 'w3d2-li')?.key).toBe('w3d2-li')
    expect(standaloneSession(gym, 'nope')).toBeNull()
  })
})

describe('previewSafety', () => {
  const today = '2026-10-03'
  it('asks when never answered or too old', () => {
    expect(previewSafety(gym, undefined, [], false, today)).toEqual({ state: 'ask', count: gym.screen.length })
    expect(previewSafety(gym, saved(gym, allNo(gym), '2026-05-01T08:00:00.000Z'), [], false, today).state).toBe('ask')
  })

  it('asks again when a question is unanswered (added since)', () => {
    const answers = allNo(gym)
    delete answers[gym.screen[0].id]
    expect(previewSafety(gym, saved(gym, answers), [], false, today).state).toBe('ask')
  })

  it('is ready on current all-no answers, with the answer date and path', () => {
    expect(previewSafety(gym, saved(gym, allNo(gym)), [], false, today)).toEqual({ state: 'ready', path: 'standard', answeredOn: '2026-10-01' })
    expect(previewSafety(gym, saved(gym, allNo(gym)), ['knee_left'], false, today)).toMatchObject({ state: 'ready', path: 'low-impact' })
  })

  it('never offers a start on a saved wait or suggest answer', () => {
    expect(previewSafety(gym, saved(gym, { ...allNo(gym), pregnant: true }), [], false, today).state).toBe('wait')
    const birth = gym.screen.find((q) => q.onYes === 'suggest:postpartum')!
    expect(previewSafety(gym, saved(gym, { ...allNo(gym), [birth.id]: true }), [], false, today)).toEqual({ state: 'suggest', programId: 'postpartum' })
  })

  it('says coming soon for a preview series whatever the answers', () => {
    expect(previewSafety(hiit, saved(hiit, allNo(hiit)), [], false, today)).toEqual({ state: 'soon' })
  })
})
