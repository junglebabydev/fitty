import { describe, expect, it } from 'vitest'
import { composeDietPattern, parseDietPattern } from '../keys'
import { normaliseOption, splitKnown, EQUIPMENT_OPTIONS } from '../options'
import { cmToFtIn, displayWeight, fmtHeight, ftInToCm, parseWeight } from '../units'
import { fmtBytes, sortTables, tableLabel } from '../files'

describe('units', () => {
  it('round-trips ft/in ↔ cm without drift', () => {
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, inch: 10 })
    expect(ftInToCm(5, 10)).toBe(177.8)
    expect(cmToFtIn(ftInToCm(5, 11))).toEqual({ ft: 5, inch: 11 })
    expect(cmToFtIn(182.9)).toEqual({ ft: 6, inch: 0 })
    expect(fmtHeight(179, 'metric')).toBe('179 cm')
    expect(fmtHeight(179, 'imperial')).toBe('5′10″')
  })

  it('round-trips lb ↔ kg for typed values', () => {
    const kg = parseWeight(185, 'imperial')
    expect(kg).toBeCloseTo(83.91, 2)
    expect(displayWeight(kg, 'imperial')).toBe(185)
    expect(parseWeight(84, 'metric')).toBe(84)
    expect(displayWeight(null, 'metric')).toBeNull()
  })
})

describe('diet pattern', () => {
  it('parses the seed string and composes it back', () => {
    const d = parseDietPattern('1–2 meals/day, skips breakfast')
    expect(d).toEqual({ mealsPerDay: 2, skipsBreakfast: true, coffee: false, supplements: false, notes: '' })
    expect(composeDietPattern(d)).toBe('1–2 meals/day, skips breakfast')
  })

  it('keeps unknown fragments as notes and detects coffee/supplements', () => {
    const d = parseDietPattern('1 meal/day, morning coffee, supplements, hawker lunch')
    expect(d.mealsPerDay).toBe(1)
    expect(d.coffee).toBe(true)
    expect(d.supplements).toBe(true)
    expect(d.notes).toBe('hawker lunch')
    expect(composeDietPattern(d)).toBe('1 meal/day, morning coffee, supplements, hawker lunch')
  })
})

describe('options', () => {
  it('normalises labels and values', () => {
    expect(normaliseOption('Lat pulldown')).toBe('lat_pulldown')
    expect(normaliseOption('stationary-bike ')).toBe('stationary_bike')
  })

  it('splits stored equipment into known values and extras', () => {
    const { known, extras } = splitKnown(['Dumbbells', 'lat_pulldown', 'Cables', 'kettlebells'], EQUIPMENT_OPTIONS)
    expect(known).toEqual(['dumbbells', 'lat_pulldown', 'cables'])
    expect(extras).toEqual(['kettlebells'])
  })
})

describe('files', () => {
  it('formats bytes', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(fmtBytes(-1)).toBe('—')
  })

  it('orders tables personal-data first and labels unknown tables', () => {
    const rows = sortTables({ settings: 3, body_metrics: 7, zzz_custom: 1, meals: 4 })
    expect(rows.map((r) => r.name)).toEqual(['body_metrics', 'meals', 'settings', 'zzz_custom'])
    expect(tableLabel('zzz_custom')).toBe('zzz custom')
    expect(rows[0].label).toBe('Body metrics')
  })
})
