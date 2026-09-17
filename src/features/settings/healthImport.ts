// Pull sleep / body mass / resting HR from the HealthKit bridge into the local
// database. Rows are deduplicated by timestamp so repeated imports are idempotent.
import { db } from '../../db/database'
import {
  addBodyMetric,
  addHealthMetric,
  addSleepRecord,
  getBodyMetrics,
  getHealthMetrics,
  getSleepRecords,
  setSetting,
} from '../../db/repositories'
import { nowIso } from '../../lib/util'
import { getHealthBridge } from '../../native'
import { KEYS } from './keys'

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
