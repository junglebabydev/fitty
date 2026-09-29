// Plan-eval fixtures. Synthetic, in memory, no real health data and no database.
//
// Each case is a PlannerPromptInput (what buildPlannerSystem needs) plus the PlanRequest.
// Coverage is deliberate rather than exhaustive: focus × minutes × gate state × conditions ×
// equipment, with the cases that previously hid bugs kept as regressions.
import { EXERCISES } from '../../src/data'
import { baselineAvoidTags, evaluateSymptomGate, type GateResult } from '../../src/engine'
import type { Exercise, Region, SafetyTag } from '../../src/domain/types'
import type { PlannerPromptInput, PlanRequest } from '../../src/features/ai/planner'

export interface EvalCase {
  id: string
  why: string
  req: PlanRequest
  input: PlannerPromptInput
  /** Extra checks this case alone cares about. */
  expect?: {
    /** At least one chosen exercise must use one of these equipment classes. */
    usesEquipment?: string[]
    /** No chosen exercise may carry any of these tags. */
    forbidTags?: SafetyTag[]
  }
}

const OK_GATE: GateResult = { regions: [], avoidTags: [], overall: 'OK', advice: [] }

/** The library a user with these condition-flag regions may be shown (mirrors plannerLibrary()). */
function libraryFor(regions: Region[]): Exercise[] {
  const avoid = baselineAvoidTags(regions)
  return avoid.length ? EXERCISES.filter((e) => !e.safetyTags.some((t) => avoid.includes(t))) : EXERCISES
}

function amberKnee(): GateResult {
  return evaluateSymptomGate([{ id: 1, ts: new Date().toISOString(), region: 'knee_left', painScore: 3, redFlags: {}, notes: '', context: 'morning', sessionId: null }])
}

const COMMERCIAL = ['barbell', 'squat rack', 'bench', 'dumbbells to 40 kg', 'kettlebells', 'cables', 'machines', 'rower', 'assault bike']
const HOME = ['resistance bands', 'a pull-up bar', 'one 20 kg kettlebell']
const CONDO = ['dumbbells', 'selectorised machines', 'cables', 'lat pulldown', 'adjustable bench', 'stationary bike', 'treadmill', 'pool']

export const CASES: EvalCase[] = [
  {
    id: 'healthy-commercial-lower-45',
    why: 'REGRESSION: no condition flags + a commercial gym. The planner used to hide every barbell lift behind a hard-coded persona avoid-list, so this case must produce free-weight work.',
    req: { minutes: 45, focus: 'lower' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL },
    expect: { usesEquipment: ['barbell', 'kettlebell'] },
  },
  {
    id: 'healthy-commercial-upper-60',
    why: 'Long upper session with everything available: tests whether the model fills the time or pads with isolation.',
    req: { minutes: 60, focus: 'upper' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'advanced', conditions: [], equipment: COMMERCIAL },
  },
  {
    id: 'healthy-bodyweight-full-30',
    why: 'Hotel room. No equipment at all — the model must stay inside the bodyweight subset rather than inventing dumbbells.',
    req: { minutes: 30, focus: 'full', note: 'Travelling, hotel room, nothing but the floor.' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'beginner', conditions: [], equipment: ['none — bodyweight only'] },
    expect: { usesEquipment: ['bodyweight'] },
  },
  {
    id: 'healthy-bands-upper-20',
    why: 'Shortest budget with the thinnest equipment: tests time-fit at the bottom of PLAN_MINUTES.',
    req: { minutes: 20, focus: 'upper' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'beginner', conditions: [], equipment: HOME },
  },
  {
    id: 'knee-history-condo-lower-45',
    why: 'The demo persona: a standing knee flag narrows the library before the model ever sees it.',
    req: { minutes: 45, focus: 'lower' },
    input: {
      allowed: libraryFor(['knee_left']), gate: OK_GATE, baselineAvoid: baselineAvoidTags(['knee_left']),
      experience: 'intermediate', conditions: ['Past left-knee soreness'], equipment: CONDO,
    },
    expect: { forbidTags: ['deep_knee_flexion', 'impact'] },
  },
  {
    id: 'knee-amber-today-lower-45',
    why: 'Healthy history but sore today: the gate, not the baseline, must do the filtering.',
    req: { minutes: 45, focus: 'lower', note: 'Left knee is grumbling today.' },
    input: { allowed: libraryFor([]), gate: amberKnee(), baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL },
    expect: { forbidTags: ['deep_knee_flexion', 'impact'] },
  },
  {
    id: 'back-history-commercial-full-45',
    why: 'A lower-back flag removes every loaded hinge and axial lift; the model still has to build a full-body session.',
    req: { minutes: 45, focus: 'full' },
    input: {
      allowed: libraryFor(['back_lower']), gate: OK_GATE, baselineAvoid: baselineAvoidTags(['back_lower']),
      experience: 'intermediate', conditions: ['Occasional lower-back tightness'], equipment: COMMERCIAL,
    },
    expect: { forbidTags: ['spinal_flexion', 'axial_load'] },
  },
  {
    id: 'healthy-conditioning-30',
    why: 'Conditioning focus with a rower and assault bike available — the only focus where cardio ids are expected.',
    req: { minutes: 30, focus: 'conditioning' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL },
  },
  {
    id: 'healthy-mobility-20',
    why: 'Mobility focus: tests that the model does not reach for loaded compounds when asked for the gentlest session.',
    req: { minutes: 20, focus: 'mobility' },
    input: { allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'beginner', conditions: [], equipment: CONDO },
  },
  {
    id: 'recent-overlap-upper-45',
    why: 'A heavy upper day two days ago: tests whether the model honours the do-not-repeat-within-48-hours rule.',
    req: { minutes: 45, focus: 'upper' },
    input: {
      allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL,
      recentTraining: '2 days ago Upper Strength: Barbell Bench Press 80 kg × 6; Barbell Bent-Over Row 70 kg × 8; Barbell Overhead Press 45 kg × 6',
    },
  },
  {
    id: 'red-gate-full-30',
    why: 'RED gate with red flags: the safety case. Nothing provocative may survive validation.',
    req: { minutes: 30, focus: 'full' },
    input: {
      allowed: libraryFor([]),
      gate: evaluateSymptomGate([{ id: 1, ts: new Date().toISOString(), region: 'back_lower', painScore: 7, redFlags: { radiating: true }, notes: '', context: 'morning', sessionId: null }]),
      baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL,
    },
  },
  {
    id: 'freeform-note-full-45',
    why: 'A conversational request rather than a focus button — the "recommend me something from how I feel" path.',
    req: { minutes: 45, focus: 'full', note: 'Slept badly, feeling flat, but I want to do something useful.' },
    input: {
      allowed: libraryFor([]), gate: OK_GATE, baselineAvoid: [], experience: 'intermediate', conditions: [], equipment: COMMERCIAL,
      readiness: { state: 'AMBER', reasons: ['5h 40m sleep, below 7-day average'] },
    },
  },
]
