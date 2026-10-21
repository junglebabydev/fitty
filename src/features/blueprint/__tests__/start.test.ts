// Start with no questions, through the real sql.js engine like workout/__tests__/program.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAllPrograms } from '../../../data/programs/load'
import { db } from '../../../db/database'
import { getSession, getSessions, getSymptomChecks, tableCounts, updateSession } from '../../../db/repositories'
import { todayStr } from '../../../lib/util'
import { screenAnswersFor } from '../../workout/program'
import { startNow, startToday } from '../start'
import { WEEK_PROGRAM_ID, dayKey } from '../week'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

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

describe('startToday', () => {
  it('starts today\'s class in one step, without asking or recording anything', () => {
    const today = todayStr()
    const id = startToday(dayKey(today), today)
    const row = getSession(id)!
    expect(row.status).toBe('in_progress')
    expect(row.startedAt).not.toBeNull()
    expect(row.exercises.length).toBeGreaterThan(0)
    expect(getSymptomChecks(1)).toEqual([])
    expect(screenAnswersFor(WEEK_PROGRAM_ID)).toBeUndefined()
  })

  it('reuses the row already started, and leaves a finished one finished', () => {
    const today = todayStr()
    const id = startToday(dayKey(today), today)
    expect(startToday(dayKey(today), today)).toBe(id)
    expect(getSessions(today, today)).toHaveLength(1)
    updateSession(id, { status: 'completed' })
    expect(startNow(id)).toBe(id)
    expect(getSession(id)!.status).toBe('completed')
  })

  it("starts another series' workout from More workouts the same way", async () => {
    await loadAllPrograms() // WorkoutIntro's route loads them (App.tsx withPrograms); the BFT cases above run without
    const today = todayStr()
    const id = startToday('w2d2', today, 'gym-strength')
    const row = getSession(id)!
    expect(row.status).toBe('in_progress')
    expect(row.templateKey).toBe('work:gym-strength:w2d2')
    expect(startToday('w2d2', today, 'gym-strength')).toBe(id)
    expect(getSymptomChecks(1)).toEqual([])
  })
})
