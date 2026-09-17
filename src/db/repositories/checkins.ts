import { db } from '../database'
import type { DailyCheckIn } from '../../domain/types'
import { mapCheckIn, type CheckInRow } from './mappers'

export function getCheckIn(date: string): DailyCheckIn | null {
  const row = db.get<CheckInRow>('SELECT * FROM daily_checkins WHERE date = ?', [date])
  return row ? mapCheckIn(row) : null
}

/** One check-in per date (UNIQUE); a second save for the same date overwrites it. Returns the row id. */
export function upsertCheckIn(c: Omit<DailyCheckIn, 'id'>): number {
  db.run(
    `INSERT INTO daily_checkins (date, energy, soreness, stress, notes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       energy = excluded.energy, soreness = excluded.soreness, stress = excluded.stress, notes = excluded.notes`,
    [c.date, c.energy ?? null, c.soreness ?? null, c.stress ?? null, c.notes ?? ''],
  )
  return db.get<{ id: number }>('SELECT id FROM daily_checkins WHERE date = ?', [c.date])!.id
}

export function getCheckIns(days: number): DailyCheckIn[] {
  return db
    .all<CheckInRow>('SELECT * FROM daily_checkins ORDER BY date DESC LIMIT ?', [Math.max(1, Math.floor(days))])
    .map(mapCheckIn)
}
