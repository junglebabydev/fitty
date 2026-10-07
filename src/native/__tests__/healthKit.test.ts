// The iPhone app's HealthKit bridge, with the plugin mocked: its samples are shaped like @capgo/capacitor-health's
// iOS output (one sample per HealthKit sample, sleep stage in sleepState, source in sourceName). The import test runs
// through the real sql.js database, like ownerBootstrap.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HealthSample } from '@capgo/capacitor-health'

process.env.TZ = 'Asia/Singapore'

const plugin = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  requestAuthorization: vi.fn(),
  readSamples: vi.fn(),
}))
vi.mock('@capgo/capacitor-health', () => ({ Health: plugin }))

import { db } from '../../db/database'
import { getBodyMetrics, getHealthMetrics, getSetting, getSleepRecords, setSetting, tableCounts } from '../../db/repositories'
import { importHealthData, importHealthIfDue } from '../../features/settings/healthImport'
import { KEYS, writeHealthPermissions } from '../../features/settings/keys'
import { WebHealthBridge, setHealthBridge } from '../health'
import { CapacitorHealthBridge, toPermissions, toRestingHr, toSleepRecords, toWeights, windowStart } from '../healthKit'

/** Local wall-clock time in Singapore, as ISO. */
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+08:00`).toISOString()
const WATCH = 'Vaibhav’s Apple Watch'

function sleep(day1: string, from: string, day2: string, to: string, sleepState: HealthSample['sleepState'], sourceName = WATCH): HealthSample {
  return { dataType: 'sleep', value: 0, unit: 'minute', startDate: at(day1, from), endDate: at(day2, to), sleepState, sourceName }
}

// One Watch night with every stage, an awake gap, and two other sources covering the same hours.
const NIGHT = [
  sleep('2026-10-05', '23:30', '2026-10-06', '01:00', 'light'),
  sleep('2026-10-06', '01:00', '2026-10-06', '02:00', 'deep'),
  sleep('2026-10-06', '02:00', '2026-10-06', '02:10', 'awake'),
  sleep('2026-10-06', '02:10', '2026-10-06', '03:00', 'rem'),
  sleep('2026-10-06', '03:00', '2026-10-06', '06:30', 'light'),
  sleep('2026-10-05', '23:00', '2026-10-06', '07:00', 'inBed', 'iPhone'),
  sleep('2026-10-05', '23:40', '2026-10-06', '06:40', 'asleep', 'AutoSleep'),
]

describe('toSleepRecords', () => {
  it('one record per night from the Watch alone, overlaps merged and awake left out', () => {
    expect(toSleepRecords(NIGHT)).toEqual([{
      startTs: at('2026-10-05', '23:30'),
      endTs: at('2026-10-06', '06:30'),
      durationMin: 150 + 260, // 23:30–02:00, then 02:10–06:30
      source: 'healthkit',
      quality: null,
    }])
  })

  it('falls back to in-bed time when a night has no asleep stages', () => {
    const rows = toSleepRecords([sleep('2026-10-06', '22:00', '2026-10-07', '06:00', 'inBed', 'iPhone')])
    expect(rows).toEqual([expect.objectContaining({ startTs: at('2026-10-06', '22:00'), endTs: at('2026-10-07', '06:00'), durationMin: 480 })])
  })

  it('keeps a month of stage samples as a month of nights (more than the plugin\'s default 100)', () => {
    const samples: HealthSample[] = []
    for (let d = 1; d <= 30; d++) {
      const day1 = `2026-09-${String(d).padStart(2, '0')}`
      // Eight 50-minute stages a night, back to back from 23:00.
      for (let i = 0; i < 8; i++) {
        const start = new Date(at(day1, '23:00')).getTime() + i * 50 * 60_000
        samples.push({ dataType: 'sleep', value: 50, unit: 'minute', startDate: new Date(start).toISOString(), endDate: new Date(start + 50 * 60_000).toISOString(), sleepState: i % 2 ? 'deep' : 'light', sourceName: WATCH })
      }
    }
    expect(samples.length).toBe(240)
    const rows = toSleepRecords(samples)
    expect(rows).toHaveLength(30)
    expect(rows.every((r) => r.durationMin === 400)).toBe(true)
  })
})

describe('toWeights and toRestingHr', () => {
  it('weights: kilograms only, two decimals, ISO timestamps as the export import writes them', () => {
    expect(toWeights([
      { dataType: 'weight', value: 72.3456, unit: 'kilogram', startDate: '2026-10-06T23:05:00.000Z', endDate: '2026-10-06T23:05:00.000Z' },
      { dataType: 'weight', value: 160, unit: 'count', startDate: '2026-10-06T23:06:00.000Z', endDate: '2026-10-06T23:06:00.000Z' },
    ])).toEqual([{ ts: '2026-10-06T23:05:00.000Z', type: 'weight', value: 72.35, unit: 'kg', source: 'healthkit' }])
  })

  it('resting HR: one reading per day at local noon, the Watch\'s when it reported', () => {
    const hr = (hm: string, value: number, sourceName: string): HealthSample => ({ dataType: 'restingHeartRate', value, unit: 'bpm', startDate: at('2026-10-06', hm), endDate: at('2026-10-06', hm), sourceName })
    expect(toRestingHr([hr('08:00', 54, WATCH), hr('20:00', 58, WATCH), hr('09:00', 70, 'Oura')])).toEqual([
      { ts: at('2026-10-06', '12:00'), type: 'resting_hr', value: 56, unit: 'bpm', source: 'healthkit' },
    ])
  })
})

describe('toPermissions and windowStart', () => {
  it('asked-about types are granted; HealthKit never says no, so the rest stay undetermined', () => {
    const p = toPermissions(['sleep', 'bodyMass', 'steps'], ['sleep', 'weight'])
    expect(p.sleep).toBe('granted')
    expect(p.bodyMass).toBe('granted')
    expect(p.steps).toBe('undetermined')
    expect(p.restingHeartRate).toBe('undetermined')
  })

  it('starts at local noon, so every night read is whole', () => {
    expect(windowStart(7, new Date(at('2026-10-07', '08:15'))).toISOString()).toBe(at('2026-09-30', '12:00'))
  })
})

describe('CapacitorHealthBridge → importHealthData', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeAll(async () => {
    await db.init()
  })

  beforeEach(() => {
    db.transaction(() => {
      for (const t of Object.keys(tableCounts())) db.run(`DELETE FROM "${t}"`)
    })
    vi.clearAllMocks()
    plugin.isAvailable.mockResolvedValue({ available: true, platform: 'ios' })
    plugin.readSamples.mockImplementation(async ({ dataType }: { dataType: string }) => ({
      samples: dataType === 'sleep' ? NIGHT
        : dataType === 'weight' ? [{ dataType, value: 72.4, unit: 'kilogram', startDate: at('2026-10-06', '07:10'), endDate: at('2026-10-06', '07:10') }]
        : [{ dataType, value: 55, unit: 'bpm', startDate: at('2026-10-06', '08:00'), endDate: at('2026-10-06', '08:00'), sourceName: WATCH }],
    }))
    setHealthBridge(new CapacitorHealthBridge())
  })

  afterAll(() => {
    setHealthBridge(new WebHealthBridge())
    errorSpy.mockRestore()
  })

  it('asks to read only, never to write', async () => {
    plugin.requestAuthorization.mockResolvedValue({ readAuthorized: ['sleep'], readDenied: [], writeAuthorized: [], writeDenied: [] })
    const p = await new CapacitorHealthBridge().requestPermissions(['sleep'])
    expect(plugin.requestAuthorization).toHaveBeenCalledWith({ read: ['sleep'], write: [] })
    expect(p.sleep).toBe('granted')
  })

  it('reads well past the plugin\'s default 100 samples, from local noon', async () => {
    await new CapacitorHealthBridge().readSleep(30)
    const opts = plugin.readSamples.mock.calls[0][0]
    expect(opts.limit).toBeGreaterThanOrEqual(5000)
    expect(new Date(opts.startDate).getHours()).toBe(12)
  })

  it('stores the night, the weigh-in and the resting HR once, however often it runs', async () => {
    const first = await importHealthData(7)
    expect(first).toMatchObject({ sleep: 1, weight: 1, restingHr: 1, skipped: 0 })
    const again = await importHealthData(7)
    expect(again).toMatchObject({ sleep: 0, weight: 0, restingHr: 0, skipped: 3 })
    expect(getSleepRecords(30)).toHaveLength(1)
    expect(getBodyMetrics('weight', 30)).toHaveLength(1)
    expect(getHealthMetrics('resting_hr', 30)).toHaveLength(1)
  })

  it('daily pull: only with permission, once a day, one run at a time', async () => {
    expect(await importHealthIfDue('2026-10-07')).toBeNull() // nothing permitted yet
    writeHealthPermissions({ sleep: 'granted' })
    const [a, b] = [importHealthIfDue('2026-10-07'), importHealthIfDue('2026-10-07')]
    expect(a).toBe(b)
    expect(await a).toMatchObject({ sleep: 1 })
    setSetting(KEYS.healthLastImport, new Date().toISOString())
    const today = new Date().toLocaleDateString('en-CA')
    expect(await importHealthIfDue(today)).toBeNull()
    expect(getSetting<string | null>(KEYS.healthLastImport, null)).not.toBeNull()
  })
})
