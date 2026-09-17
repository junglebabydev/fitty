import { db } from '../database'
import type { Exercise } from '../../domain/types'
import { mapExercise, type ExerciseRow } from './mappers'

/** Insert-or-replace the whole list in one transaction (used to load the bundled library). */
export function upsertExercises(list: Exercise[]): void {
  if (!list.length) return
  db.transaction(() => {
    for (const e of list) {
      db.run(
        `INSERT OR REPLACE INTO exercises (
           id, name, equipment, primary_muscles_json, secondary_muscles_json, pattern, safety_tags_json, substitutions_json, instructions, timed
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id, e.name, e.equipment, JSON.stringify(e.primaryMuscles ?? []), JSON.stringify(e.secondaryMuscles ?? []),
          e.pattern, JSON.stringify(e.safetyTags ?? []), JSON.stringify(e.substitutions ?? []), e.instructions ?? '', e.timed ? 1 : 0,
        ],
      )
    }
  })
}

export function getExercises(): Exercise[] {
  return db.all<ExerciseRow>('SELECT * FROM exercises ORDER BY name COLLATE NOCASE ASC').map(mapExercise)
}

export function getExercise(id: string): Exercise | null {
  const row = db.get<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [id])
  return row ? mapExercise(row) : null
}

export function exerciseCount(): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM exercises')?.n ?? 0
}
