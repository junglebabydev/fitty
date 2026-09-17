import { describe, expect, it } from 'vitest'
import {
  approxMinutes, cycleStartSec, durationOptions, fmtClock, minutesRangeLabel, patternLabel, phaseTableSeconds, planSession, positionAt, shouldSavePartial,
  type BreathPhase,
} from '../breathing'

const BOX: BreathPhase[] = [
  { phase: 'inhale', seconds: 4, label: 'Breathe in' },
  { phase: 'hold', seconds: 4, label: 'Hold' },
  { phase: 'exhale', seconds: 4, label: 'Breathe out' },
  { phase: 'hold', seconds: 4, label: 'Hold' },
]
const FOUR_7_8: BreathPhase[] = [
  { phase: 'inhale', seconds: 4, label: 'Breathe in' },
  { phase: 'hold', seconds: 7, label: 'Hold' },
  { phase: 'exhale', seconds: 8, label: 'Breathe out slowly' },
]
const COHERENT: BreathPhase[] = [
  { phase: 'inhale', seconds: 5.5, label: 'Breathe in' },
  { phase: 'exhale', seconds: 5.5, label: 'Breathe out' },
]

describe('planSession', () => {
  it('uses whole cycles closest to the requested minutes', () => {
    expect(phaseTableSeconds(BOX)).toBe(16)
    expect(planSession(BOX, 1)).toEqual({ cycleSec: 16, cycles: 4, totalSec: 64, capped: false })
    expect(planSession(BOX, 3)).toEqual({ cycleSec: 16, cycles: 11, totalSec: 176, capped: false })
    expect(planSession(COHERENT, 5)).toEqual({ cycleSec: 11, cycles: 27, totalSec: 297, capped: false })
  })

  it('respects maxCycles for 4-7-8', () => {
    expect(planSession(FOUR_7_8, 1, 4)).toEqual({ cycleSec: 19, cycles: 3, totalSec: 57, capped: false })
    expect(planSession(FOUR_7_8, 3, 4)).toEqual({ cycleSec: 19, cycles: 4, totalSec: 76, capped: true })
    expect(planSession(FOUR_7_8, 5, 4).cycles).toBe(4)
  })

  it('always gives at least one cycle and survives an empty table', () => {
    expect(planSession(FOUR_7_8, 0.1, 4).cycles).toBe(1)
    expect(planSession([], 3)).toEqual({ cycleSec: 0, cycles: 0, totalSec: 0, capped: false })
  })
})

describe('durationOptions', () => {
  it('offers 1 / 3 / 5 min when nothing is capped', () => {
    expect(durationOptions(BOX).map((o) => o.label)).toEqual(['1 min', '3 min', '5 min'])
  })

  it('collapses capped choices into one "N cycles" option', () => {
    const opts = durationOptions(FOUR_7_8, 4)
    expect(opts.map((o) => o.label)).toEqual(['1 min', '4 cycles'])
    expect(opts[1].plan.totalSec).toBe(76)
  })
})

describe('positionAt', () => {
  const plan = planSession(BOX, 1)

  it('walks the phase table', () => {
    expect(positionAt(BOX, plan, 0)).toMatchObject({ cycleIndex: 0, phaseIndex: 0, phaseRemaining: 4, remaining: 64, done: false })
    expect(positionAt(BOX, plan, 3.5)).toMatchObject({ phaseIndex: 0, phaseRemaining: 0.5 })
    expect(positionAt(BOX, plan, 4)).toMatchObject({ phaseIndex: 1, phaseRemaining: 4 })
    expect(positionAt(BOX, plan, 13).phase.label).toBe('Hold')
    expect(positionAt(BOX, plan, 13).phaseIndex).toBe(3)
    expect(positionAt(BOX, plan, 16)).toMatchObject({ cycleIndex: 1, phaseIndex: 0 })
    expect(positionAt(BOX, plan, 63.9)).toMatchObject({ cycleIndex: 3, phaseIndex: 3, done: false })
  })

  it('finishes at the planned total and clamps negatives', () => {
    expect(positionAt(BOX, plan, 64)).toMatchObject({ cycleIndex: 3, remaining: 0, done: true })
    expect(positionAt(BOX, plan, 500).done).toBe(true)
    expect(positionAt(BOX, plan, -2)).toMatchObject({ cycleIndex: 0, phaseIndex: 0, remaining: 64 })
  })

  it('handles fractional phases', () => {
    const p = planSession(COHERENT, 1)
    expect(p.cycles).toBe(5)
    expect(positionAt(COHERENT, p, 5.4).phase.phase).toBe('inhale')
    expect(positionAt(COHERENT, p, 5.5).phase.phase).toBe('exhale')
    expect(positionAt(COHERENT, p, 11).cycleIndex).toBe(1)
  })

  it('is done for an empty plan', () => {
    expect(positionAt([], planSession([], 1), 0).done).toBe(true)
  })
})

describe('cycleStartSec', () => {
  const plan = planSession(BOX, 1)
  it('rewinds to the start of the interrupted breath', () => {
    expect(cycleStartSec(plan, 0)).toBe(0)
    expect(cycleStartSec(plan, 15.9)).toBe(0)
    expect(cycleStartSec(plan, 21)).toBe(16)
    expect(cycleStartSec(plan, 999)).toBe(48)
  })
})

describe('formatting and save rule', () => {
  it('formats patterns and clocks', () => {
    expect(patternLabel(BOX)).toBe('4 · 4 · 4 · 4')
    expect(patternLabel(COHERENT)).toBe('5.5 · 5.5')
    expect(fmtClock(76)).toBe('1:16')
    expect(fmtClock(59.2)).toBe('1:00')
    expect(fmtClock(-3)).toBe('0:00')
    expect(approxMinutes(20)).toBe(1)
    expect(approxMinutes(176)).toBe(3)
    expect(minutesRangeLabel(BOX)).toBe('1–5 min')
    expect(minutesRangeLabel(FOUR_7_8, 4)).toBe('1 min')
  })

  it('keeps an early exit only from 30 seconds', () => {
    expect(shouldSavePartial(29.9)).toBe(false)
    expect(shouldSavePartial(30)).toBe(true)
  })
})
