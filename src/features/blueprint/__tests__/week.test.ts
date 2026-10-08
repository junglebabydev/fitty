import { describe, expect, it } from 'vitest'
import { getProgram } from '../../../data/programs'
import { EXERCISES } from '../../../data/exercises'
import { sessionsForWeek, toPlannedExercises } from '../../../engine/programs'
import { blockLine, dayKey, dayKind, doneOn, fmtSeconds, rowForDate, sections, sessionExerciseIds, stationLine, weekDates } from '../week'

const blueprint = getProgram('blueprint')!

describe('Blueprint week', () => {
  it('maps Monday to w1d1 and Sunday to w1d7', () => {
    // 2026-10-05 is a Monday.
    expect(dayKey('2026-10-05')).toBe('w1d1')
    expect(dayKey('2026-10-06')).toBe('w1d2')
    expect(dayKey('2026-10-11')).toBe('w1d7')
    expect(dayKind('2026-10-05')).toBe('strength')
    expect(dayKind('2026-10-08')).toBe('hiit')
    expect(dayKind('2026-10-10')).toBe('play')
    expect(dayKind('2026-10-11')).toBe('recovery')
  })

  it('gives every weekday a session that exists', () => {
    const keys = new Set(blueprint.sessions.map((s) => s.key))
    for (const d of weekDates('2026-10-04')) expect(keys.has(dayKey(d)), d).toBe(true)
  })

  it('lists Monday to Sunday of the week', () => {
    expect(weekDates('2026-10-04')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('picks the row in progress, then a finished one, then a planned one, ignoring other series and skipped rows', () => {
    const row = (id: number, status: 'planned' | 'in_progress' | 'completed' | 'skipped', key = 'work:blueprint:w1d7', scheduledDate = '2026-10-04') =>
      ({ id, status, templateKey: key, scheduledDate })
    expect(rowForDate([row(1, 'planned'), row(2, 'completed')], '2026-10-04')?.id).toBe(2)
    expect(rowForDate([row(1, 'completed'), row(2, 'in_progress')], '2026-10-04')?.id).toBe(2)
    expect(rowForDate([row(1, 'skipped')], '2026-10-04')).toBeNull()
    expect(rowForDate([row(1, 'planned', 'work:hiit:w1d1')], '2026-10-04')).toBeNull()
    expect(rowForDate([row(1, 'planned', 'work:blueprint:w1d6', '2026-10-03')], '2026-10-04')).toBeNull()
    // With a key, only that session: Tuesday's workout done on Sunday is not Sunday's.
    expect(rowForDate([row(1, 'in_progress', 'work:blueprint:w1d2')], '2026-10-04', 'w1d7')).toBeNull()
    expect(rowForDate([row(1, 'in_progress', 'work:blueprint:w1d2')], '2026-10-04', 'w1d2')?.id).toBe(1)
    expect(doneOn([row(1, 'completed', 'work:blueprint:w1d2'), row(2, 'in_progress')], '2026-10-04')).toBe(true)
    expect(doneOn([row(1, 'in_progress')], '2026-10-04')).toBe(false)
  })

  it("groups Monday's blocks under Bryan's headings", () => {
    const monday = blueprint.sessions.find((s) => s.key === 'w1d1')!
    expect(sections(monday).map((s) => [s.title, s.meta])).toEqual([
      ['Warm-up', null], ['Strength', null], ['Stability', '2 rounds'], ['Cardio', null],
    ])
    const thursday = blueprint.sessions.find((s) => s.key === 'w1d4')!
    expect(sections(thursday).map((s) => [s.title, s.meta])).toEqual([['Warm-up', null], ['4 × 4', '4 rounds'], ['Cool-down', null]])
  })

  it('writes one plain line per block and station', () => {
    expect(blockLine({ shape: 'sets', exerciseId: 'goblet_squat', sets: 3, reps: [10, 15], restSec: 60 })).toBe('3 × 10–15')
    expect(blockLine({ shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [20, 30], perSide: true, restSec: 30 })).toBe('2 × 20–30 s each side')
    expect(blockLine({ shape: 'sets', exerciseId: 'reverse_lunge', sets: 3, reps: [10, 10], perSide: true, restSec: 60 })).toBe('3 × 10 each side')
    expect(blockLine({ shape: 'steady', exerciseId: 'zone2_cardio', minutes: 25, effort: 'zone 2' })).toBe('25 min')
    expect(blockLine({
      shape: 'intervals', rounds: 4,
      work: { exerciseId: 'stationary_bike', seconds: 240, effort: 'hard' },
      rest: { exerciseId: 'stationary_bike', seconds: 180, effort: 'easy' },
    })).toBe('4 min hard, 3 min easy')
    expect(stationLine({ exerciseId: 'leg_swings', seconds: 30, perSide: true })).toBe('30 s each side')
    expect(stationLine({ exerciseId: 'bird_dog', reps: [6, 8], perSide: true })).toBe('6–8 each side')
    expect(fmtSeconds(90)).toBe('1 min 30 s')
  })

  it("counts Sunday's moves once each", () => {
    const sunday = blueprint.sessions.find((s) => s.key === 'w1d7')!
    expect(sessionExerciseIds(sunday)).toEqual(['cat_cow', 'thread_the_needle', 'butterfly_stretch', 'cobra_pose', 'childs_pose', 'hamstring_stretch', 'meditation'])
  })

  it('never repeats an exercise id within a session, warm-ups included, on any path', () => {
    // Focus Mode counts logged sets per exercise id: a warm-up on the same id would count as a work set.
    const named = Object.keys(blueprint.paths).filter((x) => x !== 'standard')
    const lists = [['standard'], ...named.map((x) => [x]), named]
    for (const paths of lists) {
      for (const s of sessionsForWeek(blueprint, 1, paths, EXERCISES)) {
        const ids = toPlannedExercises(blueprint, s).map((e) => e.exerciseId)
        expect(ids.filter((id, i) => ids.indexOf(id) !== i), `${paths.join('+')} ${s.key}`).toEqual([])
      }
    }
  })
})
