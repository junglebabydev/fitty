import { describe, expect, it } from 'vitest'
import type { ExerciseSet, PlannedExercise } from '../../../domain/types'
import { circuitRestAfter, focusIndex, nextFocusIndex, remainingPlan } from '../focus'

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

const station = (id: string, rounds: number, key = 'c1', restSec = 15, roundRestSec?: number): PlannedExercise =>
  ({ ...plan(id, rounds), restSec, circuit: key, ...(roundRestSec !== undefined ? { roundRestSec } : {}) })

/** Log one set at the cursor until the session is done; returns the ids in the order they came up. */
function walk(exercises: PlannedExercise[], stopped: string[] = []): string[] {
  const counts = new Map<string, number>()
  const order: string[] = []
  for (let guard = 0; guard < 100; guard++) {
    const i = focusIndex(exercises, map([...counts]), stopped)
    if (i == null) return order
    const id = exercises[i].exerciseId
    order.push(id)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  throw new Error('cursor did not finish')
}

describe('focus cursor in a circuit', () => {
  const C3 = [station('a', 3), station('b', 3), station('c', 3)]

  it('walks a 3-station × 3-round circuit round-robin', () => {
    expect(walk(C3)).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'])
  })

  it('goes back to the station with the fewest logged rounds', () => {
    expect(focusIndex(C3, map([['a', 1], ['b', 1], ['c', 1]]), [])).toBe(0)
    expect(focusIndex(C3, map([['a', 2], ['b', 1], ['c', 1]]), [])).toBe(1)
    // Logged out of order: c ran ahead, so a and b catch up first.
    expect(focusIndex(C3, map([['c', 1]]), [])).toBe(0)
  })

  it('drops a stopped station and keeps the rest going', () => {
    expect(walk(C3, ['b'])).toEqual(['a', 'c', 'a', 'c', 'a', 'c'])
    expect(focusIndex(C3, map([['a', 1], ['b', 1]]), ['c'])).toBe(0)
  })

  it('runs a mixed session in order: sets, then the circuit, then sets', () => {
    const mixed = [plan('x', 2), station('a', 2), station('b', 2), plan('y', 1)]
    expect(walk(mixed)).toEqual(['x', 'x', 'a', 'b', 'a', 'b', 'y'])
  })

  it('treats two circuits back to back as separate groups', () => {
    const two = [station('a', 2, 'c1'), station('b', 2, 'c1'), station('d', 1, 'c2'), station('e', 1, 'c2')]
    expect(walk(two)).toEqual(['a', 'b', 'a', 'b', 'd', 'e'])
  })

  it('shows the next station, wrapping to the first until the last round', () => {
    expect(nextFocusIndex(C3, map([]), [], 0)).toBe(1)
    expect(nextFocusIndex(C3, map([['a', 1], ['b', 1]]), [], 2)).toBe(0)
    // Final round: finished stations are skipped, then the circuit hands over to what follows.
    const mixed = [...C3, plan('y', 1)]
    expect(nextFocusIndex(mixed, map([['a', 3], ['b', 3], ['c', 2]]), [], 2)).toBe(3)
    expect(nextFocusIndex(C3, map([['a', 3], ['b', 2], ['c', 2]]), [], 1)).toBe(2)
    expect(nextFocusIndex(C3, map([['a', 3], ['b', 3], ['c', 2]]), [], 2)).toBeNull()
  })

  it('lands on the circuit station whose turn it is when coming from a sets block', () => {
    const mixed = [plan('x', 2), station('a', 2), station('b', 2)]
    expect(nextFocusIndex(mixed, map([['a', 1]]), [], 0)).toBe(2)
  })
})

describe('rest inside a circuit', () => {
  const C = [station('a', 3, 'c1', 15, 90), station('b', 3, 'c1', 15, 90), station('c', 3, 'c1', 15, 90)]

  it('rests between stations, and longer after the last station of a round', () => {
    expect(circuitRestAfter(C, map([]), [], 0)).toBe(15)
    expect(circuitRestAfter(C, map([['a', 1]]), [], 1)).toBe(15)
    expect(circuitRestAfter(C, map([['a', 1], ['b', 1]]), [], 2)).toBe(90)
    expect(circuitRestAfter(C, map([['a', 2], ['b', 1], ['c', 1]]), [], 1)).toBe(15)
  })

  it('ends a round without a stopped station', () => {
    expect(circuitRestAfter(C, map([['a', 1]]), ['c'], 1)).toBe(90)
  })

  it('falls back to restSec without a round rest, keeps 0 as no rest, and is null outside a circuit', () => {
    const noRound = [station('a', 2, 'c1', 20), station('b', 2, 'c1', 20)]
    expect(circuitRestAfter(noRound, map([['a', 1]]), [], 1)).toBe(20)
    const zero = [station('a', 2, 'c1', 0, 0), station('b', 2, 'c1', 0, 0)]
    expect(circuitRestAfter(zero, map([]), [], 0)).toBe(0)
    expect(circuitRestAfter(zero, map([['a', 1]]), [], 1)).toBe(0)
    expect(circuitRestAfter(EX, map([]), [], 0)).toBeNull()
  })
})
