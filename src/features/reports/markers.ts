// Pure helpers for health-report markers. No database, no AI, no DOM: everything here is unit-tested.
// The app never interprets results: a flag only says where the printed value sits against the range PRINTED on the report.
import type { HealthReport, ReportFlag, ReportKind, ReportMarker } from '../../domain/types'
import { dateOf } from '../../lib/util'

export const REPORT_DISCLAIMER = 'Discuss results with your clinician. This app does not interpret medical results.'

export const REPORT_KINDS: ReportKind[] = ['blood', 'body_composition', 'clinical_note', 'imaging', 'other']

export const KIND_LABEL: Record<ReportKind, string> = {
  blood: 'Blood test',
  body_composition: 'Body composition',
  clinical_note: 'Clinical note',
  imaging: 'Imaging',
  other: 'Other',
}

export const FLAG_LABEL: Record<ReportFlag, string> = {
  low: 'Low',
  normal: 'In range',
  high: 'High',
  unknown: 'No range printed',
}

export const MAX_MARKERS = 80

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function text(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
}

/** Where the value sits against the PRINTED range. 'unknown' when there is no value, no range, or the range is garbled. */
export function computeFlag(value: number | null, refLow: number | null, refHigh: number | null): ReportFlag {
  if (value === null || !Number.isFinite(value)) return 'unknown'
  if (refLow === null && refHigh === null) return 'unknown'
  if (refLow !== null && refHigh !== null && refLow > refHigh) return 'unknown'
  if (refLow !== null && value < refLow) return 'low'
  if (refHigh !== null && value > refHigh) return 'high'
  return 'normal'
}

/** Accepts the model's snake_case shape or our own camelCase shape. Returns null when there is no usable name. The flag is always recomputed. */
export function normaliseMarker(raw: unknown): ReportMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = text(r.name)
  if (!name) return null
  const value = num(r.value)
  const refLow = num(r.ref_low ?? r.refLow)
  const refHigh = num(r.ref_high ?? r.refHigh)
  const valueText = text(r.value_text ?? r.valueText) || (value !== null ? String(value) : '')
  return {
    name,
    value,
    valueText,
    unit: text(r.unit, 24),
    refLow,
    refHigh,
    flag: computeFlag(value, refLow, refHigh),
    category: text(r.category, 40) || 'Other',
  }
}

export function normaliseMarkers(raw: unknown): ReportMarker[] {
  if (!Array.isArray(raw)) return []
  const out: ReportMarker[] = []
  for (const item of raw) {
    const m = normaliseMarker(item)
    if (m) out.push(m)
    if (out.length >= MAX_MARKERS) break
  }
  return out
}

const FLAG_ORDER: Record<ReportFlag, number> = { high: 0, low: 0, normal: 1, unknown: 2 }

/** Outside the printed range first, then in range, then no range; alphabetical within each. Does not mutate. */
export function sortMarkers(markers: ReportMarker[]): ReportMarker[] {
  return [...markers].sort((a, b) => FLAG_ORDER[a.flag] - FLAG_ORDER[b.flag] || a.name.localeCompare(b.name))
}

/** Groups in first-appearance order with 'Other' last; markers keep their index in the original array so edits can address them. */
export function groupByCategory(markers: ReportMarker[]): { category: string; items: { marker: ReportMarker; index: number }[] }[] {
  const groups = new Map<string, { marker: ReportMarker; index: number }[]>()
  markers.forEach((marker, index) => {
    const key = marker.category.trim() || 'Other'
    const list = groups.get(key) ?? []
    list.push({ marker, index })
    groups.set(key, list)
  })
  return [...groups.entries()]
    .sort(([a], [b]) => Number(a === 'Other') - Number(b === 'Other'))
    .map(([category, items]) => ({ category, items }))
}

/** Up to `n` markers worth showing on a card or in coach context: outside the printed range first. Markers with nothing readable are skipped. */
export function notableMarkers(markers: ReportMarker[], n = 4): ReportMarker[] {
  return sortMarkers(markers.filter((m) => m.value !== null || m.valueText !== '')).slice(0, Math.max(0, n))
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

/** The printed range as text: "3.5–5.0", "≤ 5.2", "≥ 1.0" or '' when none was printed. */
export function rangeText(m: Pick<ReportMarker, 'refLow' | 'refHigh'>): string {
  if (m.refLow !== null && m.refHigh !== null) return `${fmt(m.refLow)}–${fmt(m.refHigh)}`
  if (m.refHigh !== null) return `≤ ${fmt(m.refHigh)}`
  if (m.refLow !== null) return `≥ ${fmt(m.refLow)}`
  return ''
}

export function valueLabel(m: Pick<ReportMarker, 'value' | 'valueText' | 'unit'>): string {
  const v = m.value !== null ? fmt(m.value) : m.valueText || 'not readable'
  return m.unit ? `${v} ${m.unit}` : v
}

export interface RangeBarGeometry {
  /** Shaded printed band, 0..1 along the track. */
  bandStart: number
  bandEnd: number
  /** Marker dot position 0..1, clamped inside the track; null when the value is not numeric. */
  dot: number | null
}

/** Track geometry for a value-on-range bar. Null when the report printed no usable range (nothing to draw against). */
export function rangeBarGeometry(m: Pick<ReportMarker, 'value' | 'refLow' | 'refHigh'>): RangeBarGeometry | null {
  const { refLow, refHigh, value } = m
  if (refLow === null && refHigh === null) return null
  if (refLow !== null && refHigh !== null && refLow > refHigh) return null
  let lo: number
  let hi: number
  if (refLow !== null && refHigh !== null) {
    const pad = (refHigh - refLow) * 0.5 || Math.abs(refHigh) * 0.5 || 1
    lo = refLow - pad
    hi = refHigh + pad
  } else if (refHigh !== null) {
    const pad = Math.abs(refHigh) || 1
    lo = refHigh - pad
    hi = refHigh + pad * 0.5
  } else {
    const low = refLow as number
    const pad = Math.abs(low) || 1
    lo = low - pad
    hi = low + pad
  }
  const span = hi - lo
  const pos = (n: number) => Math.min(1, Math.max(0, (n - lo) / span))
  return {
    bandStart: refLow !== null ? pos(refLow) : 0,
    bandEnd: refHigh !== null ? pos(refHigh) : 1,
    dot: value !== null && Number.isFinite(value) ? Math.min(0.98, Math.max(0.02, pos(value))) : null,
  }
}

/** "LDL cholesterol 3.9 mmol/L [High, printed range ≤ 3.4]" — states the printed flag only, never what it means. */
export function markerContext(m: ReportMarker): string {
  const range = rangeText(m)
  return `${m.name} ${valueLabel(m)} [${FLAG_LABEL[m.flag]}${range ? `, printed range ${range}` : ''}]`
}

/** One line per report for the coach: title, date, 3–5 notable markers with their printed-range flags. */
export function buildReportContextLine(r: HealthReport, maxMarkers = 5): string {
  const date = dateOf(r.ts)
  const head = `${KIND_LABEL[r.kind] ?? 'Report'} "${r.title || r.fileName || 'Untitled'}" (${date})`
  const notable = notableMarkers(r.markers, Math.min(5, Math.max(3, maxMarkers)))
  if (!notable.length) return r.summary ? `${head}: ${r.summary}` : head
  return `${head}: ${notable.map(markerContext).join('; ')}`
}

export const MAX_CONTEXT_REPORTS = 5

/** Nothing is shared unless the user turned on 'ai.shareReports'. Newest reports first, capped. */
export function buildReportContextLines(reports: HealthReport[], share: boolean): string[] {
  if (!share) return []
  return [...reports]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, MAX_CONTEXT_REPORTS)
    .map((r) => buildReportContextLine(r))
}

/** A printed 'YYYY-MM-DD' becomes local noon of that day; anything else (or a future date typo) falls back to `fallbackIso`. */
export function reportTs(reportDate: unknown, fallbackIso: string): string {
  if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return fallbackIso
  const [y, mo, d] = reportDate.split('-').map(Number)
  const dt = new Date(y, mo - 1, d, 12, 0, 0)
  if (Number.isNaN(dt.getTime()) || dt.getMonth() !== mo - 1 || y < 1990) return fallbackIso
  return dt.toISOString()
}

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === 'string' && (REPORT_KINDS as string[]).includes(v)
}
