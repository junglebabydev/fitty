// Programme enrolment and its rows (docs/PRD_TRAINING_PROGRAMS.md §5.2, §6). The rules live in engine/programs.ts;
// this file reads and writes settings 'train.program', 'train.screens', 'train.noImpact' and the session rows.
import type { Enrollment, Feel, PathId, Program, ProgramId, ScreenAnswers } from '../../domain/programs'
import {
  NO_IMPACT_SETTING, PROGRAM_SETTING, SCREENS_SETTING, parseProgramKey, programTemplateKey, workoutTemplateKey,
} from '../../domain/programs'
import type { Exercise, Region, SafetyTag, WorkoutSession } from '../../domain/types'
import { EXERCISES } from '../../data/exercises'
import { getProgram } from '../../data/programs'
import { db } from '../../db/database'
import {
  createSession, deleteSession, getConditionFlags, getExercises, getSession, getSessions, getSetsForSession, getSetting,
  getSymptomChecks, setSetting, symptomsForDate,
} from '../../db/repositories'
import {
  closeWindow, effectivePaths, expandSessions, kneeGuard, nextRungs, programAvoidTags, programWeekSessions, screenResult,
  sessionOnPath, sessionsForWeek, toPlannedExercises, windowDates, windowIndex, type WindowClose,
} from '../../engine'
import { addDays, dateOf, daysBetween, nowIso, startOfWeek } from '../../lib/util'

/** Symptom contexts that count as week pain (§6.2): the gate before, the check after, and the next morning. */
const PAIN_CONTEXTS = new Set(['pre_workout', 'post_workout', 'morning'])

/** Days a next-morning knee or hip score keeps holding running back (§6.6) when no later score arrives. */
export const KNEE_GUARD_DAYS = 14

function library(): Exercise[] {
  const lib = getExercises()
  return lib.length ? lib : EXERCISES
}

function flagRegions(): Region[] {
  return getConditionFlags().map((f) => f.region)
}

/** Untouched: still planned and nothing logged against it. */
function untouched(s: WorkoutSession): boolean {
  return s.status === 'planned' && getSetsForSession(s.id).length === 0
}

function ownsRow(programId: ProgramId, s: WorkoutSession): boolean {
  const k = parseProgramKey(s.templateKey)
  return !!k && !k.standalone && k.programId === programId
}

/** The paths this user's sessions run on: the given path plus the standing flags' paths and the no-impact path. */
function activePaths(program: Program, path: PathId): PathId[] {
  return effectivePaths(program, path, flagRegions(), noImpactChosen())
}

/** History reason when a long absence (advance.longGapDays) restarts the last completed week. */
export const LONG_GAP_REASON = 'Back after a break: repeating your last completed week'

/** Planned programme rows of `programId` from `from` on, with nothing logged. */
function deleteFutureRows(programId: ProgramId, from: string): number {
  let n = 0
  for (const s of getSessions(from, '9999-12-31')) {
    if (ownsRow(programId, s) && untouched(s)) { deleteSession(s.id); n++ }
  }
  return n
}

// --- enrolment --------------------------------------------------------------------------------------------------

export function currentEnrollment(): Enrollment | null {
  const raw = getSetting<Enrollment | null>(PROGRAM_SETTING, null)
  if (!raw || typeof raw !== 'object' || typeof raw.programId !== 'string' || typeof raw.startDate !== 'string') return null
  return { ...raw, feel: Array.isArray(raw.feel) ? raw.feel : [], history: Array.isArray(raw.history) ? raw.history : [] }
}

/** The active enrolment and its programme, or null. */
export function activeProgram(): { program: Program; enrollment: Enrollment } | null {
  const enrollment = currentEnrollment()
  if (!enrollment || enrollment.status !== 'active') return null
  const program = getProgram(enrollment.programId)
  return program ? { program, enrollment } : null
}

/**
 * Start a programme today on `path` (week 1). `replaceTierWeek` first deletes this calendar week's untouched planned
 * non-programme sessions dated today or later (§6.1, after the user confirmed). A previous programme's future
 * untouched rows go too. Then the first window is written.
 */
export function enrollInProgram(programId: ProgramId, path: PathId, today: string, opts: { replaceTierWeek: boolean }): Enrollment {
  return db.transaction(() => {
    const prev = currentEnrollment()
    if (prev && prev.status === 'active') deleteFutureRows(prev.programId, today)
    if (opts.replaceTierWeek) {
      for (const s of getSessions(today, addDays(startOfWeek(today), 6))) {
        if (!parseProgramKey(s.templateKey) && untouched(s)) deleteSession(s.id)
      }
    }
    const enrollment: Enrollment = { programId, path, startDate: today, week: 1, closedWindow: -1, status: 'active', feel: [], history: [] }
    setSetting(PROGRAM_SETTING, enrollment)
    ensureProgramWeek(today)
    return currentEnrollment() ?? enrollment
  })
}

/** Max pain in the window's symptom checks (any region; pre-workout, post-workout and morning). */
function windowPain(dates: string[]): number[] {
  return dates.flatMap((d) => symptomsForDate(d).filter((s) => PAIN_CONTEXTS.has(s.context)).map((s) => s.painScore))
}

/**
 * Close every elapsed window in order (week rule + ladders), then write the current window's missing sessions.
 * After a long absence (today minus the last completed session ≥ advance.longGapDays, measured from the enrolment
 * start when nothing was completed) the windows after that session are not closed one by one: ONE 'repeat' entry
 * resumes the last completed week (the last advanced-from week, at most the current one, at least 1). A gap that
 * leaves no empty window to close (Home's 8-13 days) is not caught here. Idempotent; one
 * transaction. Returns the decisions taken and the number of rows created.
 */
export function ensureProgramWeek(today: string): { closed: WindowClose[]; created: number } {
  return db.transaction(() => {
    const active = activeProgram()
    if (!active) return { closed: [], created: 0 }
    const { program } = active
    let enrollment = active.enrollment
    const k = windowIndex(enrollment.startDate, today)
    const closed: WindowClose[] = []
    const paths = activePaths(program, enrollment.path)
    // Rows of this enrolment only: an earlier enrolment of the same series may have left rows in these dates.
    const ownRows = (from: string, to: string) => getSessions(from, to).filter((s) => ownsRow(program.id, s) && s.scheduledDate >= enrollment.startDate)

    const lastDone = k > enrollment.closedWindow + 1
      ? ownRows(enrollment.startDate, today).filter((s) => s.status === 'completed').map((s) => s.scheduledDate).sort().pop() ?? null
      : null
    const longGap = k > enrollment.closedWindow + 1 && daysBetween(lastDone ?? enrollment.startDate, today) >= program.advance.longGapDays
    const resumeAfterGap = (): void => {
      const lastAdvance = [...enrollment.history].reverse().find((h) => h.decision === 'advance')
      const week = Math.max(1, Math.min(enrollment.week, lastAdvance?.week ?? 1))
      closed.push({ decision: 'repeat', nextWeek: week, status: enrollment.status, reason: LONG_GAP_REASON })
      enrollment = {
        ...enrollment,
        week,
        closedWindow: k - 1,
        // Like any non-advance close: the left week's feel answers are consumed, so a stale "Too hard" cannot repeat it.
        feel: enrollment.feel.filter((f) => f.week !== enrollment.week),
        history: [...enrollment.history, { week: enrollment.week, decision: 'repeat', reason: LONG_GAP_REASON, at: today }],
      }
    }

    for (let w = enrollment.closedWindow + 1; w < k && enrollment.status === 'active'; w++) {
      const dates = windowDates(enrollment.startDate, w)
      // The windows after the last completed session collapse into one entry.
      if (longGap && (lastDone == null || lastDone < dates[0])) { resumeAfterGap(); break }
      const rows = ownRows(dates[0], dates[6])
      const done = rows.filter((s) => s.status === 'completed')
      const result = closeWindow(program, enrollment, rows, windowPain(dates), today)
      const rungs = nextRungs(program, enrollment, done.map((session) => ({ session, sets: getSetsForSession(session.id) })), { paths, library: library() })
      // A non-advance decision consumes that week's feel answers, so a stale "Too hard" cannot repeat it again.
      const keys = new Set(rows.map((s) => parseProgramKey(s.templateKey)?.sessionKey))
      const feel = result.decision === 'advance' ? enrollment.feel : enrollment.feel.filter((f) => !(f.week === enrollment.week && keys.has(f.sessionKey)))
      enrollment = {
        ...enrollment,
        week: result.nextWeek,
        closedWindow: w,
        status: result.status,
        rungs,
        feel,
        history: [...enrollment.history, { week: enrollment.week, decision: result.decision, reason: result.reason, at: today }],
      }
      closed.push(result)
    }
    if (closed.length) setSetting(PROGRAM_SETTING, enrollment)
    if (enrollment.status !== 'active' || k < 0) return { closed, created: 0 }

    // Written when any session expected for this week is missing from this enrolment's rows in the window.
    const dates = windowDates(enrollment.startDate, k)
    const inWindow = getSessions(dates[0], dates[6])
    const expected = sessionsForWeek(program, enrollment.week, paths, library(), enrollment.rungs).map((s) => programTemplateKey(program.id, s.key))
    const present = new Set(inWindow.filter((s) => ownsRow(program.id, s) && s.scheduledDate >= enrollment.startDate).map((s) => s.templateKey))
    if (expected.every((key) => present.has(key))) return { closed, created: 0 }
    const rows = programWeekSessions(program, enrollment, today, inWindow, library(), paths)
    for (const r of rows) createSession(r)
    return { closed, created: rows.length }
  })
}

/** "How did it feel?" on a finished programme session (§4.7). One entry per session: a second answer replaces it. */
export function recordFeel(sessionId: number, value: Feel): void {
  const enrollment = currentEnrollment()
  const session = getSession(sessionId)
  const key = session ? parseProgramKey(session.templateKey) : null
  if (!enrollment || !key || key.standalone || key.programId !== enrollment.programId) return
  const feel = enrollment.feel.filter((f) => !(f.sessionKey === key.sessionKey && f.week === enrollment.week))
  setSetting(PROGRAM_SETTING, { ...enrollment, feel: [...feel, { sessionKey: key.sessionKey, week: enrollment.week, value }] })
}

/** Stop the programme: status 'left' and its future untouched planned rows are removed. */
export function leaveProgram(today: string): void {
  const enrollment = currentEnrollment()
  if (!enrollment || enrollment.status !== 'active') return
  db.transaction(() => {
    deleteFutureRows(enrollment.programId, today)
    setSetting(PROGRAM_SETTING, { ...enrollment, status: 'left' })
  })
}

// --- safety check and the no-impact choice ----------------------------------------------------------------------

function allScreens(): Partial<Record<ProgramId, ScreenAnswers>> {
  const raw = getSetting<unknown>(SCREENS_SETTING, {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Partial<Record<ProgramId, ScreenAnswers>>) : {}
}

export function saveScreenAnswers(programId: ProgramId, answers: Record<string, boolean>, answeredAt: string = nowIso()): ScreenAnswers {
  const saved: ScreenAnswers = { programId, answers, answeredAt }
  setSetting(SCREENS_SETTING, { ...allScreens(), [programId]: saved })
  return saved
}

export function screenAnswersFor(programId: ProgramId): ScreenAnswers | undefined {
  return allScreens()[programId]
}

export function noImpactChosen(): boolean {
  return getSetting<boolean>(NO_IMPACT_SETTING, false) === true
}

export function setNoImpact(v: boolean): void {
  setSetting(NO_IMPACT_SETTING, v)
}

/**
 * Extra avoid-tags for a programme-derived session (§6.3, §6.6): standing flags without impact, the series' own
 * tags, impact on the user's choice, and impact while a flagged knee or hip scored 4/10 or more the morning after.
 */
export function programExtraAvoid(program: Program, today: string): SafetyTag[] {
  const flags = flagRegions()
  const tags = new Set(programAvoidTags(program, flags, noImpactChosen()))
  const since = addDays(today, -KNEE_GUARD_DAYS)
  const scores = getSymptomChecks(KNEE_GUARD_DAYS + 1)
    .filter((s) => s.context === 'morning')
    .map((s) => ({ date: dateOf(s.ts), region: s.region, pain: s.painScore, ts: s.ts, id: s.id }))
  if (kneeGuard(scores, flags, since)) tags.add('impact')
  return [...tags]
}

// --- standalone workouts -----------------------------------------------------------------------------------------

/**
 * "Start now" (§4.9): a planned 'work:' session for today from one programme session, on the path the saved safety
 * check and the flags select (standard when never answered). Never moves the programme. Returns the new id.
 */
export function startStandaloneWorkout(programId: ProgramId, sessionKey: string, today: string): number {
  const program = getProgram(programId)
  if (!program) throw new Error(`Unknown programme ${programId}`)
  const base = expandSessions(program).find((s) => s.key === sessionKey) ?? program.sessions.find((s) => s.key === sessionKey)
  if (!base) throw new Error(`Unknown session ${programId}:${sessionKey}`)
  const saved = screenAnswersFor(programId)
  const path = screenResult(program, saved?.answers ?? {}, flagRegions(), noImpactChosen()).path
  const enrollment = currentEnrollment()
  const rungs = enrollment && enrollment.programId === programId ? enrollment.rungs : undefined
  const session = sessionOnPath(program, base, activePaths(program, path), library(), rungs)
  const pick = program.standalone.find((s) => s.sessionKey === sessionKey)
  return createSession({
    templateKey: workoutTemplateKey(programId, sessionKey),
    name: pick?.name ?? session.name,
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
    exercises: toPlannedExercises(program, session, { library: library() }),
  })
}

/** End of the current programme window, for reflow (null without an active enrolment). */
export function currentWindowEnd(today: string): string | null {
  const enrollment = currentEnrollment()
  if (!enrollment || enrollment.status !== 'active') return null
  const k = windowIndex(enrollment.startDate, today)
  return k < 0 ? null : windowDates(enrollment.startDate, k)[6]
}
