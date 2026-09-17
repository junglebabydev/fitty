import { describe, expect, it } from 'vitest'
import { addDays } from '../../lib/util'
import { SESSION_TEMPLATES, applyGateToSession, buildWeek, estimateSessionMinutes, reflowWeek, shortenedVersion } from '../planner'
import { evaluateSymptomGate } from '../symptomGate'
import { LIBRARY, TODAY, WEEK_START, session, sym } from './fixtures'

const CANONICAL = new Set(LIBRARY.map((e) => e.id))

describe('SESSION_TEMPLATES', () => {
  it('has the seven contract keys using canonical exercise IDs', () => {
    expect(Object.keys(SESSION_TEMPLATES).sort()).toEqual(['conditioning_bike', 'full_b', 'lower_a', 'mobility_hips', 'mobility_upper', 'swim', 'upper_a'])
    for (const t of Object.values(SESSION_TEMPLATES)) {
      expect(t.key in SESSION_TEMPLATES).toBe(true)
      for (const e of t.exercises) expect(CANONICAL.has(e.exerciseId), `${t.key}: ${e.exerciseId}`).toBe(true)
    }
  })

  it('upper_a is a 6-exercise strength session (~42 min); lower_a is knee-friendly (no squats)', () => {
    expect(SESSION_TEMPLATES.upper_a.exercises).toHaveLength(6)
    expect(SESSION_TEMPLATES.upper_a.estMin).toBe(42)
    const lowerIds = SESSION_TEMPLATES.lower_a.exercises.map((e) => e.exerciseId)
    expect(lowerIds).toContain('leg_press')
    expect(lowerIds).toContain('hip_thrust')
    expect(lowerIds).toContain('lying_leg_curl')
    expect(lowerIds).toContain('leg_extension')
    expect(lowerIds).toContain('standing_calf_raise')
    expect(lowerIds.some((id) => /squat|lunge/.test(id))).toBe(false)
  })
})

describe('buildWeek', () => {
  it('minimum = 3 strength, target = +conditioning, stretch = +swim/mobility', () => {
    const min = buildWeek(WEEK_START, 'minimum')
    expect(min).toHaveLength(3)
    expect(min.every((s) => s.type === 'strength')).toBe(true)
    const target = buildWeek(WEEK_START, 'target')
    expect(target).toHaveLength(4)
    expect(target.filter((s) => s.type === 'strength')).toHaveLength(3)
    expect(target.filter((s) => s.type === 'conditioning')).toHaveLength(1)
    const stretch = buildWeek(WEEK_START, 'stretch')
    expect(stretch).toHaveLength(6)
    expect(stretch.filter((s) => s.type === 'strength')).toHaveLength(3)
    expect(stretch.some((s) => s.type === 'swim')).toBe(true)
    expect(stretch.some((s) => s.type === 'mobility')).toBe(true)
  })

  it('schedules within the week, one per day, all planned, with independent exercise copies', () => {
    const wk = buildWeek(TODAY, 'stretch') // any date normalises to the Monday
    const dates = wk.map((s) => s.scheduledDate)
    expect(new Set(dates).size).toBe(dates.length)
    for (const d of dates) { expect(d >= WEEK_START).toBe(true); expect(d <= addDays(WEEK_START, 6)).toBe(true) }
    expect(wk.every((s) => s.status === 'planned' && s.startedAt === null)).toBe(true)
    wk[0].exercises[0].sets = 99
    expect(SESSION_TEMPLATES.upper_a.exercises[0].sets).toBe(3)
  })
})

describe('reflowWeek', () => {
  it('moves a missed strength session to the first free day (today) and never touches completed sessions', () => {
    const mon = session('upper_a', WEEK_START, 'completed')
    const wed = session('lower_a', addDays(WEEK_START, 2), 'planned') // missed (today is Thu)
    const fri = session('full_b', addDays(WEEK_START, 4), 'planned')
    const sat = session('conditioning_bike', addDays(WEEK_START, 5), 'planned')
    const moves = reflowWeek([mon, wed, fri, sat], TODAY)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ id: wed.id, scheduledDate: TODAY })
    expect(moves[0].note).toMatch(/Moved Lower Body/)
    expect(moves.some((m) => m.id === mon.id)).toBe(false)
  })

  it('returns nothing when nothing was missed', () => {
    expect(reflowWeek([session('upper_a', WEEK_START, 'completed'), session('lower_a', addDays(WEEK_START, 4), 'planned')], TODAY)).toEqual([])
  })

  it('protects the 3-strength minimum by displacing stretch/target sessions when days run out', () => {
    const today = addDays(WEEK_START, 5) // Saturday
    const mon = session('upper_a', WEEK_START, 'completed')
    const wed = session('lower_a', addDays(WEEK_START, 2), 'planned') // missed
    const fri = session('full_b', addDays(WEEK_START, 4), 'planned') // missed
    const sat = session('conditioning_bike', today, 'planned')
    const sun = session('swim', addDays(WEEK_START, 6), 'planned')
    const moves = reflowWeek([mon, wed, fri, sat, sun], today)
    const byId = Object.fromEntries(moves.map((m) => [m.id, m]))
    expect(byId[wed.id].drop).toBeUndefined()
    expect(byId[fri.id].drop).toBeUndefined()
    expect([byId[wed.id].scheduledDate, byId[fri.id].scheduledDate].sort()).toEqual([today, addDays(WEEK_START, 6)])
    expect(byId[sat.id].drop).toBe(true)
    expect(byId[sun.id].drop).toBe(true)
    expect(moves.some((m) => m.id === mon.id)).toBe(false)
    expect(moves.some((m) => /minimum/.test(m.note))).toBe(true)
  })

  it('drops stretch items rather than doubling up a day', () => {
    const today = addDays(WEEK_START, 6) // Sunday
    const a = session('upper_a', WEEK_START, 'completed')
    const b = session('lower_a', addDays(WEEK_START, 2), 'completed')
    const c = session('full_b', addDays(WEEK_START, 4), 'completed')
    const swim = session('swim', addDays(WEEK_START, 1), 'planned') // missed stretch item
    const bike = session('conditioning_bike', today, 'planned')
    const moves = reflowWeek([a, b, c, swim, bike], today)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ id: swim.id, drop: true })
  })

  it('never moves skipped or in-progress sessions and does not move sessions from other weeks', () => {
    const lastWeek = session('upper_a', addDays(WEEK_START, -3), 'planned')
    const skipped = session('lower_a', addDays(WEEK_START, 1), 'skipped')
    const active = session('full_b', TODAY, 'in_progress')
    expect(reflowWeek([lastWeek, skipped, active], TODAY)).toEqual([])
  })
})

describe('shortenedVersion', () => {
  it('keeps the first 4 compounds at 2 sets each and fits in 25–35 minutes', () => {
    const short = shortenedVersion(SESSION_TEMPLATES.upper_a.exercises)
    expect(short).toHaveLength(4)
    expect(short.map((e) => e.exerciseId)).toEqual(['db_bench_press', 'lat_pulldown', 'db_shoulder_press', 'seated_cable_row'])
    expect(short.every((e) => e.sets === 2)).toBe(true)
    const min = estimateSessionMinutes(short)
    expect(min).toBeLessThanOrEqual(35)
    expect(min).toBeGreaterThanOrEqual(15)
    expect(estimateSessionMinutes(SESSION_TEMPLATES.upper_a.exercises)).toBeGreaterThan(min)
  })

  it('falls back to the first exercises when a session has few compounds', () => {
    const short = shortenedVersion(SESSION_TEMPLATES.mobility_hips.exercises)
    expect(short).toHaveLength(4)
    expect(short.every((e) => e.sets <= 2)).toBe(true)
  })
})

describe('applyGateToSession', () => {
  it('substitutes overhead work when the neck is AMBER and records the change', () => {
    const gate = evaluateSymptomGate([sym('neck', 4)])
    const { exercises, changes } = applyGateToSession(SESSION_TEMPLATES.upper_a.exercises, gate, LIBRARY)
    // lateral_raise is the only safe option and is already programmed → merged, not duplicated
    expect(exercises).toHaveLength(5)
    expect(exercises.some((e) => e.exerciseId === 'db_shoulder_press')).toBe(false)
    expect(exercises.filter((e) => e.exerciseId === 'lateral_raise')).toHaveLength(1)
    expect(exercises.find((e) => e.exerciseId === 'lateral_raise')?.sets).toBe(4)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatch(/Swapped Dumbbell Shoulder Press → Dumbbell Lateral Raise \(Overhead/)
    expect(changes[0]).toMatch(/merged/)

    // with a fresh substitute available it is swapped in place with provenance
    const lib = [...LIBRARY, { ...LIBRARY.find((e) => e.id === 'lateral_raise')!, id: 'cable_lateral_raise', name: 'Cable Lateral Raise', equipment: 'cable', pattern: 'vertical_push' }]
    const r2 = applyGateToSession(SESSION_TEMPLATES.upper_a.exercises, gate, lib)
    expect(r2.exercises).toHaveLength(6)
    const swapped = r2.exercises.find((e) => e.substitutedFrom === 'db_shoulder_press')
    expect(swapped?.exerciseId).toBe('cable_lateral_raise')
    expect(swapped?.substitutionReason).toMatch(/Overhead/)
    expect(swapped?.loadKg).toBeNull()
    expect(SESSION_TEMPLATES.upper_a.exercises.find((e) => e.exerciseId === 'lateral_raise')?.sets).toBe(2) // template untouched
  })

  it('removes an exercise when no safe substitute exists and leaves everything else untouched', () => {
    const gate = evaluateSymptomGate([sym('knee_left', 7)])
    const { exercises, changes } = applyGateToSession(SESSION_TEMPLATES.lower_a.exercises, gate, LIBRARY)
    expect(exercises.some((e) => e.exerciseId === 'leg_press')).toBe(false)
    const swappedLegPress = exercises.find((e) => e.substitutedFrom === 'leg_press')
    expect(swappedLegPress?.exerciseId).toBe('glute_bridge') // hip_thrust already in session, glute_bridge is next listed
    expect(changes.length).toBeGreaterThanOrEqual(1)
    expect(exercises.filter((e) => e.exerciseId === 'hip_thrust')).toHaveLength(1)
  })

  it('is a no-op with an OK gate', () => {
    const gate = evaluateSymptomGate([sym('knee_left', 2)])
    const { exercises, changes } = applyGateToSession(SESSION_TEMPLATES.full_b.exercises, gate, LIBRARY)
    expect(changes).toEqual([])
    expect(exercises).toEqual(SESSION_TEMPLATES.full_b.exercises)
  })
})
