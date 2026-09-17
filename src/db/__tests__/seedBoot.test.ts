// Boot seeding through the real sql.js engine (node loader), like database.test.ts: what a production
// build, a `?demo=1` visitor and a dev build each find in the database after seedIfEmpty().
// No IndexedDB in node, so persist() takes its failure path (console.error is silenced).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../database'
import { exerciseCount, getProfile, getSetting, saveProfile, setSetting, tableCounts } from '../repositories'
import { MIND_DEMO_SETTING, SEED_PROFILE, defaultSettings, reseed, seedIfEmpty } from '../seed'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

const PROD = { dev: false, search: '' }
const PROD_DEMO = { dev: false, search: '?demo=1' }
const DEV = { dev: true, search: '' }

/** Every user table emptied: the state of a brand-new database after migrations. */
function clearAll(): void {
  db.transaction(() => {
    for (const t of Object.keys(tableCounts())) db.run(`DELETE FROM "${t}"`)
  })
}

/** Tables holding rows, minus the reference data every database has. */
function userDataTables(): string[] {
  return Object.entries(tableCounts())
    .filter(([table, n]) => n > 0 && table !== 'exercises' && table !== 'settings')
    .map(([table]) => table)
}

beforeAll(async () => {
  await db.init()
})

beforeEach(() => {
  clearAll()
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('seedIfEmpty in a production build', () => {
  it('seeds reference data only: no profile, so the app lands on onboarding', async () => {
    await seedIfEmpty(PROD)
    expect(getProfile()).toBeNull()
    expect(exerciseCount()).toBeGreaterThan(0)
    for (const [key, value] of Object.entries(defaultSettings())) expect(getSetting<unknown>(key, undefined), key).toEqual(value)
    expect(tableCounts().settings).toBe(Object.keys(defaultSettings()).length)
    expect(userDataTables()).toEqual([])
  })

  it('is idempotent and keeps a setting the user changed', async () => {
    await seedIfEmpty(PROD)
    setSetting('privacy.keepMealPhotos', false)
    const before = tableCounts()
    await seedIfEmpty(PROD)
    await seedIfEmpty(PROD)
    expect(tableCounts()).toEqual(before)
    expect(getSetting('privacy.keepMealPhotos', true)).toBe(false)
  })

  it('?demo=1 seeds the fictional demo persona, once', async () => {
    await seedIfEmpty(PROD) // an earlier visit without the flag
    await seedIfEmpty(PROD_DEMO)
    expect(getProfile()).toMatchObject({ name: SEED_PROFILE.name, dob: SEED_PROFILE.dob, onboarded: true })
    const counts = tableCounts()
    expect(counts.mood_logs).toBe(8)
    expect(counts.sleep_records).toBe(7)
    await seedIfEmpty(PROD_DEMO)
    await seedIfEmpty(PROD)
    expect(tableCounts()).toEqual(counts)
  })

  it('never writes demo rows into a real user database, with or without the flag', async () => {
    await seedIfEmpty(PROD)
    saveProfile({ ...SEED_PROFILE, name: 'Real User' })
    for (const env of [PROD, PROD_DEMO, DEV]) await seedIfEmpty(env)
    expect(getProfile()?.name).toBe('Real User')
    expect(userDataTables()).toEqual(['user_profile'])
    expect(getSetting(MIND_DEMO_SETTING, false)).toBe(false) // the mind top-up did not touch it either
  })

  it('"Delete all data" marker wins over ?demo=1 and a dev build', async () => {
    setSetting('seed.skipDemo', true)
    for (const env of [PROD_DEMO, DEV]) await seedIfEmpty(env)
    expect(getProfile()).toBeNull()
    expect(exerciseCount()).toBeGreaterThan(0)
    expect(userDataTables()).toEqual([])
  })

  it('reseed() (Settings → Reseed demo data) works without the dev flag or the URL flag', async () => {
    await seedIfEmpty(PROD)
    setSetting('seed.skipDemo', true)
    await reseed()
    expect(getProfile()?.name).toBe(SEED_PROFILE.name)
    expect(getSetting('seed.skipDemo', false)).toBe(false)
    expect(tableCounts().workout_sessions).toBeGreaterThan(0)
  })
})

describe('seedIfEmpty in a dev build', () => {
  it('seeds the demo scenario into an empty database', async () => {
    await seedIfEmpty(DEV)
    expect(getProfile()?.name).toBe(SEED_PROFILE.name)
    expect(getSetting('ai.provider', '')).toBe('mock')
  })

  it('called with no arguments uses import.meta.env.DEV (true under vitest)', async () => {
    await seedIfEmpty()
    expect(getProfile()).not.toBeNull()
  })
})
