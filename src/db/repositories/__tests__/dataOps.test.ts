// deleteAllData through the real sql.js engine (node loader), like database.test.ts. Node has no
// IndexedDB or web storage, so both get minimal stubs: deleteDatabase succeeds, open fails (init()
// then starts from an empty database and persist() takes its failure path), storage only needs clear().
// The "reload" after deleteAllData is the in-memory continuation: boot's db.init() is a no-op on an
// open database, so seedIfEmpty() sees exactly the fresh database deleteAllData left behind.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../database'
import { deleteAllData, exerciseCount, exportSqlite, getProfile, getSetting, setSetting, tableCounts } from '..'
import { defaultSettings, seedIfEmpty } from '../../seed'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const localClear = vi.fn()
const sessionClear = vi.fn()

beforeAll(async () => {
  vi.stubGlobal('indexedDB', {
    deleteDatabase: () => {
      const req: { onsuccess?: () => void } = {}
      queueMicrotask(() => req.onsuccess?.())
      return req
    },
    open: () => { throw new Error('no IndexedDB under node') },
  })
  vi.stubGlobal('localStorage', { clear: localClear })
  vi.stubGlobal('sessionStorage', { clear: sessionClear })
  await db.init()
})

afterAll(() => {
  vi.unstubAllGlobals()
  errorSpy.mockRestore()
})

// A backup gets shared, synced and attached to bug reports; no credential may ride along in it.
describe('exportSqlite', () => {
  it('leaves the AI keys and the bridge PIN out of the file, keeps the rest, and does not touch the live database', () => {
    const secrets = { 'ai.apiKey': 'fake-anthropic-key-0001', 'ai.geminiKey': 'fake-gemini-key-0002', 'ai.bridgePin': 'fake-pin-0003' }
    for (const [key, value] of Object.entries(secrets)) setSetting(key, value)
    setSetting('ai.geminiModel', 'fake-model-0004')
    const file = new TextDecoder('latin1').decode(exportSqlite())
    expect(file.startsWith('SQLite format 3')).toBe(true)
    for (const value of Object.values(secrets)) expect(file).not.toContain(value)
    expect(file).toContain('fake-model-0004')
    for (const [key, value] of Object.entries(secrets)) expect(getSetting(key, '')).toBe(value)
  })
})

describe('deleteAllData', () => {
  it('is sticky: the next boot lands on setup with an empty database, not the demo', async () => {
    await seedIfEmpty()
    expect(getProfile()).not.toBeNull()

    await deleteAllData()
    expect(localClear).toHaveBeenCalled()
    expect(sessionClear).toHaveBeenCalled()
    expect(db.ready).toBe(true)

    await seedIfEmpty() // what runBoot() does on the reload
    expect(getProfile()).toBeNull()
    expect(getSetting('seed.skipDemo', false)).toBe(true)
    expect(exerciseCount()).toBeGreaterThan(0) // library only, so setup can still plan a week
    const counts = tableCounts()
    expect(counts.settings).toBe(1 + Object.keys(defaultSettings()).length) // the marker + the default settings every database gets
    for (const [table, n] of Object.entries(counts)) {
      if (table !== 'exercises' && table !== 'settings') expect(n, table).toBe(0)
    }
  })

  it('a plain wipe (boot-error reset) still seeds the demo on the next boot', async () => {
    await db.wipe()
    await db.init()
    await seedIfEmpty()
    expect(getProfile()).not.toBeNull()
    expect(getSetting('seed.skipDemo', false)).toBe(false)
  })
})
