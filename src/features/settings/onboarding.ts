// Onboarding wizard state: initial values from the existing record (re-run from
// Settings), per-step validation, and a single commit that writes everything.
import type { AIProviderId } from '../../ai'
import { DEFAULT_ANTHROPIC_MODEL } from '../../ai'
import { db } from '../../db/database'
import {
  addBodyMetric,
  addConditionFlag,
  createSession,
  deleteConditionFlag,
  getConditionFlags,
  getGoals,
  getNutritionTarget,
  getProfile,
  getSessions,
  getSetting,
  latestBodyMetric,
  metricForDate,
  saveProfile,
  setNutritionTarget,
  setSetting,
  upsertGoal,
} from '../../db/repositories'
import type { ConditionFlag, Goal, Region, Units, UserProfile } from '../../domain/types'
import { buildWeek, estimateTargets, type Activity, type NutritionGoal, type TargetEstimate, type Tier } from '../../engine'
import { addDays, nowIso, round, startOfWeek, todayStr, uid } from '../../lib/util'
import type { HealthDataType, HealthPermission } from '../../native'
import { applyAISettings } from '../ai/config'
import {
  DEFAULT_MIND_CHECKIN_TIME,
  DEFAULT_VOICE_RETENTION_DAYS,
  KEYS,
  composeDietPattern,
  readAISettings,
  readDietPattern,
  readHealthPermissions,
  readMindCheckinTime,
  readMindGoals,
  type DietPattern,
} from './keys'
import { round1 } from './units'

/** Step indices — one focused question group per step. */
export const STEP = {
  profile: 0,
  goal: 1,
  training: 2,
  equipment: 3,
  mobility: 4,
  diet: 5,
  wellbeing: 6,
  privacy: 7,
  health: 8,
  disclaimer: 9,
} as const

export const STEP_COUNT = 10

export const STEP_TITLES: string[] = [
  'About you',
  'Your goal',
  'Training',
  'Equipment',
  'Mobility & history',
  'How you eat',
  'Wellbeing',
  'Privacy & AI',
  'Apple Health',
  'Before you start',
]

export interface ConditionDraft {
  key: string
  id?: number
  region: Region
  label: string
  baselineNotes: string
}

export interface WizardState {
  // 1 — profile
  name: string
  dob: string
  sex: UserProfile['sex']
  units: Units
  heightCm: number | null
  weightKg: number | null
  // 2 — goal
  targetWeightKg: number | null
  targetWaistCm: number | null
  horizonMonths: number
  activity: Activity
  kcal: number | null
  proteinG: number | null
  /** true once the user has overridden the estimate; estimate then stops following inputs. */
  targetsEdited: boolean
  // 3 — training
  daysMin: number
  daysTarget: number
  daysStretch: number
  experience: UserProfile['experience']
  coachStyle: UserProfile['coachStyle']
  preferences: string[]
  // 4 — equipment
  equipment: string[]
  // 5 — mobility + conditions
  mobility: string[]
  conditions: ConditionDraft[]
  // 6 — diet
  diet: DietPattern
  // 7 — wellbeing
  mindGoals: string[]
  /** 'HH:MM' */
  mindCheckinTime: string
  // 8 — privacy + AI, 9 — Apple Health
  aiProvider: AIProviderId
  apiKey: string
  model: string
  sendMealPhotos: boolean
  keepMealPhotos: boolean
  voiceRetentionDays: number
  healthPermissions: Record<HealthDataType, HealthPermission> | null
  // 10 — disclaimer
  accepted: boolean
  /** Whether a completed profile already existed when the wizard opened. */
  rerun: boolean
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  dob: '',
  sex: 'male',
  heightCm: 175,
  units: 'metric',
  experience: 'intermediate',
  dietPattern: '',
  equipment: ['dumbbells', 'machines', 'bench', 'cables', 'lat_pulldown', 'pool'],
  mobilityPriorities: ['hips', 'hamstrings', 'shoulders', 'back'],
  coachStyle: 'demanding',
  trainingDaysMin: 3,
  trainingDaysTarget: 4,
  trainingDaysStretch: 5,
  onboarded: false,
}

function activeGoal(goals: Goal[], type: Goal['type']): Goal | null {
  return goals.find((g) => g.type === type && g.status === 'active') ?? goals.find((g) => g.type === type) ?? null
}

function monthsUntil(targetDate: string | null, today: string): number {
  if (!targetDate) return 4
  const [y, m] = targetDate.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const months = (y - ty) * 12 + (m - tm)
  return Math.min(12, Math.max(1, months || 1))
}

export function initialWizardState(today: string = todayStr()): WizardState {
  const existing = getProfile()
  const p = existing ?? DEFAULT_PROFILE
  const goals = getGoals()
  const weightGoal = activeGoal(goals, 'weight')
  const waistGoal = activeGoal(goals, 'waist')
  const weight = latestBodyMetric('weight')
  const target = getNutritionTarget(today)
  const ai = readAISettings()
  const flags = getConditionFlags()
  const stored = getSetting<Partial<Record<HealthDataType, HealthPermission>> | null>(KEYS.healthPermissions, null)
  const activity = getSetting<string>(KEYS.activity, 'moderate')

  return {
    name: p.name,
    dob: p.dob,
    sex: p.sex,
    units: p.units,
    heightCm: p.heightCm > 0 ? p.heightCm : null,
    weightKg: weight ? weight.value : null,
    targetWeightKg: weightGoal ? weightGoal.targetValue : null,
    targetWaistCm: waistGoal ? waistGoal.targetValue : null,
    horizonMonths: monthsUntil(weightGoal?.targetDate ?? null, today),
    activity: activity === 'low' || activity === 'high' ? activity : 'moderate',
    kcal: target ? target.kcal : null,
    proteinG: target ? target.proteinG : null,
    targetsEdited: target !== null,
    daysMin: p.trainingDaysMin,
    daysTarget: p.trainingDaysTarget,
    daysStretch: p.trainingDaysStretch,
    experience: p.experience,
    coachStyle: p.coachStyle,
    preferences: getSetting<string[]>(KEYS.trainingPreferences, ['weights', 'hiit', 'swimming']),
    equipment: [...p.equipment],
    mobility: [...p.mobilityPriorities],
    conditions: flags.map(draftFromFlag),
    diet: readDietPattern(p.dietPattern),
    mindGoals: readMindGoals(),
    mindCheckinTime: readMindCheckinTime(),
    aiProvider: ai.provider,
    apiKey: ai.apiKey,
    model: ai.model || DEFAULT_ANTHROPIC_MODEL,
    sendMealPhotos: ai.sendMealPhotos,
    keepMealPhotos: getSetting<boolean>(KEYS.keepMealPhotos, true),
    voiceRetentionDays: getSetting<number>(KEYS.voiceRetentionDays, DEFAULT_VOICE_RETENTION_DAYS),
    healthPermissions: stored ? readHealthPermissions() : null,
    accepted: false,
    rerun: !!existing?.onboarded,
  }
}

export function draftFromFlag(f: ConditionFlag): ConditionDraft {
  return { key: `flag-${f.id}`, id: f.id, region: f.region, label: f.label, baselineNotes: f.baselineNotes }
}

export function newConditionDraft(region: Region, label = ''): ConditionDraft {
  return { key: uid(), region, label, baselineNotes: '' }
}

// --- derived values -----------------------------------------------------------

export function deriveGoal(weightKg: number | null, targetKg: number | null): NutritionGoal {
  if (weightKg == null || targetKg == null) return 'maintain'
  if (targetKg < weightKg - 0.5) return 'cut'
  if (targetKg > weightKg + 0.5) return 'gain'
  return 'maintain'
}

export function estimateFor(s: WizardState, today: string = todayStr()): TargetEstimate | null {
  if (!s.dob || s.heightCm == null || s.weightKg == null || s.heightCm <= 0 || s.weightKg <= 0) return null
  return estimateTargets(
    { sex: s.sex, dob: s.dob, heightCm: s.heightCm, weightKg: s.weightKg, activity: s.activity, goal: deriveGoal(s.weightKg, s.targetWeightKg) },
    today,
  )
}

/** Effective kcal/protein: the user's override when edited, otherwise the live estimate. */
export function effectiveTargets(s: WizardState, est: TargetEstimate | null): { kcal: number | null; proteinG: number | null } {
  if (s.targetsEdited) return { kcal: s.kcal, proteinG: s.proteinG }
  return { kcal: est?.kcal ?? s.kcal, proteinG: est?.proteinG ?? s.proteinG }
}

/** kg per week needed to reach the target over the horizon (negative = loss). */
export function weeklyRateTo(weightKg: number | null, targetKg: number | null, months: number): number | null {
  if (weightKg == null || targetKg == null || months <= 0) return null
  const weeks = months * 4.345
  return round1((targetKg - weightKg) / weeks)
}

export function tierForDays(targetDays: number): Tier {
  if (targetDays <= 3) return 'minimum'
  if (targetDays === 4) return 'target'
  return 'stretch'
}

// --- validation --------------------------------------------------------------

export function validateStep(step: number, s: WizardState, today: string = todayStr()): string | null {
  switch (step) {
    case STEP.profile: {
      if (!s.dob) return 'Enter your date of birth.'
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.dob) || s.dob >= today) return 'Date of birth must be in the past.'
      const [y] = s.dob.split('-').map(Number)
      const [ty] = today.split('-').map(Number)
      if (ty - y < 13) return 'This app is for adults and teens 13+.'
      if (ty - y > 110) return 'Check the year of birth.'
      if (s.heightCm == null || s.heightCm < 100 || s.heightCm > 250) return 'Height should be between 100 and 250 cm.'
      if (s.weightKg == null || s.weightKg < 30 || s.weightKg > 300) return 'Weight should be between 30 and 300 kg.'
      return null
    }
    case STEP.goal: {
      if (s.targetWeightKg != null && (s.targetWeightKg < 30 || s.targetWeightKg > 300)) return 'Target weight should be between 30 and 300 kg.'
      if (s.targetWaistCm != null && (s.targetWaistCm < 40 || s.targetWaistCm > 200)) return 'Target waist should be between 40 and 200 cm.'
      const est = estimateFor(s, today)
      const t = effectiveTargets(s, est)
      if (t.kcal == null || t.kcal < 1000 || t.kcal > 6000) return 'Calories should be between 1,000 and 6,000 kcal.'
      if (t.proteinG == null || t.proteinG < 40 || t.proteinG > 400) return 'Protein should be between 40 and 400 g.'
      return null
    }
    case STEP.training:
      if (s.daysMin > s.daysTarget || s.daysTarget > s.daysStretch) return 'Minimum ≤ target ≤ stretch.'
      return null
    case STEP.mobility:
      for (const c of s.conditions) if (!c.label.trim()) return 'Give each condition a short label (or remove it).'
      return null
    case STEP.privacy:
      if (s.aiProvider === 'anthropic' && !s.apiKey.trim()) return 'Add an API key, or stay on the demo provider for now.'
      return null
    case STEP.disclaimer:
      return s.accepted ? null : 'Please confirm you have read the note above.'
    default:
      return null
  }
}

// --- plan ------------------------------------------------------------------------

/** Creates this week's sessions when the week has none. Returns the number created. */
export function ensureWeekPlanned(today: string, tier: Tier): number {
  const start = startOfWeek(today)
  const existing = getSessions(start, addDays(start, 6))
  if (existing.length) return 0
  const rows = buildWeek(start, tier)
  for (const r of rows) createSession(r)
  return rows.length
}

// --- commit --------------------------------------------------------------------

function sameFlag(d: ConditionDraft, f: ConditionFlag): boolean {
  return d.region === f.region && d.label.trim() === f.label && d.baselineNotes.trim() === f.baselineNotes
}

/**
 * Writes the whole wizard in one transaction: profile, settings, goals, body
 * metric, nutrition target, condition flags. Then plans the week if empty and
 * re-applies AI settings so the provider is live.
 */
export function commitOnboarding(s: WizardState, today: string = todayStr()): void {
  const est = estimateFor(s, today)
  const t = effectiveTargets(s, est)
  const heightCm = round1(s.heightCm ?? DEFAULT_PROFILE.heightCm)
  const weightKg = s.weightKg == null ? null : round1(s.weightKg)

  db.transaction(() => {
    saveProfile({
      name: s.name.trim(),
      dob: s.dob,
      sex: s.sex,
      heightCm,
      units: s.units,
      experience: s.experience,
      dietPattern: composeDietPattern(s.diet),
      equipment: s.equipment,
      mobilityPriorities: s.mobility,
      coachStyle: s.coachStyle,
      trainingDaysMin: s.daysMin,
      trainingDaysTarget: s.daysTarget,
      trainingDaysStretch: s.daysStretch,
      onboarded: true,
    })
    setSetting(KEYS.units, s.units)
    setSetting(KEYS.coachStyle, s.coachStyle)
    setSetting(KEYS.trainingPreferences, s.preferences)
    setSetting(KEYS.dietPattern, s.diet)
    setSetting(KEYS.activity, s.activity)
    setSetting(KEYS.mindGoals, s.mindGoals)
    setSetting(KEYS.mindCheckinTime, /^\d{2}:\d{2}$/.test(s.mindCheckinTime) ? s.mindCheckinTime : DEFAULT_MIND_CHECKIN_TIME)

    // Current weight → body metric, unless today already has this exact value.
    if (weightKg != null) {
      const todays = metricForDate('weight', today)
      if (!todays || Math.abs(todays.value - weightKg) >= 0.05) {
        addBodyMetric({ ts: nowIso(), type: 'weight', value: weightKg, unit: 'kg', source: 'manual' })
      }
    }

    // Goals: keep ids/start dates when re-running.
    const goals = getGoals()
    const targetDate = addDays(today, Math.round(s.horizonMonths * 30.44))
    if (s.targetWeightKg != null) {
      const g = activeGoal(goals, 'weight')
      upsertGoal({
        id: g?.id,
        type: 'weight',
        targetValue: round1(s.targetWeightKg),
        unit: 'kg',
        priority: 1,
        startDate: g?.startDate ?? today,
        targetDate,
        status: 'active',
      })
    }
    if (s.targetWaistCm != null) {
      const g = activeGoal(goals, 'waist')
      upsertGoal({
        id: g?.id,
        type: 'waist',
        targetValue: round1(s.targetWaistCm),
        unit: 'cm',
        priority: 2,
        startDate: g?.startDate ?? today,
        targetDate,
        status: 'active',
      })
    }

    // Nutrition target: only when it changed (setNutritionTarget closes the previous one).
    if (t.kcal != null && t.proteinG != null) {
      const current = getNutritionTarget(today)
      if (!current || current.kcal !== t.kcal || current.proteinG !== t.proteinG) {
        const fatG = est?.fatG ?? round((weightKg ?? 80) * 0.8, 5)
        const carbsG = Math.max(0, round((t.kcal - t.proteinG * 4 - fatG * 9) / 4, 5))
        const edited = est ? est.kcal !== t.kcal || est.proteinG !== t.proteinG : true
        const rationale = est
          ? `${est.rationale}${edited ? ` Edited during onboarding to ${t.kcal.toLocaleString('en-SG')} kcal / ${t.proteinG} g protein.` : ''}`
          : 'Entered manually during onboarding.'
        setNutritionTarget({ startDate: today, endDate: null, kcal: t.kcal, proteinG: t.proteinG, carbsG, fatG, rationale })
      }
    }

    // Condition flags: delete removed / changed, add new / changed.
    const existing = getConditionFlags()
    const keep = new Set<number>()
    for (const d of s.conditions) {
      const match = d.id != null ? existing.find((f) => f.id === d.id) : undefined
      if (match && sameFlag(d, match)) {
        keep.add(match.id)
        continue
      }
      if (match) deleteConditionFlag(match.id)
      const id = addConditionFlag({ region: d.region, label: d.label.trim(), baselineNotes: d.baselineNotes.trim() })
      keep.add(id)
    }
    for (const f of existing) if (!keep.has(f.id)) deleteConditionFlag(f.id)

    // Privacy + AI + Health.
    setSetting(KEYS.aiProvider, s.aiProvider)
    setSetting(KEYS.aiApiKey, s.apiKey.trim())
    setSetting(KEYS.aiModel, s.model.trim() || DEFAULT_ANTHROPIC_MODEL)
    setSetting(KEYS.aiSendMealPhotos, s.sendMealPhotos)
    setSetting(KEYS.keepMealPhotos, s.keepMealPhotos)
    setSetting(KEYS.voiceRetentionDays, s.voiceRetentionDays)
    if (s.healthPermissions) setSetting(KEYS.healthPermissions, s.healthPermissions)

    ensureWeekPlanned(today, tierForDays(s.daysTarget))
  })

  applyAISettings()
}

// --- summaries -------------------------------------------------------------------

export function ageFromDob(dob: string, today: string = todayStr()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let age = ty - y
  if (tm < m || (tm === m && td < d)) age--
  return age
}
