// Single-user boot: turns the owner file (config/owner.ts) into a completed onboarding on a fresh database.
// Runs after db.init() and BEFORE seedIfEmpty(), so shouldSeedDemo() sees a profile and never writes the demo
// persona. Everything goes through commitOnboarding(), the wizard's own validated write path.
// On the hosted site there is no owner file: the profile comes from the Worker's OWNER_PROFILE secret instead,
// fetched with the PIN (unlockOwnerProfile, from the OwnerUnlock screen).
import { OWNER, type OwnerSetup } from '../../config/owner'
import { db } from '../../db/database'
import { addBodyMetric, getProfile, setSetting } from '../../db/repositories'
import { nowIso } from '../../lib/util'
import { STEP, commitOnboarding, initialWizardState, newConditionDraft, validateStep, type WizardState } from './onboarding'
import { ACTIVITY_OPTIONS, COACH_STYLE_OPTIONS, EXPERIENCE_OPTIONS, REGION_OPTIONS, SEX_OPTIONS } from './options'

export function ownerWizardState(owner: OwnerSetup, today?: string): WizardState {
  const { waistCm: _waist, conditions, ...fields } = owner
  return {
    ...initialWizardState(today),
    ...fields,
    conditions: conditions.map((c) => ({ ...newConditionDraft(c.region, c.label), baselineNotes: c.baselineNotes ?? '' })),
    accepted: true,
  }
}

/** Writes the owner's profile when an owner file exists and no profile does. Returns true when it wrote. */
export function applyOwnerProfile(owner: OwnerSetup | null = OWNER, today?: string): boolean {
  if (!owner || getProfile() != null) return false
  commitOnboarding(ownerWizardState(owner, today), today)
  // Keep the demo persona and the demo Mind top-up off a real profile, even after "Delete all data".
  setSetting('seed.skipDemo', true)
  if (owner.waistCm != null) {
    addBodyMetric({ ts: nowIso(), type: 'waist', value: owner.waistCm, unit: 'cm', source: 'manual' })
  }
  return true
}

// --- hosted: the profile from the Worker ---------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const oneOf = <T extends string>(v: unknown, options: { value: T }[]): v is T => options.some((o) => o.value === v)

/**
 * Checks untrusted JSON (the OWNER_PROFILE secret) against OwnerSetup, then runs the wizard's own step checks on
 * the result. Returns the clean profile (unknown keys dropped) or the first problem, naming the field.
 */
export function parseOwnerSetup(raw: unknown): { ok: true; owner: OwnerSetup } | { ok: false; problem: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problem: 'the profile is not a JSON object' }
  const r = raw as Record<string, unknown>
  const bad = (field: string) => ({ ok: false as const, problem: `"${field}" is missing or invalid` })
  const numOrNull = (v: unknown) => v == null || isNum(v)

  if (typeof r.name !== 'string') return bad('name')
  if (typeof r.dob !== 'string') return bad('dob')
  if (!oneOf(r.sex, SEX_OPTIONS)) return bad('sex')
  if (r.units !== 'metric' && r.units !== 'imperial') return bad('units')
  if (!isNum(r.heightCm)) return bad('heightCm')
  if (!isNum(r.weightKg)) return bad('weightKg')
  if (!numOrNull(r.waistCm)) return bad('waistCm')
  if (!numOrNull(r.targetWeightKg)) return bad('targetWeightKg')
  if (!numOrNull(r.targetWaistCm)) return bad('targetWaistCm')
  if (!isNum(r.horizonMonths) || r.horizonMonths < 1 || r.horizonMonths > 12) return bad('horizonMonths')
  if (!oneOf(r.activity, ACTIVITY_OPTIONS)) return bad('activity')
  for (const k of ['daysMin', 'daysTarget', 'daysStretch']) if (!isNum(r[k]) || (r[k] as number) < 1 || (r[k] as number) > 7) return bad(k)
  if (!oneOf(r.experience, EXPERIENCE_OPTIONS)) return bad('experience')
  if (!oneOf(r.coachStyle, COACH_STYLE_OPTIONS)) return bad('coachStyle')
  for (const k of ['preferences', 'equipment', 'mobility']) if (!isStrList(r[k])) return bad(k)
  if (!Array.isArray(r.conditions)) return bad('conditions')
  const conditions: OwnerSetup['conditions'] = []
  for (const c of r.conditions as unknown[]) {
    const x = (c ?? {}) as Record<string, unknown>
    if (!oneOf(x.region, REGION_OPTIONS) || typeof x.label !== 'string') return bad('conditions')
    conditions.push({ region: x.region, label: x.label, baselineNotes: typeof x.baselineNotes === 'string' ? x.baselineNotes : '' })
  }
  const d = (r.diet ?? null) as Record<string, unknown> | null
  if (!d || typeof d !== 'object' || ![1, 2, 3].includes(d.mealsPerDay as number)) return bad('diet')

  const owner: OwnerSetup = {
    name: r.name, dob: r.dob, sex: r.sex, units: r.units, heightCm: r.heightCm, weightKg: r.weightKg,
    waistCm: (r.waistCm as number | null | undefined) ?? null,
    targetWeightKg: (r.targetWeightKg as number | null | undefined) ?? null,
    targetWaistCm: (r.targetWaistCm as number | null | undefined) ?? null,
    horizonMonths: r.horizonMonths, activity: r.activity,
    daysMin: r.daysMin as number, daysTarget: r.daysTarget as number, daysStretch: r.daysStretch as number,
    experience: r.experience, coachStyle: r.coachStyle,
    preferences: r.preferences as string[], equipment: r.equipment as string[], mobility: r.mobility as string[],
    conditions,
    diet: {
      mealsPerDay: d.mealsPerDay as 1 | 2 | 3,
      skipsBreakfast: d.skipsBreakfast === true,
      coffee: d.coffee === true,
      supplements: d.supplements === true,
      notes: typeof d.notes === 'string' ? d.notes : '',
    },
  }
  if (owner.waistCm != null && (owner.waistCm < 40 || owner.waistCm > 200)) return bad('waistCm')
  const state = ownerWizardState(owner)
  for (const step of [STEP.profile, STEP.goal, STEP.training, STEP.mobility]) {
    const problem = validateStep(step, state)
    if (problem) return { ok: false, problem }
  }
  return { ok: true, owner }
}

/**
 * Fetches the owner profile from the Worker with the PIN and applies it. The PIN is saved first, so the AI settings
 * that commitOnboarding() re-applies pick it up and hosted AI works straight away. Returns null on success, otherwise one sentence for the UI.
 */
export async function unlockOwnerProfile(pin: string): Promise<string | null> {
  const trimmed = pin.trim()
  if (!trimmed) return 'Enter the PIN.'
  let status: number
  let body: { ok?: boolean; owner?: unknown; message?: string }
  try {
    const res = await fetch('/api/ai/owner', { headers: { 'x-coach-pin': trimmed }, cache: 'no-store' })
    status = res.status
    body = await res.json()
  } catch {
    return "Couldn't reach the server. Check the connection and try again."
  }
  if (status === 403) return 'That PIN was not accepted.'
  if (!body.ok) return typeof body.message === 'string' ? body.message : 'The server could not return the profile.'
  const parsed = parseOwnerSetup(body.owner)
  if (!parsed.ok) return `The profile on the server is not usable: ${parsed.problem.replace(/\.$/, '')}.`
  setSetting('ai.bridgePin', trimmed)
  applyOwnerProfile(parsed.owner)
  await db.persist()
  return null
}
