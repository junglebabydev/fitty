// Single-user build: the owner's profile, loaded from the git-ignored ./owner.local.ts (the repo is public).
// import.meta.glob turns a missing file into an empty match, so a fresh clone still builds and boots into
// onboarding. Copy ./owner.example.ts to ./owner.local.ts to use it. Applied at boot by
// features/settings/ownerBootstrap.ts.
// Dev builds only (npm run dev, vitest): a production build never contains the file, even one made on this Mac,
// so the profile cannot end up in a deployed bundle. The hosted site gets it from the Worker's OWNER_PROFILE
// secret instead (`npm run owner:secret`), loaded on a fresh phone with the PIN (docs/DEPLOY.md §2).
import type { Region, UserProfile } from '../domain/types'
import type { Activity } from '../engine'
import type { DietPattern } from '../features/settings/keys'

export interface OwnerSetup {
  name: string
  /** 'YYYY-MM-DD' */
  dob: string
  sex: UserProfile['sex']
  units: UserProfile['units']
  heightCm: number
  weightKg: number
  /** Current waist, written as a body metric (the wizard's body-check step). */
  waistCm: number | null
  targetWeightKg: number | null
  targetWaistCm: number | null
  horizonMonths: number
  activity: Activity
  daysMin: number
  daysTarget: number
  daysStretch: number
  experience: UserProfile['experience']
  coachStyle: UserProfile['coachStyle']
  preferences: string[]
  equipment: string[]
  mobility: string[]
  conditions: { region: Region; label: string; baselineNotes?: string }[]
  diet: DietPattern
}

const found: Record<string, { OWNER: OwnerSetup }> = import.meta.env.DEV
  ? import.meta.glob<{ OWNER: OwnerSetup }>('./owner.local.ts', { eager: true })
  : {}

export const OWNER: OwnerSetup | null = Object.values(found)[0]?.OWNER ?? null

export function hasOwner(): boolean {
  return OWNER !== null
}
