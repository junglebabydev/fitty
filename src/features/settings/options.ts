// Static option lists for the onboarding wizard and Settings.
import type { Region, UserProfile } from '../../domain/types'
import type { Activity } from '../../engine'

export interface Option<T extends string = string> {
  value: T
  label: string
  hint?: string
}

export const SEX_OPTIONS: Option<UserProfile['sex']>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

export const EXPERIENCE_OPTIONS: Option<UserProfile['experience']>[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const COACH_STYLE_OPTIONS: Option<UserProfile['coachStyle']>[] = [
  { value: 'demanding', label: 'Demanding', hint: 'Direct about missed sessions and unlogged meals. Still conservative around pain.' },
  { value: 'balanced', label: 'Balanced', hint: 'Plain-spoken, fewer nudges. Same safety rules.' },
  { value: 'gentle', label: 'Gentle', hint: 'Softer tone, priorities only. Same safety rules.' },
]

export const ACTIVITY_OPTIONS: Option<Activity>[] = [
  { value: 'low', label: 'Mostly seated', hint: 'Desk work, little walking' },
  { value: 'moderate', label: 'Moderate', hint: 'Some walking, 3–4 sessions' },
  { value: 'high', label: 'Active', hint: 'On your feet, 5+ sessions' },
]

export const PREFERENCE_OPTIONS: Option[] = [
  { value: 'weights', label: 'Weights' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'running', label: 'Running' },
  { value: 'swimming', label: 'Swimming' },
]

export const EQUIPMENT_OPTIONS: Option[] = [
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'machines', label: 'Machines' },
  { value: 'bench', label: 'Bench' },
  { value: 'cables', label: 'Cables' },
  { value: 'lat_pulldown', label: 'Lat pulldown' },
  { value: 'pool', label: 'Pool' },
  { value: 'stationary_bike', label: 'Stationary bike' },
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'rower', label: 'Rowing machine' },
]

export const MOBILITY_OPTIONS: Option[] = [
  { value: 'hips', label: 'Hips' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'back', label: 'Back' },
  { value: 'neck', label: 'Neck' },
  { value: 'general', label: 'General' },
]

export const REGION_OPTIONS: Option<Region>[] = [
  { value: 'knee_left', label: 'Left knee' },
  { value: 'knee_right', label: 'Right knee' },
  { value: 'back_lower', label: 'Lower back' },
  { value: 'back_mid', label: 'Mid back' },
  { value: 'back_upper', label: 'Upper back' },
  { value: 'neck', label: 'Neck' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'hip', label: 'Hip' },
  { value: 'other', label: 'Other' },
]

export const REGION_LABEL: Record<Region, string> = Object.fromEntries(REGION_OPTIONS.map((o) => [o.value, o.label])) as Record<Region, string>

/** Quick labels offered per region; the user can always type their own. */
export const CONDITION_SUGGESTIONS: Record<Region, string[]> = {
  knee_left: ['Meniscus tear', 'Patellar pain', 'Ligament history'],
  knee_right: ['Meniscus tear', 'Patellar pain', 'Ligament history'],
  back_lower: ['Disc issue', 'Recurring strain', 'Stiffness'],
  back_mid: ['Stiffness', 'Recurring strain'],
  back_upper: ['Stiffness', 'Recurring strain'],
  neck: ['Neck issues', 'Nerve irritation history', 'Stiffness'],
  shoulder: ['Impingement', 'Instability', 'Rotator cuff history'],
  hip: ['Impingement', 'Tightness', 'Labral history'],
  other: ['Other condition'],
}

/** Normalises a stored value ("Lat pulldown", "lat-pulldown") to an option value ("lat_pulldown"). */
export function normaliseOption(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Splits stored values into known option values + any extras the options list does not cover. */
export function splitKnown(values: string[], options: Option[]): { known: string[]; extras: string[] } {
  const byNorm = new Map(options.map((o) => [normaliseOption(o.value), o.value]))
  for (const o of options) byNorm.set(normaliseOption(o.label), o.value)
  const known: string[] = []
  const extras: string[] = []
  for (const v of values) {
    const hit = byNorm.get(normaliseOption(v))
    if (hit) {
      if (!known.includes(hit)) known.push(hit)
    } else if (!extras.includes(v)) extras.push(v)
  }
  return { known, extras }
}

export function labelFor(value: string, options: Option[]): string {
  return options.find((o) => o.value === value)?.label ?? value
}
