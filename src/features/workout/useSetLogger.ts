// Set logging for one planned exercise, shared by ExerciseCard (list view) and FocusMode so both write
// identical rows: history + PR detection, the pain-aware progression target, the prefill for the next
// set, and the row itself. Moved unchanged out of ExerciseCard.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import { useQuery } from '../../hooks'
import { addSet, exerciseHistory, lastSetsForExercise, previousSetsForExercise, updateVoiceCommand } from '../../db/repositories'
import { TIMED_IDS, type ProgressionResult } from '../../engine'
import { nowIso } from '../../lib/util'
import { evaluateProgressionWithPain } from './gate'
import { bestE1RM, fmtSec } from './helpers'

/** A personal best detected the moment a set is committed. */
export interface LivePR {
  exerciseName: string
  /** e.g. "Est. 1RM 36.4 kg — was 34.7 kg". */
  detail: string
}

export type LoggedSet = ExerciseSet & { restSec: number; pr: LivePR | null }

export interface SetLoggerInput {
  session: WorkoutSession
  planned: PlannedExercise
  exercise: Exercise
  /** Sets logged for this exercise in this session, in log order. */
  sets: ExerciseSet[]
  /** True after a red-flag report: no more sets can be logged. */
  stopped: boolean
  /** The next logged set gets a pain flag (pain reported before any set was logged). */
  painNext: boolean
}

export const NO_LOAD_EQUIPMENT = ['bodyweight', 'bike', 'treadmill', 'elliptical', 'pool', 'none']

/** Substitution reasons that are not pain-driven (SubstituteSheet quick reasons) — progression may still advance. */
const NON_PAIN_SUBSTITUTION = /^(equipment busy|preference)\b/i

/** The exercise_sets row for the next set. Pure, so the list view and Focus Mode provably write the same thing. */
export function buildSetRow(i: {
  sessionId: number; exerciseId: string; setIndex: number; timed: boolean; loadable: boolean
  reps: number | null; loadKg: number | null; durationSec: number | null; rir: number; painFlag: boolean; loggedAt: string
}): Omit<ExerciseSet, 'id'> {
  return {
    sessionId: i.sessionId,
    exerciseId: i.exerciseId,
    setIndex: i.setIndex,
    reps: i.timed ? null : i.reps,
    loadKg: i.loadable ? i.loadKg : null,
    rir: i.timed ? null : i.rir,
    rpe: null,
    durationSec: i.timed ? i.durationSec : null,
    painFlag: i.painFlag,
    loggedAt: i.loggedAt,
  }
}

export function useSetLogger({ session, planned, exercise, sets, stopped, painNext }: SetLoggerInput) {
  const timed = exercise.timed || TIMED_IDS.has(exercise.id)
  const loadable = !NO_LOAD_EQUIPMENT.includes(exercise.equipment.toLowerCase())

  /** Comparable effort for PR detection: seconds when timed, e1RM when loaded, otherwise reps. */
  const effortOf = (list: Pick<ExerciseSet, 'loadKg' | 'reps' | 'durationSec'>[]): number | null => {
    if (timed) {
      const d = list.map((s) => s.durationSec).filter((x): x is number => x != null)
      return d.length ? Math.max(...d) : null
    }
    if (loadable) return bestE1RM(list as ExerciseSet[])
    const r = list.map((s) => s.reps).filter((x): x is number => x != null)
    return r.length ? Math.max(...r) : null
  }

  // Previous completed sessions plus the pain-aware recommendation (re-runs on every DB write, so a
  // Pain / Issue report saved a moment ago is reflected immediately).
  const history = useQuery(() => {
    const last = lastSetsForExercise(exercise.id, session.id)
    const prev = previousSetsForExercise(exercise.id, session.id)
    let best: number | null = null
    for (const h of exerciseHistory(exercise.id, 50)) {
      if (h.sessionId === session.id) continue
      const v = effortOf(h.sets)
      if (v != null && (best == null || v > best)) best = v
    }
    return { last, prev, best, progression: evaluateProgressionWithPain(planned, exercise, last, prev) }
  }, [exercise.id, session.id, planned])
  const progression = history.progression

  // Anything pain-related in this session forces a hold (PRD §9.2): a flagged set, a pain report before the
  // first set, a load reduced mid-session, or a substitute swapped in for pain (by the gate or a report).
  const lastLogged = sets[sets.length - 1]
  // Reduced mid-session by a Pain / Issue report (explicit marker set by reducePlannedLoad).
  const reduced = planned.loadKg != null && !!planned.reducedReason
  const painSub = !!planned.substitutedFrom && !!planned.substitutionReason && !NON_PAIN_SUBSTITUTION.test(planned.substitutionReason)
  const painHere = painNext || sets.some((s) => s.painFlag)
  const effective = useMemo<ProgressionResult>(() => {
    if (!(painHere || reduced || painSub)) return progression
    const historyLoad = history.last.reduce<number | null>((m, s) => (s.loadKg != null && (m == null || s.loadKg > m) ? s.loadKg : m), null)
    const nextLoadKg = reduced ? planned.loadKg : lastLogged?.loadKg ?? historyLoad ?? planned.loadKg
    const reason = reduced
      ? 'Load reduced after a pain report — hold it there and keep the range pain-free.'
      : painSub
        ? 'Swapped in because of pain today — hold the load and keep the range pain-free.'
        : 'Pain reported today — hold the load and keep the range pain-free.'
    return { ...progression, action: 'hold', nextLoadKg, repMin: planned.repMin, repMax: planned.repMax, reason, stalled: false }
  }, [progression, painHere, reduced, painSub, history.last, lastLogged, planned])

  const [load, setLoad] = useState<number | null>(null)
  const [reps, setReps] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [rir, setRir] = useState(2)
  const lastPrefillCount = useRef(-1)

  // Prefill the next row from the last logged set, else from the progression target.
  useEffect(() => {
    if (lastPrefillCount.current === sets.length) return
    lastPrefillCount.current = sets.length
    const lastLogged = sets[sets.length - 1]
    if (lastLogged) {
      setLoad(lastLogged.loadKg)
      setReps(lastLogged.reps)
      setDuration(lastLogged.durationSec)
      setRir(lastLogged.rir ?? 2)
      return
    }
    const seed = history.last[0]
    setLoad(effective.nextLoadKg ?? planned.loadKg ?? seed?.loadKg ?? null)
    if (timed) {
      setDuration(seed?.durationSec ?? effective.repMin)
      setReps(null)
    } else {
      setReps(seed?.reps ?? effective.repMin)
      setDuration(null)
    }
    setRir(seed?.rir ?? 2)
  }, [sets, history.last, effective, planned.loadKg, timed])

  // Drop the prefilled load when the plan is reduced mid-session, or pain is reported before the first set.
  useEffect(() => {
    if (reduced && planned.loadKg != null) setLoad(planned.loadKg)
    else if (painNext && sets.length === 0 && effective.nextLoadKg != null) setLoad(effective.nextLoadKg)
  }, [reduced, planned.loadKg, painNext, sets.length, effective.nextLoadKg])

  const canLog = !stopped && (timed ? (duration ?? 0) > 0 : (reps ?? 0) > 0)

  /**
   * Writes the set with the current draft values (or `override`, e.g. a timed set's actual seconds).
   * `voiceCommandId` marks the voice command that filled the draft as applied. Returns the logged row.
   */
  const log = (opts: { voiceCommandId?: number; override?: { durationSec?: number } } = {}): LoggedSet | null => {
    const dur = opts.override?.durationSec ?? duration
    if (stopped || !(timed ? (dur ?? 0) > 0 : (reps ?? 0) > 0)) return null
    const row = buildSetRow({
      sessionId: session.id, exerciseId: exercise.id, setIndex: sets.length + 1, timed, loadable,
      reps, loadKg: load, durationSec: dur, rir, painFlag: painNext, loggedAt: nowIso(),
    })
    // PR = beats every earlier session AND everything already logged today. Never celebrated alongside pain.
    const value = effortOf([row])
    const sessionBest = effortOf(sets)
    const isPr = !painHere && history.best != null && value != null && value > history.best && (sessionBest == null || value > sessionBest)
    const pr: LivePR | null = isPr && value != null && history.best != null
      ? {
          exerciseName: exercise.name,
          detail: timed
            ? `${fmtSec(Math.round(value))} — was ${fmtSec(Math.round(history.best))}`
            : loadable
              ? `Est. 1RM ${value.toFixed(1)} kg — was ${history.best.toFixed(1)} kg`
              : `${value} reps — was ${history.best}`,
        }
      : null

    const id = addSet(row)
    if (opts.voiceCommandId) {
      try { updateVoiceCommand(opts.voiceCommandId, { status: 'applied' }) } catch { /* ignore */ }
    }
    return { ...row, id, restSec: planned.restSec, pr }
  }

  return {
    timed, loadable, history, progression, effective, painHere, reduced, painSub,
    load, setLoad, reps, setReps, duration, setDuration, rir, setRir,
    canLog, log,
  }
}
