// The coach's weekly facts on the Blueprint (BFT) build, through the real sql.js engine like
// workout/__tests__/program.test.ts. Found by the coach eval (scripts/evals/coach, 2026-10-15): a workout done this
// week from More workouts, or any finished workout, was missing from the coach's week.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkoutSession } from '../../../domain/types'
import { db } from '../../../db/database'
import { createSession, tableCounts } from '../../../db/repositories'
import { buildCoachFacts } from '../facts'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
// A Thursday: Monday 2026-10-12 starts the week.
const TODAY = '2026-10-15'

function row(over: Partial<WorkoutSession>): Omit<WorkoutSession, 'id'> {
  return {
    templateKey: 'upper_a', name: 'Upper A', type: 'strength', tier: 'minimum', scheduledDate: '2026-10-12', status: 'planned',
    startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [], ...over,
  }
}

beforeAll(async () => {
  await db.init()
})

beforeEach(() => {
  db.transaction(() => {
    for (const t of Object.keys(tableCounts())) db.run(`DELETE FROM "${t}"`)
  })
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe("the coach's week", () => {
  it('counts every workout done this week, BFT or not, and leaves old plan rows nobody started out', () => {
    createSession(row({ templateKey: 'work:bft:w1d1', name: 'Strength · lower body', status: 'completed' }))
    createSession(row({ templateKey: 'work:gym-strength:w2d2', name: 'Full Body A', scheduledDate: '2026-10-13', status: 'completed' }))
    createSession(row({ templateKey: 'upper_a', name: 'Upper A', scheduledDate: '2026-10-14', status: 'completed' }))
    createSession(row({ templateKey: 'work:bodyweight:w3d2', name: 'Bodyweight circuit', scheduledDate: TODAY, status: 'in_progress' }))
    // An old weekly-plan row from before the Blueprint cut, never started: not part of this week.
    createSession(row({ templateKey: 'lower_a', name: 'Lower A', scheduledDate: '2026-10-13', status: 'planned' }))
    // Last week.
    createSession(row({ templateKey: 'work:bft:w1d4', name: 'HIIT', scheduledDate: '2026-10-08', status: 'completed' }))

    const f = buildCoachFacts(TODAY)
    expect(f.sessionsThisWeek.map((s) => s.name).sort()).toEqual(['Bodyweight circuit', 'Full Body A', 'Strength · lower body', 'Upper A'])
    expect(f.sessionsThisWeek.filter((s) => s.status === 'completed')).toHaveLength(3)
    expect(f.missedThisWeek).toBe(0)
  })

  it("still counts a BFT class planned on its day and not started as missed once the day has passed", () => {
    createSession(row({ templateKey: 'work:bft:w1d2', name: 'Summit', scheduledDate: '2026-10-13', status: 'planned' }))
    const f = buildCoachFacts(TODAY)
    expect(f.sessionsThisWeek.map((s) => s.name)).toEqual(['Summit'])
    expect(f.missedThisWeek).toBe(1)
  })
})
