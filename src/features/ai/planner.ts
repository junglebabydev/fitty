// AI workout planner: asks the connected model for a plan restricted to library exercise ids, then ALWAYS
// runs the reply through the deterministic validator (library, symptom gate, clamps, time budget).
// Not connected, or any failure → the local template-based fallback. Nothing is saved here.
import { aiConnected, aiJson } from '../../ai'
import type { Exercise } from '../../domain/types'
import { EXERCISES } from '../../data'
import { getConditionFlags, getExercises, getProfile, getSessions, getSetsForSession } from '../../db/repositories'
import { fallbackPlan, validateAIPlan, type AIPlanDraft, type GateResult, type PlanFocus } from '../../engine'
import { addDays, todayStr } from '../../lib/util'
import { gateFor, todayReadiness } from '../coach/facts'

export interface PlanRequest {
  minutes: number
  focus: PlanFocus
  note?: string
}

export interface PlanResult {
  plan: AIPlanDraft
  source: 'ai' | 'local'
  dropped: string[]
  substituted: string[]
}

export const PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'focus', 'minutes', 'rationale', 'exercises'],
  properties: {
    name: { type: 'string', description: 'Short session name, at most 5 words' },
    focus: { type: 'string', enum: ['upper', 'lower', 'full', 'conditioning', 'mobility'] },
    minutes: { type: 'integer' },
    rationale: { type: 'string', description: 'ONE sentence, at most 22 words, on why this plan fits today' },
    exercises: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['exerciseId', 'sets', 'repMin', 'repMax', 'restSec'],
        properties: {
          exerciseId: { type: 'string', description: 'An id copied exactly from the allowed list' },
          sets: { type: 'integer' },
          repMin: { type: 'integer', description: 'Reps, or seconds for timed / cardio exercises' },
          repMax: { type: 'integer' },
          restSec: { type: 'integer' },
          note: { type: 'string', description: 'Optional cue, at most 10 words' },
        },
      },
    },
  },
}

/** Standing constraints for this user: nothing that needs deep knee flexion under load, no impact / running. */
const PROFILE_AVOID = ['deep_knee_flexion', 'impact']

function library(): Exercise[] {
  const list = getExercises()
  return list.length ? list : EXERCISES
}

/** The library the planner may draw from: everything minus exercises the user's conditions rule out every day. */
export function plannerLibrary(): Exercise[] {
  return library().filter((e) => !e.safetyTags.some((t) => PROFILE_AVOID.includes(t)))
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

function recentTraining(byId: Map<string, Exercise>, today: string): string {
  const sessions = safe(() => getSessions(addDays(today, -14), today), []).filter((s) => s.status === 'completed').slice(-4)
  if (!sessions.length) return 'No completed sessions in the last 14 days.'
  return sessions.map((s) => {
    const sets = safe(() => getSetsForSession(s.id), [])
    const top = new Map<string, string>()
    for (const x of sets) {
      if (x.loadKg == null || x.reps == null) continue
      top.set(x.exerciseId, `${byId.get(x.exerciseId)?.name ?? x.exerciseId} ${x.loadKg} kg × ${x.reps}${x.painFlag ? ' (pain flagged)' : ''}`)
    }
    return `${s.scheduledDate} ${s.name}${s.sessionRpe != null ? ` (RPE ${s.sessionRpe})` : ''}: ${[...top.values()].slice(0, 6).join('; ') || 'no loaded sets'}`
  }).join('\n')
}

/** Everything the planner prompt needs, already read from the database (or from a fixture): keeps the builder pure. */
export interface PlannerPromptInput {
  allowed: Exercise[]
  gate: GateResult
  experience?: string | null
  /** Condition labels as shown to the user, e.g. "Meniscus tear, left knee (aggravated by deep squats)". */
  conditions?: string[]
  equipment?: string[]
  readiness?: { state: string; reasons: string[] } | null
  /** One line per recent session (see `recentTraining`). */
  recentTraining?: string
}

/** The planner's system prompt. Pure: no database, no clock. */
export function buildPlannerSystem(i: PlannerPromptInput): string {
  const { allowed, gate, readiness } = i
  const conditions = i.conditions?.length ? i.conditions.join('; ') : 'bilateral meniscus tears; lower, mid and upper back issues; neck issues'
  const equipment = i.equipment?.length ? i.equipment.join(', ') : 'dumbbells, selectorised machines, cables, lat pulldown, adjustable bench, stationary bike, treadmill, pool'
  const list = allowed.map((e) => `${e.id} | ${e.name} | ${e.pattern} | ${e.equipment} | ${e.safetyTags.join(',') || 'none'}${e.timed ? ' | timed (seconds)' : ''}`).join('\n')

  return [
    'You plan ONE gym session for a single user of a wellness app. Reply with JSON only, matching the schema.',
    `USER: ${i.experience ?? 'intermediate'} lifter, trains in a condo gym. Conditions: ${conditions}.`,
    'STANDING RULES: prefer machines, cables and dumbbells; low impact only; no deep knee flexion under load; no running or jumping; keep the spine supported where possible; no neck strain. Never diagnose and never give medical advice.',
    `EQUIPMENT: ${equipment}.`,
    `TODAY: readiness ${readiness?.state ?? 'unknown'}${readiness?.reasons.length ? ` (${readiness.reasons.slice(0, 3).join('; ')})` : ''}. Symptom gate ${gate.overall}${gate.avoidTags.length ? ` — avoid every exercise tagged: ${gate.avoidTags.join(', ')}` : ''}.${gate.advice.length ? ` ${gate.advice.slice(0, 3).join(' ')}` : ''}`,
    'When readiness is AMBER or RED, reduce volume (fewer sets, more reps in reserve) rather than adding work.',
    `RECENT TRAINING (top sets):\n${i.recentTraining || 'No completed sessions in the last 14 days.'}`,
    'Avoid repeating the main lifts of a session done in the last 48 hours. Order exercises by priority: compounds first, accessories last.',
    `ALLOWED EXERCISES — use ONLY these ids, copied exactly (id | name | pattern | equipment | safety tags):\n${list}`,
    'Sets 1–5, reps 3–30 (seconds for timed exercises), rest 30–180 s. The whole session, including a 5-minute warm-up, must fit the requested minutes (each set ≈ 45 s of work plus its rest).',
  ].join('\n\n')
}

/** The user message for a plan request. Pure. */
export function plannerPrompt(req: PlanRequest): string {
  const note = (req.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  return `Plan a ${req.minutes}-minute ${req.focus} session for today.${note ? ` The user adds: "${note}".` : ''}`
}

function buildSystem(allowed: Exercise[], gate: GateResult, today: string): string {
  const byId = new Map(allowed.map((e) => [e.id, e]))
  const profile = safe(getProfile, null)
  const flags = safe(getConditionFlags, [])
  return buildPlannerSystem({
    allowed,
    gate,
    experience: profile?.experience,
    conditions: flags.map((f) => `${f.label}${f.baselineNotes ? ` (${f.baselineNotes})` : ''}`),
    equipment: profile?.equipment ?? [],
    readiness: safe(() => todayReadiness(today), null),
    recentTraining: recentTraining(byId, today),
  })
}

export async function planWorkout(req: PlanRequest): Promise<PlanResult> {
  const today = todayStr()
  const allowed = plannerLibrary()
  const gate = safe(() => gateFor(today), { regions: [], avoidTags: [], overall: 'OK' as const, advice: [] })
  const local = (): PlanResult => ({ ...fallbackPlan(req.focus, req.minutes, allowed, gate), source: 'local' })

  if (!aiConnected()) return local()
  try {
    const raw = await aiJson<unknown>(
      { system: buildSystem(allowed, gate, today), prompt: plannerPrompt(req), schema: PLAN_SCHEMA },
      { dataType: 'training_context', purpose: 'AI workout plan' },
    )
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const checked = validateAIPlan({ ...obj, focus: req.focus }, allowed, gate, req.minutes)
    // A reply with nothing usable left is not an AI plan — hand over the local one instead.
    const usable = Array.isArray(obj.exercises) ? obj.exercises.length - checked.dropped.length : 0
    if (usable < 1) return local()
    return { ...checked, source: 'ai' }
  } catch {
    // AIError (offline, auth, rate limit, refusal, timeout…) or anything else: the local plan always works.
    return local()
  }
}
