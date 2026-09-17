import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import type { BodyMetric, CardioSession, HealthMetric, SleepRecord } from '../../domain/types'

// The repository + database layers are replaced by in-memory arrays, so these tests never load sql.js.
const store = vi.hoisted(() => ({
  sleep: [] as Omit<SleepRecord, 'id'>[],
  body: [] as Omit<BodyMetric, 'id'>[],
  health: [] as Omit<HealthMetric, 'id'>[],
  cardio: [] as Omit<CardioSession, 'id'>[],
  transactions: 0,
}))

vi.mock('../../db/database', () => ({
  db: { transaction: <T>(fn: () => T): T => { store.transactions++; return fn() } },
}))

vi.mock('../../db/repositories', () => ({
  addSleepRecord: (r: Omit<SleepRecord, 'id'>) => store.sleep.push(r),
  getSleepRecords: () => store.sleep,
  addBodyMetric: (m: Omit<BodyMetric, 'id'>) => store.body.push(m),
  getBodyMetrics: (type: string) => store.body.filter((m) => m.type === type),
  addHealthMetric: (m: Omit<HealthMetric, 'id'>) => store.health.push(m),
  getHealthMetrics: (type: string) => store.health.filter((m) => m.type === type),
  addCardio: (c: Omit<CardioSession, 'id'>) => store.cardio.push(c),
  getCardio: () => store.cardio,
}))

import {
  HealthExportCollector,
  aggregateDaily,
  aggregateSleep,
  extractTags,
  importAppleHealthExport,
  isExportXmlName,
  isWatchSource,
  mapWorkoutType,
  nightOf,
  noonIso,
  parseAttributes,
  parseHealthDate,
  sleepStage,
  toKcal,
  toKg,
  toKm,
  wallDay,
  type DailySample,
  type SleepSample,
} from '../healthExport'

// The importer reads existing rows with the device clock; pin it so the demo-data clash test is deterministic.
process.env.TZ = 'Asia/Singapore'

/** 2026-09-17 12:00 in Singapore — the day the export was taken. */
const NOW = Date.parse('2026-09-17T04:00:00Z')

const WATCH = 'sourceName="Alex’s Apple Watch" sourceVersion="12.0" device="&lt;&lt;HKDevice: 0x3021a&gt;, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,1, software:12.0&gt;"'
const PHONE = 'sourceName="Alex’s iPhone" sourceVersion="19.0" device="&lt;&lt;HKDevice: 0x3021b&gt;, name:iPhone, manufacturer:Apple Inc., model:iPhone, hardware:iPhone17,1, software:19.0&gt;"'
const SLEEP = 'type="HKCategoryTypeIdentifierSleepAnalysis"'
const STAGE = 'HKCategoryValueSleepAnalysis'

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord)*)>
<!ELEMENT Record ((MetadataEntry|HeartRateVariabilityMetadataList)*)>
<!ATTLIST Record
  type CDATA #REQUIRED
  unit CDATA #IMPLIED
  value CDATA #IMPLIED
>
<!ELEMENT Workout ((MetadataEntry|WorkoutEvent|WorkoutRoute|WorkoutStatistics)*)>
]>
<HealthData locale="en_SG">
 <ExportDate value="2026-09-17 09:12:44 +0800"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1989-02-11" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>

 <!-- outside the 90-day window: must be dropped -->
 <Record type="HKQuantityTypeIdentifierBodyMass" ${PHONE} unit="kg" creationDate="2025-01-01 07:00:00 +0800" startDate="2025-01-01 07:00:00 +0800" endDate="2025-01-01 07:00:00 +0800" value="88"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${PHONE} unit="count" startDate="2025-01-01 09:00:00 +0800" endDate="2025-01-01 09:10:00 +0800" value="999"/>

 <!-- a type the app does not import -->
 <Record type="HKQuantityTypeIdentifierHeartRate" ${WATCH} unit="count/min" startDate="2026-09-10 08:00:00 +0800" endDate="2026-09-10 08:00:00 +0800" value="61">
  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="1"/>
 </Record>

 <!-- night waking 10 Sep: phone in-bed, a third-party sleep app, and the Watch all overlap -->
 <Record ${SLEEP} ${PHONE} startDate="2026-09-09 23:00:00 +0800" endDate="2026-09-10 07:10:00 +0800" value="${STAGE}InBed"/>
 <Record ${SLEEP} sourceName="AutoSleep" sourceVersion="7" startDate="2026-09-09 23:20:00 +0800" endDate="2026-09-10 07:00:00 +0800" value="${STAGE}AsleepUnspecified"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-09 23:30:00 +0800" endDate="2026-09-10 01:00:00 +0800" value="${STAGE}AsleepCore"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-10 01:00:00 +0800" endDate="2026-09-10 02:00:00 +0800" value="${STAGE}AsleepDeep"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-10 02:00:00 +0800" endDate="2026-09-10 02:10:00 +0800" value="${STAGE}Awake"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-10 02:10:00 +0800" endDate="2026-09-10 03:40:00 +0800" value="${STAGE}AsleepREM"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-10 03:40:00 +0800" endDate="2026-09-10 06:50:00 +0800" value="${STAGE}AsleepCore"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-10 03:40:00 +0800" endDate="2026-09-10 05:00:00 +0800" value="${STAGE}AsleepCore"/>

 <!-- night waking 11 Sep: no Watch, only in-bed from the phone → fallback -->
 <Record ${SLEEP} ${PHONE} startDate="2026-09-11 00:30:00 +0800" endDate="2026-09-11 07:30:00 +0800" value="${STAGE}InBed"/>

 <!-- 13:00 nap on the 11th falls in the noon-to-noon window of the night waking 12 Sep -->
 <Record ${SLEEP} ${WATCH} startDate="2026-09-11 13:00:00 +0800" endDate="2026-09-11 13:45:00 +0800" value="${STAGE}AsleepCore"/>
 <Record ${SLEEP} ${WATCH} startDate="2026-09-11 23:40:00 +0800" endDate="2026-09-12 06:40:00 +0800" value="${STAGE}AsleepCore"/>

 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Withings" sourceVersion="6" unit="kg" startDate="2026-09-10 07:05:00 +0800" endDate="2026-09-10 07:05:00 +0800" value="83.4"/>
 <Record type='HKQuantityTypeIdentifierBodyMass' sourceName='Withings' unit='lb' startDate='2026-09-11 07:02:10 +0800' endDate='2026-09-11 07:02:10 +0800' value='184.2'/>

 <Record type="HKQuantityTypeIdentifierRestingHeartRate" ${WATCH} unit="count/min" startDate="2026-09-10 00:00:10 +0800" endDate="2026-09-10 21:00:00 +0800" value="56"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" ${WATCH} unit="count/min" startDate="2026-09-10 12:00:00 +0800" endDate="2026-09-10 23:00:00 +0800" value="58"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" ${WATCH} unit="count/min" startDate="2026-09-11 00:00:10 +0800" endDate="2026-09-11 21:00:00 +0800" value="55"/>

 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" ${WATCH} unit="ms" startDate="2026-09-10 03:00:00 +0800" endDate="2026-09-10 03:01:00 +0800" value="42.5">
  <HeartRateVariabilityMetadataList>
   <InstantaneousBeatsPerMinute bpm="54" time="03:00:01.10"/>
   <InstantaneousBeatsPerMinute bpm="55" time="03:00:02.20"/>
  </HeartRateVariabilityMetadataList>
 </Record>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" ${WATCH} unit="ms" startDate="2026-09-10 05:00:00 +0800" endDate="2026-09-10 05:01:00 +0800" value="47.5"/>

 <!-- 10 Sep: phone and Watch both counted the same walk -->
 <Record type="HKQuantityTypeIdentifierStepCount" ${PHONE} unit="count" startDate="2026-09-10 09:00:00 +0800" endDate="2026-09-10 09:30:00 +0800" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${PHONE} unit="count" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:20:00 +0800" value="1200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${WATCH} unit="count" startDate="2026-09-10 09:00:00 +0800" endDate="2026-09-10 09:30:00 +0800" value="3500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${WATCH} unit="count" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:20:00 +0800" value="1500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${WATCH} unit="count" startDate="2026-09-10 21:00:00 +0800" endDate="2026-09-10 21:10:00 +0800" value="800"/>
 <!-- 11 Sep: Watch left on the charger -->
 <Record type="HKQuantityTypeIdentifierStepCount" ${PHONE} unit="count" startDate="2026-09-11 10:00:00 +0800" endDate="2026-09-11 10:30:00 +0800" value="2500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" ${PHONE} unit="count" startDate="2026-09-11 20:00:00 +0800" endDate="2026-09-11 20:05:00 +0800" value="400"/>
 <!-- export day: incomplete, must not be stored -->
 <Record type="HKQuantityTypeIdentifierStepCount" ${WATCH} unit="count" startDate="2026-09-17 08:00:00 +0800" endDate="2026-09-17 08:30:00 +0800" value="900"/>

 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" ${WATCH} unit="kcal" startDate="2026-09-10 09:00:00 +0800" endDate="2026-09-10 09:30:00 +0800" value="300"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" ${WATCH} unit="kJ" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:30:00 +0800" value="418.4"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" ${WATCH} unit="Cal" startDate="2026-09-11 10:00:00 +0800" endDate="2026-09-11 10:30:00 +0800" value="250"/>

 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="31.2" durationUnit="min" ${WATCH} creationDate="2026-09-10 18:32:00 +0800" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:31:12 +0800">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutEvent type="HKWorkoutEventTypeSegment" date="2026-09-10 18:00:00 +0800" duration="6.1" durationUnit="min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:31:12 +0800" sum="310" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:31:12 +0800" sum="5.02" unit="km"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:31:12 +0800" average="148.6" minimum="98" maximum="171" unit="count/min"/>
  <WorkoutRoute sourceName="Alex’s Apple Watch" startDate="2026-09-10 18:00:00 +0800" endDate="2026-09-10 18:31:12 +0800">
   <FileReference path="/workout-routes/route_2026-09-10_6.31pm.gpx"/>
  </WorkoutRoute>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="52.0" durationUnit="min" ${WATCH} startDate="2026-09-11 19:00:00 +0800" endDate="2026-09-11 19:52:00 +0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="2026-09-11 19:00:00 +0800" endDate="2026-09-11 19:52:00 +0800" average="112" minimum="80" maximum="150" unit="count/min"/>
 </Workout>
 <!-- out of the window; its statistics must not leak onto the strength session above -->
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" ${WATCH} startDate="2025-02-01 08:00:00 +0800" endDate="2025-02-01 09:00:00 +0800">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" startDate="2025-02-01 08:00:00 +0800" endDate="2025-02-01 09:00:00 +0800" sum="20" unit="km"/>
 </Workout>
 <!-- iOS 15-style element with the distance as an attribute, in miles -->
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="40" durationUnit="min" totalDistance="2.0" totalDistanceUnit="mi" totalEnergyBurned="150" totalEnergyBurnedUnit="kcal" ${PHONE} startDate="2026-09-12 08:00:00 +0800" endDate="2026-09-12 08:40:00 +0800"/>
</HealthData>
`

function collect(chunks: string[]): ReturnType<HealthExportCollector['finish']> {
  const c = new HealthExportCollector(90, NOW)
  for (const chunk of chunks) c.push(chunk)
  return c.finish()
}

/** A File whose stream hands out `chunkSize`-byte pieces, like a large upload would. */
function fakeFile(bytes: Uint8Array, name: string, chunkSize: number): File {
  return {
    name,
    size: bytes.length,
    stream: () => {
      let i = 0
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i >= bytes.length) { controller.close(); return }
          controller.enqueue(bytes.subarray(i, i + chunkSize))
          i += chunkSize
        },
      })
    },
  } as unknown as File
}

describe('parseAttributes', () => {
  it('reads double- and single-quoted values, loose spacing, and decodes entities', () => {
    const a = parseAttributes(`<Record type = "HKQuantityTypeIdentifierBodyMass"  sourceName='Mum&apos;s &amp; Dad&#39;s scale' unit="kg" device="&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch&gt;" value="83.4"/>`)
    expect(a.type).toBe('HKQuantityTypeIdentifierBodyMass')
    expect(a.sourceName).toBe("Mum's & Dad's scale")
    expect(a.device).toBe('<<HKDevice: 0x1>, name:Apple Watch>')
    expect(a.value).toBe('83.4')
  })

  it('keeps apostrophes inside double quotes and returns {} for a tag with no attributes', () => {
    expect(parseAttributes(`<Record sourceName="Alex's Apple Watch">`).sourceName).toBe("Alex's Apple Watch")
    expect(parseAttributes('<Workout>')).toEqual({})
  })

  it('leaves unknown entities untouched', () => {
    expect(parseAttributes('<Record sourceName="A &bogus; B"/>').sourceName).toBe('A &bogus; B')
  })
})

describe('parseHealthDate', () => {
  it('parses the Apple Health format with a positive offset', () => {
    const d = parseHealthDate('2026-09-10 07:00:12 +0800')
    expect(d).toEqual({ ms: Date.parse('2026-09-09T23:00:12Z'), offsetMin: 480 })
  })

  it('handles negative and half-hour offsets, ISO "T", colon offsets and Z', () => {
    expect(parseHealthDate('2026-03-01 22:15:00 -0500')).toEqual({ ms: Date.parse('2026-03-02T03:15:00Z'), offsetMin: -300 })
    expect(parseHealthDate('2026-03-01 06:00:00 +0530')).toEqual({ ms: Date.parse('2026-03-01T00:30:00Z'), offsetMin: 330 })
    expect(parseHealthDate('2026-03-01T06:00:00+05:30')?.ms).toBe(Date.parse('2026-03-01T00:30:00Z'))
    expect(parseHealthDate('2026-03-01T06:00:00Z')).toEqual({ ms: Date.parse('2026-03-01T06:00:00Z'), offsetMin: 0 })
  })

  it('returns null for junk', () => {
    expect(parseHealthDate('')).toBeNull()
    expect(parseHealthDate(undefined)).toBeNull()
    expect(parseHealthDate('yesterday')).toBeNull()
    expect(parseHealthDate('2026-09-10')).toBeNull()
  })

  it('wallDay / nightOf / noonIso use the clock that wrote the sample, not the machine clock', () => {
    const late = parseHealthDate('2026-09-09 23:30:00 +0800')!
    expect(wallDay(late.ms, late.offsetMin)).toBe('2026-09-09')
    expect(nightOf(late.ms, late.offsetMin)).toBe('2026-09-10')
    const beforeNoon = parseHealthDate('2026-09-10 11:59:59 +0800')!
    const atNoon = parseHealthDate('2026-09-10 12:00:00 +0800')!
    expect(nightOf(beforeNoon.ms, beforeNoon.offsetMin)).toBe('2026-09-10')
    expect(nightOf(atNoon.ms, atNoon.offsetMin)).toBe('2026-09-11')
    expect(noonIso('2026-09-10', 480)).toBe('2026-09-10T04:00:00.000Z')
    expect(noonIso('2026-09-10', -300)).toBe('2026-09-10T17:00:00.000Z')
  })
})

describe('extractTags', () => {
  it('finds Record / Workout / WorkoutStatistics / ExportDate start tags and nothing else', () => {
    const { tags, rest } = extractTags(FIXTURE)
    expect(rest).toBe('')
    const count = (n: string) => tags.filter((t) => t.name === n).length
    expect(count('ExportDate')).toBe(1)
    expect(count('Workout')).toBe(4)
    expect(count('WorkoutStatistics')).toBe(5)
    expect(count('Record')).toBe(32)
    // DTD declarations, <WorkoutEvent>, <WorkoutRoute> and child elements are never returned
    expect(tags.every((t) => /^<(Record|Workout|WorkoutStatistics|ExportDate)[\s/>]/.test(t.text))).toBe(true)
    expect(tags.some((t) => t.text.includes('ELEMENT') || t.text.includes('WorkoutEvent') || t.text.includes('WorkoutRoute'))).toBe(false)
  })

  it('carries a tag split across two chunks', () => {
    const cut = FIXTURE.indexOf('value="83.4"') - 20 // inside the startDate of the 83.4 kg record
    const first = extractTags(FIXTURE.slice(0, cut))
    expect(first.rest.startsWith('<Record type="HKQuantityTypeIdentifierBodyMass"')).toBe(true)
    expect(first.rest.includes('value="83.4"')).toBe(false)
    const second = extractTags(first.rest + FIXTURE.slice(cut))
    expect(second.tags[0].text).toContain('value="83.4"')
    expect(first.tags.length + second.tags.length).toBe(extractTags(FIXTURE).tags.length)
  })

  it('carries a tag name split across chunks ("<Rec" + "ord …")', () => {
    const a = extractTags('<x/>\n <Rec')
    expect(a).toEqual({ tags: [], rest: '<Rec' })
    const b = extractTags(a.rest + 'ord type="T" value="1"/> <Workout')
    expect(b.tags.map((t) => t.text)).toEqual(['<Record type="T" value="1"/>'])
    expect(b.rest).toBe('<Workout') // could still become <WorkoutStatistics
    expect(extractTags(b.rest + 'Statistics sum="2"/>').tags[0].name).toBe('WorkoutStatistics')
    expect(extractTags(b.rest + 'Event date="x"/>')).toEqual({ tags: [], rest: '' })
  })

  it('is not fooled by ">" inside a quoted attribute value', () => {
    const { tags } = extractTags('<Record device="<<HKDevice: 0x1>, name:Apple Watch>" value="7"/><Record value="8"/>')
    expect(tags).toHaveLength(2)
    expect(parseAttributes(tags[0].text).value).toBe('7')
  })

  it('gives identical tags wherever the chunk boundary falls', () => {
    const whole = extractTags(FIXTURE).tags.map((t) => t.text)
    for (let cut = 1; cut < FIXTURE.length; cut += 7) {
      const a = extractTags(FIXTURE.slice(0, cut))
      const b = extractTags(a.rest + FIXTURE.slice(cut))
      expect(b.rest).toBe('')
      expect([...a.tags, ...b.tags].map((t) => t.text)).toEqual(whole)
    }
  })
})

describe('units, sources, workout names', () => {
  it('converts mass, energy and distance', () => {
    expect(toKg(83.4, 'kg')).toBe(83.4)
    expect(toKg(184.2, 'lb')).toBeCloseTo(83.552, 3)
    expect(toKg(13, 'st')).toBeCloseTo(82.554, 3)
    expect(toKg(1, 'oz')).toBeNull()
    expect(toKcal(418.4, 'kJ')).toBeCloseTo(100, 6)
    expect(toKcal(250, 'Cal')).toBe(250)
    expect(toKcal(1, 'J')).toBeNull()
    expect(toKm(2, 'mi')).toBeCloseTo(3.2187, 4)
    expect(toKm(1500, 'm')).toBe(1.5)
  })

  it('detects the Watch by source name or by device description (renamed watch)', () => {
    expect(isWatchSource({ sourceName: 'Alex’s Apple Watch' })).toBe(true)
    expect(isWatchSource({ sourceName: 'Wristy', device: '<<HKDevice: 0x1>, name:Apple Watch, model:Watch>' })).toBe(true)
    expect(isWatchSource({ sourceName: 'Alex’s iPhone', device: '<<HKDevice: 0x2>, name:iPhone, model:iPhone>' })).toBe(false)
  })

  it('maps workout activity types to friendly names', () => {
    expect(mapWorkoutType('HKWorkoutActivityTypeRunning')).toBe('Running')
    expect(mapWorkoutType('HKWorkoutActivityTypeWalking')).toBe('Walking')
    expect(mapWorkoutType('HKWorkoutActivityTypeCycling')).toBe('Cycling')
    expect(mapWorkoutType('HKWorkoutActivityTypeSwimming')).toBe('Swimming')
    expect(mapWorkoutType('HKWorkoutActivityTypeTraditionalStrengthTraining')).toBe('Strength training')
    expect(mapWorkoutType('HKWorkoutActivityTypeFunctionalStrengthTraining')).toBe('Strength training')
    expect(mapWorkoutType('HKWorkoutActivityTypeHighIntensityIntervalTraining')).toBe('HIIT')
    expect(mapWorkoutType('HKWorkoutActivityTypeYoga')).toBe('Yoga')
    expect(mapWorkoutType('HKWorkoutActivityTypeJumpRope')).toBe('Jump rope')
    expect(mapWorkoutType('HKWorkoutActivityTypeOther')).toBe('Workout')
    expect(mapWorkoutType(undefined)).toBe('Workout')
  })

  it('classifies sleep values', () => {
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleepCore')).toBe('asleep')
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleepDeep')).toBe('asleep')
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleepREM')).toBe('asleep')
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleepUnspecified')).toBe('asleep')
    expect(sleepStage('HKCategoryValueSleepAnalysisAsleep')).toBe('asleep') // pre-iOS 16
    expect(sleepStage('HKCategoryValueSleepAnalysisInBed')).toBe('inBed')
    expect(sleepStage('HKCategoryValueSleepAnalysisAwake')).toBeNull()
  })

  it('picks the export XML out of the archive listing', () => {
    expect(isExportXmlName('apple_health_export/export.xml')).toBe(true)
    expect(isExportXmlName('apple_health_export/Exportación.xml')).toBe(true)
    expect(isExportXmlName('export.xml')).toBe(true)
    expect(isExportXmlName('apple_health_export/export_cda.xml')).toBe(false)
    expect(isExportXmlName('apple_health_export/workout-routes/route.gpx')).toBe(false)
    expect(isExportXmlName('apple_health_export/clinical/records/thing.xml')).toBe(false)
    expect(isExportXmlName('__MACOSX/._export.xml')).toBe(false)
  })
})

describe('aggregateSleep', () => {
  const at = (s: string) => parseHealthDate(`${s} +0800`)!.ms
  const sample = (start: string, end: string, stage: 'asleep' | 'inBed', source: string, watch: boolean): SleepSample =>
    ({ startMs: at(start), endMs: at(end), offsetMin: 480, stage, source, watch })

  it('groups by wake date with a noon-to-noon window', () => {
    const nights = aggregateSleep([
      sample('2026-09-09 12:00:00', '2026-09-09 12:30:00', 'asleep', 'W', true), // noon sharp → next wake date
      sample('2026-09-09 23:00:00', '2026-09-10 06:00:00', 'asleep', 'W', true),
      sample('2026-09-10 11:00:00', '2026-09-10 11:40:00', 'asleep', 'W', true), // lie-in, still the same night
      sample('2026-09-10 12:10:00', '2026-09-10 12:40:00', 'asleep', 'W', true), // after noon → the 11th
    ])
    expect(nights.map((n) => [n.night, n.durationMin])).toEqual([['2026-09-10', 30 + 420 + 40], ['2026-09-11', 30]])
    expect(nights[0].startTs).toBe('2026-09-09T04:00:00.000Z')
    expect(nights[0].endTs).toBe('2026-09-10T03:40:00.000Z')
  })

  it('prefers Watch samples over an overlapping app, and merges overlaps instead of double counting', () => {
    const [night] = aggregateSleep([
      sample('2026-09-09 23:20:00', '2026-09-10 07:00:00', 'asleep', 'AutoSleep', false),
      sample('2026-09-09 23:30:00', '2026-09-10 03:00:00', 'asleep', 'Watch', true),
      sample('2026-09-10 02:00:00', '2026-09-10 04:00:00', 'asleep', 'Old Watch', true), // overlaps 02:00–03:00
      sample('2026-09-10 04:30:00', '2026-09-10 06:30:00', 'asleep', 'Watch', true),
    ])
    expect(night.durationMin).toBe(270 + 120) // 23:30–04:00 merged, then 04:30–06:30
    expect(night.startTs).toBe('2026-09-09T15:30:00.000Z')
    expect(night.endTs).toBe('2026-09-09T22:30:00.000Z')
    expect(night.source).toBe('healthkit')
    expect(night.quality).toBeNull()
  })

  it('without a Watch, uses the one source with the most sleep rather than adding apps together', () => {
    const [night] = aggregateSleep([
      sample('2026-09-09 23:00:00', '2026-09-10 06:00:00', 'asleep', 'AutoSleep', false),
      sample('2026-09-09 23:30:00', '2026-09-10 05:00:00', 'asleep', 'Pillow', false),
    ])
    expect(night.durationMin).toBe(420)
  })

  it('falls back to InBed only when the night has no asleep samples', () => {
    const nights = aggregateSleep([
      sample('2026-09-09 23:00:00', '2026-09-10 07:00:00', 'inBed', 'iPhone', false),
      sample('2026-09-09 23:30:00', '2026-09-10 06:30:00', 'asleep', 'Watch', true),
      sample('2026-09-11 00:30:00', '2026-09-11 07:30:00', 'inBed', 'iPhone', false),
    ])
    expect(nights.map((n) => [n.night, n.durationMin])).toEqual([['2026-09-10', 420], ['2026-09-11', 420]])
  })

  it('ignores zero-length and inverted samples', () => {
    expect(aggregateSleep([sample('2026-09-10 02:00:00', '2026-09-10 02:00:00', 'asleep', 'W', true)])).toEqual([])
    expect(aggregateSleep([sample('2026-09-10 03:00:00', '2026-09-10 02:00:00', 'asleep', 'W', true)])).toEqual([])
  })
})

describe('aggregateDaily', () => {
  const s = (day: string, value: number, source: string, watch: boolean): DailySample => ({ day, offsetMin: 480, value, source, watch })

  it('sums the Watch alone on days it reported, otherwise the largest single source', () => {
    const out = aggregateDaily([
      s('2026-09-10', 3000, 'iPhone', false), s('2026-09-10', 1200, 'iPhone', false),
      s('2026-09-10', 3500, 'Watch', true), s('2026-09-10', 2300, 'Watch', true),
      s('2026-09-11', 2500, 'iPhone', false), s('2026-09-11', 400, 'iPhone', false), s('2026-09-11', 1000, 'Pedometer++', false),
    ], 'sum')
    expect(out).toEqual([
      { day: '2026-09-10', value: 5800, ts: '2026-09-10T04:00:00.000Z', samples: 2 },
      { day: '2026-09-11', value: 2900, ts: '2026-09-11T04:00:00.000Z', samples: 2 },
    ])
  })

  it('averages per day, sorted by day, skipping non-finite values', () => {
    const out = aggregateDaily([
      s('2026-09-11', 55, 'Watch', true),
      s('2026-09-10', 56, 'Watch', true), s('2026-09-10', 58, 'Watch', true), s('2026-09-10', NaN, 'Watch', true),
    ], 'mean')
    expect(out.map((d) => [d.day, d.value])).toEqual([['2026-09-10', 57], ['2026-09-11', 55]])
  })

  it('returns [] for no samples', () => {
    expect(aggregateDaily([], 'sum')).toEqual([])
  })
})

describe('HealthExportCollector', () => {
  const expected = collect([FIXTURE])

  it('builds one sleep record per night from the fixture', () => {
    expect(expected.sleep).toEqual([
      // Watch stages only: 90 + 60 + 90 + 190; the awake gap, AutoSleep and the phone's in-bed are excluded
      { night: '2026-09-10', startTs: '2026-09-09T15:30:00.000Z', endTs: '2026-09-09T22:50:00.000Z', durationMin: 430, source: 'healthkit', quality: null },
      // in-bed fallback
      { night: '2026-09-11', startTs: '2026-09-10T16:30:00.000Z', endTs: '2026-09-10T23:30:00.000Z', durationMin: 420, source: 'healthkit', quality: null },
      // 45-minute nap at 13:00 + 7 h overnight share a noon-to-noon window
      { night: '2026-09-12', startTs: '2026-09-11T05:00:00.000Z', endTs: '2026-09-11T22:40:00.000Z', durationMin: 465, source: 'healthkit', quality: null },
    ])
  })

  it('converts weights to kg and drops the one outside the window', () => {
    expect(expected.weights).toEqual([
      { ts: '2026-09-09T23:05:00.000Z', type: 'weight', value: 83.4, unit: 'kg', source: 'healthkit' },
      { ts: '2026-09-10T23:02:10.000Z', type: 'weight', value: 83.55, unit: 'kg', source: 'healthkit' },
    ])
  })

  it('produces daily resting HR, HRV, steps and active energy', () => {
    const pairs = (k: keyof typeof expected.daily) => expected.daily[k].map((d) => [d.day, d.value])
    expect(pairs('resting_hr')).toEqual([['2026-09-10', 57], ['2026-09-11', 55]])
    expect(pairs('hrv')).toEqual([['2026-09-10', 45]])
    expect(pairs('steps')).toEqual([['2026-09-10', 5800], ['2026-09-11', 2900]]) // Watch preferred; export day omitted
    expect(pairs('active_energy')).toEqual([['2026-09-10', 400], ['2026-09-11', 250]]) // 300 kcal + 418.4 kJ
    expect(expected.warnings.some((w) => w.includes('2026-09-17'))).toBe(true)
  })

  it('maps workouts, reading distance and heart rate from statistics or attributes', () => {
    expect(expected.workouts).toEqual([
      { sessionId: null, modality: 'Running', durationMin: 31, distanceKm: 5.02, avgHr: 149, ts: '2026-09-10T10:00:00.000Z', source: 'healthkit' },
      { sessionId: null, modality: 'Strength training', durationMin: 52, distanceKm: null, avgHr: 112, ts: '2026-09-11T11:00:00.000Z', source: 'healthkit' },
      { sessionId: null, modality: 'Walking', durationMin: 40, distanceKm: 3.22, avgHr: null, ts: '2026-09-12T00:00:00.000Z', source: 'healthkit' },
    ])
  })

  it('reports the covered date range', () => {
    expect(expected.from).toBe('2026-09-10')
    expect(expected.to).toBe('2026-09-17')
  })

  it('gives the same result however the text is chunked', () => {
    for (const size of [1, 13, 64, 257, 1024]) {
      const chunks: string[] = []
      for (let i = 0; i < FIXTURE.length; i += size) chunks.push(FIXTURE.slice(i, i + size))
      expect(collect(chunks)).toEqual(expected)
    }
  })

  it('honours the days window', () => {
    const c = new HealthExportCollector(6, NOW) // 12 Sep … 17 Sep
    c.push(FIXTURE)
    const d = c.finish()
    expect(d.sleep.map((n) => n.night)).toEqual(['2026-09-12'])
    expect(d.weights).toEqual([])
    expect(d.workouts.map((w) => w.modality)).toEqual(['Walking'])
  })

  it('counts malformed records instead of throwing', () => {
    const c = new HealthExportCollector(90, NOW)
    c.push('<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="not a date" value="80"/>')
    c.push('<Record type="HKQuantityTypeIdentifierBodyMass" unit="oz" startDate="2026-09-10 07:00:00 +0800" value="80"/>')
    c.push('<Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-09-10 07:00:00 +0800" value="lots"/>')
    const d = c.finish()
    expect(d.weights).toEqual([])
    expect(d.warnings.join(' ')).toMatch(/2 record\(s\)/)
    expect(d.warnings.join(' ')).toMatch(/oz \(body mass\)/)
  })
})

describe('importAppleHealthExport', () => {
  beforeEach(() => {
    store.sleep.length = 0
    store.body.length = 0
    store.health.length = 0
    store.cardio.length = 0
    store.transactions = 0
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  const xmlBytes = strToU8(FIXTURE)
  const COUNTS = { sleepNights: 3, weights: 2, restingHr: 2, hrv: 1, steps: 2, activeEnergy: 2, workouts: 3 }

  it('imports a bare export.xml streamed in small chunks (multi-byte characters split across chunks)', async () => {
    const phases: string[] = []
    let last = { bytesRead: 0, totalBytes: 0 }
    const summary = await importAppleHealthExport(fakeFile(xmlBytes, 'export.xml', 101), {
      onProgress: (p) => { if (phases[phases.length - 1] !== p.phase) phases.push(p.phase); last = p },
    })
    expect(summary).toMatchObject({ ...COUNTS, from: '2026-09-10', to: '2026-09-17', skipped: 0 })
    expect(phases).toEqual(['parsing', 'saving'])
    expect(last).toMatchObject({ bytesRead: xmlBytes.length, totalBytes: xmlBytes.length })
    expect(store.transactions).toBe(1)
    expect(store.sleep).toHaveLength(3)
    expect(store.body.map((m) => m.value)).toEqual([83.4, 83.55])
    expect(store.health.find((m) => m.type === 'steps')).toEqual({ ts: '2026-09-10T04:00:00.000Z', type: 'steps', value: 5800, unit: 'count', source: 'healthkit' })
    expect(store.health.find((m) => m.type === 'resting_hr')).toMatchObject({ value: 57, unit: 'bpm' })
    expect(store.health.find((m) => m.type === 'hrv')).toMatchObject({ value: 45, unit: 'ms' })
    expect(store.health.find((m) => m.type === 'active_energy')).toMatchObject({ value: 400, unit: 'kcal' })
    expect(store.cardio.map((c) => c.modality)).toEqual(['Running', 'Strength training', 'Walking'])
  })

  it('finds apple_health_export/export.xml inside export.zip and ignores the other entries', async () => {
    const zipped = zipSync({
      'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument><Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-09-13 07:00:00 +0800" value="1"/></ClinicalDocument>'),
      'apple_health_export/workout-routes/route_2026-09-10_6.31pm.gpx': strToU8('<gpx/>'),
      'apple_health_export/export.xml': xmlBytes,
      'apple_health_export/electrocardiograms/ecg_2026-09-01.csv': strToU8('Name,Alex Tan'),
    })
    const phases = new Set<string>()
    const summary = await importAppleHealthExport(fakeFile(zipped, 'export.zip', 500), { onProgress: (p) => phases.add(p.phase) })
    expect(summary).toMatchObject({ ...COUNTS, skipped: 0 })
    expect([...phases]).toEqual(['unzipping', 'parsing', 'saving'])
    expect(store.body.map((m) => m.value)).toEqual([83.4, 83.55]) // nothing from export_cda.xml
  })

  it('is idempotent: importing the same export again writes nothing', async () => {
    await importAppleHealthExport(fakeFile(xmlBytes, 'export.xml', 4096))
    const before = JSON.stringify(store)
    const again = await importAppleHealthExport(fakeFile(xmlBytes, 'export.xml', 4096))
    expect(again).toMatchObject({ sleepNights: 0, weights: 0, restingHr: 0, hrv: 0, steps: 0, activeEnergy: 0, workouts: 0, skipped: 15 })
    expect(JSON.stringify({ ...store, transactions: 1 })).toBe(before)
  })

  it('skips a night or day that already has a row and says so when it was demo data', async () => {
    store.sleep.push({ startTs: '2026-09-09T16:50:00.000Z', endTs: '2026-09-09T23:00:00.000Z', durationMin: 370, source: 'seed', quality: null }) // woke 07:00 on the 10th
    store.health.push({ ts: '2026-09-10T22:30:00.000Z', type: 'resting_hr', value: 57, unit: 'bpm', source: 'seed' }) // 06:30 on the 11th
    const summary = await importAppleHealthExport(fakeFile(xmlBytes, 'export.xml', 4096))
    expect(summary).toMatchObject({ sleepNights: 2, restingHr: 1, skipped: 2 })
    expect(summary.warnings.join(' ')).toMatch(/2 row\(s\) were skipped because demo data/)
  })

  it('honours opts.days', async () => {
    const summary = await importAppleHealthExport(fakeFile(xmlBytes, 'export.xml', 4096), { days: 6 })
    expect(summary).toMatchObject({ sleepNights: 1, weights: 0, restingHr: 0, hrv: 0, steps: 0, activeEnergy: 0, workouts: 1, from: '2026-09-12' })
  })

  it('rejects a zip without export.xml and a file that is not a Health export', async () => {
    const zipped = zipSync({ 'photos/readme.txt': strToU8('hello') })
    await expect(importAppleHealthExport(fakeFile(zipped, 'photos.zip', 500))).rejects.toThrow(/No export\.xml/)
    await expect(importAppleHealthExport(fakeFile(strToU8('<html><body>hi</body></html>'), 'page.xml', 500))).rejects.toThrow(/does not look like/)
    expect(store.transactions).toBe(0)
  })

  it('warns instead of failing when the export has nothing recent', async () => {
    const old = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2020-01-01 09:00:00 +0800" value="10"/></HealthData>'
    const summary = await importAppleHealthExport(fakeFile(strToU8(old), 'export.xml', 500))
    expect(summary).toMatchObject({ steps: 0, skipped: 0, from: null, to: null })
    expect(summary.warnings.join(' ')).toMatch(/No sleep, weight/)
  })
})
