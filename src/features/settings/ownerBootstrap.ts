// Single-user boot: turns the owner file (config/owner.ts) into a completed onboarding on a fresh database.
// Runs after db.init() and BEFORE seedIfEmpty(), so shouldSeedDemo() sees a profile and never writes the demo
// persona. Everything goes through commitOnboarding(), the wizard's own validated write path.
import { OWNER, type OwnerSetup } from '../../config/owner'
import { addBodyMetric, getProfile, setSetting } from '../../db/repositories'
import { nowIso } from '../../lib/util'
import { commitOnboarding, initialWizardState, newConditionDraft, type WizardState } from './onboarding'

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
