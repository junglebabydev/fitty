// Applies accepted coach proposals to the local database and syncs new proposals from the engine.
// The coach never mutates data silently: everything here runs only after an explicit Accept
// (or Revert) from the user. Pure helpers are exported for tests; db-backed functions sit below.
import { db } from '../../db/database'
import {
  activeSession, addDecision, getDecisions, getExercises, getNutritionTarget, getNutritionTargets, getSession,
  getSessions, getSessionsForDate, lastSetsForExercise, setDecisionStatus, setNutritionTarget, updateSession,
} from '../../db/repositories'
import type { CoachDecision, Exercise, NutritionTarget, PlannedExercise, ProposedAction, WorkoutSession } from '../../domain/types'
import { generateProposals, loadIncrement, reflowWeek } from '../../engine'
import { addDays, fmtDate, isoAt, nowIso, startOfWeek, todayStr } from '../../lib/util'
import { buildCoachFacts } from './facts'

const fmtN = (n: number) => Math.round(n).toLocaleString('en-SG')

// --- pure helpers --------------------------------------------------------------------

export function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Rounds `kg` down to a multiple of `step` (0.1 kg when the step is 0, e.g. bodyweight). */
export function roundDownToStep(kg: number, step: number): number {
  const s = step > 0 ? step : 0.1
  return Math.round(Math.floor(kg / s + 1e-9) * s * 100) / 100
}

export interface DeloadResult {
  exercises: PlannedExercise[]
  changed: number
  fromKg: number | null
  toKg: number | null
}

/**
 * Scales the planned load of `exerciseId` by (1 - pct/100), rounded down to the equipment step, always
 * reducing by at least one step. Entries without a planned load use `fallbackLoadKg` (the last logged load).
 */
export function deloadExercises(
  exercises: PlannedExercise[],
  exerciseId: string,
  pct: number,
  fallbackLoadKg: number | null,
  step: number,
): DeloadResult {
  let changed = 0
  let fromKg: number | null = null
  let toKg: number | null = null
  const out = exercises.map((e) => {
    if (e.exerciseId !== exerciseId) return e
    const base = e.loadKg ?? fallbackLoadKg
    if (base == null || base <= 0) return e
    let next = roundDownToStep(base * (1 - pct / 100), step)
    if (next >= base) next = roundDownToStep(base - (step > 0 ? step : 0.1), step)
    if (next <= 0) return e
    changed++
    if (fromKg === null) { fromKg = base; toKg = next }
    return { ...e, loadKg: next }
  })
  return { exercises: out, changed, fromKg, toKg }
}

/** Adds `delta` sets to every exercise (never below `minSets`). */
export function adjustSets(exercises: PlannedExercise[], delta: number, minSets = 1): { exercises: PlannedExercise[]; changed: number } {
  let changed = 0
  const out = exercises.map((e) => {
    const sets = Math.max(minSets, e.sets + delta)
    if (sets === e.sets) return e
    changed++
    return { ...e, sets }
  })
  return { exercises: out, changed }
}

/** Replaces `fromId` with `toId`, keeping sets/reps/rest and recording the original + reason. */
export function swapExercise(exercises: PlannedExercise[], fromId: string, toId: string, reason: string): { exercises: PlannedExercise[]; changed: number } {
  let changed = 0
  const out = exercises.map((e) => {
    if (e.exerciseId !== fromId) return e
    changed++
    return { ...e, exerciseId: toId, substitutedFrom: e.substitutedFrom ?? fromId, substitutionReason: reason }
  })
  return { exercises: out, changed }
}

/** The target that was closed when a new one started on `startDate` (its endDate is the day before). */
export function previousTargetFor(targets: NutritionTarget[], startDate: string): NutritionTarget | null {
  const prevEnd = addDays(startDate, -1)
  const candidates = targets.filter((t) => t.endDate === prevEnd)
  if (!candidates.length) return null
  candidates.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)
  return candidates[0]
}

/**
 * True when the same kind+title is already pending, or was accepted/rejected on or after `sinceTs`.
 * Reverted decisions do not block a fresh proposal.
 */
export function isRecentDuplicate(existing: CoachDecision[], draft: { kind: string; title: string }, sinceTs: string): boolean {
  return existing.some((d) => {
    if (d.kind !== draft.kind || d.title !== draft.title) return false
    if (d.status === 'proposed') return true
    if (d.status === 'reverted') return false
    return d.ts >= sinceTs
  })
}

/** The single-sentence change an LLM reply may end with ("PROPOSAL: ..."), or null. */
export function extractProposalLine(reply: string): string | null {
  const m = /^\s*\**\s*PROPOSAL\s*:\s*\**\s*(.+?)\s*$/im.exec(reply)
  if (!m) return null
  const text = m[1].replace(/\*+$/g, '').trim()
  return text.length ? text : null
}

export function decisionKindLabel(kind: ProposedAction['kind'] | string): string {
  switch (kind) {
    case 'nutrition_target': return 'Nutrition'
    case 'reflow_week': return 'Plan'
    case 'deload': return 'Deload'
    case 'substitute': return 'Substitution'
    case 'volume': return 'Volume'
    case 'note': return 'Suggestion'
    default: return 'Coach'
  }
}

export interface ReversibleContext {
  /** The nutrition target active today (pass null when there is none, undefined when unknown). */
  currentTarget?: NutritionTarget | null
  /** The session a volume decision touched (null when it no longer exists, undefined when unknown). */
  session?: WorkoutSession | null
}

/** Only accepted nutrition-target and (still planned) volume decisions can be undone automatically. */
export function isReversible(d: CoachDecision, ctx: ReversibleContext = {}): boolean {
  if (d.status !== 'accepted') return false
  switch (d.action.kind) {
    case 'nutrition_target': {
      if (ctx.currentTarget === undefined) return true
      if (!ctx.currentTarget) return false
      return ctx.currentTarget.rationale.includes(d.title)
    }
    case 'volume': {
      if (ctx.session === undefined) return true
      return !!ctx.session && ctx.session.status === 'planned'
    }
    default:
      return false
  }
}

function appendNote(existing: string, note: string): string {
  const base = existing.trim()
  return base ? `${base}\n${note}` : note
}

function exerciseName(library: Exercise[], id: string): string {
  return library.find((e) => e.id === id)?.name ?? id.replace(/_/g, ' ')
}

// --- db-backed application -------------------------------------------------------

function applyNutritionTarget(d: CoachDecision): string {
  const p = d.action.payload
  const today = todayStr()
  const proposedStart = str(p.startDate)
  const startDate = proposedStart && proposedStart > today ? proposedStart : today
  const current = getNutritionTarget(startDate) ?? getNutritionTarget(today)
  const kcal = Math.round(numberOr(p.kcal, current ? current.kcal + numberOr(p.deltaKcal, 0) : NaN))
  if (!Number.isFinite(kcal) || kcal <= 0) throw new Error('This proposal has no calorie target to apply')
  const proteinG = Math.round(numberOr(p.proteinG, current?.proteinG ?? 0))
  const fatG = Math.round(numberOr(p.fatG, current?.fatG ?? 0))
  const carbsG = Math.round(numberOr(p.carbsG, Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4)))
  const why = str(p.rationale) || d.rationale
  setNutritionTarget({
    startDate,
    endDate: null,
    kcal,
    proteinG,
    carbsG,
    fatG,
    rationale: `Coach: ${d.title}. ${why}`,
  })
  const from = startDate === today ? 'today' : fmtDate(startDate)
  return `Target ${fmtN(kcal)} kcal / ${proteinG} g protein from ${from}${current ? ` (was ${fmtN(current.kcal)} kcal)` : ''}`
}

function applyReflow(): string {
  const today = todayStr()
  const weekStart = startOfWeek(today)
  const sessions = getSessions(weekStart, addDays(weekStart, 6))
  const moves = reflowWeek(sessions, today)
  if (!moves.length) return 'Nothing to move - the week is already in order'
  const byId = new Map(sessions.map((s) => [s.id, s]))
  db.transaction(() => {
    for (const m of moves) {
      const s = byId.get(m.id)
      const notes = appendNote(s?.notes ?? '', m.note)
      if (m.drop) updateSession(m.id, { status: 'skipped', notes })
      else updateSession(m.id, { scheduledDate: m.scheduledDate, notes })
    }
  })
  return moves.map((m) => m.note).join('; ')
}

function applyDeload(d: CoachDecision): string {
  const p = d.action.payload
  const name = str(p.exerciseName)
  const pct = Math.max(1, Math.min(50, numberOr(p.pct, 10)))
  const library = getExercises()
  const byId = str(p.exerciseId) ? library.find((e) => e.id === str(p.exerciseId)) : undefined
  const lower = name.toLowerCase()
  const ex = byId
    ?? (lower ? library.find((e) => e.name.toLowerCase() === lower) : undefined)
    ?? (lower ? library.find((e) => e.name.toLowerCase().includes(lower)) : undefined)
  if (!ex) throw new Error(`Could not find "${name || str(p.exerciseId)}" in the exercise library`)
  const step = loadIncrement(ex.equipment)
  if (step === 0) return `${ex.name} is bodyweight - reduce reps by ${pct}% instead; nothing to change on the plan`
  const lastLoad = lastSetsForExercise(ex.id).reduce<number | null>((max, s) => (s.loadKg != null && s.loadKg > (max ?? 0) ? s.loadKg : max), null)
  const today = todayStr()
  const upcoming = getSessions(today, addDays(today, 28)).filter((s) => s.status === 'planned' && s.exercises.some((e) => e.exerciseId === ex.id))
  let touched = 0
  let fromKg: number | null = null
  let toKg: number | null = null
  db.transaction(() => {
    for (const s of upcoming) {
      const r = deloadExercises(s.exercises, ex.id, pct, lastLoad, step)
      if (!r.changed) continue
      updateSession(s.id, { exercises: r.exercises })
      touched++
      if (fromKg === null) { fromKg = r.fromKg; toKg = r.toKg }
    }
  })
  const perHand = ex.equipment.toLowerCase().includes('dumbbell') ? ' per hand' : ''
  if (!touched) {
    const hint = lastLoad != null ? ` (about ${roundDownToStep(lastLoad * (1 - pct / 100), step)} kg${perHand} instead of ${lastLoad} kg)` : ''
    return `${ex.name}: no upcoming planned session carries a load to reduce - start ${pct}% lighter the next time it is programmed${hint}`
  }
  return `${ex.name}: ${fromKg} kg -> ${toKg} kg${perHand} in ${touched} upcoming session${touched === 1 ? '' : 's'}`
}

function sessionForPayload(p: Record<string, unknown>): WorkoutSession | null {
  const id = numberOr(p.sessionId, NaN)
  if (Number.isFinite(id)) return getSession(id)
  const active = activeSession()
  if (active) return active
  return getSessionsForDate(todayStr()).find((s) => s.status === 'planned' || s.status === 'in_progress') ?? null
}

function applySubstitute(d: CoachDecision): string {
  const p = d.action.payload
  const fromId = str(p.fromExerciseId) || str(p.exerciseId)
  const toId = str(p.toExerciseId) || str(p.substituteId)
  if (!fromId || !toId) throw new Error('This substitution proposal is missing exercise ids')
  const session = sessionForPayload(p)
  if (!session) throw new Error('No session to apply the substitution to')
  const library = getExercises()
  const fromName = exerciseName(library, fromId)
  const toName = exerciseName(library, toId)
  if (session.status === 'completed' || session.status === 'skipped') return `${session.name} is already ${session.status} - nothing changed`
  const reason = str(p.reason) || d.rationale
  const r = swapExercise(session.exercises, fromId, toId, reason)
  if (!r.changed) return `${fromName} is not in ${session.name} - nothing changed`
  updateSession(session.id, { exercises: r.exercises })
  return `${fromName} -> ${toName} in ${session.name}`
}

function applyVolume(d: CoachDecision): string {
  const p = d.action.payload
  const delta = Math.round(numberOr(p.setsDelta, -1))
  if (delta === 0) return 'No change to set counts'
  const session = sessionForPayload(p)
  if (!session) throw new Error('No session to change')
  if (session.status === 'completed' || session.status === 'skipped') return `${session.name} is already ${session.status} - nothing changed`
  const r = adjustSets(session.exercises, delta)
  if (!r.changed) return `${session.name}: set counts are already at the minimum - nothing changed`
  updateSession(session.id, { exercises: r.exercises })
  return `${delta > 0 ? '+' : ''}${delta} set${Math.abs(delta) === 1 ? '' : 's'} per exercise in ${session.name} (${r.changed} exercise${r.changed === 1 ? '' : 's'})`
}

/**
 * Applies an accepted proposal and returns a short result note. Throws when the proposal cannot be
 * applied (the caller should keep it pending and show the message).
 */
export function applyDecision(d: CoachDecision): string {
  switch (d.action.kind) {
    case 'nutrition_target': return applyNutritionTarget(d)
    case 'reflow_week': return applyReflow()
    case 'deload': return applyDeload(d)
    case 'substitute': return applySubstitute(d)
    case 'volume': return applyVolume(d)
    case 'note': return d.action.summary ? `Noted: ${d.action.summary}` : 'Noted'
    default: return `Nothing to apply for "${String((d.action as ProposedAction).kind)}"`
  }
}

/** Accept = apply + record, atomically; a failed apply leaves the proposal pending. */
export function acceptDecision(d: CoachDecision): string {
  return db.transaction(() => {
    const note = applyDecision(d)
    setDecisionStatus(d.id, 'accepted', note)
    return note
  })
}

export function rejectDecision(d: CoachDecision, note = 'Rejected - nothing changed'): void {
  setDecisionStatus(d.id, 'rejected', note)
}

/** Undoes an accepted decision where that is safe (see `isReversible`) and marks it reverted. */
export function revertDecision(d: CoachDecision): string {
  if (d.status !== 'accepted') throw new Error('Only accepted decisions can be reverted')
  return db.transaction(() => {
    let note: string
    switch (d.action.kind) {
      case 'nutrition_target': {
        const today = todayStr()
        const current = getNutritionTarget(today)
        if (!current) throw new Error('There is no active target to revert')
        const prev = previousTargetFor(getNutritionTargets(), current.startDate)
        if (!prev) throw new Error('No earlier target to restore')
        setNutritionTarget({
          startDate: today,
          endDate: null,
          kcal: prev.kcal,
          proteinG: prev.proteinG,
          carbsG: prev.carbsG,
          fatG: prev.fatG,
          rationale: `Reverted "${d.title}" - restored the previous target (${fmtN(prev.kcal)} kcal / ${prev.proteinG} g protein).`,
        })
        note = `Reverted: back to ${fmtN(prev.kcal)} kcal / ${prev.proteinG} g protein from today`
        break
      }
      case 'volume': {
        const session = sessionForPayload(d.action.payload)
        if (!session) throw new Error('That session no longer exists')
        if (session.status !== 'planned') throw new Error(`${session.name} is already ${session.status} - cannot revert`)
        const delta = -Math.round(numberOr(d.action.payload.setsDelta, -1))
        const r = adjustSets(session.exercises, delta)
        if (r.changed) updateSession(session.id, { exercises: r.exercises })
        note = `Reverted: set counts restored in ${session.name}`
        break
      }
      default:
        throw new Error('This decision cannot be reverted automatically')
    }
    setDecisionStatus(d.id, 'reverted', d.resultNotes ? `${d.resultNotes} | ${note}` : note)
    return note
  })
}

/**
 * Generates proposals from today's facts and inserts the ones not already proposed, or accepted/rejected
 * in the last 7 days (matched on kind + title). Safe to call on every Coach screen mount.
 */
export function syncProposals(): void {
  const facts = buildCoachFacts()
  const drafts = generateProposals(facts)
  if (!drafts.length) return
  const since = isoAt(addDays(facts.today, -7), 0)
  const existing = getDecisions(200)
  const seen = new Set<string>()
  const fresh = drafts.filter((d) => {
    const key = `${d.kind} ${d.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return !isRecentDuplicate(existing, d, since)
  })
  if (!fresh.length) return
  const ts = nowIso()
  db.transaction(() => {
    for (const d of fresh) addDecision({ ...d, ts, status: 'proposed', resultNotes: '', decidedAt: null })
  })
}
