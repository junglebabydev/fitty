import { describe, expect, it } from 'vitest'
import type { HealthReport, ReportMarker } from '../../../domain/types'
import {
  FLAG_LABEL, buildReportContextLine, buildReportContextLines, computeFlag, groupByCategory, markerContext, normaliseMarker,
  normaliseMarkers, notableMarkers, rangeBarGeometry, rangeText, reportTs, sortMarkers, valueLabel, MAX_MARKERS,
} from '../markers'

function marker(over: Partial<ReportMarker> = {}): ReportMarker {
  const m = { name: 'LDL cholesterol', value: 3.9, valueText: '3.9', unit: 'mmol/L', refLow: null, refHigh: 3.4, category: 'Lipids', ...over }
  return { ...m, flag: over.flag ?? computeFlag(m.value, m.refLow, m.refHigh) }
}

function report(over: Partial<HealthReport> = {}): HealthReport {
  return {
    id: 1, ts: '2026-08-02T04:00:00.000Z', kind: 'blood', title: 'Lipid panel', fileName: 'lipids.pdf', mediaType: 'application/pdf',
    fileDataUrl: null, status: 'extracted', summary: 'A lipid panel from Raffles Medical.', markers: [], notes: '', ...over,
  }
}

describe('computeFlag', () => {
  it('compares the value with the printed range only', () => {
    expect(computeFlag(4.2, 3.5, 5.0)).toBe('normal')
    expect(computeFlag(3.5, 3.5, 5.0)).toBe('normal') // bounds are inclusive
    expect(computeFlag(5.0, 3.5, 5.0)).toBe('normal')
    expect(computeFlag(3.4, 3.5, 5.0)).toBe('low')
    expect(computeFlag(5.1, 3.5, 5.0)).toBe('high')
  })

  it('handles one-sided printed ranges', () => {
    expect(computeFlag(3.9, null, 3.4)).toBe('high')
    expect(computeFlag(2.0, null, 3.4)).toBe('normal')
    expect(computeFlag(0.8, 1.0, null)).toBe('low')
    expect(computeFlag(1.4, 1.0, null)).toBe('normal')
  })

  it("is 'unknown' without a value, without a printed range, or with a garbled range", () => {
    expect(computeFlag(null, 1, 2)).toBe('unknown')
    expect(computeFlag(5, null, null)).toBe('unknown')
    expect(computeFlag(5, 9, 2)).toBe('unknown')
    expect(computeFlag(Number.NaN, 1, 2)).toBe('unknown')
  })
})

describe('normaliseMarker', () => {
  it('maps the model shape (snake_case) and recomputes the flag itself', () => {
    const m = normaliseMarker({ name: ' HbA1c ', value: 6.1, value_text: '6.1', unit: '%', ref_low: 4, ref_high: 5.6, category: 'Glucose', flag: 'normal' })
    expect(m).toEqual({ name: 'HbA1c', value: 6.1, valueText: '6.1', unit: '%', refLow: 4, refHigh: 5.6, flag: 'high', category: 'Glucose' })
  })

  it('keeps unreadable or non-numeric values as text with no flag', () => {
    const m = normaliseMarker({ name: 'Urine protein', value: null, value_text: 'Negative', unit: '', ref_low: null, ref_high: null, category: '' })
    expect(m).toMatchObject({ value: null, valueText: 'Negative', flag: 'unknown', category: 'Other' })
    expect(normaliseMarker({ name: 'CRP', value: '< 5', unit: 'mg/L' })).toMatchObject({ value: null, flag: 'unknown' })
  })

  it('accepts numeric strings (decimal comma) and the camelCase shape from the manual form', () => {
    expect(normaliseMarker({ name: 'Ferritin', value: '41,5', valueText: '41,5', unit: 'ug/L', refLow: 30, refHigh: 400, category: 'Iron' }))
      .toMatchObject({ value: 41.5, refLow: 30, refHigh: 400, flag: 'normal' })
  })

  it('drops entries without a name and non-objects; caps the list', () => {
    expect(normaliseMarker({ name: '  ', value: 1 })).toBeNull()
    expect(normaliseMarker('LDL 3.9')).toBeNull()
    expect(normaliseMarkers('nope')).toEqual([])
    expect(normaliseMarkers([{ name: 'A', value: 1 }, null, { value: 2 }, { name: 'B', value: Infinity }]).map((m) => [m.name, m.value])).toEqual([['A', 1], ['B', null]])
    expect(normaliseMarkers(Array.from({ length: 200 }, (_, i) => ({ name: `M${i}`, value: i })))).toHaveLength(MAX_MARKERS)
  })
})

describe('sorting, grouping and notable markers', () => {
  const list = [
    marker({ name: 'HDL', value: 1.3, refLow: 1.0, refHigh: null }),
    marker({ name: 'Weight', value: 84, unit: 'kg', refLow: null, refHigh: null, category: '' }),
    marker({ name: 'LDL', value: 3.9 }),
    marker({ name: 'Haemoglobin', value: 12.1, unit: 'g/dL', refLow: 13, refHigh: 17, category: 'Full blood count' }),
    marker({ name: 'Blank', value: null, valueText: '', refHigh: null }),
  ]

  it('sorts outside-range first, then in range, then no range, without mutating', () => {
    const before = list.map((m) => m.name)
    expect(sortMarkers(list).map((m) => m.name)).toEqual(['Haemoglobin', 'LDL', 'HDL', 'Blank', 'Weight'])
    expect(list.map((m) => m.name)).toEqual(before)
  })

  it('groups by category in first-appearance order with Other last and keeps original indexes', () => {
    const groups = groupByCategory(list)
    expect(groups.map((g) => g.category)).toEqual(['Lipids', 'Full blood count', 'Other'])
    expect(groups[0].items.map((i) => i.index)).toEqual([0, 2, 4])
    expect(groups[2].items[0]).toMatchObject({ index: 1, marker: { name: 'Weight' } })
  })

  it('picks notable markers: flagged first, unreadable ones skipped', () => {
    expect(notableMarkers(list, 3).map((m) => m.name)).toEqual(['Haemoglobin', 'LDL', 'HDL'])
    expect(notableMarkers(list, 10).map((m) => m.name)).not.toContain('Blank')
    expect(notableMarkers(list, 0)).toEqual([])
  })
})

describe('range text and bar geometry', () => {
  it('prints the range as it was printed', () => {
    expect(rangeText({ refLow: 3.5, refHigh: 5 })).toBe('3.5–5')
    expect(rangeText({ refLow: null, refHigh: 3.4 })).toBe('≤ 3.4')
    expect(rangeText({ refLow: 1, refHigh: null })).toBe('≥ 1')
    expect(rangeText({ refLow: null, refHigh: null })).toBe('')
    expect(valueLabel({ value: 3.9, valueText: '3.9', unit: 'mmol/L' })).toBe('3.9 mmol/L')
    expect(valueLabel({ value: null, valueText: '', unit: '' })).toBe('not readable')
  })

  it('places the band in the middle half for a two-sided range and the dot by value', () => {
    const g = rangeBarGeometry({ value: 4.25, refLow: 3.5, refHigh: 5 })!
    expect(g.bandStart).toBeCloseTo(0.25)
    expect(g.bandEnd).toBeCloseTo(0.75)
    expect(g.dot).toBeCloseTo(0.5)
    expect(rangeBarGeometry({ value: 3.4, refLow: 3.5, refHigh: 5 })!.dot!).toBeLessThan(g.bandStart)
  })

  it('clamps far-out values inside the track and handles one-sided ranges', () => {
    expect(rangeBarGeometry({ value: 900, refLow: 3.5, refHigh: 5 })!.dot).toBe(0.98)
    expect(rangeBarGeometry({ value: -900, refLow: 3.5, refHigh: 5 })!.dot).toBe(0.02)
    const upper = rangeBarGeometry({ value: 3.9, refLow: null, refHigh: 3.4 })!
    expect(upper.bandStart).toBe(0)
    expect(upper.bandEnd).toBeCloseTo(2 / 3)
    expect(upper.dot!).toBeGreaterThan(upper.bandEnd)
    const lower = rangeBarGeometry({ value: 0.8, refLow: 1, refHigh: null })!
    expect(lower.bandStart).toBeCloseTo(0.5)
    expect(lower.bandEnd).toBe(1)
    expect(lower.dot!).toBeLessThan(lower.bandStart)
  })

  it('has nothing to draw without a printed range, and no dot without a number', () => {
    expect(rangeBarGeometry({ value: 84, refLow: null, refHigh: null })).toBeNull()
    expect(rangeBarGeometry({ value: 5, refLow: 9, refHigh: 2 })).toBeNull()
    expect(rangeBarGeometry({ value: null, refLow: 1, refHigh: 2 })!.dot).toBeNull()
    expect(rangeBarGeometry({ value: 0, refLow: 0, refHigh: 0 })!.dot).not.toBeNaN()
  })
})

describe('coach context lines', () => {
  const r = report({
    markers: [
      marker({ name: 'HDL', value: 1.3, refLow: 1.0, refHigh: null }),
      marker({ name: 'LDL', value: 3.9 }),
      marker({ name: 'Triglycerides', value: 1.1, refHigh: 1.7 }),
      marker({ name: 'Total cholesterol', value: 5.0, refHigh: 5.2 }),
      marker({ name: 'Non-HDL', value: 3.7, refHigh: null }),
      marker({ name: 'Ratio', value: 3.8, refHigh: null }),
    ],
  })

  it('states the printed flag and range, nothing more', () => {
    expect(markerContext(marker({ name: 'LDL' }))).toBe('LDL 3.9 mmol/L [High, printed range ≤ 3.4]')
    expect(markerContext(marker({ name: 'Weight', value: 84, unit: 'kg', refHigh: null }))).toBe(`Weight 84 kg [${FLAG_LABEL.unknown}]`)
  })

  it('builds one line per report: kind, title, date and at most 5 notable markers, flagged first', () => {
    const line = buildReportContextLine(r)
    expect(line.startsWith('Blood test "Lipid panel" (2026-08-02): LDL 3.9 mmol/L [High')).toBe(true)
    expect(line.split('; ')).toHaveLength(5)
    expect(line).not.toMatch(/diagnos|risk|should|elevated|abnormal/i)
  })

  it('falls back to the summary when a report has no values', () => {
    expect(buildReportContextLine(report({ kind: 'clinical_note', title: 'Physio note' }))).toBe('Clinical note "Physio note" (2026-08-02): A lipid panel from Raffles Medical.')
  })

  it('shares nothing unless the user opted in; newest first, capped at 5 reports', () => {
    const many = Array.from({ length: 7 }, (_, i) => report({ id: i + 1, title: `R${i + 1}`, ts: `2026-0${i + 1}-10T04:00:00.000Z` }))
    expect(buildReportContextLines(many, false)).toEqual([])
    const lines = buildReportContextLines(many, true)
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatch(/"R7"/)
    expect(lines[4]).toMatch(/"R3"/)
  })
})

describe('reportTs', () => {
  const FALLBACK = '2026-09-17T03:00:00.000Z'
  it('uses the printed date at local noon', () => {
    const d = new Date(reportTs('2026-08-02', FALLBACK))
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 8, 2, 12])
  })
  it('falls back for missing or impossible dates', () => {
    for (const bad of [null, undefined, '', '02/08/2026', '2026-13-40', '2026-02-31', '0001-01-01', 20260802]) expect(reportTs(bad, FALLBACK)).toBe(FALLBACK)
  })
})
