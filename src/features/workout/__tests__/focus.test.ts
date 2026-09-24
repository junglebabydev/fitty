import { describe, expect, it } from 'vitest'
import type { ExerciseSet, PlannedExercise } from '../../../domain/types'
import { focusIndex, nextFocusIndex, remainingPlan } from '../focus'

const plan = (id: string, sets: number): PlannedExercise => ({ exerciseId: id, sets, repMin: 8, repMax: 12, loadKg: null, restSec: 60 })
const logged = (id: string, n: number): ExerciseSet[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, sessionId: 1, exerciseId: id, setIndex: i + 1, reps: 10, loadKg: null, rir: 2, rpe: null, durationSec: null, painFlag: false, loggedAt: '' }))
const map = (entries: [string, number][]) => new Map(entries.map(([id, n]) => [id, logged(id, n)]))

const EX = [plan('a', 3), plan('b', 2), plan('c', 2)]

describe('focus cursor', () => {
  it('starts on the first exercise with sets left', () => {
    expect(focusIndex(EX, map([]), [])).toBe(0)
    expect(focusIndex(EX, map([['a', 3]]), [])).toBe(1)
  })

  it('skips stopped exercises and ignores extra sets beyond the plan', () => {
    expect(focusIndex(EX, map([['a', 1]]), ['a'])).toBe(1)
    expect(focusIndex(EX, map([['a', 5], ['b', 2]]), [])).toBe(2)
  })

  it('is null when everything is logged or stopped, and for an empty session', () => {
    expect(focusIndex(EX, map([['a', 3], ['b', 2]]), ['c'])).toBeNull()
    expect(focusIndex([], map([]), [])).toBeNull()
  })

  it('finds what comes next', () => {
    expect(nextFocusIndex(EX, map([]), [], 0)).toBe(1)
    expect(nextFocusIndex(EX, map([['b', 2]]), [], 0)).toBe(2)
    expect(nextFocusIndex(EX, map([]), ['b', 'c'], 0)).toBeNull()
  })

  it('keeps only unlogged sets in the remaining plan', () => {
    expect(remainingPlan(EX, map([['a', 1], ['b', 2]]), ['c']).map((e) => [e.exerciseId, e.sets])).toEqual([['a', 2]])
  })
})
