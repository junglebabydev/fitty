// Blocks that run on their own once started (the player and the coach-led workout): interval rounds and the timed
// stations of a circuit. Tap Start once; after each rest the next round or station starts by itself, until the
// block is done or you pause. Steady blocks and the move into a new block still take a tap. Pure.
import type { PlannedExercise } from '../../domain/types'

/**
 * The block an entry belongs to for auto-run: 'c:<circuit key>' for any station of a circuit, 'i:<index>' for an
 * interval entry (a work bout with an easy bout between rounds), null for anything that runs one tap at a time.
 * Only timed entries start themselves; a reps station inside an armed circuit waits for its log, then the run goes on.
 */
export function autoBlock(planned: Pick<PlannedExercise, 'circuit' | 'restExerciseId'>, index: number): string | null {
  if (planned.circuit) return `c:${planned.circuit}`
  if (planned.restExerciseId) return `i:${index}`
  return null
}

/** What to say when a round or station starts by itself. */
export function startWord(planned: Pick<PlannedExercise, 'circuit' | 'sets'>, setNo: number, exerciseName: string): string {
  if (planned.circuit) return exerciseName
  return planned.sets > 1 && setNo === planned.sets ? 'Last round' : 'Go'
}

/** What to say when a work bout ends and a rest follows: interval rests are easy bouts, circuit rests are breaks. */
export function restWord(planned: Pick<PlannedExercise, 'circuit' | 'restExerciseId'>, nextName: string | null): string {
  if (planned.restExerciseId) return 'Easy'
  return nextName ? `Next, ${nextName}` : 'Rest'
}
