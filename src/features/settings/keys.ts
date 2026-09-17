// Settings keys + typed readers/writers shared by Onboarding, Settings and the
// settings sub-screens. Contract keys are listed in src/db/repositories/settings.ts;
// the `training.*`, `diet.*`, `nutrition.*`, `mind.*`, `health.lastImport` and
// `health.lastFileImport` keys are additive extras owned by this module.
import type { AIProviderId } from '../../ai'
import { DEFAULT_ANTHROPIC_MODEL } from '../../ai'
import { getSetting, setSetting } from '../../db/repositories'
import { emptyPermissions, type HealthDataType, type HealthPermission } from '../../native'

export const KEYS = {
  aiProvider: 'ai.provider',
  aiApiKey: 'ai.apiKey',
  aiModel: 'ai.model',
  aiSendMealPhotos: 'ai.sendMealPhotos',
  keepMealPhotos: 'privacy.keepMealPhotos',
  voiceRetentionDays: 'privacy.voiceRetentionDays',
  healthPermissions: 'health.permissions',
  healthWriteWorkouts: 'health.writeWorkouts',
  healthWriteBodyMass: 'health.writeBodyMass',
  healthLastImport: 'health.lastImport',
  healthLastFileImport: 'health.lastFileImport',
  remindersMorning: 'reminders.morning',
  remindersEvening: 'reminders.evening',
  units: 'units',
  coachStyle: 'coach.style',
  trainingPreferences: 'training.preferences',
  dietPattern: 'diet.pattern',
  activity: 'nutrition.activity',
  mindGoals: 'mind.goals',
  mindCheckinTime: 'mind.checkinTime',
} as const

export const DEFAULT_VOICE_RETENTION_DAYS = 30
export const VOICE_RETENTION_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
]

/** Reminder times are 'HH:MM' strings; null means the reminder is off. */
export const DEFAULT_MORNING_REMINDER = '07:30'
export const DEFAULT_EVENING_REMINDER = '20:00'

// --- Mind --------------------------------------------------------------------
// Onboarding's wellbeing step: what the user wants more of (chips) and when they
// would like the daily mood check-in. Stored as `mind.goals` (string[]) and
// `mind.checkinTime` ('HH:MM').

export const MIND_GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'calmer_evenings', label: 'Calmer evenings' },
  { value: 'better_sleep', label: 'Better sleep' },
  { value: 'less_stress', label: 'Less stress' },
  { value: 'more_energy', label: 'More energy' },
  { value: 'steadier_mood', label: 'Steadier mood' },
  { value: 'sharper_focus', label: 'Sharper focus' },
  { value: 'time_to_reflect', label: 'Time to reflect' },
]

export const MIND_CHECKIN_PRESETS: { value: string; label: string }[] = [
  { value: '08:00', label: 'Morning' },
  { value: '13:00', label: 'Midday' },
  { value: '18:30', label: 'After work' },
  { value: '21:30', label: 'Before bed' },
]

export const DEFAULT_MIND_CHECKIN_TIME = '21:30'

export function readMindGoals(): string[] {
  const v = getSetting<unknown>(KEYS.mindGoals, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function readMindCheckinTime(): string {
  const v = getSetting<unknown>(KEYS.mindCheckinTime, DEFAULT_MIND_CHECKIN_TIME)
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : DEFAULT_MIND_CHECKIN_TIME
}

// --- AI ----------------------------------------------------------------------

export interface AISettings {
  provider: AIProviderId
  apiKey: string
  model: string
  sendMealPhotos: boolean
}

export function readAISettings(): AISettings {
  const provider = getSetting<string>(KEYS.aiProvider, 'mock')
  const model = getSetting<string>(KEYS.aiModel, DEFAULT_ANTHROPIC_MODEL)
  return {
    provider: provider === 'anthropic' ? 'anthropic' : 'mock',
    apiKey: getSetting<string>(KEYS.aiApiKey, '') || '',
    model: model && model.trim() ? model.trim() : DEFAULT_ANTHROPIC_MODEL,
    sendMealPhotos: getSetting<boolean>(KEYS.aiSendMealPhotos, true),
  }
}

/** Writes only the keys present in `patch`. Does not reconfigure the live provider — see features/settings/ai.ts. */
export function writeAISettings(patch: Partial<AISettings>): void {
  if (patch.provider !== undefined) setSetting(KEYS.aiProvider, patch.provider)
  if (patch.apiKey !== undefined) setSetting(KEYS.aiApiKey, patch.apiKey.trim())
  if (patch.model !== undefined) setSetting(KEYS.aiModel, patch.model.trim() || DEFAULT_ANTHROPIC_MODEL)
  if (patch.sendMealPhotos !== undefined) setSetting(KEYS.aiSendMealPhotos, patch.sendMealPhotos)
}

// --- Apple Health ------------------------------------------------------------

export function readHealthPermissions(): Record<HealthDataType, HealthPermission> {
  const stored = getSetting<Partial<Record<HealthDataType, HealthPermission>>>(KEYS.healthPermissions, {})
  const out = emptyPermissions()
  for (const k of Object.keys(out) as HealthDataType[]) {
    const v = stored[k]
    if (v === 'granted' || v === 'denied' || v === 'undetermined') out[k] = v
  }
  return out
}

export function writeHealthPermissions(p: Partial<Record<HealthDataType, HealthPermission>>): void {
  setSetting(KEYS.healthPermissions, { ...readHealthPermissions(), ...p })
}

// --- Diet pattern ------------------------------------------------------------
// UserProfile.dietPattern is a free-text string (seed: "1–2 meals/day, skips breakfast").
// Onboarding edits a structured form, stored under KEYS.dietPattern, and writes the
// composed string to the profile so every other screen keeps reading one string.

export interface DietPattern {
  mealsPerDay: 1 | 2 | 3
  skipsBreakfast: boolean
  coffee: boolean
  supplements: boolean
  notes: string
}

export const DEFAULT_DIET_PATTERN: DietPattern = { mealsPerDay: 2, skipsBreakfast: true, coffee: true, supplements: true, notes: '' }

export function composeDietPattern(d: DietPattern): string {
  const parts: string[] = [d.mealsPerDay === 1 ? '1 meal/day' : d.mealsPerDay === 2 ? '1–2 meals/day' : '3+ meals/day']
  if (d.skipsBreakfast) parts.push('skips breakfast')
  if (d.coffee) parts.push('morning coffee')
  if (d.supplements) parts.push('supplements')
  const notes = d.notes.trim()
  if (notes) parts.push(notes)
  return parts.join(', ')
}

/** Best-effort parse of a free-text pattern (used when no structured setting exists yet). */
export function parseDietPattern(text: string): DietPattern {
  const out: DietPattern = { mealsPerDay: 2, skipsBreakfast: false, coffee: false, supplements: false, notes: '' }
  const leftovers: string[] = []
  for (const raw of text.split(',')) {
    const part = raw.trim()
    if (!part) continue
    const t = part.toLowerCase()
    if (/meals?\s*\/\s*day|meals? a day|meals? per day/.test(t)) {
      if (/^(3|three)/.test(t) || /3\+/.test(t)) out.mealsPerDay = 3
      else if (/^(1|one)\s*meal/.test(t) && !/[–-]\s*2/.test(t)) out.mealsPerDay = 1
      else out.mealsPerDay = 2
    } else if (/breakfast/.test(t) && /skip|no /.test(t)) out.skipsBreakfast = true
    else if (/coffee|kopi/.test(t)) out.coffee = true
    else if (/supplement/.test(t)) out.supplements = true
    else leftovers.push(part)
  }
  out.notes = leftovers.join(', ')
  return out
}

export function readDietPattern(profileText: string): DietPattern {
  const stored = getSetting<Partial<DietPattern> | null>(KEYS.dietPattern, null)
  if (stored && typeof stored === 'object') {
    const meals = stored.mealsPerDay
    return {
      mealsPerDay: meals === 1 || meals === 2 || meals === 3 ? meals : 2,
      skipsBreakfast: !!stored.skipsBreakfast,
      coffee: !!stored.coffee,
      supplements: !!stored.supplements,
      notes: typeof stored.notes === 'string' ? stored.notes : '',
    }
  }
  return profileText.trim() ? parseDietPattern(profileText) : DEFAULT_DIET_PATTERN
}
