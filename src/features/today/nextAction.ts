// The one primary button on Today. Pure and deterministic: same facts → same action.
// Order matters; the first rule that matches wins.

export type NextActionKind =
  | 'continue_workout' | 'start_short' | 'start_workout' | 'morning_check_in'
  | 'mobility' | 'wind_down' | 'log_meal' | 'mood_check_in'

export interface NextActionInput {
  hour: number
  sessionStatus: 'planned' | 'in_progress' | 'completed' | 'skipped' | null
  /** Readiness RED or symptom gate RED: never push a session. */
  blocked: boolean
  /** A shortened version of today's session exists (late-evening 30-minute option). */
  canShorten: boolean
  checkedIn: boolean
  mealsToday: number
  proteinG: number
  /** Protein expected by this hour to be on pace. */
  proteinExpectedG: number
  moodLogged: boolean
}

export interface NextAction { kind: NextActionKind; label: string }

export const EVENING_HOUR = 20
export const WIND_DOWN_HOUR = 21
const PROTEIN_BEHIND_FRACTION = 0.6

const LABEL: Record<NextActionKind, string> = {
  continue_workout: 'Continue workout',
  start_short: 'Start 30-min version',
  start_workout: 'Start workout',
  morning_check_in: 'Check in',
  mobility: 'Easy mobility',
  wind_down: 'Wind down',
  log_meal: 'Log a meal',
  mood_check_in: 'Check in',
}

export function nextAction(i: NextActionInput): NextAction {
  const pick = (kind: NextActionKind): NextAction => ({ kind, label: LABEL[kind] })
  if (i.sessionStatus === 'in_progress') return pick('continue_workout')
  if (i.sessionStatus === 'planned') {
    // A morning check-in sharpens the readiness call before the session starts.
    if (!i.checkedIn && i.hour < 12) return pick('morning_check_in')
    if (i.blocked) return pick(i.checkedIn ? 'mobility' : 'morning_check_in')
    if (i.hour >= EVENING_HOUR && i.canShorten) return pick('start_short')
    return pick('start_workout')
  }
  if (i.hour >= WIND_DOWN_HOUR) return pick('wind_down')
  if (i.mealsToday === 0 || i.proteinG < PROTEIN_BEHIND_FRACTION * i.proteinExpectedG) return pick('log_meal')
  if (!i.checkedIn && i.hour < 12) return pick('morning_check_in')
  if (!i.moodLogged) return pick('mood_check_in')
  return pick('log_meal')
}
