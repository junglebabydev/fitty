// Pure breathing-session maths: a technique's phase table + a chosen duration → a schedule,
// and an elapsed time → where in the schedule we are. No React, no db, no engine imports.

export type BreathPhaseKind = 'inhale' | 'hold' | 'exhale' | 'rest'

export interface BreathPhase {
  phase: BreathPhaseKind
  seconds: number
  label: string
}

export interface BreathPlan {
  /** Length of one full cycle through the phase table. */
  cycleSec: number
  cycles: number
  totalSec: number
  /** True when `maxCycles` shortened the requested duration. */
  capped: boolean
}

export interface BreathPosition {
  /** 0-based. */
  cycleIndex: number
  phaseIndex: number
  phase: BreathPhase
  /** Seconds left in the current phase. */
  phaseRemaining: number
  /** Seconds left in the whole session. */
  remaining: number
  done: boolean
}

export const DURATION_MINUTES = [1, 3, 5] as const

/** Sessions shorter than this are not saved when the user leaves early. */
export const MIN_SAVE_SEC = 30

export function phaseTableSeconds(phases: BreathPhase[]): number {
  return phases.reduce((sum, p) => sum + Math.max(0, p.seconds), 0)
}

/** Whole cycles closest to the requested minutes (at least one), limited by `maxCycles`. */
export function planSession(phases: BreathPhase[], minutes: number, maxCycles?: number): BreathPlan {
  const cycleSec = phaseTableSeconds(phases)
  if (cycleSec <= 0) return { cycleSec: 0, cycles: 0, totalSec: 0, capped: false }
  const wanted = Math.max(1, Math.round((minutes * 60) / cycleSec))
  const capped = maxCycles !== undefined && wanted > maxCycles
  const cycles = capped ? maxCycles : wanted
  return { cycleSec, cycles, totalSec: cycles * cycleSec, capped }
}

export interface DurationOption {
  minutes: number
  plan: BreathPlan
  label: string
}

/** 1 / 3 / 5 minute choices; choices that the cycle cap makes identical collapse into one "N cycles" option. */
export function durationOptions(phases: BreathPhase[], maxCycles?: number): DurationOption[] {
  const out: DurationOption[] = []
  for (const minutes of DURATION_MINUTES) {
    const plan = planSession(phases, minutes, maxCycles)
    if (plan.cycles === 0) continue
    if (out.some((o) => o.plan.cycles === plan.cycles)) continue
    out.push({ minutes, plan, label: plan.capped ? `${plan.cycles} cycles` : `${minutes} min` })
  }
  return out
}

/** Where a session is after `elapsedSec` of active (un-paused) time. */
export function positionAt(phases: BreathPhase[], plan: BreathPlan, elapsedSec: number): BreathPosition {
  const last = phases[phases.length - 1]
  if (plan.totalSec <= 0 || !last) {
    return { cycleIndex: 0, phaseIndex: 0, phase: last ?? { phase: 'rest', seconds: 0, label: '' }, phaseRemaining: 0, remaining: 0, done: true }
  }
  const t = Math.max(0, elapsedSec)
  if (t >= plan.totalSec) {
    return { cycleIndex: plan.cycles - 1, phaseIndex: phases.length - 1, phase: last, phaseRemaining: 0, remaining: 0, done: true }
  }
  const cycleIndex = Math.floor(t / plan.cycleSec)
  let into = t - cycleIndex * plan.cycleSec
  let phaseIndex = 0
  for (let i = 0; i < phases.length; i++) {
    const len = Math.max(0, phases[i].seconds)
    if (into < len) { phaseIndex = i; break }
    into -= len
    phaseIndex = i
  }
  const phase = phases[phaseIndex]
  return { cycleIndex, phaseIndex, phase, phaseRemaining: Math.max(0, phase.seconds - into), remaining: plan.totalSec - t, done: false }
}

/** Resuming after a pause restarts the interrupted breath, so nobody is asked to pick up mid-inhale. */
export function cycleStartSec(plan: BreathPlan, elapsedSec: number): number {
  if (plan.cycleSec <= 0) return 0
  const capped = Math.min(Math.max(0, elapsedSec), Math.max(0, plan.totalSec - plan.cycleSec))
  return Math.floor(capped / plan.cycleSec) * plan.cycleSec
}

/** "4 · 4 · 4 · 4", "5.5 · 5.5". */
export function patternLabel(phases: BreathPhase[]): string {
  return phases.map((p) => (Number.isInteger(p.seconds) ? String(p.seconds) : p.seconds.toFixed(1))).join(' · ')
}

/** "1:16" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "1–5 min" for a technique card; a capped technique collapses to a single figure ("1 min"). */
export function minutesRangeLabel(phases: BreathPhase[], maxCycles?: number): string {
  const opts = durationOptions(phases, maxCycles)
  if (opts.length === 0) return ''
  const lo = approxMinutes(opts[0].plan.totalSec)
  const hi = approxMinutes(opts[opts.length - 1].plan.totalSec)
  return lo === hi ? `${lo} min` : `${lo}–${hi} min`
}

/** Whole minutes, never 0. */
export function approxMinutes(sec: number): number {
  return Math.max(1, Math.round(sec / 60))
}

/** A session that ended early is only worth keeping once it lasted `MIN_SAVE_SEC`. */
export function shouldSavePartial(activeSec: number): boolean {
  return activeSec >= MIN_SAVE_SEC
}
