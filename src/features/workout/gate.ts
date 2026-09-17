// Pre-workout and mid-workout symptom gate: records checks, evaluates the gate and rewrites
// the session's exercise list with safe substitutions (PRD §7.2, §9.3).
import type { Exercise, ExerciseSet, PlannedExercise, Readiness, RedFlags, Region, SymptomCheck, WorkoutSession } from '../../domain/types'
import { db } from '../../db/database'
import { addSymptomCheck, getSymptomChecks, updateSession } from '../../db/repositories'
import {
  applyGateToSession, evaluateProgression, evaluateSymptomGate, isExerciseAllowed, latestSymptomsByRegion,
  type GateResult, type ProgressionResult,
} from '../../engine'
import { dateOf, fmtDate, nowIso, todayStr } from '../../lib/util'
import { gateSymptoms } from '../coach/facts'
import { REGION_LABELS, activeFlagKeys } from './helpers'

export interface GateEntry {
  region: Region
  painScore: number
  redFlags: RedFlags
  notes?: string
}

export interface BlockedExercise {
  exerciseId: string
  name: string
  reasons: string[]
}

export interface GateOutcome {
  gate: GateResult
  exercises: PlannedExercise[]
  /** Human lines such as "Swapped Leg Press → Hip Thrust (Deep knee flexion — left knee AMBER)". */
  changes: string[]
  /** Exercises still in the session that the gate would block (only when no substitute existed). */
  blocked: BlockedExercise[]
}

/**
 * Gate from the same symptom window the coach / Today use (today plus yesterday's carry-over via
 * `gateSymptoms`), so a flag logged last night still shapes this session until it is re-checked.
 */
export function todaysGate(today: string = todayStr()): GateResult {
  return evaluateSymptomGate(gateSymptoms(today))
}

/** Latest pain / flags per region across that window, for prefilling the gate sheet. */
export function todaysRegionState(today: string = todayStr()): Partial<Record<Region, { painScore: number; redFlags: RedFlags; check: SymptomCheck }>> {
  const out: Partial<Record<Region, { painScore: number; redFlags: RedFlags; check: SymptomCheck }>> = {}
  for (const [region, snap] of latestSymptomsByRegion(gateSymptoms(today))) {
    out[region] = { painScore: snap.painScore, redFlags: snap.redFlags, check: snap.latest }
  }
  return out
}

/**
 * Persist the gate entries as 'pre_workout' checks. An entry is written when it reports pain or a
 * flag, or when it changes what was reported earlier (so a knee that has settled to 0 clears).
 */
export function recordGateEntries(sessionId: number, entries: GateEntry[], context: SymptomCheck['context'] = 'pre_workout'): number[] {
  const existing = todaysRegionState()
  const ids: number[] = []
  const ts = nowIso()
  for (const e of entries) {
    const flags = activeFlagKeys(e.redFlags)
    const prev = existing[e.region]
    const changed = prev ? prev.painScore !== e.painScore || activeFlagKeys(prev.redFlags).join() !== flags.join() : false
    if (e.painScore <= 0 && !flags.length && !changed) continue
    const redFlags: RedFlags = {}
    for (const k of flags) redFlags[k] = true
    ids.push(addSymptomCheck({ ts, region: e.region, painScore: e.painScore, redFlags, notes: e.notes ?? '', context, sessionId }))
  }
  return ids
}

function blockedIn(exercises: PlannedExercise[], gate: GateResult, library: Exercise[]): BlockedExercise[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  const out: BlockedExercise[] = []
  for (const pe of exercises) {
    const ex = byId.get(pe.exerciseId)
    if (!ex) continue
    const check = isExerciseAllowed(ex, gate)
    if (!check.allowed) out.push({ exerciseId: ex.id, name: ex.name, reasons: check.reasons })
  }
  return out
}

/**
 * Start a planned session: record the gate entries, evaluate the gate, substitute disallowed
 * exercises, and move the session to in_progress in one transaction.
 */
export function startSessionWithGate(
  session: WorkoutSession,
  entries: GateEntry[],
  library: Exercise[],
  readiness: Readiness | null,
): GateOutcome {
  return db.transaction(() => {
    recordGateEntries(session.id, entries, 'pre_workout')
    const gate = todaysGate()
    const applied = applyGateToSession(session.exercises, gate, library)
    updateSession(session.id, {
      exercises: applied.exercises,
      status: 'in_progress',
      startedAt: session.startedAt ?? nowIso(),
      readiness: readiness ?? session.readiness,
      // A missed or future session started now belongs to today (Today reads plannedSessionFor(today)).
      scheduledDate: todayStr(),
    })
    return { gate, exercises: applied.exercises, changes: applied.changes, blocked: blockedIn(applied.exercises, gate, library) }
  })
}

// --- pain reports and progression ---------------------------------------------------------------

/** Days a Pain / Issue report against an exercise keeps holding its progression (until a clean session is logged). */
export const PAIN_REPORT_DAYS = 14

/** Newest Pain / Issue report filed against the exercise after `afterTs` (any session, last PAIN_REPORT_DAYS days). */
export function latestPainReport(exerciseId: string, afterTs: string | null = null): SymptomCheck | null {
  return getSymptomChecks(PAIN_REPORT_DAYS).find((s) => s.exerciseId === exerciseId && (afterTs == null || s.ts > afterTs)) ?? null
}

/**
 * `evaluateProgression` with pain reports honoured (PRD §9.2): a report filed against the exercise since its
 * last logged history holds the load even when no set carried the flag (stopped or substituted before logging).
 */
export function evaluateProgressionWithPain(
  planned: PlannedExercise,
  exercise: Exercise,
  lastSets: ExerciseSet[],
  previousSets: ExerciseSet[],
): ProgressionResult {
  const base = evaluateProgression(planned, exercise, lastSets, previousSets)
  const lastTs = lastSets.reduce<string | null>((m, s) => (m == null || s.loggedAt > m ? s.loggedAt : m), null)
  const report = latestPainReport(exercise.id, lastTs)
  if (!report || base.action === 'hold') return base
  const loads = lastSets.map((s) => s.loadKg).filter((l): l is number => l != null)
  const what = report.painScore > 0 ? `pain ${report.painScore}/10` : 'an issue'
  const when = dateOf(report.ts) === todayStr() ? 'today' : `on ${fmtDate(dateOf(report.ts))}`
  return {
    ...base,
    action: 'hold',
    nextLoadKg: loads.length ? Math.max(...loads) : planned.loadKg,
    repMin: planned.repMin,
    repMax: planned.repMax,
    reason: `${REGION_LABELS[report.region]} ${what} reported during this exercise ${when} — hold and keep the range pain-free.`,
    stalled: false,
  }
}

/** Re-run the gate on an in-progress session after a new symptom report; persists only when something changes. */
export function reapplyGate(session: WorkoutSession, library: Exercise[]): GateOutcome {
  const gate = todaysGate()
  const applied = applyGateToSession(session.exercises, gate, library)
  if (applied.changes.length) updateSession(session.id, { exercises: applied.exercises })
  return { gate, exercises: applied.exercises, changes: applied.changes, blocked: blockedIn(applied.exercises, gate, library) }
}

/** Replace one planned exercise with a substitute, keeping the original as `substitutedFrom`. */
export function substituteExercise(session: WorkoutSession, index: number, sub: Exercise, reason: string): PlannedExercise[] {
  const next = session.exercises.map((e) => ({ ...e }))
  const cur = next[index]
  if (!cur) return session.exercises
  next[index] = {
    ...cur,
    exerciseId: sub.id,
    loadKg: null,
    substitutedFrom: cur.substitutedFrom ?? cur.exerciseId,
    substitutionReason: reason,
  }
  updateSession(session.id, { exercises: next })
  return next
}

/** Reduce the planned load of one exercise by 10 % (rounded to 0.5 kg). */
export function reducePlannedLoad(session: WorkoutSession, index: number, currentLoadKg: number | null): number | null {
  const cur = session.exercises[index]
  if (!cur) return null
  const base = currentLoadKg ?? cur.loadKg
  if (base == null || base <= 0) return null
  const next = Math.max(0.5, Math.round((base * 0.9) * 2) / 2)
  const exercises = session.exercises.map((e, i) => (i === index ? { ...e, loadKg: next, reducedReason: 'pain report' } : { ...e }))
  updateSession(session.id, { exercises })
  return next
}
