import { db } from '../database'
import { setSetting } from './settings'

/** Every table as pretty-printed JSON (raw rows, snake_case columns). */
export function exportJson(): string {
  return JSON.stringify(db.exportJson(), null, 2)
}

/** Secrets, not health data: API keys for any provider and the hosted-bridge PIN. Left out of every export. */
export const SECRET_SETTING_KEYS: string[] = ['ai.apiKey', 'ai.geminiKey', 'ai.bridgePin']

/** SQLite file bytes of the whole database, minus the SECRET_SETTING_KEYS rows. */
export function exportSqlite(): Uint8Array {
  return db.exportWithoutSettings(SECRET_SETTING_KEYS)
}

/**
 * Wipes the local database (IndexedDB + localStorage) and clears any in-flight drafts in sessionStorage.
 * Boot seeds the demo scenario into any database without a profile, so a fresh database is opened and
 * marked with `seed.skipDemo`; seedIfEmpty() then leaves it empty and the next launch starts at onboarding.
 */
export async function deleteAllData(): Promise<void> {
  await db.wipe()
  await db.init()
  setSetting('seed.skipDemo', true)
  await db.persist()
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
  } catch {
    // storage may be unavailable (private mode); the database is already gone
  }
}

/** Row count per user table, keyed by table name. */
export function tableCounts(): Record<string, number> {
  const tables = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'meta' ORDER BY name`,
  )
  const out: Record<string, number> = {}
  for (const t of tables) {
    out[t.name] = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t.name}"`)?.n ?? 0
  }
  return out
}
