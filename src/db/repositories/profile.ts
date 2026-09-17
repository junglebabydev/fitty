import { db } from '../database'
import type { ConditionFlag, Goal, UserProfile } from '../../domain/types'
import { nowIso } from '../../lib/util'
import { mapConditionFlag, mapGoal, mapProfile, type ConditionFlagRow, type GoalRow, type ProfileRow } from './mappers'

export function getProfile(): UserProfile | null {
  const row = db.get<ProfileRow>('SELECT * FROM user_profile WHERE id = 1')
  return row ? mapProfile(row) : null
}

/** Single-row profile (id = 1). Insert on first save, update afterwards; created_at is preserved. */
export function saveProfile(p: UserProfile): void {
  db.run(
    `INSERT INTO user_profile (
       id, name, dob, sex, height_cm, units, experience, diet_pattern, equipment_json, mobility_priorities_json,
       coach_style, training_days_min, training_days_target, training_days_stretch, onboarded, created_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, dob = excluded.dob, sex = excluded.sex, height_cm = excluded.height_cm,
       units = excluded.units, experience = excluded.experience, diet_pattern = excluded.diet_pattern,
       equipment_json = excluded.equipment_json, mobility_priorities_json = excluded.mobility_priorities_json,
       coach_style = excluded.coach_style, training_days_min = excluded.training_days_min,
       training_days_target = excluded.training_days_target, training_days_stretch = excluded.training_days_stretch,
       onboarded = excluded.onboarded`,
    [
      p.name, p.dob, p.sex, p.heightCm, p.units, p.experience, p.dietPattern,
      JSON.stringify(p.equipment ?? []), JSON.stringify(p.mobilityPriorities ?? []),
      p.coachStyle, p.trainingDaysMin, p.trainingDaysTarget, p.trainingDaysStretch, p.onboarded ? 1 : 0, nowIso(),
    ],
  )
}

export function getGoals(): Goal[] {
  return db.all<GoalRow>('SELECT * FROM goals ORDER BY priority ASC, id ASC').map(mapGoal)
}

/** Insert when `id` is absent, otherwise update that row. Returns the goal id. */
export function upsertGoal(g: Omit<Goal, 'id'> & { id?: number }): number {
  if (g.id != null) {
    db.run(
      `UPDATE goals SET type = ?, target_value = ?, unit = ?, priority = ?, start_date = ?, target_date = ?, status = ? WHERE id = ?`,
      [g.type, g.targetValue, g.unit, g.priority, g.startDate, g.targetDate ?? null, g.status, g.id],
    )
    return g.id
  }
  return db.run(
    `INSERT INTO goals (type, target_value, unit, priority, start_date, target_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [g.type, g.targetValue, g.unit, g.priority, g.startDate, g.targetDate ?? null, g.status],
  )
}

export function deleteGoal(id: number): void {
  db.run('DELETE FROM goals WHERE id = ?', [id])
}

export function getConditionFlags(): ConditionFlag[] {
  return db.all<ConditionFlagRow>('SELECT * FROM condition_flags ORDER BY id ASC').map(mapConditionFlag)
}

export function addConditionFlag(f: Omit<ConditionFlag, 'id'>): number {
  return db.run(
    `INSERT INTO condition_flags (region, label, baseline_notes, created_at) VALUES (?, ?, ?, ?)`,
    [f.region, f.label, f.baselineNotes ?? '', nowIso()],
  )
}

export function deleteConditionFlag(id: number): void {
  db.run('DELETE FROM condition_flags WHERE id = ?', [id])
}
