import { describe, expect, it } from 'vitest'
import {
  clampTo,
  fmtInt,
  formatNumberInput,
  inRange,
  parseNumberInput,
  pct,
  sparklineGeometry,
  stepDecimals,
} from '../util'

describe('parseNumberInput', () => {
  it('parses plain and comma decimals', () => {
    expect(parseNumberInput('83.4')).toBe(83.4)
    expect(parseNumberInput('83,4')).toBe(83.4)
    expect(parseNumberInput(' 12 ')).toBe(12)
  })
  it('returns null for empty / partial / junk input', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('.')).toBeNull()
    expect(parseNumberInput('-')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput('1.2.3')).toBeNull()
  })
  it('keeps a trailing dot editable by parsing the number so far', () => {
    expect(parseNumberInput('8.')).toBe(8)
  })
})

describe('formatNumberInput', () => {
  it('trims float noise and null', () => {
    expect(formatNumberInput(null)).toBe('')
    expect(formatNumberInput(0.1 + 0.2)).toBe('0.3')
    expect(formatNumberInput(84)).toBe('84')
    expect(formatNumberInput(1.005, 1)).toBe('1')
  })
})

describe('pct / clampTo / stepDecimals / fmtInt', () => {
  it('pct clamps 0–100 and survives bad max', () => {
    expect(pct(50, 200)).toBe(25)
    expect(pct(300, 200)).toBe(100)
    expect(pct(-5, 200)).toBe(0)
    expect(pct(10, 0)).toBe(0)
    expect(pct(NaN, 10)).toBe(0)
  })
  it('clampTo honours optional bounds', () => {
    expect(clampTo(5)).toBe(5)
    expect(clampTo(5, 6)).toBe(6)
    expect(clampTo(5, undefined, 4)).toBe(4)
  })
  it('inRange honours optional bounds and rejects out-of-range values', () => {
    expect(inRange(5)).toBe(true)
    expect(inRange(84, 25, 300)).toBe(true)
    expect(inRange(25, 25, 300)).toBe(true)
    expect(inRange(8.4, 25, 300)).toBe(false) // the '8.4 instead of 84' typo must not become valid
    expect(inRange(20, 800, 6000)).toBe(false)
    expect(inRange(301, undefined, 300)).toBe(false)
  })
  it('stepDecimals infers precision', () => {
    expect(stepDecimals(1)).toBe(0)
    expect(stepDecimals(0.5)).toBe(1)
    expect(stepDecimals(0.25)).toBe(2)
    expect(stepDecimals(0)).toBe(0)
  })
  it('fmtInt rounds and groups thousands', () => {
    expect(fmtInt(2050)).toBe('2,050')
    expect(fmtInt(149.6)).toBe('150')
    expect(fmtInt(NaN)).toBe('–')
  })
})

describe('sparklineGeometry', () => {
  it('maps min to the bottom and max to the top with padding', () => {
    const g = sparklineGeometry([1, 3, 2], 100, 50, undefined, 5)
    expect(g.coords).toHaveLength(3)
    expect(g.coords[0].x).toBe(0)
    expect(g.coords[2].x).toBe(100)
    expect(g.coords[0].y).toBeCloseTo(45) // min → bottom pad
    expect(g.coords[1].y).toBeCloseTo(5) // max → top pad
    expect(g.targetY).toBeNull()
  })
  it('includes the target in the y-range and positions the target line', () => {
    const g = sparklineGeometry([84.6, 84.4, 84.0], 100, 40, 74, 0)
    expect(g.min).toBe(74)
    expect(g.targetY).toBeCloseTo(40) // target is the minimum → bottom edge
    expect(g.coords[0].y).toBeCloseTo(0) // 84.6 is the max → top edge
  })
  it('handles flat and empty series without NaN', () => {
    const flat = sparklineGeometry([5, 5, 5], 100, 40)
    expect(flat.coords.every((c) => Number.isFinite(c.y))).toBe(true)
    expect(flat.coords[0].y).toBeCloseTo(20)
    const empty = sparklineGeometry([], 100, 40)
    expect(empty.coords).toHaveLength(0)
    expect(empty.points).toBe('')
  })
  it('skips non-finite values and centres a single point', () => {
    const g = sparklineGeometry([NaN, 10, Infinity], 100, 40)
    expect(g.coords).toHaveLength(1)
    expect(g.coords[0].x).toBe(50)
  })
})
