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
import { applyOwnerProfile, parseOwnerSetup, unlockOwnerProfile } from '../ownerBootstrap'

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
  vi.unstubAllGlobals()
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

describe('parseOwnerSetup', () => {
  it('accepts the example after a JSON round trip and drops unknown keys', () => {
    const r = parseOwnerSetup({ ...JSON.parse(JSON.stringify(EXAMPLE)), extra: 'x' })
    const conditions = EXAMPLE.conditions.map((c) => ({ ...c, baselineNotes: '' }))
    expect(r).toEqual({ ok: true, owner: { ...EXAMPLE, conditions } })
  })

  it('names the first bad field', () => {
    expect(parseOwnerSetup(null)).toMatchObject({ ok: false })
    expect(parseOwnerSetup({ ...EXAMPLE, sex: 'x' })).toEqual({ ok: false, problem: '"sex" is missing or invalid' })
    expect(parseOwnerSetup({ ...EXAMPLE, conditions: [{ region: 'elbow', label: 'Elbow' }] })).toEqual({ ok: false, problem: '"conditions" is missing or invalid' })
  })

  it('runs the wizard step checks on the values', () => {
    expect(parseOwnerSetup({ ...EXAMPLE, heightCm: 20 })).toEqual({ ok: false, problem: 'Height should be between 100 and 250 cm.' })
    expect(parseOwnerSetup({ ...EXAMPLE, daysMin: 5, daysTarget: 4 })).toEqual({ ok: false, problem: 'Minimum ≤ target ≤ stretch.' })
  })
})

describe('unlockOwnerProfile', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('fetches with the PIN, applies the profile and saves the PIN', async () => {
    const fetchMock = reply(200, { ok: true, owner: EXAMPLE })
    vi.stubGlobal('fetch', fetchMock)
    expect(await unlockOwnerProfile('  a-long-enough-pin ')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/owner', expect.objectContaining({ headers: { 'x-coach-pin': 'a-long-enough-pin' } }))
    expect(getProfile()).toMatchObject({ name: EXAMPLE.name, onboarded: true })
    expect(getSetting('ai.bridgePin', '')).toBe('a-long-enough-pin')
  })

  it('reports a refused PIN, a missing profile, a bad profile and a network failure without writing anything', async () => {
    vi.stubGlobal('fetch', reply(403, { ok: false, kind: 'forbidden', message: 'PIN required.' }))
    expect(await unlockOwnerProfile('wrong-pin-123')).toBe('That PIN was not accepted.')
    vi.stubGlobal('fetch', reply(404, { ok: false, kind: 'failed', message: 'No owner profile is set on this server.' }))
    expect(await unlockOwnerProfile('a-long-enough-pin')).toBe('No owner profile is set on this server.')
    vi.stubGlobal('fetch', reply(200, { ok: true, owner: { ...EXAMPLE, dob: '' } }))
    expect(await unlockOwnerProfile('a-long-enough-pin')).toBe('The profile on the server is not usable: Enter your date of birth.')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await unlockOwnerProfile('a-long-enough-pin')).toMatch(/Couldn't reach the server/)
    expect(await unlockOwnerProfile('   ')).toBe('Enter the PIN.')
    expect(getProfile()).toBeNull()
    expect(getSetting('ai.bridgePin', '')).toBe('')
  })
})
