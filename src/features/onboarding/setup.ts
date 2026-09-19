// Setup gate. The intake can be skipped from the welcome screen: the app opens and everything
// that only reads or browses works, but the actions that need a real profile — starting a
// workout or a mobility routine, taking any photo — stay locked until the intake is committed.
// `profile.onboarded` is still the single source of truth; the skip flag only records that the
// user asked to look around first, so App does not bounce them back to /onboarding.
import { deleteSetting, getProfile, getSetting, setSetting } from '../../db/repositories'
import { nowIso } from '../../lib/util'

/** ISO timestamp of the tap on "Skip for now". Cleared by `commitIntake`. */
export const ONBOARDING_SKIP_KEY = 'onboarding.skippedAt'

/** Everything that stays locked until the intake is finished. */
export type GatedAction = 'workout' | 'mobility' | 'meal_photo' | 'progress_photo' | 'report'

export interface GateCopy {
  /** Sheet / screen headline. */
  title: string
  /** One sentence in the coach's voice: why this needs the intake. */
  body: string
}

export const GATE_COPY: Record<GatedAction, GateCopy> = {
  workout: {
    title: 'Finish setup before you train',
    body: 'A session is built from your injuries, equipment and experience. Without those I would be guessing at the moves and the weight.',
  },
  mobility: {
    title: 'Finish setup before you stretch',
    body: 'Mobility routines work around the areas you tell me hurt. Two minutes of setup and they are yours.',
  },
  meal_photo: {
    title: 'Finish setup to log a photo',
    body: 'A meal photo becomes calories and protein against your targets — and you have no targets yet.',
  },
  progress_photo: {
    title: 'Finish setup to add a photo',
    body: 'Progress photos sit beside your weight and waist trend. Set that starting point first and the comparison means something.',
  },
  report: {
    title: 'Finish setup to add a report',
    body: 'Reports are read against your profile, and only leave this phone if you allow it during setup.',
  },
}

/** The intake has been committed at least once. */
export function isOnboarded(): boolean {
  return getProfile()?.onboarded === true
}

/** The user tapped "Skip for now" and is looking around with an unfinished profile. */
export function onboardingSkipped(): boolean {
  return typeof getSetting<unknown>(ONBOARDING_SKIP_KEY, null) === 'string'
}

export function skipOnboarding(): void {
  setSetting(ONBOARDING_SKIP_KEY, nowIso())
}

export function clearOnboardingSkip(): void {
  deleteSetting(ONBOARDING_SKIP_KEY)
}

/** Whether a gated action can run right now. Every gated action needs the same thing: a finished intake. */
export function canDo(_action: GatedAction): boolean {
  return isOnboarded()
}

/** Copy for a locked action. */
export function gateCopy(action: GatedAction): GateCopy {
  return GATE_COPY[action]
}
