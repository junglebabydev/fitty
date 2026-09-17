import { db } from '../database'
import type { Region, SymptomCheck } from '../../domain/types'
import { dayRange, mapSymptom, sinceIso, type SymptomRow } from './mappers'

export function addSymptomCheck(s: Omit<SymptomCheck, 'id'>): number {
  return db.run(
    `INSERT INTO symptom_checks (ts, region, pain_score, red_flags_json, notes, context, session_id, exercise_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.ts, s.region, s.painScore, JSON.stringify(s.redFlags ?? {}), s.notes ?? '', s.context, s.sessionId ?? null, s.exerciseId ?? null],
  )
}

/** Most recent first, within the last `days` calendar days (today inclusive). */
export function getSymptomChecks(days: number): SymptomCheck[] {
  return db
    .all<SymptomRow>('SELECT * FROM symptom_checks WHERE ts >= ? ORDER BY ts DESC, id DESC', [sinceIso(days)])
    .map(mapSymptom)
}

/** All checks logged on the local calendar date, chronological. */
export function symptomsForDate(date: string): SymptomCheck[] {
  const [start, end] = dayRange(date)
  return db
    .all<SymptomRow>('SELECT * FROM symptom_checks WHERE ts >= ? AND ts < ? ORDER BY ts ASC, id ASC', [start, end])
    .map(mapSymptom)
}

/** Newest check per region within the window; regions with no check are absent. */
export function latestSymptomByRegion(days: number): Partial<Record<Region, SymptomCheck>> {
  const out: Partial<Record<Region, SymptomCheck>> = {}
  for (const s of getSymptomChecks(days)) {
    if (!out[s.region]) out[s.region] = s
  }
  return out
}

export function deleteSymptomCheck(id: number): void {
  db.run('DELETE FROM symptom_checks WHERE id = ?', [id])
}
