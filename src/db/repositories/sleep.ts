import { db } from '../database'
import type { SleepRecord } from '../../domain/types'
import { dayRange, mapSleep, sinceIso, type SleepRow } from './mappers'

export function addSleepRecord(r: Omit<SleepRecord, 'id'>): number {
  return db.run(
    `INSERT INTO sleep_records (start_ts, end_ts, duration_min, source, quality) VALUES (?, ?, ?, ?, ?)`,
    [r.startTs, r.endTs, r.durationMin, r.source, r.quality ?? null],
  )
}

/** Nights whose end falls within the last `days` calendar days (today inclusive), ascending by endTs. */
export function getSleepRecords(days: number): SleepRecord[] {
  return db
    .all<SleepRow>('SELECT * FROM sleep_records WHERE end_ts >= ? ORDER BY end_ts ASC, id ASC', [sinceIso(days)])
    .map(mapSleep)
}

/** The record that ended on `today` (i.e. last night). Longest first if several were imported. */
export function lastNightSleep(today: string): SleepRecord | null {
  const [start, end] = dayRange(today)
  const row = db.get<SleepRow>(
    'SELECT * FROM sleep_records WHERE end_ts >= ? AND end_ts < ? ORDER BY duration_min DESC, end_ts DESC LIMIT 1',
    [start, end],
  )
  return row ? mapSleep(row) : null
}

export function deleteSleepRecord(id: number): void {
  db.run('DELETE FROM sleep_records WHERE id = ?', [id])
}
