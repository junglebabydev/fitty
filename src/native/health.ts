import type { BodyMetric, CardioSession, HealthMetric, SleepRecord } from '../domain/types'

// HealthKit bridge. The web build cannot reach HealthKit, so `WebHealthBridge`
// reports unavailable and every read returns []. Screens must render the
// unavailable / permission-denied states from `isAvailable()` and the
// per-type permission map, never assume data.
//
// ── Capacitor swap ───────────────────────────────────────────────────────────
// When the app is wrapped in Capacitor, add a native `HealthKitBridge` that
// implements `HealthBridge` and register it once at boot:
//
//   import { registerPlugin } from '@capacitor/core'
//   const HK = registerPlugin<HealthKitPlugin>('HealthKit')   // Swift plugin
//   setHealthBridge(new CapacitorHealthBridge(HK))
//
// Mapping the Swift plugin must implement (all timestamps ISO 8601, metric units):
//   isAvailable        → HKHealthStore.isHealthDataAvailable()
//   requestPermissions → HKHealthStore.requestAuthorization(toShare:read:) with the
//                        HK types below; return per-type status. HealthKit never
//                        reveals *read* denial, so treat "granted-but-empty" as
//                        'granted' and only report 'denied' for write types.
//   readSleep          → HKCategoryTypeIdentifierSleepAnalysis; merge the
//                        asleepCore/Deep/REM (or legacy asleep) samples per night
//                        into one SleepRecord {startTs, endTs, durationMin, source:'healthkit'}.
//   readBodyMass       → HKQuantityTypeIdentifierBodyMass in kg → BodyMetric type 'weight', source 'healthkit'.
//   readRestingHr      → HKQuantityTypeIdentifierRestingHeartRate (bpm) → HealthMetric type 'resting_hr'.
//   readWorkouts       → HKWorkout (walking/running/cycling/swimming/HIIT) → CardioSession
//                        {modality from workoutActivityType, durationMin, distanceKm, avgHr}.
//   writeWorkout       → HKWorkoutBuilder with activityType from `type`, total energy if given.
//   writeBodyMass      → HKQuantitySample(bodyMass, kg) at `ts`.
// Writes must stay behind the 'health.writeWorkouts' / 'health.writeBodyMass' settings.
// ─────────────────────────────────────────────────────────────────────────────

export type HealthDataType = 'sleep' | 'workouts' | 'activeEnergy' | 'steps' | 'heartRate' | 'restingHeartRate' | 'bodyMass'

export type HealthPermission = 'granted' | 'denied' | 'undetermined'

export const HEALTH_DATA_TYPES: HealthDataType[] = ['sleep', 'workouts', 'activeEnergy', 'steps', 'heartRate', 'restingHeartRate', 'bodyMass']

export const HEALTH_TYPE_INFO: Record<HealthDataType, { label: string; why: string }> = {
  sleep: {
    label: 'Sleep analysis',
    why: 'Last night and 7-day sleep feed the readiness check. Short sleep reduces volume, it never cancels training on its own.',
  },
  workouts: {
    label: 'Workouts',
    why: 'Imports cardio and swims recorded on Apple Watch so the week reflows correctly without manual entry.',
  },
  activeEnergy: {
    label: 'Active energy',
    why: 'Shows daily movement alongside intake. Never used for calorie arithmetic — targets adjust from weight trends.',
  },
  steps: {
    label: 'Steps',
    why: 'Low-impact activity context for conditioning days and recovery notes.',
  },
  heartRate: {
    label: 'Heart rate',
    why: 'Average heart rate for imported cardio sessions.',
  },
  restingHeartRate: {
    label: 'Resting heart rate',
    why: 'A resting HR well above your baseline flags recovery strain in the morning readiness check.',
  },
  bodyMass: {
    label: 'Body mass',
    why: 'Uses your smart-scale weigh-ins so the app only asks for weight when none exists today.',
  },
}

export interface WorkoutSummary {
  name: string
  type: 'strength' | 'conditioning' | 'swim' | 'mobility' | string
  startTs: string
  endTs: string
  durationMin: number
  activeKcal?: number | null
  avgHr?: number | null
  distanceKm?: number | null
}

export interface HealthBridge {
  isAvailable(): Promise<{ available: boolean; reason?: string }>
  requestPermissions(types: HealthDataType[]): Promise<Record<HealthDataType, HealthPermission>>
  readSleep(days: number): Promise<Omit<SleepRecord, 'id'>[]>
  readBodyMass(days: number): Promise<Omit<BodyMetric, 'id'>[]>
  readRestingHr(days: number): Promise<Omit<HealthMetric, 'id'>[]>
  readWorkouts(days: number): Promise<Omit<CardioSession, 'id'>[]>
  writeWorkout(summary: WorkoutSummary): Promise<boolean>
  writeBodyMass(kg: number, ts: string): Promise<boolean>
}

export const HEALTH_UNAVAILABLE_REASON = 'HealthKit requires the iOS app shell (Capacitor)'

export function emptyPermissions(value: HealthPermission = 'undetermined'): Record<HealthDataType, HealthPermission> {
  return Object.fromEntries(HEALTH_DATA_TYPES.map((t) => [t, value])) as Record<HealthDataType, HealthPermission>
}

export class WebHealthBridge implements HealthBridge {
  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: false, reason: HEALTH_UNAVAILABLE_REASON }
  }

  async requestPermissions(types: HealthDataType[]): Promise<Record<HealthDataType, HealthPermission>> {
    const out = emptyPermissions('undetermined')
    for (const t of types) out[t] = 'undetermined'
    return out
  }

  async readSleep(_days: number): Promise<Omit<SleepRecord, 'id'>[]> {
    return []
  }

  async readBodyMass(_days: number): Promise<Omit<BodyMetric, 'id'>[]> {
    return []
  }

  async readRestingHr(_days: number): Promise<Omit<HealthMetric, 'id'>[]> {
    return []
  }

  async readWorkouts(_days: number): Promise<Omit<CardioSession, 'id'>[]> {
    return []
  }

  async writeWorkout(_summary: WorkoutSummary): Promise<boolean> {
    return false
  }

  async writeBodyMass(_kg: number, _ts: string): Promise<boolean> {
    return false
  }
}

let bridge: HealthBridge = new WebHealthBridge()

export function getHealthBridge(): HealthBridge {
  return bridge
}

/** Boot-time injection point for the Capacitor implementation (see comment block above). */
export function setHealthBridge(b: HealthBridge): void {
  bridge = b
}
