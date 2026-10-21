// A programme row whose series is not loaded must fail loudly at the gate, never run a weaker gate.
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../../db/database'
import { createSession, getSession } from '../../../db/repositories'
import { todayStr } from '../../../lib/util'
import { loadAllPrograms } from '../../../data/programs/load'
import { startSessionWithGate } from '../gate'
import { libraryExercises } from '../helpers'

beforeAll(async () => { await db.init() })

describe('gate on a series that is not loaded', () => {
  it('throws before loadAllPrograms, runs after', async () => {
    const id = createSession({
      templateKey: 'work:gym-strength:w2d2', name: 'Full Body A', type: 'strength', tier: 'minimum', scheduledDate: todayStr(), status: 'planned',
      startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '',
      exercises: [{ exerciseId: 'leg_press', sets: 2, repMin: 8, repMax: 12, loadKg: null, restSec: 90 } as never],
    })
    expect(() => startSessionWithGate(getSession(id)!, [{ region: 'knee_left' as never, painScore: 5, redFlags: {} }], libraryExercises(), null)).toThrow(/not loaded/)
    expect(getSession(id)!.status).toBe('planned')
    await loadAllPrograms()
    const out = startSessionWithGate(getSession(id)!, [], libraryExercises(), null)
    expect(getSession(id)!.status).toBe('in_progress')
    expect(out.exercises.length).toBe(1)
  })
})
