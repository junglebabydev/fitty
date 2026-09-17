// On-device importer for the Apple Health "Export All Health Data" archive.
//
// Works in the plain PWA (no native shell): the user picks export.zip (or the unzipped
// export.xml) and it is streamed — unzip → UTF-8 decode → incremental tag scan — so a
// multi-hundred-MB export never sits fully in memory. Only the last `days` are kept.
//
// All parsing / aggregation lives in the pure helpers below (no db, no DOM) and is unit-tested
// in __tests__/healthExport.test.ts. Only `importAppleHealthExport` touches the database.
//
// Day grouping uses the wall clock written in the export itself ("2026-09-10 07:00:12 +0800"),
// not the clock of the machine running the import, so results do not depend on the local TZ.
import { Inflate, Unzip, UnzipPassThrough, type AsyncFlateStreamHandler, type UnzipDecoder } from 'fflate'
import { db } from '../db/database'
import {
  addBodyMetric,
  addCardio,
  addHealthMetric,
  addSleepRecord,
  getBodyMetrics,
  getCardio,
  getHealthMetrics,
  getSleepRecords,
} from '../db/repositories'
import type { BodyMetric, CardioSession, HealthMetric, SleepRecord } from '../domain/types'

export interface HealthImportSummary {
  sleepNights: number
  weights: number
  restingHr: number
  hrv: number
  steps: number
  activeEnergy: number
  workouts: number
  from: string | null
  to: string | null
  skipped: number
  warnings: string[]
}

export type HealthImportPhase = 'unzipping' | 'parsing' | 'saving'

export interface HealthImportOptions {
  days?: number
  onProgress?: (p: { bytesRead: number; totalBytes: number; phase: string }) => void
}

const DAY_MS = 86_400_000
const HALF_DAY_MS = DAY_MS / 2

// ─── Attribute + date parsing ────────────────────────────────────────────────

const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body] ?? whole
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/** Tolerant attribute parser for one start tag: either quote style, any spacing, entities decoded. */
export function parseAttributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(tag)) !== null) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
  return out
}

/** An instant plus the UTC offset it was written with, so the original wall clock can be rebuilt. */
export interface HealthDate {
  ms: number
  offsetMin: number
}

const DATE_RE = /^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?\s*$/

/** Parses Apple Health's "2026-09-10 07:00:12 +0800". A missing offset is read as UTC. */
export function parseHealthDate(s: string | undefined | null): HealthDate | null {
  if (!s) return null
  const m = DATE_RE.exec(s)
  if (!m) return null
  const offsetMin = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
  if (!Number.isFinite(utc)) return null
  return { ms: utc - offsetMin * 60_000, offsetMin }
}

/** 'YYYY-MM-DD' on the wall clock that wrote the sample. */
export function wallDay(ms: number, offsetMin: number): string {
  return new Date(ms + offsetMin * 60_000).toISOString().slice(0, 10)
}

/** Wake date of the noon-to-noon night a moment belongs to: 12:00 on day D-1 up to 11:59 on day D → D. */
export function nightOf(ms: number, offsetMin: number): string {
  return wallDay(ms + HALF_DAY_MS, offsetMin)
}

/** ISO timestamp for 12:00 wall-clock on `day`; used as the single timestamp of a per-day metric. */
export function noonIso(day: string, offsetMin: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - offsetMin * 60_000).toISOString()
}

// ─── Incremental tag scanning ────────────────────────────────────────────────

export type HealthTagName = 'Record' | 'Workout' | 'WorkoutStatistics' | 'ExportDate'

export interface RawTag {
  name: HealthTagName
  /** The whole start tag, `<Record …>` or `<Record …/>`. */
  text: string
}

const TAG_NAMES: HealthTagName[] = ['Record', 'WorkoutStatistics', 'Workout', 'ExportDate']
// Quote-aware so a literal '>' inside an attribute value does not end the tag. The name must be followed
// by whitespace, '/' or '>' so <Workout does not match <WorkoutEvent / <WorkoutRoute, and the DTD's
// <!ELEMENT Record …> never matches because of the '!'. Single-char alternatives only (no nested '+').
const TAG_RE = /<(Record|WorkoutStatistics|Workout|ExportDate)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/g
const OPEN_RE = /<(?:Record|WorkoutStatistics|Workout|ExportDate)(?=[\s/>])/g
const MAX_OPEN_LEN = '<WorkoutStatistics'.length

/**
 * Pulls every complete start tag of interest out of `buffer`. `rest` is the unfinished tail (a tag, or
 * even a tag name, cut by the chunk boundary) that must be prepended to the next chunk.
 */
export function extractTags(buffer: string): { tags: RawTag[]; rest: string } {
  const tags: RawTag[] = []
  let lastEnd = 0
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(buffer)) !== null) {
    tags.push({ name: m[1] as HealthTagName, text: m[0] })
    lastEnd = TAG_RE.lastIndex
  }
  // Any tag of interest opened after the last complete one is, by construction, unfinished.
  OPEN_RE.lastIndex = lastEnd
  const open = OPEN_RE.exec(buffer)
  if (open) return { tags, rest: buffer.slice(open.index) }
  // The buffer may end inside the tag name itself ("<Rec", or "<Workout" with nothing after it yet).
  const lt = buffer.lastIndexOf('<')
  if (lt >= lastEnd && buffer.length - lt <= MAX_OPEN_LEN) {
    const tail = buffer.slice(lt)
    if (TAG_NAMES.some((n) => `<${n}`.startsWith(tail))) return { tags, rest: tail }
  }
  return { tags, rest: '' }
}

// ─── Units, sources, workout names ───────────────────────────────────────────

export function toKg(value: number, unit: string | undefined): number | null {
  switch ((unit ?? 'kg').trim().toLowerCase()) {
    case 'kg': return value
    case 'g': return value / 1000
    case 'lb': case 'lbs': return value * 0.45359237
    case 'st': return value * 6.35029318
    default: return null
  }
}

export function toKcal(value: number, unit: string | undefined): number | null {
  switch ((unit ?? 'kcal').trim().toLowerCase()) {
    case 'kcal': case 'cal': return value // Apple writes dietary/large calories as "Cal" or "kcal"
    case 'kj': return value / 4.184
    default: return null
  }
}

export function toKm(value: number, unit: string | undefined): number | null {
  switch ((unit ?? 'km').trim().toLowerCase()) {
    case 'km': return value
    case 'm': return value / 1000
    case 'mi': return value * 1.609344
    case 'yd': return value * 0.0009144
    case 'ft': return value * 0.0003048
    default: return null
  }
}

/** The watch can be renamed, so also look at the HKDevice description ("name:Apple Watch, … model:Watch"). */
export function isWatchSource(attrs: Record<string, string>): boolean {
  return /watch/i.test(attrs.sourceName ?? '') || /\bWatch/.test(attrs.device ?? '')
}

const WORKOUT_NAMES: Record<string, string> = {
  Running: 'Running',
  Walking: 'Walking',
  Hiking: 'Hiking',
  Cycling: 'Cycling',
  Swimming: 'Swimming',
  TraditionalStrengthTraining: 'Strength training',
  FunctionalStrengthTraining: 'Strength training',
  HighIntensityIntervalTraining: 'HIIT',
  Yoga: 'Yoga',
  Pilates: 'Pilates',
  Rowing: 'Rowing',
  Elliptical: 'Elliptical',
  StairClimbing: 'Stair climbing',
  Stairs: 'Stair climbing',
  CoreTraining: 'Core training',
  Flexibility: 'Flexibility',
  MindAndBody: 'Mind and body',
  MixedCardio: 'Mixed cardio',
  CrossTraining: 'Cross training',
  Cooldown: 'Cooldown',
  Dance: 'Dance',
  Other: 'Workout',
}

/** 'HKWorkoutActivityTypeRunning' → 'Running'. Unknown types are de-camel-cased ('JumpRope' → 'Jump rope'). */
export function mapWorkoutType(activityType: string | undefined | null): string {
  const key = (activityType ?? '').replace(/^HKWorkoutActivityType/, '')
  if (!key) return 'Workout'
  if (WORKOUT_NAMES[key]) return WORKOUT_NAMES[key]
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ─── Sleep ───────────────────────────────────────────────────────────────────

export interface SleepSample {
  startMs: number
  endMs: number
  offsetMin: number
  stage: 'asleep' | 'inBed'
  source: string
  watch: boolean
}

/** AsleepCore / Deep / REM / Unspecified and the pre-iOS 16 "Asleep" count as sleep; Awake is ignored. */
export function sleepStage(value: string | undefined): 'asleep' | 'inBed' | null {
  const v = (value ?? '').replace(/^HKCategoryValueSleepAnalysis/, '')
  if (v === 'InBed') return 'inBed'
  if (v.startsWith('Asleep')) return 'asleep'
  return null
}

export type NightSleep = Omit<SleepRecord, 'id'> & { night: string }

/** Watch samples win when present; otherwise the single source with the most minutes (never a sum across apps). */
function preferredSource<T extends { source: string; watch: boolean }>(samples: T[], weight: (s: T) => number): T[] {
  const watch = samples.filter((s) => s.watch)
  if (watch.length) return watch
  const totals = new Map<string, number>()
  for (const s of samples) totals.set(s.source, (totals.get(s.source) ?? 0) + weight(s))
  let best = ''
  let bestTotal = -Infinity
  for (const [source, total] of totals) if (total > bestTotal) { best = source; bestTotal = total }
  return samples.filter((s) => s.source === best)
}

/**
 * One record per night. Samples are grouped by wake date using a noon-to-noon window on their start time;
 * asleep stages are used when the night has any, else InBed as a fallback. Overlapping intervals are merged
 * before summing, so two devices recording the same hour never double-count.
 */
export function aggregateSleep(samples: SleepSample[]): NightSleep[] {
  const byNight = new Map<string, SleepSample[]>()
  for (const s of samples) {
    if (!(s.endMs > s.startMs)) continue
    const night = nightOf(s.startMs, s.offsetMin)
    const list = byNight.get(night)
    if (list) list.push(s)
    else byNight.set(night, [s])
  }
  const out: NightSleep[] = []
  for (const [night, list] of byNight) {
    const asleep = list.filter((s) => s.stage === 'asleep')
    const pool = asleep.length ? asleep : list.filter((s) => s.stage === 'inBed')
    const chosen = preferredSource(pool, (s) => s.endMs - s.startMs).sort((a, b) => a.startMs - b.startMs)
    if (!chosen.length) continue
    let totalMs = 0
    let curStart = chosen[0].startMs
    let curEnd = chosen[0].endMs
    for (const s of chosen.slice(1)) {
      if (s.startMs <= curEnd) { curEnd = Math.max(curEnd, s.endMs); continue }
      totalMs += curEnd - curStart
      curStart = s.startMs
      curEnd = s.endMs
    }
    totalMs += curEnd - curStart
    const durationMin = Math.round(totalMs / 60_000)
    if (durationMin <= 0) continue
    out.push({
      night,
      startTs: new Date(chosen[0].startMs).toISOString(),
      endTs: new Date(curEnd).toISOString(),
      durationMin,
      source: 'healthkit',
      quality: null,
    })
  }
  return out.sort((a, b) => (a.night < b.night ? -1 : 1))
}

// ─── Daily metrics ───────────────────────────────────────────────────────────

export interface DailySample {
  day: string
  offsetMin: number
  value: number
  source: string
  watch: boolean
}

export interface DailyValue {
  day: string
  value: number
  /** 12:00 wall-clock on `day`, as ISO. */
  ts: string
  samples: number
}

/**
 * 'mean' (resting HR, HRV): average of the day's samples, Watch-only when the Watch reported that day.
 * 'sum' (steps, active energy): iPhone and Watch both count the same steps, so sum the Watch alone when it
 * reported that day, otherwise the single largest source.
 */
export function aggregateDaily(samples: DailySample[], mode: 'mean' | 'sum'): DailyValue[] {
  const byDay = new Map<string, DailySample[]>()
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue
    const list = byDay.get(s.day)
    if (list) list.push(s)
    else byDay.set(s.day, [s])
  }
  const out: DailyValue[] = []
  for (const [day, list] of byDay) {
    const watch = list.filter((s) => s.watch)
    const chosen = mode === 'sum' ? preferredSource(list, (s) => s.value) : watch.length ? watch : list
    const total = chosen.reduce((acc, s) => acc + s.value, 0)
    out.push({
      day,
      value: mode === 'sum' ? total : total / chosen.length,
      ts: noonIso(day, chosen[0].offsetMin),
      samples: chosen.length,
    })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1))
}

// ─── Collector: tags in, domain rows out (pure) ──────────────────────────────

const RECORD_TYPES = {
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep',
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_hr',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active_energy',
} as const
type RecordKind = (typeof RECORD_TYPES)[keyof typeof RECORD_TYPES]
type DailyKind = Exclude<RecordKind, 'sleep' | 'weight'>

// Most of an export is heart-rate / distance / basal-energy records; reject those before parsing attributes.
const WANTED_TYPE_RE = /\btype\s*=\s*["'](HK(?:Category|Quantity)TypeIdentifier\w+)["']/

export interface HealthExportData {
  sleep: NightSleep[]
  weights: Omit<BodyMetric, 'id'>[]
  daily: Record<DailyKind, DailyValue[]>
  workouts: Omit<CardioSession, 'id'>[]
  from: string | null
  to: string | null
  warnings: string[]
}

interface PendingWorkout {
  modality: string
  startMs: number
  durationMin: number
  distanceKm: number | null
  avgHr: number | null
}

/** Feed it decoded XML text in any chunking; `finish()` returns rows ready to save. No db, no I/O. */
export class HealthExportCollector {
  private rest = ''
  private readonly cutoffByOffset = new Map<number, string>()
  private readonly sleep: SleepSample[] = []
  private readonly weights = new Map<string, Omit<BodyMetric, 'id'>>()
  private readonly daily: Record<DailyKind, DailySample[]> = { resting_hr: [], hrv: [], steps: [], active_energy: [] }
  private readonly workouts: PendingWorkout[] = []
  private currentWorkout: PendingWorkout | null = null
  private exportDay: string | null = null
  private from: string | null = null
  private to: string | null = null
  private malformed = 0
  private unknownUnits = new Set<string>()
  /** Start tags seen at all, in or out of the window — 0 means this was not a Health export. */
  tagsSeen = 0

  constructor(private readonly days: number, private readonly nowMs: number) {}

  push(text: string): void {
    const { tags, rest } = extractTags(this.rest + text)
    // A tag is a few hundred bytes; a huge remainder means malformed input, not a split tag.
    this.rest = rest.length > 1_000_000 ? '' : rest
    for (const t of tags) this.handle(t)
  }

  private inWindow(day: string, offsetMin: number): boolean {
    let cutoff = this.cutoffByOffset.get(offsetMin)
    if (!cutoff) {
      cutoff = wallDay(this.nowMs - (Math.max(1, Math.floor(this.days)) - 1) * DAY_MS, offsetMin)
      this.cutoffByOffset.set(offsetMin, cutoff)
    }
    return day >= cutoff
  }

  private touch(day: string): void {
    if (!this.from || day < this.from) this.from = day
    if (!this.to || day > this.to) this.to = day
  }

  private handle(tag: RawTag): void {
    this.tagsSeen++
    if (tag.name === 'Record') {
      const type = WANTED_TYPE_RE.exec(tag.text)?.[1]
      const kind = type ? RECORD_TYPES[type as keyof typeof RECORD_TYPES] : undefined
      if (kind) this.handleRecord(kind, parseAttributes(tag.text))
    } else if (tag.name === 'Workout') {
      this.handleWorkout(parseAttributes(tag.text))
    } else if (tag.name === 'WorkoutStatistics') {
      if (this.currentWorkout) this.handleWorkoutStats(this.currentWorkout, parseAttributes(tag.text))
    } else {
      const d = parseHealthDate(parseAttributes(tag.text).value)
      if (d) this.exportDay = wallDay(d.ms, d.offsetMin)
    }
  }

  private handleRecord(kind: RecordKind, a: Record<string, string>): void {
    const start = parseHealthDate(a.startDate)
    if (!start) { this.malformed++; return }

    if (kind === 'sleep') {
      const end = parseHealthDate(a.endDate)
      const stage = sleepStage(a.value)
      if (!end) { this.malformed++; return }
      if (!stage) return
      const night = nightOf(start.ms, start.offsetMin)
      if (!this.inWindow(night, start.offsetMin)) return
      this.touch(night)
      this.sleep.push({ startMs: start.ms, endMs: end.ms, offsetMin: start.offsetMin, stage, source: a.sourceName ?? '', watch: isWatchSource(a) })
      return
    }

    const day = wallDay(start.ms, start.offsetMin)
    if (!this.inWindow(day, start.offsetMin)) return
    const raw = Number(a.value)
    if (!Number.isFinite(raw)) { this.malformed++; return }

    if (kind === 'weight') {
      const kg = toKg(raw, a.unit)
      if (kg == null) { this.unknownUnits.add(`${a.unit} (body mass)`); return }
      const ts = new Date(start.ms).toISOString()
      this.touch(day)
      this.weights.set(ts, { ts, type: 'weight', value: Math.round(kg * 100) / 100, unit: 'kg', source: 'healthkit' })
      return
    }

    let value: number | null = raw
    if (kind === 'active_energy') value = toKcal(raw, a.unit)
    if (value == null) { this.unknownUnits.add(`${a.unit} (active energy)`); return }
    this.touch(day)
    this.daily[kind].push({ day, offsetMin: start.offsetMin, value, source: a.sourceName ?? '', watch: isWatchSource(a) })
  }

  private handleWorkout(a: Record<string, string>): void {
    this.currentWorkout = null
    const start = parseHealthDate(a.startDate)
    if (!start) { this.malformed++; return }
    const day = wallDay(start.ms, start.offsetMin)
    if (!this.inWindow(day, start.offsetMin)) return
    const end = parseHealthDate(a.endDate)
    let minutes = Number(a.duration)
    const unit = (a.durationUnit ?? 'min').toLowerCase()
    if (Number.isFinite(minutes)) minutes = unit === 's' || unit === 'sec' ? minutes / 60 : unit === 'hr' || unit === 'h' ? minutes * 60 : minutes
    else minutes = end ? (end.ms - start.ms) / 60_000 : NaN
    if (!Number.isFinite(minutes) || minutes <= 0) { this.malformed++; return }
    // iOS ≤ 15 exports carry the distance on the element itself; newer ones use <WorkoutStatistics> children.
    const distance = a.totalDistance != null ? toKm(Number(a.totalDistance), a.totalDistanceUnit) : null
    this.touch(day)
    this.currentWorkout = {
      modality: mapWorkoutType(a.workoutActivityType),
      startMs: start.ms,
      durationMin: Math.max(1, Math.round(minutes)),
      distanceKm: distance != null && Number.isFinite(distance) && distance > 0 ? distance : null,
      avgHr: null,
    }
    this.workouts.push(this.currentWorkout)
  }

  private handleWorkoutStats(w: PendingWorkout, a: Record<string, string>): void {
    const type = a.type ?? ''
    if (type === 'HKQuantityTypeIdentifierHeartRate') {
      const avg = Number(a.average)
      if (Number.isFinite(avg) && avg > 0) w.avgHr = Math.round(avg)
    } else if (type.startsWith('HKQuantityTypeIdentifierDistance') && w.distanceKm == null) {
      const km = toKm(Number(a.sum), a.unit)
      if (km != null && Number.isFinite(km) && km > 0) w.distanceKm = km
    }
  }

  finish(): HealthExportData {
    const warnings: string[] = []
    // The export day is still in progress: a partial step / energy total would be stored once and then
    // never corrected, because later imports skip days that already have a row.
    const complete = (list: DailySample[]) => (this.exportDay ? list.filter((s) => s.day !== this.exportDay) : list)
    const partial = this.exportDay != null && [...this.daily.steps, ...this.daily.active_energy].some((s) => s.day === this.exportDay)
    if (partial) warnings.push(`Steps and active energy for ${this.exportDay} (the export day) were left out because the day was incomplete.`)
    if (this.malformed) warnings.push(`${this.malformed} record(s) had an unreadable date, value or duration and were ignored.`)
    if (this.unknownUnits.size) warnings.push(`Ignored records with unsupported units: ${[...this.unknownUnits].join(', ')}.`)

    const round = (list: DailyValue[], digits: number) => {
      const f = 10 ** digits
      return list.map((d) => ({ ...d, value: Math.round(d.value * f) / f }))
    }
    const seen = new Set<string>()
    const workouts: Omit<CardioSession, 'id'>[] = []
    for (const w of this.workouts.sort((a, b) => a.startMs - b.startMs)) {
      const ts = new Date(w.startMs).toISOString()
      if (seen.has(`${w.modality}|${ts}`)) continue
      seen.add(`${w.modality}|${ts}`)
      workouts.push({
        sessionId: null,
        modality: w.modality,
        durationMin: w.durationMin,
        distanceKm: w.distanceKm == null ? null : Math.round(w.distanceKm * 100) / 100,
        avgHr: w.avgHr,
        ts,
        source: 'healthkit',
      })
    }
    return {
      sleep: aggregateSleep(this.sleep),
      weights: [...this.weights.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1)),
      daily: {
        resting_hr: round(aggregateDaily(this.daily.resting_hr, 'mean'), 1),
        hrv: round(aggregateDaily(this.daily.hrv, 'mean'), 1),
        steps: round(aggregateDaily(complete(this.daily.steps), 'sum'), 0),
        active_energy: round(aggregateDaily(complete(this.daily.active_energy), 'sum'), 0),
      },
      workouts,
      from: this.from,
      to: this.to,
      warnings,
    }
  }
}

// ─── Streaming I/O ───────────────────────────────────────────────────────────

/** apple_health_export/export.xml — the name is localised on some phones, so accept any top-level .xml except the CDA copy. */
export function isExportXmlName(name: string): boolean {
  const parts = name.split('/')
  const base = parts[parts.length - 1]
  if (parts.length > 2 || parts[0] === '__MACOSX' || base.startsWith('._')) return false
  return /\.xml$/i.test(base) && !/_cda\.xml$/i.test(base)
}

/**
 * fflate buffers the compressed bytes of any entry that is never started, so every entry is started, and this
 * decoder inflates only the export XML; export_cda.xml, GPX routes and ECG CSVs are dropped without inflating.
 */
class ExportOnlyInflate implements UnzipDecoder {
  static compression = 8
  ondata!: AsyncFlateStreamHandler
  private readonly inflate: Inflate | null
  constructor(name: string) {
    this.inflate = isExportXmlName(name) ? new Inflate((data, final) => this.ondata(null, data, final)) : null
  }
  push(chunk: Uint8Array, final: boolean): void {
    if (!this.inflate) { if (final) this.ondata(null, new Uint8Array(0), true); return }
    try {
      this.inflate.push(chunk, final)
    } catch (e) {
      this.ondata(e as Parameters<AsyncFlateStreamHandler>[0], new Uint8Array(0), final)
    }
  }
}

const ZIP_SLICE = 64 * 1024 // XML deflates ~20:1, so this bounds each inflated burst to roughly 1–2 MB.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function streamExport(
  file: File,
  onText: (text: string) => void,
  onProgress: (bytesRead: number, phase: HealthImportPhase) => void,
): Promise<{ zip: boolean; foundXml: boolean }> {
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8')
  let bytesRead = 0
  let zip: boolean | null = null
  let foundXml = false
  let done = false
  let failure: unknown = null
  let sinceTick = 0

  const unzip = new Unzip((entry) => {
    const target = !foundXml && isExportXmlName(entry.name)
    if (target) foundXml = true
    entry.ondata = (err, data, final) => {
      if (!target) return
      if (err) { failure = err; return }
      const text = decoder.decode(data, { stream: !final })
      if (text) onText(text)
      if (final) done = true
    }
    entry.start()
  })
  unzip.register(ExportOnlyInflate)
  unzip.register(UnzipPassThrough)

  try {
    for (;;) {
      const { value, done: eof } = await reader.read()
      if (value?.length) {
        if (zip === null) zip = value[0] === 0x50 && value[1] === 0x4b // "PK"
        bytesRead += value.length
        if (zip) {
          for (let i = 0; i < value.length && !done && !failure; i += ZIP_SLICE) unzip.push(value.subarray(i, i + ZIP_SLICE), false)
        } else {
          const text = decoder.decode(value, { stream: true })
          if (text) onText(text)
        }
        onProgress(bytesRead, zip ? 'unzipping' : 'parsing')
        sinceTick += value.length
        if (sinceTick >= 4 * 1024 * 1024) { sinceTick = 0; await tick() } // let the progress UI paint
      }
      if (failure) throw failure
      if (eof || done) break
    }
    if (zip === false) {
      const tail = decoder.decode()
      if (tail) onText(tail)
    }
  } finally {
    // export.xml is complete (or we failed): no need to read the CDA copy, routes and ECGs that follow.
    await reader.cancel().catch(() => {})
  }
  return { zip: zip === true, foundXml }
}

// ─── Public entry point ──────────────────────────────────────────────────────

const SAVE_BATCH = 500

/** Local (device clock) date of an existing row, matching how the rest of the app reads `ts`. */
function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function importAppleHealthExport(file: File, opts: HealthImportOptions = {}): Promise<HealthImportSummary> {
  const days = Math.max(1, Math.floor(opts.days ?? 90))
  const totalBytes = file.size
  const report = (bytesRead: number, phase: HealthImportPhase) => opts.onProgress?.({ bytesRead, totalBytes, phase })

  const collector = new HealthExportCollector(days, Date.now())
  const { zip, foundXml } = await streamExport(file, (text) => collector.push(text), report)
  if (zip && !foundXml) throw new Error('No export.xml found in this zip. Pick the export.zip created by Health → Export All Health Data.')
  if (!collector.tagsSeen) {
    throw new Error(zip
      ? 'The zip could not be read as an Apple Health export. Unzip it in Files and pick apple_health_export/export.xml instead.'
      : 'This file does not look like an Apple Health export.xml.')
  }

  report(totalBytes, 'parsing')
  const data = collector.finish()
  const summary: HealthImportSummary = {
    sleepNights: 0, weights: 0, restingHr: 0, hrv: 0, steps: 0, activeEnergy: 0, workouts: 0,
    from: data.from, to: data.to, skipped: 0, warnings: [...data.warnings],
  }

  // Dedupe against what is already stored: exact timestamp, plus same night / same day for the per-day rows.
  const window = days + 2
  const writes: (() => void)[] = []
  let seedClash = 0

  const haveSleep = new Map<string, string>()
  for (const r of getSleepRecords(window)) {
    haveSleep.set(`${r.startTs}|${r.endTs}`, r.source)
    haveSleep.set(localDay(Date.parse(r.startTs) + HALF_DAY_MS), r.source)
  }
  for (const { night, ...rec } of data.sleep) {
    const clash = haveSleep.get(`${rec.startTs}|${rec.endTs}`) ?? haveSleep.get(night)
    if (clash) { summary.skipped++; if (clash === 'seed') seedClash++; continue }
    writes.push(() => { addSleepRecord(rec); summary.sleepNights++ })
  }

  const haveWeight = new Set(getBodyMetrics('weight', window).map((m) => m.ts))
  for (const w of data.weights) {
    if (haveWeight.has(w.ts)) { summary.skipped++; continue }
    writes.push(() => { addBodyMetric(w); summary.weights++ })
  }

  const dailyKinds: [DailyKind, 'restingHr' | 'hrv' | 'steps' | 'activeEnergy', string][] = [
    ['resting_hr', 'restingHr', 'bpm'], ['hrv', 'hrv', 'ms'], ['steps', 'steps', 'count'], ['active_energy', 'activeEnergy', 'kcal'],
  ]
  for (const [type, field, unit] of dailyKinds) {
    const have = new Map<string, string>()
    for (const m of getHealthMetrics(type, window)) {
      have.set(m.ts, m.source)
      have.set(localDay(Date.parse(m.ts)), m.source)
    }
    for (const d of data.daily[type]) {
      const clash = have.get(d.ts) ?? have.get(d.day)
      if (clash) { summary.skipped++; if (clash === 'seed') seedClash++; continue }
      const row: Omit<HealthMetric, 'id'> = { ts: d.ts, type, value: d.value, unit, source: 'healthkit' }
      writes.push(() => { addHealthMetric(row); summary[field]++ })
    }
  }

  const haveCardio = new Set(getCardio(window).map((c) => `${c.modality}|${c.ts}`))
  for (const c of data.workouts) {
    if (haveCardio.has(`${c.modality}|${c.ts}`)) { summary.skipped++; continue }
    writes.push(() => { addCardio(c); summary.workouts++ })
  }

  if (seedClash) summary.warnings.push(`${seedClash} row(s) were skipped because demo data already covers those dates. Delete the demo data in Settings → Data, then import again.`)
  if (!writes.length && !summary.skipped) summary.warnings.push(`No sleep, weight, heart, activity or workout data found in the last ${days} days.`)

  report(totalBytes, 'saving')
  for (let i = 0; i < writes.length; i += SAVE_BATCH) {
    db.transaction(() => { for (const write of writes.slice(i, i + SAVE_BATCH)) write() })
    report(totalBytes, 'saving')
    if (i + SAVE_BATCH < writes.length) await tick()
  }
  return summary
}
