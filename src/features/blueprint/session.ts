// The week's session (BFT, see week.ts) for a day on this user's path, and the database rows for it. Shared by Today, the
// coach-led workout and the coach's facts, so all three see the same session. Reads the database; only
// ensureTodayRow writes.
import type { ProgramSession } from '../../domain/programs'
import { workoutTemplateKey } from '../../domain/programs'
import type { WorkoutSession } from '../../domain/types'
import { getProgram } from '../../data/programs'
import { getConditionFlags, getSessions, getSetsForSession } from '../../db/repositories'
import { effectivePaths, expandSessions, screenResult, sessionOnPath, toPlannedExercises } from '../../engine'
import { libraryExercises } from '../workout/helpers'
import { noImpactChosen, screenAnswersFor, startStandaloneWorkout } from '../workout/program'
import { WEEK_PROGRAM_ID, dayKey, isBlueprintRow, rowForDate, weekDates } from './week'

export function blueprintProgram() {
  return getProgram(WEEK_PROGRAM_ID)!
}

/** The day's session on the user's path (standing flags, saved answers, the no-impact choice): what Start creates, before the gate. */
export function blueprintSession(key: string): ProgramSession | null {
  const program = blueprintProgram()
  const base = expandSessions(program).find((s) => s.key === key)
  if (!base) return null
  const flags = getConditionFlags().map((f) => f.region)
  const noImpact = noImpactChosen()
  const path = screenResult(program, screenAnswersFor(program.id)?.answers ?? {}, flags, noImpact).path
  return sessionOnPath(program, base, effectivePaths(program, path, flags, noImpact), libraryExercises())
}

/** This week's Blueprint rows, Monday to Sunday. */
export function blueprintRows(today: string): WorkoutSession[] {
  const week = weekDates(today)
  return getSessions(week[0], week[6]).filter(isBlueprintRow)
}

/** Today's row for a session: one in progress, or an untouched planned one, is reused; otherwise a new one is made. */
export function ensureTodayRow(key: string, today: string): number {
  const own = getSessions(today, today).filter((r) => isBlueprintRow(r) && r.templateKey.endsWith(`:${key}`))
  const live = own.find((r) => r.status === 'in_progress')
  if (live) return live.id
  const fresh = own.find((r) => r.status === 'planned' && getSetsForSession(r.id).length === 0)
  return fresh ? fresh.id : startStandaloneWorkout(WEEK_PROGRAM_ID, key, today)
}

/**
 * Today's Blueprint session for the coach: today's row (in progress, done or planned), else the day's session as an
 * unsaved plan with id 0. Nothing may act on id 0 (the volume proposal skips it).
 */
export function blueprintToday(today: string): WorkoutSession | null {
  const row = rowForDate(blueprintRows(today), today)
  if (row) return row
  const key = dayKey(today)
  const session = blueprintSession(key)
  if (!session) return null
  return {
    id: 0,
    templateKey: workoutTemplateKey(WEEK_PROGRAM_ID, key),
    name: session.name,
    type: session.type,
    tier: 'minimum',
    scheduledDate: today,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    durationMin: null,
    readiness: null,
    sessionRpe: null,
    notes: '',
    exercises: toPlannedExercises(blueprintProgram(), session, { library: libraryExercises() }),
  }
}
