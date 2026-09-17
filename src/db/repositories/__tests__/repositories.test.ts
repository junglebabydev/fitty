// Pure tests: row mappers and the date-filling logic behind dailyTotalsRange. No sql.js involved.
import { describe, expect, it } from 'vitest'
import { addDays, isoAt } from '../../../lib/util'
import {
  bool, dayRange, fillDates, mapDecision, mapExercise, mapFoodItem, mapMacros, mapMeal, mapProfile, mapSession,
  mapSet, mapSymptom, mapTarget, mapVoice, parseJson, placeholders, sinceIso, toSql,
} from '../mappers'

describe('primitive helpers', () => {
  it('bool maps 0/1 columns', () => {
    expect(bool(1)).toBe(true)
    expect(bool(0)).toBe(false)
    expect(bool(null)).toBe(false)
    expect(bool(undefined)).toBe(false)
    expect(bool('1')).toBe(true)
  })

  it('parseJson falls back on null, empty, invalid and JSON null', () => {
    expect(parseJson('[1,2]', [])).toEqual([1, 2])
    expect(parseJson(null, ['x'])).toEqual(['x'])
    expect(parseJson('', {})).toEqual({})
    expect(parseJson('{bad', { ok: true })).toEqual({ ok: true })
    expect(parseJson('null', 7)).toBe(7)
  })

  it('toSql converts booleans, objects and undefined', () => {
    expect(toSql(true)).toBe(1)
    expect(toSql(false)).toBe(0)
    expect(toSql(undefined)).toBeNull()
    expect(toSql(null)).toBeNull()
    expect(toSql(3.5)).toBe(3.5)
    expect(toSql('x')).toBe('x')
    expect(toSql({ a: 1 })).toBe('{"a":1}')
    expect(toSql([1, 'b'])).toBe('[1,"b"]')
  })

  it('placeholders builds an IN list', () => {
    expect(placeholders(0)).toBe('')
    expect(placeholders(1)).toBe('?')
    expect(placeholders(3)).toBe('?, ?, ?')
  })
})

describe('date windows', () => {
  it('dayRange covers exactly one local day', () => {
    const [start, end] = dayRange('2026-09-10')
    expect(start).toBe(isoAt('2026-09-10', 0))
    expect(end).toBe(isoAt('2026-09-11', 0))
    expect(start < end).toBe(true)
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('sinceIso(7) spans today plus the six previous days', () => {
    expect(sinceIso(7, '2026-09-10')).toBe(isoAt('2026-09-04', 0))
    expect(sinceIso(1, '2026-09-10')).toBe(isoAt('2026-09-10', 0))
    expect(sinceIso(0, '2026-09-10')).toBe(isoAt('2026-09-10', 0))
  })

  it('sinceIso crosses month boundaries', () => {
    expect(sinceIso(3, '2026-03-01')).toBe(isoAt('2026-02-27', 0))
  })
})

describe('fillDates', () => {
  it('returns one row per date, zero-filled with logged=false', () => {
    const out = fillDates('2026-09-08', '2026-09-10', [{ date: '2026-09-09', kcal: 620, proteinG: 45 }])
    expect(out).toEqual([
      { date: '2026-09-08', kcal: 0, proteinG: 0, logged: false },
      { date: '2026-09-09', kcal: 620, proteinG: 45, logged: true },
      { date: '2026-09-10', kcal: 0, proteinG: 0, logged: false },
    ])
  })

  it('sums several meals on the same date and rounds to one decimal', () => {
    const out = fillDates('2026-09-10', '2026-09-10', [
      { date: '2026-09-10', kcal: 5, proteinG: 0.1 },
      { date: '2026-09-10', kcal: 612.25, proteinG: 41.2 },
      { date: '2026-09-10', kcal: 0.1, proteinG: 0.2 },
    ])
    expect(out).toEqual([{ date: '2026-09-10', kcal: 617.4, proteinG: 41.5, logged: true }])
  })

  it('marks a meal with no items as logged', () => {
    const out = fillDates('2026-09-10', '2026-09-10', [{ date: '2026-09-10', kcal: 0, proteinG: 0 }])
    expect(out[0].logged).toBe(true)
  })

  it('ignores rows outside the range and returns [] when from > to', () => {
    const out = fillDates('2026-09-10', '2026-09-11', [{ date: '2026-09-01', kcal: 900, proteinG: 60 }])
    expect(out.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-11'])
    expect(out.every((r) => !r.logged)).toBe(true)
    expect(fillDates('2026-09-11', '2026-09-10', [])).toEqual([])
  })

  it('covers a 30-day window in order', () => {
    const from = '2026-08-12'
    const out = fillDates(from, addDays(from, 29), [])
    expect(out).toHaveLength(30)
    expect(out[0].date).toBe(from)
    expect(out[29].date).toBe('2026-09-10')
  })
})

describe('row mappers', () => {
  it('mapProfile parses JSON lists and the onboarded flag', () => {
    const p = mapProfile({
      id: 1, name: 'Alex Tan', dob: '1989-02-11', sex: 'male', height_cm: 179, units: 'metric', experience: 'intermediate',
      diet_pattern: '1-2 meals/day', equipment_json: '["dumbbells","cables"]', mobility_priorities_json: '["hips"]',
      coach_style: 'demanding', training_days_min: 3, training_days_target: 4, training_days_stretch: 5, onboarded: 1,
      created_at: '2026-09-01T00:00:00.000Z',
    })
    expect(p).toEqual({
      name: 'Alex Tan', dob: '1989-02-11', sex: 'male', heightCm: 179, units: 'metric', experience: 'intermediate',
      dietPattern: '1-2 meals/day', equipment: ['dumbbells', 'cables'], mobilityPriorities: ['hips'], coachStyle: 'demanding',
      trainingDaysMin: 3, trainingDaysTarget: 4, trainingDaysStretch: 5, onboarded: true,
    })
  })

  it('mapSession parses exercises_json and nullable columns', () => {
    const s = mapSession({
      id: 4, template_key: 'upper_a', name: 'Upper A', type: 'strength', tier: 'minimum', scheduled_date: '2026-09-10',
      status: 'planned', started_at: null, completed_at: null, duration_min: null, readiness: null, session_rpe: null,
      notes: '', exercises_json: '[{"exerciseId":"db_bench_press","sets":3,"repMin":8,"repMax":12,"loadKg":26,"restSec":120}]',
    })
    expect(s.id).toBe(4)
    expect(s.status).toBe('planned')
    expect(s.readiness).toBeNull()
    expect(s.exercises).toHaveLength(1)
    expect(s.exercises[0].exerciseId).toBe('db_bench_press')
    expect(s.exercises[0].loadKg).toBe(26)
  })

  it('mapSession tolerates corrupt exercises_json', () => {
    const s = mapSession({
      id: 1, template_key: 'x', name: 'x', type: 'strength', tier: 'target', scheduled_date: '2026-09-10', status: 'completed',
      started_at: 'a', completed_at: 'b', duration_min: 50, readiness: 'AMBER', session_rpe: 7.5, notes: 'n', exercises_json: '{oops',
    })
    expect(s.exercises).toEqual([])
    expect(s.readiness).toBe('AMBER')
    expect(s.sessionRpe).toBe(7.5)
  })

  it('mapSet converts pain_flag to boolean', () => {
    const base = { id: 9, session_id: 4, exercise_id: 'lat_pulldown', set_index: 1, reps: 10, load_kg: 55, rir: 2, rpe: null, duration_sec: null, logged_at: '2026-09-07T10:00:00.000Z' }
    expect(mapSet({ ...base, pain_flag: 1 }).painFlag).toBe(true)
    expect(mapSet({ ...base, pain_flag: 0 })).toEqual({
      id: 9, sessionId: 4, exerciseId: 'lat_pulldown', setIndex: 1, reps: 10, loadKg: 55, rir: 2, rpe: null,
      durationSec: null, painFlag: false, loggedAt: '2026-09-07T10:00:00.000Z',
    })
  })

  it('mapMeal attaches items and maps saved flags', () => {
    const item = mapFoodItem({
      id: 2, meal_id: 7, food_name: 'Chicken rice, no skin', quantity_g: 350, serving_description: '1 plate',
      kcal: 520, protein_g: 38, carbs_g: 60, fat_g: 12, source: 'search', confidence: null, uncertainty_reason: null,
    })
    const meal = mapMeal(
      { id: 7, ts: '2026-09-09T04:30:00.000Z', meal_type: 'lunch', photo_uri: null, notes: '', source: 'clone', saved_name: 'Chicken rice', is_saved: 1 },
      [item],
    )
    expect(meal.isSaved).toBe(true)
    expect(meal.savedName).toBe('Chicken rice')
    expect(meal.photoUri).toBeNull()
    expect(meal.items).toHaveLength(1)
    expect(meal.items[0].mealId).toBe(7)
    expect(meal.items[0].uncertaintyReason).toBeNull()
    expect(mapMeal({ id: 8, ts: 't', meal_type: 'drink', photo_uri: 'file:///a.jpg', notes: 'x', source: 'photo', saved_name: null, is_saved: 0 }).items).toEqual([])
  })

  it('mapMacros zero-fills null sums and rounds', () => {
    expect(mapMacros(null)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
    expect(mapMacros({ kcal: 5, protein_g: 0.30000000000000004, carbs_g: null, fat_g: 1.25 })).toEqual({ kcal: 5, proteinG: 0.3, carbsG: 0, fatG: 1.3 })
  })

  it('mapTarget keeps an open end_date as null', () => {
    const t = mapTarget({ id: 1, start_date: '2026-09-01', end_date: null, kcal: 2050, protein_g: 150, carbs_g: 190, fat_g: 65, rationale: 'r' })
    expect(t.endDate).toBeNull()
    expect(t.proteinG).toBe(150)
  })

  it('mapSymptom parses red flags', () => {
    const s = mapSymptom({
      id: 3, ts: '2026-09-10T00:30:00.000Z', region: 'knee_left', pain_score: 2, red_flags_json: '{"locking":false,"swelling":true}',
      notes: '', context: 'morning', session_id: null,
    })
    expect(s.redFlags).toEqual({ locking: false, swelling: true })
    expect(s.sessionId).toBeNull()
    expect(s.painScore).toBe(2)
  })

  it('mapExercise parses tag lists and timed flag', () => {
    const e = mapExercise({
      id: 'plank', name: 'Plank', equipment: 'bodyweight', primary_muscles_json: '["core"]', secondary_muscles_json: '[]',
      pattern: 'core', safety_tags_json: '["spinal_load"]', substitutions_json: '["dead_bug"]', instructions: 'Brace.', timed: 1,
    })
    expect(e.timed).toBe(true)
    expect(e.safetyTags).toEqual(['spinal_load'])
    expect(e.substitutions).toEqual(['dead_bug'])
  })

  it('mapDecision parses evidence and action, with safe fallbacks', () => {
    const d = mapDecision({
      id: 1, ts: '2026-09-08T01:00:00.000Z', kind: 'reflow_week', title: 'Move lower session', rationale: 'Missed Tuesday',
      evidence_json: '[{"label":"Missed","value":"Tue"}]', action_json: '{"kind":"reflow_week","payload":{"moves":1},"summary":"Shift"}',
      status: 'accepted', result_notes: 'done', decided_at: '2026-09-08T02:00:00.000Z',
    })
    expect(d.evidence).toEqual([{ label: 'Missed', value: 'Tue' }])
    expect(d.action.kind).toBe('reflow_week')
    expect(d.status).toBe('accepted')

    const broken = mapDecision({
      id: 2, ts: 't', kind: 'k', title: 't', rationale: 'r', evidence_json: 'nope', action_json: '',
      status: 'proposed', result_notes: '', decided_at: null,
    })
    expect(broken.evidence).toEqual([])
    expect(broken.action).toEqual({ kind: 'note', payload: {}, summary: '' })
    expect(broken.decidedAt).toBeNull()
  })

  it('mapVoice parses the payload', () => {
    const v = mapVoice({ id: 1, ts: 't', transcript: 'Weight today 83.4 kilos', intent: 'log_body_metric', payload_json: '{"value":83.4}', status: 'applied' })
    expect(v.payload).toEqual({ value: 83.4 })
    expect(v.status).toBe('applied')
  })
})
