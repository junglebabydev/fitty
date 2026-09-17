import { describe, expect, it } from 'vitest'
import { matchExercise, normalizeTranscript, parseMealCorrection, parseVoiceCommand, resolveDayRef, wordsToDigits } from '../voice'
import { LIBRARY, TODAY } from './fixtures'

const ctx = {
  exercises: LIBRARY,
  savedMeals: ['Chicken rice, no skin, extra cucumber', 'Fish soup with rice', 'Greek yogurt, whey & berries'],
  now: `${TODAY}T12:15:00`,
}
const parse = (t: string) => parseVoiceCommand(t, ctx)

describe('word numbers', () => {
  it('converts word numbers, decimals and hundreds', () => {
    expect(wordsToDigits('eighty three point four')).toBe('83.4')
    expect(wordsToDigits('three eggs two toast and a latte')).toBe('3 eggs 2 toast and a latte')
    expect(wordsToDigits('a hundred and five kilos')).toBe('105 kilos')
    expect(wordsToDigits('twenty five for twelve')).toBe('25 for 12')
    expect(wordsToDigits('seventy')).toBe('70')
    expect(wordsToDigits('one and a half scoops')).toBe('1.5 scoops')
    expect(normalizeTranscript("Start today's workout!")).toBe('start today workout')
  })
})

describe('parseVoiceCommand — PRD §7.4 examples', () => {
  it('"Weight today 83.4 kilos" → log_body_metric', () => {
    const r = parse('Weight today 83.4 kilos')
    expect(r.intent).toBe('log_body_metric')
    expect(r.payload).toMatchObject({ type: 'weight', value: 83.4, unit: 'kg', date: TODAY })
    expect(r.confidence).toBeGreaterThan(0.85)
    expect(r.preview).toMatch(/83\.4 kg/)
  })

  it('word-number weight and lbs → kg conversion', () => {
    expect(parse('weight eighty three point four kilos').payload).toMatchObject({ type: 'weight', value: 83.4, unit: 'kg' })
    const lbs = parse('I weighed 185 pounds this morning')
    expect(lbs.intent).toBe('log_body_metric')
    expect(lbs.payload).toMatchObject({ type: 'weight', value: 83.9, unit: 'kg', originalUnit: 'lbs' })
    expect(parse('weight yesterday 84 kg').payload.date).toBe('2026-09-09')
    expect(parse('waist 33 inches').payload).toMatchObject({ type: 'waist', value: 83.8, unit: 'cm' })
  })

  it('"Three eggs, two toast and a latte" → log_meal with digit quantities', () => {
    const r = parse('Three eggs, two toast and a latte')
    expect(r.intent).toBe('log_meal')
    expect(r.payload.items).toEqual([
      { name: 'eggs', qty: 3 },
      { name: 'toast', qty: 2 },
      { name: 'latte', qty: 1 },
    ])
    expect(r.payload.mealType).toBe('lunch')
    expect(r.needsConfirmation).toBe(true)
    expect(r.preview).toMatch(/3 × eggs/)
  })

  it('meal prefixes, units and drinks', () => {
    const r = parse('I had half a chicken rice and 2 cups of coffee for dinner')
    expect(r.intent).toBe('log_meal')
    expect(r.payload.mealType).toBe('dinner')
    expect(r.payload.items).toEqual([{ name: 'chicken rice', qty: 0.5 }, { name: 'coffee', qty: 2, unit: 'cups' }])
    const drink = parse('a black kopi')
    expect(drink.intent).toBe('log_meal')
    expect(drink.payload.mealType).toBe('drink')
    const grams = parse('200 grams of rice and a scoop of whey')
    expect(grams.payload.items).toEqual([{ name: 'rice', qty: 1, unit: 'grams', quantityG: 200 }, { name: 'whey', qty: 1, unit: 'scoop' }])
  })

  it('"Bench 70 kilos for eight, RIR two" → log_set', () => {
    const r = parse('Bench 70 kilos for eight, RIR two')
    expect(r.intent).toBe('log_set')
    expect(r.payload).toMatchObject({ exerciseId: 'db_bench_press', loadKg: 70, reps: 8, rir: 2 })
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
    expect(r.preview).toMatch(/Dumbbell Bench Press 70 kg × 8 RIR 2/)
  })

  it('fuzzy-matches exercise aliases and unit variants', () => {
    expect(parse('lat pulldown 55 kilos for 10').payload).toMatchObject({ exerciseId: 'lat_pulldown', loadKg: 55, reps: 10 })
    expect(parse('leg press 120 for twelve').payload).toMatchObject({ exerciseId: 'leg_press', loadKg: 120, reps: 12 })
    expect(parse('rows forty kilos for ten rir one').payload).toMatchObject({ exerciseId: 'seated_cable_row', loadKg: 40, reps: 10, rir: 1 })
    expect(parse('shoulder press 16 kg 10 reps').payload).toMatchObject({ exerciseId: 'db_shoulder_press', loadKg: 16, reps: 10 })
    expect(parse('curls 12 kilos for 12 rpe 8').payload).toMatchObject({ exerciseId: 'db_curl', loadKg: 12, reps: 12, rpe: 8 })
    expect(parse('RDL 30 kg for 10').payload).toMatchObject({ exerciseId: 'db_rdl', loadKg: 30 })
    expect(parse('hip thrust 60 for 12').payload).toMatchObject({ exerciseId: 'hip_thrust', loadKg: 60, reps: 12 })
    expect(parse('pushdown 25 for 15').payload).toMatchObject({ exerciseId: 'triceps_pushdown' })
    expect(parse('bench 155 pounds for 5').payload).toMatchObject({ exerciseId: 'db_bench_press', loadKg: 70.5, loadUnit: 'lbs' })
    expect(parse('plank 45 seconds').payload).toMatchObject({ exerciseId: 'plank', durationSec: 45 })
    expect(parse('bike 20 minutes').payload).toMatchObject({ exerciseId: 'stationary_bike', durationSec: 1200 })
    expect(parse('goblet squat 24 kilos for 10').payload).toMatchObject({ exerciseId: 'goblet_squat' })
    expect(parse('pulldwon 55 kilos for 10').payload).toMatchObject({ exerciseId: 'lat_pulldown' })
    expect(matchExercise('incline', LIBRARY)?.exercise.id).toBe('incline_db_press')
    expect(matchExercise('calf raise', LIBRARY)?.exercise.id).toBe('standing_calf_raise')
  })

  it('"Start today\'s workout" → start_workout', () => {
    const r = parse("Start today's workout")
    expect(r.intent).toBe('start_workout')
    expect(r.needsConfirmation).toBe(false)
    expect(parse("let's train").intent).toBe('start_workout')
  })

  it('"My left knee hurts today" → log_symptom with knee_left', () => {
    const r = parse('My left knee hurts today')
    expect(r.intent).toBe('log_symptom')
    expect(r.payload).toMatchObject({ region: 'knee_left', context: 'voice' })
    expect(r.payload.painScore).toBeUndefined()
    expect(r.needsConfirmation).toBe(true)
    expect(r.preview).toMatch(/left knee/)
  })

  it('parses pain scores, sides and red flags', () => {
    expect(parse('my left knee hurts, 7 out of 10').payload).toMatchObject({ region: 'knee_left', painScore: 7 })
    expect(parse('right knee pain 4').payload).toMatchObject({ region: 'knee_right', painScore: 4 })
    expect(parse('lower back is sore, about 3 out of ten').payload).toMatchObject({ region: 'back_lower', painScore: 3 })
    expect(parse('neck is a bit stiff').payload).toMatchObject({ region: 'neck', painScore: 2 })
    const flag = parse('my right knee locked up and gave way on the stairs')
    expect(flag.intent).toBe('log_symptom')
    expect(flag.payload.redFlags).toMatchObject({ locking: true, givingWay: true })
    expect(parse('numbness shooting down my leg from my back').payload.redFlags).toMatchObject({ numbness: true, radiating: true })
    const unspecified = parse('my knee hurts')
    expect(unspecified.payload.sideUnspecified).toBe(true)
  })

  it('"Swap squats for something easier on my knee" → request_substitution', () => {
    const r = parse('Swap squats for something easier on my knee')
    expect(r.intent).toBe('request_substitution')
    expect(r.payload.exerciseId).toBe('goblet_squat')
    expect(r.payload.regionGroup).toBe('knee')
    expect(['knee_left', 'knee_right']).toContain(r.payload.region)
    expect(r.needsConfirmation).toBe(true)
    expect(parse('substitute the shoulder press, my neck is bothering me').payload).toMatchObject({ exerciseId: 'db_shoulder_press', region: 'neck' })
  })

  it('"Same lunch as Tuesday" → clone_meal', () => {
    const r = parse('Same lunch as Tuesday')
    expect(r.intent).toBe('clone_meal')
    expect(r.payload).toMatchObject({ mealType: 'lunch', dayRef: 'tuesday', date: '2026-09-08' })
    expect(parse('same dinner as yesterday').payload).toMatchObject({ mealType: 'dinner', dayRef: 'yesterday', date: '2026-09-09' })
    expect(resolveDayRef('thursday', TODAY)).toBe('2026-09-03')
    expect(resolveDayRef('last friday', TODAY)).toBe('2026-09-04')
  })

  it('recognises saved meals by name', () => {
    const r = parse('log the fish soup with rice')
    expect(r.intent).toBe('clone_meal')
    expect(r.payload.savedMealName).toBe('Fish soup with rice')
    expect(parse('greek yogurt whey and berries again').payload.savedMealName).toBe('Greek yogurt, whey & berries')
  })

  it('"How am I doing this week?" → coach_query', () => {
    const r = parse('How am I doing this week?')
    expect(r.intent).toBe('coach_query')
    expect(r.payload.question).toBe('How am I doing this week?')
    expect(r.needsConfirmation).toBe(false)
    expect(parse('what should I eat for dinner').intent).toBe('coach_query')
    expect(parse('should I train today').intent).toBe('coach_query')
  })

  it('unknown for gibberish', () => {
    const r = parse('the quick brown fox jumps over the lazy dog tonight okay')
    expect(r.intent).toBe('unknown')
    expect(r.confidence).toBe(0)
    expect(parse('').intent).toBe('unknown')
  })
})

describe('parseMealCorrection', () => {
  const items = [
    { foodName: 'Steamed rice', quantityG: 200 },
    { foodName: 'Chicken skin', quantityG: 20 },
    { foodName: 'Roast chicken', quantityG: 120 },
    { foodName: 'Latte', quantityG: 240 },
  ]

  it('"half the rice, no skin" → scale rice 0.5 and remove skin', () => {
    const r = parseMealCorrection('half the rice, no skin', items)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ itemIndex: 0, op: 'scale', factor: 0.5 })
    expect(r[0].note).toMatch(/200 g → 100 g/)
    expect(r[1]).toMatchObject({ itemIndex: 1, op: 'remove' })
  })

  it('double, remove and set grams', () => {
    expect(parseMealCorrection('double the chicken', items)[0]).toMatchObject({ itemIndex: 2, op: 'scale', factor: 2 })
    expect(parseMealCorrection('remove the latte', items)[0]).toMatchObject({ itemIndex: 3, op: 'remove' })
    expect(parseMealCorrection('150 grams of rice', items)[0]).toMatchObject({ itemIndex: 0, op: 'set_quantity', quantityG: 150 })
    expect(parseMealCorrection('a bit less rice and no chicken skin', items)).toEqual([
      expect.objectContaining({ itemIndex: 0, op: 'scale', factor: 0.75 }),
      expect.objectContaining({ itemIndex: 1, op: 'remove' }),
    ])
  })

  it('ignores clauses that match nothing', () => {
    expect(parseMealCorrection('no broccoli', items)).toEqual([])
    expect(parseMealCorrection('half', [{ foodName: 'Nasi lemak', quantityG: 300 }])[0]).toMatchObject({ itemIndex: 0, factor: 0.5 })
  })
})
