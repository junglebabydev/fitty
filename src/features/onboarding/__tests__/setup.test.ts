import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  profile: null as { onboarded: boolean } | null,
}))

vi.mock('../../../db/repositories', () => ({
  getProfile: () => mem.profile,
  getSetting: <T,>(k: string, d: T): T => (mem.settings.has(k) ? (mem.settings.get(k) as T) : d),
  setSetting: (k: string, v: unknown) => { mem.settings.set(k, v) },
  deleteSetting: (k: string) => { mem.settings.delete(k) },
}))

import {
  GATE_COPY,
  ONBOARDING_SKIP_KEY,
  canDo,
  clearOnboardingSkip,
  gateCopy,
  isOnboarded,
  onboardingSkipped,
  skipOnboarding,
  type GatedAction,
} from '../setup'

const ACTIONS: GatedAction[] = ['workout', 'mobility', 'meal_photo', 'progress_photo', 'report']

beforeEach(() => {
  mem.settings.clear()
  mem.profile = null
})

describe('setup gate', () => {
  it('is not onboarded without a profile, or with an unfinished one', () => {
    expect(isOnboarded()).toBe(false)
    mem.profile = { onboarded: false }
    expect(isOnboarded()).toBe(false)
    mem.profile = { onboarded: true }
    expect(isOnboarded()).toBe(true)
  })

  it('records and clears the skip flag', () => {
    expect(onboardingSkipped()).toBe(false)
    skipOnboarding()
    expect(onboardingSkipped()).toBe(true)
    expect(typeof mem.settings.get(ONBOARDING_SKIP_KEY)).toBe('string')
    clearOnboardingSkip()
    expect(onboardingSkipped()).toBe(false)
  })

  it('ignores a skip flag that is not a timestamp', () => {
    mem.settings.set(ONBOARDING_SKIP_KEY, true)
    expect(onboardingSkipped()).toBe(false)
  })

  it('locks every gated action until the intake is committed — skipping does not unlock anything', () => {
    for (const a of ACTIONS) expect(canDo(a)).toBe(false)
    skipOnboarding()
    for (const a of ACTIONS) expect(canDo(a)).toBe(false)
    mem.profile = { onboarded: true }
    for (const a of ACTIONS) expect(canDo(a)).toBe(true)
  })

  it('has a reason for every gated action', () => {
    for (const a of ACTIONS) {
      expect(gateCopy(a)).toBe(GATE_COPY[a])
      expect(gateCopy(a).title.length).toBeGreaterThan(0)
      expect(gateCopy(a).body.length).toBeGreaterThan(0)
    }
    expect(Object.keys(GATE_COPY).sort()).toEqual([...ACTIONS].sort())
  })
})
