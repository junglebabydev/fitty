// HealthKit in the iPhone app (docs/IOS.md), through @capgo/capacitor-health. main.tsx registers it at boot in the
// native shell only; the web keeps WebHealthBridge. Samples are mapped with the Apple Health export's own rules
// (aggregateSleep, aggregateDaily), so a live read and a file import produce the same rows and dedupe each other.
// Reads only for now: the plugin cannot save a workout, and the planned Watch app will record workouts in Health
// itself. The write toggles stay hidden (FEATURES.healthWrites).
import { Health, type HealthDataType as PluginType, type HealthSample } from '@capgo/capacitor-health'
import type { BodyMetric, CardioSession, HealthMetric, SleepRecord } from '../domain/types'
import { emptyPermissions, type HealthBridge, type HealthDataType, type HealthPermission } from './health'
import { aggregateDaily, aggregateSleep, wallDay, type SleepSample } from './healthExport'

const PLUGIN_TYPE: Record<HealthDataType, PluginType> = {
  sleep: 'sleep', workouts: 'workouts', activeEnergy: 'calories', steps: 'steps',
  heartRate: 'heartRate', restingHeartRate: 'restingHeartRate', bodyMass: 'weight',
}

// readSamples returns the newest 100 by default. A month of Watch sleep stages runs into the thousands.
const READ_LIMIT = 10_000

/** 12:00 local, `days` days ago: every noon-to-noon night after it is read whole. */
export function windowStart(days: number, now: Date = new Date()): Date {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(12, 0, 0, 0)
  return d
}

/** HealthKit never reveals a read refusal: "authorized" only means the user was asked, and a refusal reads as empty. */
export function toPermissions(requested: HealthDataType[], readAuthorized: PluginType[]): Record<HealthDataType, HealthPermission> {
  const out = emptyPermissions('undetermined')
  for (const t of requested) if (readAuthorized.includes(PLUGIN_TYPE[t])) out[t] = 'granted'
  return out
}

function offsetMinAt(ms: number): number {
  return -new Date(ms).getTimezoneOffset()
}

function isWatch(s: HealthSample): boolean {
  return /watch/i.test(s.sourceName ?? '')
}

/** Core, deep, REM and unspecified count as asleep; in bed is the fallback; awake is dropped. */
export function toSleepRecords(samples: HealthSample[]): Omit<SleepRecord, 'id'>[] {
  const sleep: SleepSample[] = []
  for (const s of samples) {
    const stage = s.sleepState === 'inBed' ? 'inBed' : s.sleepState && s.sleepState !== 'awake' ? 'asleep' : null
    if (!stage) continue
    const startMs = Date.parse(s.startDate)
    sleep.push({ startMs, endMs: Date.parse(s.endDate), offsetMin: offsetMinAt(startMs), stage, source: s.sourceName ?? '', watch: isWatch(s) })
  }
  return aggregateSleep(sleep).map(({ night: _night, ...r }) => r)
}

export function toWeights(samples: HealthSample[]): Omit<BodyMetric, 'id'>[] {
  return samples
    .filter((s) => s.unit === 'kilogram' && Number.isFinite(s.value))
    .map((s) => ({ ts: new Date(s.startDate).toISOString(), type: 'weight' as const, value: Math.round(s.value * 100) / 100, unit: 'kg', source: 'healthkit' as const }))
}

/** One reading per day at 12:00, the day's mean (Watch only when it reported), as the export import stores it. */
export function toRestingHr(samples: HealthSample[]): Omit<HealthMetric, 'id'>[] {
  const daily = samples.map((s) => {
    const ms = Date.parse(s.startDate)
    const offsetMin = offsetMinAt(ms)
    return { day: wallDay(ms, offsetMin), offsetMin, value: s.value, source: s.sourceName ?? '', watch: isWatch(s) }
  })
  return aggregateDaily(daily, 'mean').map((d) => ({ ts: d.ts, type: 'resting_hr' as const, value: d.value, unit: 'bpm', source: 'healthkit' }))
}

async function read(dataType: PluginType, days: number): Promise<HealthSample[]> {
  const { samples } = await Health.readSamples({ dataType, startDate: windowStart(days).toISOString(), endDate: new Date().toISOString(), limit: READ_LIMIT })
  return samples
}

export class CapacitorHealthBridge implements HealthBridge {
  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    const r = await Health.isAvailable()
    return r.available ? { available: true } : { available: false, reason: r.reason ?? 'Apple Health is not available on this device.' }
  }

  async requestPermissions(types: HealthDataType[]): Promise<Record<HealthDataType, HealthPermission>> {
    // Reads only: asking to write would also need NSHealthUpdateUsageDescription in Info.plist.
    const r = await Health.requestAuthorization({ read: types.map((t) => PLUGIN_TYPE[t]), write: [] })
    return toPermissions(types, r.readAuthorized)
  }

  async readSleep(days: number): Promise<Omit<SleepRecord, 'id'>[]> {
    return toSleepRecords(await read('sleep', days))
  }

  async readBodyMass(days: number): Promise<Omit<BodyMetric, 'id'>[]> {
    return toWeights(await read('weight', days))
  }

  async readRestingHr(days: number): Promise<Omit<HealthMetric, 'id'>[]> {
    return toRestingHr(await read('restingHeartRate', days))
  }

  // Nothing reads workouts from the bridge yet; the file import covers them.
  async readWorkouts(_days: number): Promise<Omit<CardioSession, 'id'>[]> {
    return []
  }

  async writeWorkout(): Promise<boolean> {
    return false
  }

  async writeBodyMass(): Promise<boolean> {
    return false
  }
}
