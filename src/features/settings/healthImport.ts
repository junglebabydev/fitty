// Pull sleep / body mass / resting HR from the HealthKit bridge into the local
// database. Rows are deduplicated by timestamp so repeated imports are idempotent.
import { db } from '../../db/database'
import {
  addBodyMetric,
  addHealthMetric,
  addSleepRecord,
  getBodyMetrics,
  getHealthMetrics,
  getSetting,
  getSleepRecords,
  setSetting,
} from '../../db/repositories'
import { dateOf, nowIso, todayStr } from '../../lib/util'
import { getHealthBridge } from '../../native'
import { KEYS, readHealthPermissions } from './keys'

export interface HealthImportResult {
  sleep: number
  weight: number
  restingHr: number
  /** Rows already present locally (same timestamp) that were left untouched. */
  skipped: number
  /** Set when one of the reads failed; the counts reflect what did import. */
  error?: string
}

export const HEALTH_IMPORT_DAYS = 30

export async function importHealthData(days: number = HEALTH_IMPORT_DAYS): Promise<HealthImportResult> {
  const bridge = getHealthBridge()
  const result: HealthImportResult = { sleep: 0, weight: 0, restingHr: 0, skipped: 0 }
  const errors: string[] = []

  const [sleep, mass, rhr] = await Promise.all([
    bridge.readSleep(days).catch((e: unknown) => {
      errors.push(`sleep: ${describe(e)}`)
      return []
    }),
    bridge.readBodyMass(days).catch((e: unknown) => {
      errors.push(`body mass: ${describe(e)}`)
      return []
    }),
    bridge.readRestingHr(days).catch((e: unknown) => {
      errors.push(`resting HR: ${describe(e)}`)
      return []
    }),
  ])

  // Window the dedupe sets a little wider than the import so edge nights still match.
  const window = days + 2
  const haveSleep = new Set(getSleepRecords(window).map((r) => r.endTs))
  const haveWeight = new Set(getBodyMetrics('weight', window).map((m) => m.ts))
  const haveRhr = new Set(getHealthMetrics('resting_hr', window).map((m) => m.ts))

  db.transaction(() => {
    for (const r of sleep) {
      if (haveSleep.has(r.endTs)) {
        result.skipped++
        continue
      }
      addSleepRecord({ ...r, source: 'healthkit' })
      haveSleep.add(r.endTs)
      result.sleep++
    }
    for (const m of mass) {
      if (m.type !== 'weight' || haveWeight.has(m.ts)) {
        result.skipped++
        continue
      }
      addBodyMetric({ ...m, unit: 'kg', source: 'healthkit' })
      haveWeight.add(m.ts)
      result.weight++
    }
    for (const h of rhr) {
      if (h.type !== 'resting_hr' || haveRhr.has(h.ts)) {
        result.skipped++
        continue
      }
      addHealthMetric({ ...h, source: 'healthkit' })
      haveRhr.add(h.ts)
      result.restingHr++
    }
    setSetting(KEYS.healthLastImport, nowIso())
  })

  if (errors.length) result.error = errors.join('; ')
  return result
}

let pulling: Promise<HealthImportResult | null> | null = null

/**
 * The morning Apple Health pull (PRD §7.1, §18): once a day when sleep, body mass or resting HR is permitted, so
 * readiness and the coach do not sit on stale data until a manual import. App.tsx runs it at launch and whenever the
 * app comes back to the front; a second call while one runs gets the same promise. Null when nothing was due.
 */
export function importHealthIfDue(today: string = todayStr()): Promise<HealthImportResult | null> {
  pulling ??= (async () => {
    const last = getSetting<string | null>(KEYS.healthLastImport, null)
    if (last && dateOf(last) === today) return null
    const perms = readHealthPermissions()
    if (perms.sleep !== 'granted' && perms.bodyMass !== 'granted' && perms.restingHeartRate !== 'granted') return null
    const avail = await getHealthBridge().isAvailable()
    return avail.available ? importHealthData(7) : null
  })().finally(() => { pulling = null })
  return pulling
}

function describe(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'read failed'
}

export function summariseImport(r: HealthImportResult): string {
  const parts: string[] = []
  if (r.sleep) parts.push(`${r.sleep} night${r.sleep === 1 ? '' : 's'} of sleep`)
  if (r.weight) parts.push(`${r.weight} weigh-in${r.weight === 1 ? '' : 's'}`)
  if (r.restingHr) parts.push(`${r.restingHr} resting HR reading${r.restingHr === 1 ? '' : 's'}`)
  if (!parts.length) return r.skipped ? `Nothing new — ${r.skipped} existing row${r.skipped === 1 ? '' : 's'} already matched.` : 'Nothing to import yet.'
  return `Imported ${parts.join(', ')}${r.skipped ? ` (${r.skipped} already present)` : ''}.`
}
