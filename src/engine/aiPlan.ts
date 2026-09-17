// AI workout plans: deterministic validation of a model's draft plus a local, template-based fallback.
// Pure functions. The model only ever proposes; everything it returns is checked here against the
// exercise library, today's symptom gate and the time budget before anyone sees it.
import type { Exercise, PlannedExercise, SessionType, WorkoutSession } from '../domain/types'
import { SESSION_TEMPLATES, TIMED_IDS, applyGateToSession, cloneExercises, estimateSessionMinutes, shortenedVersion } from './planner'
import { findSubstitute, isExerciseAllowed, type GateResult } from './symptomGate'

export type PlanFocus = 'upper' | 'lower' | 'full' | 'conditioning' | 'mobility'

export const PLAN_FOCUSES: PlanFocus[] = ['upper', 'lower', 'full', 'conditioning', 'mobility']
export const PLAN_MINUTES = [20, 30, 45, 60]
export const AI_PLAN_TEMPLATE_KEY = 'ai_plan'

export interface AIPlanExercise {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
  note?: string
  /** Set when the symptom gate swapped this in for another exercise. */
  substitutedFrom?: string
  substitutionReason?: string
}

export interface AIPlanDraft {
  name: string
  focus: string
  minutes: number
  rationale: string
  exercises: AIPlanExercise[]
}

export interface ValidatedPlan {
  plan: AIPlanDraft
  /** Unknown ids, and exercises removed because nothing safe could replace them today. */
  dropped: string[]
  /** "Leg Press → Glute Bridge" lines for gate-driven swaps. */
  substituted: string[]
}

export const MIN_PLAN_EXERCISES = 3
const MAX_PLAN_EXERCISES = 8

/** Templates used to top a plan up (and to build the local fallback), most relevant first. */
const FOCUS_TEMPLATES: Record<PlanFocus, string[]> = {
  upper: ['upper_a', 'mobility_upper', 'full_b'],
  lower: ['lower_a', 'mobility_hips', 'full_b'],
  full: ['full_b', 'upper_a', 'lower_a'],
  conditioning: ['conditioning_bike', 'mobility_hips', 'mobility_upper'],
  mobility: ['mobility_hips', 'mobility_upper'],
}

const FOCUS_NAME: Record<PlanFocus, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
  full: 'Full Body',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
}

export function normalizeFocus(v: unknown): PlanFocus {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (s.startsWith('upper')) return 'upper'
  if (s.startsWith('lower') || s.startsWith('leg')) return 'lower'
  if (s.startsWith('cond') || s.startsWith('cardio')) return 'conditioning'
  if (s.startsWith('mob')) return 'mobility'
  return 'full'
}

export function sessionTypeForFocus(focus: string): SessionType {
  const f = normalizeFocus(focus)
  return f === 'conditioning' ? 'conditioning' : f === 'mobility' ? 'mobility' : 'strength'
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function isTimed(ex: Exercise): boolean {
  return ex.timed || TIMED_IDS.has(ex.id)
}

/** 5 min warm-up + sets × (≈45 s work, or the hold time, + rest) — same maths as the weekly planner. */
export function planMinutes(exercises: AIPlanExercise[], library: Exercise[] = []): number {
  const timed = new Set<string>(TIMED_IDS)
  for (const e of library) if (e.timed) timed.add(e.id)
  let sec = 5 * 60
  for (const e of exercises) {
    const work = timed.has(e.exerciseId) ? (e.repMin + e.repMax) / 2 : 45
    sec += e.sets * (work + e.restSec)
  }
  return Math.round(sec / 60)
}

/** Trim to the time budget: shave accessory sets first, then drop trailing exercises, then go to single sets. */
function fitToBudget(list: AIPlanExercise[], minutes: number, library: Exercise[]): AIPlanExercise[] {
  const out = list.map((e) => ({ ...e }))
  const over = () => planMinutes(out, library) > minutes
  const shave = (floor: number) => {
    let changed = true
    while (over() && changed) {
      changed = false
      for (let i = out.length - 1; i >= 0 && over(); i--) {
        if (out[i].sets > floor) { out[i].sets--; changed = true }
      }
    }
  }
  shave(2)
  while (over() && out.length > MIN_PLAN_EXERCISES) out.pop()
  shave(1)
  // Long single holds (a 15 min cooldown walk in a 20 min plan): shorten the hold itself.
  for (let guard = 0; over() && guard < 6; guard++) {
    const longest = out.reduce<AIPlanExercise | null>((m, e) => (e.repMax > 120 && (!m || e.repMax > m.repMax) ? e : m), null)
    if (!longest) break
    longest.repMax = Math.max(120, Math.round(longest.repMax * 0.6))
    longest.repMin = Math.min(longest.repMin, longest.repMax)
  }
  return out
}

/** Gate-safe template exercises for a focus, in priority order, that are present in the library. */
function topUpCandidates(focus: PlanFocus, library: Exercise[], gate: GateResult): AIPlanExercise[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  const out: AIPlanExercise[] = []
  const seen = new Set<string>()
  for (const key of FOCUS_TEMPLATES[focus]) {
    const t = SESSION_TEMPLATES[key]
    if (!t) continue
    for (const pe of applyGateToSession(t.exercises, gate, library).exercises) {
      const ex = byId.get(pe.exerciseId)
      if (!ex || seen.has(ex.id) || !isExerciseAllowed(ex, gate).allowed) continue
      seen.add(ex.id)
      out.push({ exerciseId: pe.exerciseId, sets: Math.min(pe.sets, 2), repMin: pe.repMin, repMax: pe.repMax, restSec: Math.min(pe.restSec, 90) })
    }
  }
  // Last resort: anything the gate allows, untagged exercises first.
  for (const ex of [...library].sort((a, b) => a.safetyTags.length - b.safetyTags.length)) {
    if (seen.has(ex.id) || !isExerciseAllowed(ex, gate).allowed) continue
    seen.add(ex.id)
    out.push(isTimed(ex) ? { exerciseId: ex.id, sets: 2, repMin: 20, repMax: 30, restSec: 30 } : { exerciseId: ex.id, sets: 2, repMin: 10, repMax: 12, restSec: 60 })
  }
  return out
}

function ensureMinimum(list: AIPlanExercise[], focus: PlanFocus, library: Exercise[], gate: GateResult): AIPlanExercise[] {
  if (list.length >= MIN_PLAN_EXERCISES) return list
  const out = [...list]
  const used = new Set(out.map((e) => e.exerciseId))
  for (const c of topUpCandidates(focus, library, gate)) {
    if (out.length >= MIN_PLAN_EXERCISES) break
    if (used.has(c.exerciseId)) continue
    used.add(c.exerciseId)
    out.push(c)
  }
  return out
}

/**
 * Turn whatever the model returned into a plan that is safe to show:
 * unknown ids are dropped, anything today's symptom gate disallows is swapped (findSubstitute) or removed,
 * numbers are clamped, duplicates removed, the list is trimmed to the time budget and topped up to ≥ 3
 * exercises from the matching template.
 */
export function validateAIPlan(raw: unknown, library: Exercise[], gate: GateResult, minutes: number): ValidatedPlan {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const focus = normalizeFocus(obj.focus)
  const budget = clampInt(minutes, 10, 120, 30)
  const byId = new Map(library.map((e) => [e.id, e]))
  const dropped: string[] = []
  const substituted: string[] = []
  const used = new Set<string>()
  let list: AIPlanExercise[] = []

  const rows = Array.isArray(obj.exercises) ? obj.exercises : []
  for (const r of rows) {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const id = text(row.exerciseId ?? row.id, 60)
    let ex = byId.get(id)
    if (!ex) { if (id && !dropped.includes(id)) dropped.push(id); continue }
    if (used.has(ex.id)) continue

    let substitutedFrom: string | undefined
    let substitutionReason: string | undefined
    const check = isExerciseAllowed(ex, gate)
    if (!check.allowed) {
      const sub = findSubstitute(ex, gate, library.filter((e) => !used.has(e.id)))
      if (!sub) { dropped.push(ex.name); continue }
      substituted.push(`${ex.name} → ${sub.name}`)
      substitutedFrom = ex.id
      substitutionReason = check.reasons.join('; ')
      ex = sub
    }
    used.add(ex.id)

    const timed = isTimed(ex)
    const lo = timed ? 10 : 3
    const hi = timed ? 1800 : 30
    const repMin = clampInt(row.repMin, lo, hi, timed ? 30 : 8)
    const repMax = Math.max(repMin, clampInt(row.repMax, lo, hi, timed ? 45 : 12))
    const note = text(row.note, 120)
    list.push({
      exerciseId: ex.id,
      sets: clampInt(row.sets, 1, timed ? 10 : 5, 3),
      repMin,
      repMax,
      restSec: clampInt(row.restSec, 30, 180, 75),
      ...(note ? { note } : {}),
      ...(substitutedFrom ? { substitutedFrom, substitutionReason } : {}),
    })
  }

  list = fitToBudget(list.slice(0, MAX_PLAN_EXERCISES), budget, library)
  list = fitToBudget(ensureMinimum(list, focus, library, gate), budget, library)

  return {
    plan: {
      name: text(obj.name, 48) || `${FOCUS_NAME[focus]} · ${budget} min`,
      focus,
      minutes: planMinutes(list, library),
      rationale: text(obj.rationale, 220),
      exercises: list,
    },
    dropped,
    substituted,
  }
}

/**
 * Deterministic plan when no model is connected (or it failed): the matching session template,
 * shortened for short budgets, extended with accessories for long ones, run through the symptom gate.
 */
export function fallbackPlan(focus: PlanFocus, minutes: number, library: Exercise[], gate: GateResult): ValidatedPlan {
  const f = normalizeFocus(focus)
  const budget = clampInt(minutes, 10, 120, 30)
  const byId = new Map(library.map((e) => [e.id, e]))
  const template = SESSION_TEMPLATES[FOCUS_TEMPLATES[f][0]]
  const base = template ? cloneExercises(template.exercises).filter((e) => byId.has(e.exerciseId)) : []
  const sized = estimateSessionMinutes(base) > budget ? shortenedVersion(base) : base
  const gated = applyGateToSession(sized, gate, library)

  const substituted: string[] = []
  const kept = new Set<string>()
  let list: AIPlanExercise[] = gated.exercises.map((pe) => {
    kept.add(pe.substitutedFrom ?? pe.exerciseId)
    if (pe.substitutedFrom) substituted.push(`${byId.get(pe.substitutedFrom)?.name ?? pe.substitutedFrom} → ${byId.get(pe.exerciseId)?.name ?? pe.exerciseId}`)
    return {
      exerciseId: pe.exerciseId, sets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, restSec: pe.restSec,
      ...(pe.substitutedFrom ? { substitutedFrom: pe.substitutedFrom, substitutionReason: pe.substitutionReason } : {}),
    }
  })
  const dropped = sized.filter((e) => !kept.has(e.exerciseId)).map((e) => byId.get(e.exerciseId)?.name ?? e.exerciseId)

  // Room to spare: add accessories from the related templates while they fit.
  const used = new Set(list.map((e) => e.exerciseId))
  for (const c of topUpCandidates(f, library, gate)) {
    if (list.length >= MAX_PLAN_EXERCISES) break
    if (used.has(c.exerciseId)) continue
    if (planMinutes([...list, c], library) > budget) continue
    used.add(c.exerciseId)
    list.push(c)
  }

  list = fitToBudget(ensureMinimum(fitToBudget(list, budget, library), f, library, gate), budget, library)
  const est = planMinutes(list, library)
  const gateNote = gate.overall === 'OK' ? '' : ' with today\'s flagged areas worked around'
  return {
    plan: {
      name: `${FOCUS_NAME[f]} · ${budget} min`,
      focus: f,
      minutes: est,
      rationale: `Your standard ${FOCUS_NAME[f].toLowerCase()} session sized to about ${est} minutes${gateNote}.`,
      exercises: list,
    },
    dropped,
    substituted,
  }
}

export function planToPlanned(exercises: AIPlanExercise[]): PlannedExercise[] {
  return exercises.map((e) => ({
    exerciseId: e.exerciseId, sets: e.sets, repMin: e.repMin, repMax: e.repMax, loadKg: null, restSec: e.restSec,
    ...(e.substitutedFrom ? { substitutedFrom: e.substitutedFrom, substitutionReason: e.substitutionReason } : {}),
  }))
}

/** A planned session from a validated plan. The symptom gate still runs when it is started. */
export function planToSession(plan: AIPlanDraft, scheduledDate: string): Omit<WorkoutSession, 'id'> {
  return {
    templateKey: AI_PLAN_TEMPLATE_KEY,
    name: plan.name,
    type: sessionTypeForFocus(plan.focus),
    tier: 'minimum',
    scheduledDate,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    durationMin: null,
    readiness: null,
    sessionRpe: null,
    notes: plan.rationale,
    exercises: planToPlanned(plan.exercises),
  }
}
