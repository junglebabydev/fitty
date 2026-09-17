import { db } from '../database'
import type { CardioSession, ExerciseSet, MobilitySession, WorkoutSession } from '../../domain/types'
import { updateById, type ColumnMap } from './common'
import { mapCardio, mapMobility, mapSession, mapSet, sinceIso, type CardioRow, type MobilityRow, type SessionRow, type SetRow } from './mappers'

// --- sessions ----------------------------------------------------------------

const SESSION_COLS: ColumnMap<Omit<WorkoutSession, 'id'>> = {
  templateKey: 'template_key', name: 'name', type: 'type', tier: 'tier', scheduledDate: 'scheduled_date',
  status: 'status', startedAt: 'started_at', completedAt: 'completed_at', durationMin: 'duration_min',
  readiness: 'readiness', sessionRpe: 'session_rpe', notes: 'notes', exercises: 'exercises_json',
}

export function createSession(s: Omit<WorkoutSession, 'id'>): number {
  return db.run(
    `INSERT INTO workout_sessions (
       template_key, name, type, tier, scheduled_date, status, started_at, completed_at, duration_min, readiness, session_rpe, notes, exercises_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.templateKey, s.name, s.type, s.tier, s.scheduledDate, s.status, s.startedAt ?? null, s.completedAt ?? null,
      s.durationMin ?? null, s.readiness ?? null, s.sessionRpe ?? null, s.notes ?? '', JSON.stringify(s.exercises ?? []),
    ],
  )
}

export function updateSession(id: number, patch: Partial<WorkoutSession>): void {
  updateById('workout_sessions', SESSION_COLS, id, patch)
}

/** Sets are removed explicitly: ON DELETE CASCADE depends on PRAGMA foreign_keys, which is per-connection state. */
export function deleteSession(id: number): void {
  db.transaction(() => {
    db.run('DELETE FROM exercise_sets WHERE session_id = ?', [id])
    db.run('DELETE FROM workout_sessions WHERE id = ?', [id])
  })
}

export function getSession(id: number): WorkoutSession | null {
  const row = db.get<SessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [id])
  return row ? mapSession(row) : null
}

/** Sessions scheduled in [from, to] inclusive, ascending by date. */
export function getSessions(from: string, to: string): WorkoutSession[] {
  return db
    .all<SessionRow>('SELECT * FROM workout_sessions WHERE scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date ASC, id ASC', [from, to])
    .map(mapSession)
}

export function getSessionsForDate(date: string): WorkoutSession[] {
  return db.all<SessionRow>('SELECT * FROM workout_sessions WHERE scheduled_date = ? ORDER BY id ASC', [date]).map(mapSession)
}

/** The in-progress session, if any (most recently started wins). */
export function activeSession(): WorkoutSession | null {
  const row = db.get<SessionRow>(`SELECT * FROM workout_sessions WHERE status = 'in_progress' ORDER BY started_at DESC, id DESC LIMIT 1`)
  return row ? mapSession(row) : null
}

export function completedSessionCount(from: string, to: string): number {
  return db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM workout_sessions WHERE status = 'completed' AND scheduled_date >= ? AND scheduled_date <= ?`,
    [from, to],
  )?.n ?? 0
}

// --- sets --------------------------------------------------------------------

const SET_COLS: ColumnMap<Omit<ExerciseSet, 'id'>> = {
  sessionId: 'session_id', exerciseId: 'exercise_id', setIndex: 'set_index', reps: 'reps', loadKg: 'load_kg',
  rir: 'rir', rpe: 'rpe', durationSec: 'duration_sec', painFlag: 'pain_flag', loggedAt: 'logged_at',
}

export function addSet(s: Omit<ExerciseSet, 'id'>): number {
  return db.run(
    `INSERT INTO exercise_sets (session_id, exercise_id, set_index, reps, load_kg, rir, rpe, duration_sec, pain_flag, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.sessionId, s.exerciseId, s.setIndex, s.reps ?? null, s.loadKg ?? null, s.rir ?? null, s.rpe ?? null,
      s.durationSec ?? null, s.painFlag ? 1 : 0, s.loggedAt,
    ],
  )
}

export function updateSet(id: number, patch: Partial<ExerciseSet>): void {
  updateById('exercise_sets', SET_COLS, id, patch)
}

export function deleteSet(id: number): void {
  db.run('DELETE FROM exercise_sets WHERE id = ?', [id])
}

/** All sets of a session in the order they were logged. */
export function getSetsForSession(sessionId: number): ExerciseSet[] {
  return db.all<SetRow>('SELECT * FROM exercise_sets WHERE session_id = ? ORDER BY id ASC', [sessionId]).map(mapSet)
}

/**
 * Id of the `offset`-th most recent completed session (0 = latest) that has logged sets for `exerciseId`,
 * skipping `excludeSessionId` (typically the session currently in progress).
 */
function completedSessionWithExercise(exerciseId: string, offset: number, excludeSessionId?: number): number | null {
  const row = db.get<{ id: number }>(
    `SELECT s.id FROM workout_sessions s
     WHERE s.status = 'completed' AND s.id != ?
       AND EXISTS (SELECT 1 FROM exercise_sets es WHERE es.session_id = s.id AND es.exercise_id = ?)
     ORDER BY s.scheduled_date DESC, s.completed_at DESC, s.id DESC
     LIMIT 1 OFFSET ?`,
    [excludeSessionId ?? -1, exerciseId, offset],
  )
  return row?.id ?? null
}

function setsForSessionExercise(sessionId: number, exerciseId: string): ExerciseSet[] {
  return db
    .all<SetRow>('SELECT * FROM exercise_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_index ASC, id ASC', [sessionId, exerciseId])
    .map(mapSet)
}

/** Sets from the most recent completed session containing the exercise. */
export function lastSetsForExercise(exerciseId: string, excludeSessionId?: number): ExerciseSet[] {
  const sessionId = completedSessionWithExercise(exerciseId, 0, excludeSessionId)
  return sessionId == null ? [] : setsForSessionExercise(sessionId, exerciseId)
}

/** Sets from the completed session before the one `lastSetsForExercise` returns. */
export function previousSetsForExercise(exerciseId: string, excludeSessionId?: number): ExerciseSet[] {
  const sessionId = completedSessionWithExercise(exerciseId, 1, excludeSessionId)
  return sessionId == null ? [] : setsForSessionExercise(sessionId, exerciseId)
}

export interface ExerciseHistoryEntry { sessionId: number; date: string; sets: ExerciseSet[] }

/** Most recent `limit` sessions (any status) with logged sets for the exercise, newest first. */
export function exerciseHistory(exerciseId: string, limit = 10): ExerciseHistoryEntry[] {
  const rows = db.all<SetRow & { session_date: string }>(
    `SELECT es.*, s.scheduled_date AS session_date
     FROM exercise_sets es JOIN workout_sessions s ON s.id = es.session_id
     WHERE es.exercise_id = ?
     ORDER BY s.scheduled_date DESC, s.id DESC, es.set_index ASC, es.id ASC`,
    [exerciseId],
  )
  const out: ExerciseHistoryEntry[] = []
  let current: ExerciseHistoryEntry | null = null
  for (const r of rows) {
    if (!current || current.sessionId !== r.session_id) {
      if (out.length >= limit) break
      current = { sessionId: r.session_id, date: r.session_date, sets: [] }
      out.push(current)
    }
    current.sets.push(mapSet(r))
  }
  return out
}

// --- cardio ------------------------------------------------------------------

export function addCardio(c: Omit<CardioSession, 'id'>): number {
  return db.run(
    `INSERT INTO cardio_sessions (session_id, modality, duration_min, distance_km, avg_hr, ts, source) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.sessionId ?? null, c.modality, c.durationMin, c.distanceKm ?? null, c.avgHr ?? null, c.ts, c.source],
  )
}

/** Most recent first, within the last `days` calendar days (today inclusive). */
export function getCardio(days: number): CardioSession[] {
  return db
    .all<CardioRow>('SELECT * FROM cardio_sessions WHERE ts >= ? ORDER BY ts DESC, id DESC', [sinceIso(days)])
    .map(mapCardio)
}

export function deleteCardio(id: number): void {
  db.run('DELETE FROM cardio_sessions WHERE id = ?', [id])
}

// --- mobility ----------------------------------------------------------------

export function addMobilitySession(m: Omit<MobilitySession, 'id'>): number {
  return db.run(
    `INSERT INTO mobility_sessions (routine_id, ts, movements_json, completed) VALUES (?, ?, ?, ?)`,
    [m.routineId, m.ts, JSON.stringify(m.movements ?? []), m.completed ? 1 : 0],
  )
}

/** Most recent first, within the last `days` calendar days (today inclusive). */
export function getMobilitySessions(days: number): MobilitySession[] {
  return db
    .all<MobilityRow>('SELECT * FROM mobility_sessions WHERE ts >= ? ORDER BY ts DESC, id DESC', [sinceIso(days)])
    .map(mapMobility)
}

export function deleteMobilitySession(id: number): void {
  db.run('DELETE FROM mobility_sessions WHERE id = ?', [id])
}
