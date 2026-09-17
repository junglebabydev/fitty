// Readiness model (PRD §9.3, §11, §11.1). Pure function; auditable rules.
import type { DailyCheckIn, Readiness, Region, SymptomCheck } from '../domain/types'
import { fmtDuration } from '../lib/util'
import { RED_FLAG_LABELS, activeRedFlags, capitalize, latestSymptomsByRegion, regionGroup, regionLabel } from './symptomGate'

export interface ReadinessInput {
  sleepLastNightMin: number | null
  sleepAvg7Min: number | null
  /** Today's symptom checks. */
  symptoms: SymptomCheck[]
  checkIn: DailyCheckIn | null
  restingHr?: number | null
  restingHrBaseline?: number | null
  sessionsLast7: number
}

export interface ReadinessModifiers {
  reduceVolume: boolean
  lowImpactOnly: boolean
  avoidRegions: Region[]
  suggestRest: boolean
}

export interface ReadinessResult {
  state: Readiness
  reasons: string[]
  modifiers: ReadinessModifiers
}

/** Below this, a short night is an AMBER on its own (reduce volume, never rest). */
export const SLEEP_SHORT_MIN = 330 // 5h 30m
/** Below this, sleep is a caution and combines with soreness/pain/energy. */
export const SLEEP_TARGET_MIN = 420 // 7h
/** Chronic short sleep: 7-day average under this combines with a short night into AMBER. */
export const SLEEP_AVG_LOW_MIN = 390 // 6h 30m
export const RHR_DELTA_AMBER = 7
export const HEAVY_LOAD_SESSIONS = 6

const RANK: Record<Readiness, number> = { GREEN: 0, AMBER: 1, RED: 2 }

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const st: { state: Readiness } = { state: 'GREEN' }
  const raise = (to: Readiness) => { if (RANK[to] > RANK[st.state]) st.state = to }

  const urgentReasons: string[] = []
  const sleepReasons: string[] = []
  const mildReasons: string[] = []
  const otherReasons: string[] = []
  const avoidRegions: Region[] = []
  let reduceVolume = false
  let lowImpactOnly = false

  // --- symptoms -------------------------------------------------------------
  let mildPain = 0
  for (const [region, snap] of latestSymptomsByRegion(input.symptoms)) {
    const label = regionLabel(region)
    const group = regionGroup(region)
    const flags = activeRedFlags(snap.redFlags)
    const pain = snap.painScore

    if (flags.length) {
      raise('RED')
      avoidRegions.push(region)
      urgentReasons.push(`${capitalize(label)}: ${flags.map((f) => RED_FLAG_LABELS[f]).join(', ')} reported`)
    }
    if (pain > 5) {
      raise('RED')
      if (!avoidRegions.includes(region)) avoidRegions.push(region)
      urgentReasons.push(`Significant ${label} pain (${pain}/10)`)
    } else if (pain >= 3) {
      raise('AMBER')
      if (!avoidRegions.includes(region)) avoidRegions.push(region)
      urgentReasons.push(`Moderate ${label} pain (${pain}/10)`)
    } else if (pain >= 1) {
      mildPain = Math.max(mildPain, pain)
      mildReasons.push(`Mild ${label} soreness (${pain}/10)`)
    }
    if (snap.redFlags.swelling && !flags.length && pain <= 5) {
      raise('AMBER')
      if (!avoidRegions.includes(region)) avoidRegions.push(region)
      urgentReasons.push(`${capitalize(label)} swelling reported`)
    }
    if ((group === 'knee' || group === 'hip') && (pain >= 1 || flags.length || snap.redFlags.swelling)) lowImpactOnly = true
  }

  // --- sleep ------------------------------------------------------------------
  const last = input.sleepLastNightMin
  const avg = input.sleepAvg7Min
  const soreness = input.checkIn?.soreness ?? null
  const energy = input.checkIn?.energy ?? null
  let shortSleep = false
  if (last != null) {
    const belowAvg = avg != null && last < avg - 15
    const qualifier = belowAvg ? ', below 7-day average' : last < SLEEP_TARGET_MIN ? ', under 7h' : ''
    if (last < SLEEP_SHORT_MIN) {
      raise('AMBER')
      reduceVolume = true
      sleepReasons.push(`${fmtDuration(last)} sleep${qualifier}`)
    } else if (last < SLEEP_TARGET_MIN) {
      shortSleep = true
      sleepReasons.push(`${fmtDuration(last)} sleep${qualifier}`)
      const combined = mildPain >= 1 || (soreness != null && soreness >= 3) || (energy != null && energy <= 3)
      if (combined) { raise('AMBER'); reduceVolume = true }
      if (avg != null && avg < SLEEP_AVG_LOW_MIN) {
        raise('AMBER'); reduceVolume = true
        sleepReasons.push(`7-day sleep average only ${fmtDuration(avg)}`)
      }
    }
  }

  // --- check-in -----------------------------------------------------------------
  if (soreness != null) {
    if (soreness >= 6) { raise('AMBER'); reduceVolume = true; otherReasons.push(`High soreness (${soreness}/10)`) }
    else if (soreness >= 3 && shortSleep) otherReasons.push(`Soreness ${soreness}/10`)
  }
  if (energy != null) {
    if (energy <= 2) { raise('AMBER'); reduceVolume = true; otherReasons.push(`Low energy (${energy}/10)`) }
    else if (energy <= 3 && shortSleep) otherReasons.push(`Low energy (${energy}/10)`)
  }
  const stress = input.checkIn?.stress ?? null
  if (stress != null && stress >= 8) otherReasons.push(`High stress (${stress}/10)`)

  // --- resting HR ---------------------------------------------------------------
  const hr = input.restingHr ?? null
  const base = input.restingHrBaseline ?? null
  if (hr != null && base != null && hr >= base + RHR_DELTA_AMBER) {
    raise('AMBER'); reduceVolume = true
    otherReasons.push(`Resting HR ${Math.round(hr)} bpm, ${Math.round(hr - base)} above baseline`)
  }

  // --- training load ------------------------------------------------------------
  if (input.sessionsLast7 >= HEAVY_LOAD_SESSIONS) {
    raise('AMBER'); reduceVolume = true
    otherReasons.push(`${input.sessionsLast7} sessions in the last 7 days`)
  }

  const reasons = [...urgentReasons, ...sleepReasons, ...mildReasons, ...otherReasons]
  const state = st.state
  if (state === 'AMBER') reduceVolume = true
  const suggestRest = state === 'RED'
  if (state === 'RED') { reduceVolume = true; lowImpactOnly = true }
  if (!reasons.length) reasons.push('Slept enough, no symptoms flagged')

  return { state, reasons, modifiers: { reduceVolume, lowImpactOnly, avoidRegions, suggestRest } }
}
