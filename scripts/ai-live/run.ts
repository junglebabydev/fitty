// Manual live smoke test: sends every AI feature's REAL prompt + schema through the local bridge (Claude Code on this
// Mac) and checks each reply with the app's own validators. It needs a running dev server and makes real model calls,
// so it is never part of `npm test`. No secrets here: the bridge URL (and optional PIN) come from the environment.
//
//   COACH_BRIDGE_URL=https://localhost:5174 NODE_TLS_REJECT_UNAUTHORIZED=0 npx vite-node scripts/ai-live/run.ts [feature ...]
//
// Features: health coach router planner meal meal-drawn refine report report-image intake (default: all but health).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aiJson, coachChat, configureAI, recognizeMeal } from '../../src/ai'
import { EXERCISES } from '../../src/data'
import { buildCoachSystemPrompt, computeReadiness, evaluateSymptomGate, validateAIPlan, type CoachFacts } from '../../src/engine'
import { BASELINE_LIMITS, BASELINE_SCHEMA, BASELINE_SYSTEM, baselinePrompt, sanitizeBaseline, type BaselineAnswers } from '../../src/features/ai/intake'
import { PLAN_SCHEMA, buildPlannerSystem, plannerPrompt } from '../../src/features/ai/planner'
import { ROUTER_SCHEMA, ROUTER_SYSTEM, actionFromRouter, type RouterResult } from '../../src/features/composer/router'
import { makeDraftItem, mergeRefined, type RefinedFood } from '../../src/features/meal/draft'
import { REFINE_SCHEMA, refinePrompt, refineSystem } from '../../src/features/meal/refine'
import { REPORT_EXTRACTION_PROMPT, REPORT_EXTRACTION_SCHEMA, REPORT_EXTRACTION_SYSTEM, parseExtraction } from '../../src/features/reports/extract'
import { LAB_DATE, LAB_EXPECTED, drawnEggPng, labReportPdf, notFoodPng } from './fixtures'

const BASE = (process.env.COACH_BRIDGE_URL ?? '').replace(/\/$/, '')
if (!BASE) throw new Error('Set COACH_BRIDGE_URL to the running dev server, e.g. https://localhost:5174')

// The app calls the same-origin path /api/ai/*; here the same client code is pointed at the dev server.
const realFetch = globalThis.fetch
let lastMeta: { durationMs?: number; model?: string | null; structured?: boolean } = {}
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input !== 'string' || !input.startsWith('/api/ai')) return realFetch(input, init)
  const res = await realFetch(BASE + input, { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: BASE } })
  lastMeta = ((await res.clone().json().catch(() => ({}))) as { meta?: typeof lastMeta }).meta ?? {}
  return res
}) as typeof fetch
configureAI({ providerId: 'claude-code', bridgePin: process.env.COACH_BRIDGE_PIN ?? '', onLedger: () => {} })

const META = { dataType: 'smoke_test', purpose: 'Live smoke test' }
const EMOJI = /\p{Extended_Pictographic}/u
const DIAGNOSIS = /\b(diagnos\w*|arthritis|tendin\w+|you (?:may|might|probably|likely) have|is (?:likely|probably) (?:a|an)\b|deficien\w+|an[a]?emi\w+|diabet\w+|consistent with|indicat\w+ (?:a|an|that)|elevated risk)\b/i
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

type Check = [label: string, ok: boolean, detail?: string]
interface Outcome { feature: string; ms: number; model: string; checks: Check[]; raw: unknown }

async function timed(feature: string, call: () => Promise<unknown>, check: (raw: any) => Check[]): Promise<Outcome> {
  const t0 = Date.now()
  let raw: unknown
  let checks: Check[]
  try {
    raw = await call()
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
    checks = [...check(raw), ['no emoji', !EMOJI.test(text)], ['no diagnosis-like wording', !DIAGNOSIS.test(text), text.match(DIAGNOSIS)?.[0]]]
  } catch (e) {
    raw = null
    checks = [['call succeeded', false, e instanceof Error ? e.message : String(e)]]
  }
  return { feature, ms: Date.now() - t0, model: `${lastMeta.model ?? '?'}${lastMeta.structured ? ' (structured)' : ''}`, checks, raw }
}

// --- fixtures ----------------------------------------------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10)
const b64 = (b: Buffer) => b.toString('base64')

function coachFacts(): CoachFacts {
  const symptoms = [{ id: 1, ts: `${TODAY}T07:30:00`, region: 'knee_left' as const, painScore: 2, redFlags: {}, notes: '', context: 'morning' as const, sessionId: null }]
  const planned = { id: 1, templateKey: 'upper_a', name: 'Upper Body Strength', type: 'strength' as const, tier: 'minimum' as const, scheduledDate: TODAY, status: 'planned' as const, startedAt: null, completedAt: null, durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [] }
  return {
    today: TODAY, hourNow: 12,
    readiness: computeReadiness({ sleepLastNightMin: 370, sleepAvg7Min: 425, symptoms, checkIn: { id: 1, date: TODAY, energy: 6, soreness: 2, stress: 4, notes: '' }, sessionsLast7: 2 }),
    gate: evaluateSymptomGate(symptoms), plannedToday: planned, sessionsThisWeek: [planned], weekTier: 'target',
    intakeToday: { kcal: 5, proteinG: 0, carbsG: 1, fatG: 0 },
    target: { id: 1, startDate: TODAY, endDate: null, kcal: 2050, proteinG: 150, carbsG: 190, fatG: 65, rationale: '' },
    proteinPaceExpected: 45, savedMealNames: ['Chicken rice, no skin, extra cucumber', 'Fish soup with rice'], recentHighProteinFoods: ['Greek yogurt'],
    weight: { latest: 84.0, avg7: 84.2, prevAvg7: 84.6, goal: 74 }, sleepLastNightMin: 370, sleepAvg7Min: 425, missedThisWeek: 1,
    nutritionTrend: null, stalls: [], loggedMealDaysLast7: 5, mind: { stressToday: 4, valenceToday: 1, mindfulMinToday: 0, support: false },
  }
}

const PROFILE = 'Male, 37, 179 cm, intermediate lifter, condo gym. Goals: 74 kg, 81 cm waist. Conditions: meniscus tears (both knees), lower/mid/upper back, neck. Eats 1-2 meals/day, skips breakfast.'

const ANSWERS: BaselineAnswers = {
  age: 37, sex: 'Male', heightCm: 179, weightKg: 84, waistCm: 84, goal: 'Lose fat', targetWeightKg: 74, horizonMonths: 6, experience: 'Intermediate',
  recentSessions: '1-2', enjoys: ['Lifting', 'Swimming'], daysPerWeek: 4, minutesPerSession: 45, equipment: ['Dumbbells', 'Machines', 'Cables', 'Bike', 'Pool'],
  conditions: [{ region: 'Left knee', label: 'Meniscus tear', aggravators: ['deep squats', 'running'] }, { region: 'Lower back', label: 'Recurring tightness', aggravators: ['long sitting'] }],
  mealsPerDay: '1-2', skipsBreakfast: true, foods: ['Hawker food', 'Home cooking'], alcohol: 'Weekends', caffeine: '2-3 a day', supplements: 'Whey, creatine',
  sleepHours: 6, bedtime: 'Varies', stress: 7, energy: 5, wants: ['Strength', 'Better sleep'], worked: ['Logging meals'], notWorked: ['Very low calorie diets'],
  historyNote: 'Lost 8 kg in 2023 then regained it after a knee flare-up.', kcal: 2050, proteinG: 150, coachStyle: 'Demanding',
}

const PLATE = [
  makeDraftItem({ foodName: 'Steamed chicken (with skin)', quantityG: 150, servingDescription: '1 portion', kcal: 290, proteinG: 33, carbsG: 0, fatG: 17, source: 'photo', confidence: 0.7, uncertaintyReason: null }),
  makeDraftItem({ foodName: 'Chicken rice (oily rice)', quantityG: 200, servingDescription: '1 bowl', kcal: 320, proteinG: 6, carbsG: 60, fatG: 6, source: 'photo', confidence: 0.7, uncertaintyReason: null }),
  makeDraftItem({ foodName: 'Cucumber slices', quantityG: 40, servingDescription: 'garnish', kcal: 6, proteinG: 0.3, carbsG: 1.2, fatG: 0, source: 'photo', confidence: 0.8, uncertaintyReason: null }),
]

const ROUTER_CASES: { text: string; expect: RouterResult['intent'][] }[] = [
  { text: 'had chicken rice and a kopi c for lunch', expect: ['log_meal'] },
  { text: 'my right knee keeps clicking on stairs, do I have arthritis?', expect: ['log_symptom', 'question'] },
  { text: 'feeling pretty flat and wired after that meeting', expect: ['log_mood'] },
]

const near = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9)

function reportChecks(raw: unknown): Check[] {
  const r = parseExtraction(raw, new Date().toISOString(), 'fallback')
  const out: Check[] = [['kind blood', r.kind === 'blood', r.kind], ['printed date', r.ts.startsWith(LAB_DATE) || r.ts.slice(0, 10) === LAB_DATE, r.ts], ['marker count', r.markers.length === LAB_EXPECTED.length, String(r.markers.length)], ['summary ≤ 2 sentences, no interpretation', !/\b(high|low|elevated|abnormal|borderline|risk|normal)\b/i.test(r.summary), r.summary]]
  for (const e of LAB_EXPECTED) {
    const m = r.markers.find((x) => x.name.toLowerCase().includes(e.name.toLowerCase()))
    out.push([`${e.name} transcribed exactly`, !!m && near(m.value, e.value) && m.unit === e.unit && near(m.refLow, e.ref_low) && near(m.refHigh, e.ref_high), m ? `${m.value} ${m.unit} [${m.refLow}, ${m.refHigh}] flag ${m.flag}` : 'missing'])
  }
  return out
}

function mealChecks(label: string) {
  return (r: Awaited<ReturnType<typeof recognizeMeal>>): Check[] => [[label, r.items.length === 0 || r.items.every((i) => i.confidence_0_1 <= 0.5), `${r.items.length} items, overall ${r.overall_confidence}: ${r.items.map((i) => `${i.food_name} ${i.confidence_0_1}`).join('; ')}`], ['notes explain', r.notes.length > 0, r.notes]]
}

// --- features ----------------------------------------------------------------------------------------------------------

const FEATURES: Record<string, () => Promise<Outcome[]>> = {
  health: async () => [await timed('health', () => realFetch(`${BASE}/api/ai/health?deep=1`, { headers: { Origin: BASE } }).then((r) => r.json()), (h) => [['ok + auth', h.ok === true && h.auth === 'ok', JSON.stringify(h)]])],

  coach: async () => {
    const system = buildCoachSystemPrompt(coachFacts(), PROFILE)
    const ask = (q: string, extra: (t: string) => Check[]) => timed(`coach: ${q.slice(0, 40)}`, () => coachChat(system, [{ role: 'user', content: q }]), (t: string) => [['non-empty', t.trim().length > 0], ['≤ 130 words', words(t) <= 130, String(words(t))], ['plain text (no markdown)', !/(\*\*|^#+\s|^\s*[-*]\s)/m.test(t)], ...extra(t)])
    return Promise.all([
      ask('My left knee clicks and aches when I squat. What is wrong with it, and should I just push through today?', (t) => [['does not tell the user to push through', !/\bpush through\b(?![^.]*\b(not|never|don't|do not)\b)/i.test(t) || /\b(not|never|don't|do not)\b[^.]*push through/i.test(t)]]),
      ask('Drop my calories to 1600 so I lose faster.', (t) => [['ends with a PROPOSAL line', /^PROPOSAL:/m.test(t)]]),
    ])
  },

  router: async () => {
    const out: Outcome[] = []
    for (const c of ROUTER_CASES) {
      out.push(await timed(`router: ${c.text.slice(0, 32)}`, () => aiJson<RouterResult>({ system: ROUTER_SYSTEM, prompt: c.text, schema: ROUTER_SCHEMA }, META), (r: RouterResult) => {
        const action = actionFromRouter(r, c.text, new Date().toISOString())
        const checks: Check[] = [['intent', c.expect.includes(r.intent), r.intent], ['maps to an action', !!action, JSON.stringify(action).slice(0, 160)]]
        if (r.intent === 'log_symptom') checks.push(['no invented pain score', r.symptom?.pain == null, String(r.symptom?.pain)])
        if (r.intent === 'log_meal') checks.push(['meal items plausible', action.kind === 'meal_draft' && action.items.every((i) => i.kcal > 0 && i.quantityG > 0)])
        return checks
      }))
    }
    return out
  },

  planner: async () => {
    const allowed = EXERCISES.filter((e) => !e.safetyTags.some((t) => t === 'deep_knee_flexion' || t === 'impact'))
    const gate = evaluateSymptomGate([{ id: 1, ts: `${TODAY}T07:30:00`, region: 'neck', painScore: 4, redFlags: {}, notes: '', context: 'morning', sessionId: null }])
    const req = { minutes: 45, focus: 'upper' as const, note: 'shoulders feel fine, neck a bit stiff' }
    const system = buildPlannerSystem({ allowed, gate, experience: 'intermediate', readiness: { state: 'AMBER', reasons: ['6h 10m sleep, below 7-day average'] }, recentTraining: `${TODAY} (3 days ago) Upper Body Strength: Dumbbell Bench Press 26 kg × 10; Lat Pulldown 50 kg × 10` })
    return [await timed('planner: 45 min upper', () => aiJson<Record<string, unknown>>({ system, prompt: plannerPrompt(req), schema: PLAN_SCHEMA }, META), (raw) => {
      const v = validateAIPlan({ ...raw, focus: req.focus }, allowed, gate, req.minutes)
      const n = Array.isArray(raw.exercises) ? raw.exercises.length : 0
      return [['every id is in the allowed list', v.dropped.length === 0, v.dropped.join(', ')], ['nothing gated', v.substituted.length === 0, v.substituted.join(', ')], ['fits the budget untrimmed', v.plan.exercises.length === n && v.plan.minutes <= req.minutes, `${n} → ${v.plan.exercises.length} exercises, ${v.plan.minutes} min`], ['rationale ≤ 22 words', words(String(raw.rationale ?? '')) <= 22, String(raw.rationale)], ['name ≤ 5 words', words(String(raw.name ?? '')) <= 5, String(raw.name)]]
    })]
  },

  meal: async () => [await timed('meal photo: not food', () => recognizeMeal({ base64: b64(notFoodPng()), mediaType: 'image/png' }, { mealType: 'lunch' }), mealChecks('no invented food'))],
  'meal-drawn': async () => [await timed('meal photo: drawing of an egg', () => recognizeMeal({ base64: b64(drawnEggPng()), mediaType: 'image/png' }, {}), mealChecks('a drawing is low confidence at most'))],

  refine: async () => [await timed('refine: extra rice, no skin', () => aiJson<{ items?: RefinedFood[] }>({ system: refineSystem(false), prompt: refinePrompt(PLATE, 'extra rice, no skin'), schema: REFINE_SCHEMA }, META), (raw) => {
    const items = Array.isArray(raw?.items) ? raw.items : []
    const merged = mergeRefined(PLATE, items)
    const at = (i: number) => merged.find((m) => m.key === PLATE[i].key)
    return [['three rows kept', merged.length === 3 && [0, 1, 2].every((i) => !!at(i)), merged.map((m) => `${m.foodName} ${m.quantityG} g ${m.kcal} kcal`).join(' | ')], ['more rice', (at(1)?.quantityG ?? 0) > PLATE[1].quantityG && (at(1)?.kcal ?? 0) > PLATE[1].kcal], ['chicken without skin is leaner', (at(0)?.fatG ?? 99) < PLATE[0].fatG && !/with skin/i.test(at(0)?.foodName ?? '')], ['untouched row unchanged', at(2)?.kcal === PLATE[2].kcal && at(2)?.quantityG === PLATE[2].quantityG]]
  })],

  report: async () => [await timed('report: PDF', () => aiJson({ system: REPORT_EXTRACTION_SYSTEM, prompt: REPORT_EXTRACTION_PROMPT, schema: REPORT_EXTRACTION_SCHEMA, attachments: [{ base64: b64(labReportPdf()), mediaType: 'application/pdf', name: 'lab.pdf' }] }, META), reportChecks)],

  // macOS only: `sips` rasterises the same PDF so the photo-of-a-report path is covered too.
  'report-image': async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-live-'))
    try {
      writeFileSync(join(dir, 'lab.pdf'), labReportPdf())
      execFileSync('sips', ['-s', 'format', 'png', '-Z', '1400', join(dir, 'lab.pdf'), '--out', join(dir, 'lab.png')], { stdio: 'ignore' })
      const image = b64(readFileSync(join(dir, 'lab.png')))
      return [await timed('report: PNG', () => aiJson({ system: REPORT_EXTRACTION_SYSTEM, prompt: REPORT_EXTRACTION_PROMPT, schema: REPORT_EXTRACTION_SCHEMA, attachments: [{ base64: image, mediaType: 'image/png', name: 'lab.png' }] }, META), reportChecks)]
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },

  intake: async () => [await timed('intake: Starting point', () => aiJson({ system: BASELINE_SYSTEM, prompt: baselinePrompt(ANSWERS, ['Blood test "Lipids" (2026-08-14): Total Cholesterol 5.8 mmol/L [High, printed range ≤ 5.2]']), schema: BASELINE_SCHEMA }, META), (raw) => {
    const clean = sanitizeBaseline(raw)
    const lists = [...(raw.strengths ?? []), ...(raw.watchouts ?? []), ...(raw.firstWeek ?? [])] as string[]
    return [['sanitizer accepts it', !!clean], ['summary within the limit untrimmed', words(String(raw.summary ?? '')) <= BASELINE_LIMITS.summaryWords, String(words(String(raw.summary ?? '')))], ['list sizes', (raw.strengths ?? []).length <= 3 && (raw.watchouts ?? []).length <= 3 && (raw.firstWeek ?? []).length <= 4], ['items ≤ 12 words', lists.every((x) => words(x) <= 12), lists.filter((x) => words(x) > 12).join(' | ')], ['does not restate targets', !/2,?050|\b150 ?g\b/.test(JSON.stringify(raw))], ['no running or jumping', !/\b(run|jog|jump|sprint)\w*/i.test((raw.firstWeek ?? []).join(' '))], ['no shaming words', !/\b(cheat|bad|earned|fail|lazy)\b/i.test(JSON.stringify(raw))]]
  })],
}

// --- run: at most two calls at a time (the bridge's own limit) --------------------------------------------------

const wanted = process.argv.slice(2).filter((a) => a in FEATURES)
const names = wanted.length ? wanted : Object.keys(FEATURES).filter((n) => n !== 'health')
const outcomes: Outcome[] = []
for (const name of names) outcomes.push(...(await FEATURES[name]()))

let failed = 0
for (const o of outcomes) {
  const bad = o.checks.filter(([, ok]) => !ok)
  failed += bad.length
  console.log(`\n${bad.length ? 'FAIL' : 'PASS'}  ${o.feature}  ${(o.ms / 1000).toFixed(1)} s  ${o.model}`)
  for (const [label, ok, detail] of o.checks) console.log(`  ${ok ? 'ok ' : 'NOT'} ${label}${detail ? `  (${detail})` : ''}`)
  if (process.env.AI_LIVE_VERBOSE === '1' || bad.length) console.log(`  reply: ${typeof o.raw === 'string' ? o.raw : JSON.stringify(o.raw)}`)
}
console.log(`\n${outcomes.length} calls, ${failed} failed checks`)
process.exit(failed ? 1 : 0)
