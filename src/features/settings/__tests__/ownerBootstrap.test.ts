// Single-user boot through the real sql.js engine (node loader), like seedBoot.test.ts. Uses the fictional
// owner.example.ts explicitly so the result never depends on whether a real owner.local.ts is on disk.
// No IndexedDB in node, so persist() takes its failure path (console.error is silenced).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db/database'
import {
  getConditionFlags,
  getGoals,
  getNutritionTarget,
  getProfile,
  getSessions,
  getSetting,
  latestBodyMetric,
  saveProfile,
  tableCounts,
} from '../../../db/repositories'
import { SEED_PROFILE, seedIfEmpty } from '../../../db/seed'
import { OWNER as EXAMPLE } from '../../../config/owner.example'
import { addDays, startOfWeek } from '../../../lib/util'
import { applyOwnerProfile } from '../ownerBootstrap'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const TODAY = '2026-09-24'

beforeAll(async () => {
  await db.init()
})

beforeEach(() => {
  db.transaction(() => {
    for (const t of Object.keys(tableCounts())) db.run(`DELETE FROM "${t}"`)
  })
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('applyOwnerProfile', () => {
  it('does nothing without an owner file', () => {
    expect(applyOwnerProfile(null, TODAY)).toBe(false)
    expect(getProfile()).toBeNull()
  })

  it('does nothing when a profile already exists', () => {
    saveProfile({ ...SEED_PROFILE, name: 'Existing' })
    expect(applyOwnerProfile(EXAMPLE, TODAY)).toBe(false)
    expect(getProfile()?.name).toBe('Existing')
  })

  it('writes a completed onboarding from the owner file', () => {
    expect(applyOwnerProfile(EXAMPLE, TODAY)).toBe(true)
    const p = getProfile()
    expect(p).toMatchObject({ name: EXAMPLE.name, dob: EXAMPLE.dob, heightCm: EXAMPLE.heightCm, onboarded: true })
    expect(p?.equipment).toEqual(EXAMPLE.equipment)
    expect(latestBodyMetric('weight')?.value).toBe(EXAMPLE.weightKg)
    expect(latestBodyMetric('waist')?.value).toBe(EXAMPLE.waistCm)
    expect(getGoals().find((g) => g.type === 'weight')?.targetValue).toBe(EXAMPLE.targetWeightKg)
    expect(getGoals().some((g) => g.type === 'waist')).toBe(false)
    expect(getNutritionTarget(TODAY)).not.toBeNull()
    expect(getConditionFlags().map((f) => [f.region, f.label])).toEqual(EXAMPLE.conditions.map((c) => [c.region, c.label]))
    const start = startOfWeek(TODAY)
    expect(getSessions(start, addDays(start, 6)).length).toBeGreaterThan(0)
    expect(getSetting('seed.skipDemo', false)).toBe(true)
  })

  it('run before seedIfEmpty keeps the demo persona out, even in a dev build', async () => {
    applyOwnerProfile(EXAMPLE, TODAY)
    await seedIfEmpty({ dev: true, search: '?demo=1' })
    expect(getProfile()?.name).toBe(EXAMPLE.name)
    expect(tableCounts().sleep_records ?? 0).toBe(0)
    expect(getSetting('ai.provider', '')).toBe('mock')
  })
})
