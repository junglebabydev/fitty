// Start goes straight into the workout, with no questions first (owner, 2026-10-14: the safety questions and "anything
// hurting?" before every start were friction). The symptom gate still runs on what is already known: profile flags
// pick the path, and pain reported earlier today still swaps moves. The Pain button stays in the workout. Its own module
// because the gate reads the coach's facts, which read session.ts.
import { getSession } from '../../db/repositories'
import { startSessionWithGate } from '../workout/gate'
import { libraryExercises } from '../workout/helpers'
import { ensureTodayRow } from './session'

/** Starts a planned row without asking anything; a row already started or done is left as it is. Returns its id. */
export function startNow(id: number): number {
  const row = getSession(id)
  if (row?.status === 'planned') startSessionWithGate(row, [], libraryExercises(), null)
  return id
}

/** Today's row for one of the week's sessions, started. */
export function startToday(key: string, today: string): number {
  return startNow(ensureTodayRow(key, today))
}
