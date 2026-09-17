// Runs the real sql.js engine (node loader) through the `db` wrapper. There is no IndexedDB in node,
// so persist() exercises its failure path here.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { WorkoutSession } from '../../domain/types'
import { db } from '../database'
import { addMeal, addSet, createSession, deleteMeal, deleteSession, getMeal, getSetsForSession } from '../repositories'

function count(table: string, where = '1=1', params: (string | number)[] = []): number {
  return db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params)!.n
}

function foreignKeysOn(): number {
  return db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys
}

const MEAL = { ts: '2026-09-10T12:00:00.000Z', mealType: 'lunch', photoUri: null, notes: '', source: 'manual', savedName: null, isSaved: false } as const
const ITEM = { foodName: 'Chicken rice', quantityG: 350, servingDescription: '1 plate', kcal: 600, proteinG: 35, carbsG: 70, fatG: 18, source: 'manual', confidence: null, uncertaintyReason: null }
const SESSION: Omit<WorkoutSession, 'id'> = {
  templateKey: 'upper_a', name: 'Upper A', type: 'strength', tier: 'minimum', scheduledDate: '2026-09-10', status: 'completed',
  startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
}

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeAll(async () => {
  await db.init()
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('foreign keys survive export()', () => {
  it('re-enables PRAGMA foreign_keys after sql.js closes and reopens the connection', () => {
    expect(foreignKeysOn()).toBe(1)
    const bytes = db.export()
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(foreignKeysOn()).toBe(1)
  })

  it('ON DELETE CASCADE still fires for a raw meal delete after an export', () => {
    const id = addMeal(MEAL, [ITEM, ITEM])
    expect(count('food_items', 'meal_id = ?', [id])).toBe(2)
    db.export()
    db.run('DELETE FROM meals WHERE id = ?', [id])
    expect(count('food_items', 'meal_id = ?', [id])).toBe(0)
  })
})

describe('deleteMeal / deleteSession', () => {
  it('deleteMeal removes the meal and its items after an export', () => {
    const id = addMeal(MEAL, [ITEM, ITEM, ITEM])
    db.export()
    deleteMeal(id)
    expect(getMeal(id)).toBeNull()
    expect(count('food_items', 'meal_id = ?', [id])).toBe(0)
  })

  it('deleteSession removes the session and its sets after an export', () => {
    const id = createSession(SESSION)
    addSet({ sessionId: id, exerciseId: 'db_bench_press', setIndex: 0, reps: 10, loadKg: 26, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: '2026-09-10T08:00:00.000Z' })
    addSet({ sessionId: id, exerciseId: 'db_bench_press', setIndex: 1, reps: 10, loadKg: 26, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: '2026-09-10T08:02:00.000Z' })
    expect(getSetsForSession(id)).toHaveLength(2)
    db.export()
    deleteSession(id)
    expect(count('workout_sessions', 'id = ?', [id])).toBe(0)
    expect(getSetsForSession(id)).toHaveLength(0)
  })
})

describe('persist()', () => {
  it('does not throw when the IndexedDB write fails; it flags the failure and reports it', async () => {
    const onError = vi.fn()
    db.onPersistError = onError
    try {
      await expect(db.persist()).resolves.toBeUndefined()
      expect(db.persistFailed).toBe(true)
      expect(onError).toHaveBeenCalledTimes(1)
      // the connection is still usable afterwards, with foreign keys on
      expect(foreignKeysOn()).toBe(1)
    } finally {
      db.onPersistError = null
    }
  })
})
