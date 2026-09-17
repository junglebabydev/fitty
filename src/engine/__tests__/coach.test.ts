import { describe, expect, it } from 'vitest'
import { addDays } from '../../lib/util'
import { answerLocally, buildCoachSystemPrompt, computeDailyPriority, generateProposals, weeklyReview, type CoachFacts } from '../coach'
import { evaluateNutritionTrend } from '../nutrition'
import { computeReadiness } from '../readiness'
import { evaluateSymptomGate } from '../symptomGate'
import { TARGET, TODAY, WEEK_START, checkIn, session, sym } from './fixtures'

const GUILT = /\b(lazy|shame|shameful|fail|failed|failure|guilt|guilty|pathetic|excuse)\b/i

function seedFacts(over: Partial<CoachFacts> = {}): CoachFacts {
  const symptoms = [sym('knee_left', 2)]
  const readiness = computeReadiness({ sleepLastNightMin: 370, sleepAvg7Min: 425, symptoms, checkIn: checkIn({ soreness: 2 }), sessionsLast7: 2 })
  const planned = session('upper_a', TODAY, 'planned')
  return {
    today: TODAY,
    hourNow: 12,
    readiness,
    gate: evaluateSymptomGate(symptoms),
    plannedToday: planned,
    sessionsThisWeek: [session('upper_a', WEEK_START, 'completed'), planned, session('full_b', addDays(WEEK_START, 4)), session('conditioning_bike', addDays(WEEK_START, 5))],
    weekTier: 'target',
    intakeToday: { kcal: 5, proteinG: 0, carbsG: 1, fatG: 0 },
    target: TARGET,
    proteinPaceExpected: 45,
    savedMealNames: ['Chicken rice, no skin, extra cucumber', 'Fish soup with rice', 'Greek yogurt, whey & berries'],
    recentHighProteinFoods: ['Chicken breast', 'Greek yogurt'],
    weight: { latest: 84.0, avg7: 84.2, prevAvg7: 84.6, goal: 74 },
    sleepLastNightMin: 370,
    sleepAvg7Min: 425,
    missedThisWeek: 0,
    nutritionTrend: null,
    stalls: [],
    loggedMealDaysLast7: 5,
    ...over,
  }
}

describe('computeDailyPriority (PRD §13)', () => {
  it('seed scenario: upper-body session, low-impact conditioning, high-protein lunch, evidence sleep + knee + protein', () => {
    const p = computeDailyPriority(seedFacts())
    expect(p.headline).toBe('Do the upper-body session today.')
    expect(p.directives.some((d) => /low impact/i.test(d))).toBe(true)
    expect(p.directives.some((d) => /high-protein lunch/i.test(d))).toBe(true)
    expect(p.directives.some((d) => /Fish soup with rice|Chicken rice/.test(d))).toBe(true)
    const ev = JSON.stringify(p.evidence)
    expect(ev).toMatch(/sleep/i)
    expect(ev).toMatch(/knee/i)
    expect(ev).toMatch(/protein/i)
    expect(ev).toMatch(/6h 10m/)
    expect(p.tone).toBe('steady')
    expect(p.headline + p.directives.join(' ')).not.toMatch(GUILT)
  })

  it('still recommends a high-protein lunch early in the morning when nothing but coffee is in', () => {
    const p = computeDailyPriority(seedFacts({ hourNow: 9 }))
    expect(p.directives.some((d) => /high-protein lunch/i.test(d))).toBe(true)
  })

  it('no protein directive once intake is on pace', () => {
    const p = computeDailyPriority(seedFacts({ intakeToday: { kcal: 700, proteinG: 60, carbsG: 60, fatG: 20 }, proteinPaceExpected: 45 }))
    expect(p.directives.some((d) => /high-protein/i.test(d))).toBe(false)
  })

  it('8 PM rule: offers the 25–35 minute version before any skip', () => {
    const p = computeDailyPriority(seedFacts({ hourNow: 20 }))
    expect(p.headline).toMatch(/25–35 minute version of the upper-body session/)
    expect(p.tone).toBe('push')
    expect(p.directives[0]).toMatch(/two sets each/i)
    expect(p.directives[0]).not.toMatch(/skip/i)
    expect(p.directives.some((d) => /tomorrow/.test(d))).toBe(true)
    expect(p.evidence[0].label).toBe('Time')
  })

  it('8 PM with the workout already done does not nag', () => {
    const p = computeDailyPriority(seedFacts({ hourNow: 21, plannedToday: session('upper_a', TODAY, 'completed') }))
    expect(p.headline).toMatch(/done/i)
    expect(p.headline).not.toMatch(/25–35/)
  })

  it('three missed days: rebuild around the 3-session minimum with no guilt wording', () => {
    const wk = [session('upper_a', WEEK_START), session('lower_a', addDays(WEEK_START, 1)), session('conditioning_bike', addDays(WEEK_START, 2)), session('full_b', addDays(WEEK_START, 5))]
    const p = computeDailyPriority(seedFacts({ missedThisWeek: 3, plannedToday: null, sessionsThisWeek: wk }))
    expect(p.headline).toMatch(/3 strength sessions/)
    expect(p.directives.some((d) => /reflow/i.test(d))).toBe(true)
    expect(p.tone).toBe('steady')
    const text = JSON.stringify(p)
    expect(text).not.toMatch(GUILT)
    expect(text).not.toContain('lazy')
    expect(text).not.toContain('shame')
    expect(text).not.toContain('fail')
    const proposals = generateProposals(seedFacts({ missedThisWeek: 3, plannedToday: null, sessionsThisWeek: wk }))
    expect(proposals.some((x) => x.action.kind === 'reflow_week')).toBe(true)
    expect(JSON.stringify(proposals)).not.toMatch(GUILT)
  })

  it('RED readiness → protect: no session, advice to get red flags assessed, no pressure', () => {
    const symptoms = [sym('knee_right', 3, { givingWay: true })]
    const readiness = computeReadiness({ sleepLastNightMin: 450, sleepAvg7Min: 430, symptoms, checkIn: null, sessionsLast7: 2 })
    const p = computeDailyPriority(seedFacts({ readiness, gate: evaluateSymptomGate(symptoms) }))
    expect(p.tone).toBe('protect')
    expect(p.headline).toMatch(/no upper-body session/)
    expect(p.directives.some((d) => /assessed/i.test(d))).toBe(true)
    expect(p.directives.some((d) => /^Do the/.test(d))).toBe(false)
    expect(p.evidence[0].label).toBe('Readiness')
  })

  it('RED from pain alone (no red flags) still advises clinical assessment', () => {
    const symptoms = [sym('knee_left', 7)]
    const readiness = computeReadiness({ sleepLastNightMin: 450, sleepAvg7Min: 430, symptoms, checkIn: null, sessionsLast7: 2 })
    expect(readiness.state).toBe('RED')
    const p = computeDailyPriority(seedFacts({ readiness, gate: evaluateSymptomGate(symptoms) }))
    expect(p.tone).toBe('protect')
    expect(p.directives.some((d) => /assessed/i.test(d))).toBe(true)
    expect(p.directives.some((d) => /pain above 5\/10.*clinical assessment/i.test(d))).toBe(true)
  })

  it('five hours sleep, otherwise well → reduced volume, not a rest day', () => {
    const readiness = computeReadiness({ sleepLastNightMin: 300, sleepAvg7Min: 430, symptoms: [], checkIn: checkIn({ soreness: 1, energy: 6 }), sessionsLast7: 2 })
    expect(readiness.state).toBe('AMBER')
    const p = computeDailyPriority(seedFacts({ readiness, gate: evaluateSymptomGate([]), sleepLastNightMin: 300 }))
    expect(p.headline).toBe('Do the upper-body session today.')
    expect(p.directives[0]).toMatch(/reduced volume, not a rest day/)
    expect(p.directives.some((d) => /low impact/i.test(d))).toBe(false)
  })

  it('calls out missed sessions and unlogged meals plainly', () => {
    const p = computeDailyPriority(seedFacts({ missedThisWeek: 1, loggedMealDaysLast7: 2, stalls: [{ exerciseName: 'Dumbbell Bench Press' }] }))
    expect(p.directives.some((d) => /1 session missed this week/.test(d))).toBe(true)
    // A missed session is one that has NOT been reflowed yet — never claim the mutation happened.
    expect(p.directives.some((d) => /has been reflowed/i.test(d))).toBe(false)
    expect(p.directives.some((d) => /reflow it on Train or accept the reflow proposal/.test(d))).toBe(true)
    expect(answerLocally('How am I doing this week?', seedFacts({ missedThisWeek: 1 })).content).not.toMatch(/reflowed/)
    expect(p.directives.some((d) => /only 2 of the last 7 days/.test(d))).toBe(true)
    expect(p.directives.some((d) => /Dumbbell Bench Press stalled/.test(d))).toBe(true)
    expect(JSON.stringify(p)).not.toMatch(GUILT)
  })

  it('GREEN with nothing planned → rest-day guidance', () => {
    const readiness = computeReadiness({ sleepLastNightMin: 450, sleepAvg7Min: 430, symptoms: [], checkIn: null, sessionsLast7: 2 })
    const p = computeDailyPriority(seedFacts({ readiness, gate: evaluateSymptomGate([]), plannedToday: null, sessionsThisWeek: [session('upper_a', WEEK_START, 'completed'), session('lower_a', addDays(WEEK_START, 2), 'completed'), session('full_b', addDays(WEEK_START, 4))] }))
    expect(p.headline).toMatch(/Rest day/)
    expect(p.tone).toBe('steady')
  })
})

describe('generateProposals', () => {
  it('flat weight with adherence → nutrition_target −150 with evidence', () => {
    const weights = Array.from({ length: 21 }, (_, i) => ({ id: i, ts: `${addDays(TODAY, -(20 - i))}T07:00:00`, type: 'weight' as const, value: 84, unit: 'kg', source: 'seed' as const }))
    const intake = Array.from({ length: 14 }, (_, i) => ({ date: addDays(TODAY, -(13 - i)), kcal: 2000, proteinG: 150, logged: true }))
    const trend = evaluateNutritionTrend({ weights, waists: [], intake, target: TARGET, today: TODAY })
    const props = generateProposals(seedFacts({ nutritionTrend: trend }))
    const nt = props.find((p) => p.kind === 'nutrition_target')
    expect(nt).toBeDefined()
    expect(nt!.title).toMatch(/Lower calories by 150/)
    expect(nt!.action.payload.kcal).toBe(1900)
    expect(nt!.evidence.length).toBeGreaterThan(0)
    expect(nt!.rationale).toMatch(/flat/i)
  })

  it('stall → deload proposal; AMBER with a planned strength session → volume proposal', () => {
    const props = generateProposals(seedFacts({ stalls: [{ exerciseName: 'Lat Pulldown' }] }))
    expect(props.find((p) => p.kind === 'deload')?.action.payload).toMatchObject({ exerciseName: 'Lat Pulldown', pct: 10 })
    expect(props.some((p) => p.kind === 'volume')).toBe(true)
  })

  it('nothing to propose on a clean GREEN day', () => {
    const readiness = computeReadiness({ sleepLastNightMin: 450, sleepAvg7Min: 430, symptoms: [], checkIn: null, sessionsLast7: 2 })
    expect(generateProposals(seedFacts({ readiness, gate: evaluateSymptomGate([]) }))).toEqual([])
  })
})

describe('weeklyReview', () => {
  it('returns 0–100 percentages with highlights and concerns', () => {
    const r = weeklyReview({ ...seedFacts({ sessionsThisWeek: [session('upper_a', WEEK_START, 'completed'), session('lower_a', addDays(WEEK_START, 2), 'completed'), session('full_b', addDays(WEEK_START, 4), 'completed'), session('conditioning_bike', addDays(WEEK_START, 5))] }), completedSessions: 3, plannedSessions: 4, loggedDays: 6, sleepNights: 7, avgSleepMin: 425 })
    expect(r.training).toBe(75)
    expect(r.nutrition).toBeGreaterThanOrEqual(0)
    expect(r.nutrition).toBeLessThanOrEqual(100)
    expect(r.sleep).toBe(100)
    expect(r.highlights.some((h) => /minimum met/.test(h))).toBe(true)
    expect(r.highlights.some((h) => /Weight down 0.40 kg/.test(h))).toBe(true)
    expect(r.summary).toMatch(/Training 75%/)
    expect(JSON.stringify(r)).not.toMatch(GUILT)
  })

  it('handles an empty week', () => {
    const r = weeklyReview({ ...seedFacts({ sessionsThisWeek: [], plannedToday: null }), completedSessions: 0, plannedSessions: 0, loggedDays: 0, sleepNights: 0, avgSleepMin: null })
    expect(r.training).toBe(0)
    expect(r.sleep).toBe(0)
    expect(r.concerns.length).toBeGreaterThan(0)
  })
})

describe('buildCoachSystemPrompt / answerLocally', () => {
  it('system prompt is safety-bounded, evidence-linked and forbids calorie math', () => {
    const s = buildCoachSystemPrompt(seedFacts(), 'Alex Tan, 37, 179 cm, 84 kg, cutting to 74 kg')
    expect(s).toMatch(/Do NOT do calorie or macro arithmetic/)
    expect(s).toMatch(/Never diagnose/)
    expect(s).toMatch(/Do the upper-body session today\./)
    expect(s).toMatch(/Readiness: AMBER/)
    expect(s).toMatch(/PROPOSAL:/)
    expect(s).toMatch(/Alex Tan/)
  })

  it('answers common questions deterministically with evidence', () => {
    const f = seedFacts()
    expect(answerLocally('How am I doing this week?', f).content).toMatch(/sessions done this week/)
    expect(answerLocally('what should I eat', f).content).toMatch(/150 g protein/)
    expect(answerLocally('should I train today', f).content).toMatch(/AMBER/)
    expect(answerLocally('how is my weight', f).content).toMatch(/84\.0 kg/)
    expect(answerLocally('how did I sleep', f).content).toMatch(/6h 10m/)
    expect(answerLocally('my knee', f).content).toMatch(/knee/i)
    const fallback = answerLocally('tell me a joke', f)
    expect(fallback.content).toMatch(/upper-body session/)
    expect(fallback.evidence.length).toBeGreaterThan(0)
  })
})
