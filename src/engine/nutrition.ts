// Nutrition targets and trend adjustment (PRD §10). Deterministic; the coach only proposes.
import type { BodyMetric, Evidence, NutritionTarget, ProposedAction } from '../domain/types'
import { addDays, dateOf, daysBetween, round, todayStr } from '../lib/util'
import { rollingAverage } from './trends'

export type Activity = 'low' | 'moderate' | 'high'
export type NutritionGoal = 'cut' | 'maintain' | 'gain'

export interface TargetProfile {
  sex: 'male' | 'female' | 'other'
  dob: string
  heightCm: number
  weightKg: number
  activity: Activity
  goal: NutritionGoal
}

export interface TargetEstimate { kcal: number; proteinG: number; carbsG: number; fatG: number; rationale: string }

export const ACTIVITY_FACTORS: Record<Activity, number> = { low: 1.3, moderate: 1.43, high: 1.6 }
export const GOAL_DELTA_KCAL: Record<NutritionGoal, number> = { cut: -500, maintain: 0, gain: 300 }
export const KCAL_FLOOR = 1600
export const PROTEIN_G_PER_KG = 1.8
export const FAT_G_PER_KG = 0.8

export function ageAt(dob: string, today: string = todayStr()): number {
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let age = ty - y
  if (tm < m || (tm === m && td < d)) age--
  return Math.max(0, age)
}

/** Mifflin-St Jeor resting energy expenditure. */
export function mifflinStJeor(sex: TargetProfile['sex'], weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base - 78
}

const fmtN = (n: number) => Math.round(n).toLocaleString('en-SG')

export function estimateTargets(p: TargetProfile, today: string = todayStr()): TargetEstimate {
  const age = ageAt(p.dob, today)
  const bmr = mifflinStJeor(p.sex, p.weightKg, p.heightCm, age)
  const factor = ACTIVITY_FACTORS[p.activity]
  const tdee = bmr * factor
  const delta = GOAL_DELTA_KCAL[p.goal]
  let kcal = round(tdee + delta, 50)
  if (p.goal === 'cut' && kcal < KCAL_FLOOR) kcal = KCAL_FLOOR
  const proteinG = round(p.weightKg * PROTEIN_G_PER_KG, 5)
  const fatG = round(p.weightKg * FAT_G_PER_KG, 5)
  const carbsG = Math.max(0, round((kcal - proteinG * 4 - fatG * 9) / 4, 5))
  const goalWord = p.goal === 'cut' ? 'fat loss' : p.goal === 'gain' ? 'a lean gain' : 'maintenance'
  const deltaText = delta === 0 ? '' : ` ${delta > 0 ? '+' : '−'}${Math.abs(delta)} kcal for ${goalWord}`
  const rationale =
    `Mifflin-St Jeor: ${fmtN(bmr)} kcal at rest × ${factor} (${p.activity} activity) ≈ ${fmtN(tdee)} kcal/day;` +
    `${deltaText}${p.goal === 'cut' && kcal === KCAL_FLOOR ? ' (held at the 1,600 kcal floor)' : ''} → ${fmtN(kcal)} kcal. ` +
    `Protein ${PROTEIN_G_PER_KG} g/kg = ${proteinG} g, fat ${FAT_G_PER_KG} g/kg = ${fatG} g, carbs fill the remainder (${carbsG} g). ` +
    'Adjust from 14–21 day weight and waist trends, not from re-running the formula.'
  return { kcal, proteinG, carbsG, fatG, rationale }
}

// --- trend evaluation ---------------------------------------------------------

export interface IntakeDay { date: string; kcal: number; proteinG: number; logged: boolean }

export type TrendFlagKind = 'under_eating' | 'low_protein' | 'rapid_loss' | 'flat' | 'on_track' | 'insufficient_data'
export interface TrendFlag { kind: TrendFlagKind; message: string }

export interface TrendResult {
  weeklyRateKg: number | null
  avg7Kg: number | null
  prevAvg7Kg: number | null
  loggedDays: number
  adherencePct: number
  avgKcal: number | null
  avgProteinG: number | null
  flags: TrendFlag[]
  proposal: ProposedAction | null
  evidence: Evidence[]
}

export interface NutritionTrendInput {
  weights: BodyMetric[]
  waists: BodyMetric[]
  intake: IntakeDay[]
  target: NutritionTarget
  windowDays?: number
  /** Defaults to the latest date seen in the data. */
  today?: string
}

export const FLAT_RATE_KG = 0.15
export const RAPID_LOSS_RATE_KG = -1.2
export const UNDER_EATING_KCAL = 1500
export const LOW_PROTEIN_FRACTION = 0.7
export const MIN_TREND_DAYS = 14
export const ADHERENCE_FOR_CHANGE = 80
export const KCAL_STEP = 150

const fmtRate = (r: number) => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)} kg/wk`

function targetProposal(target: NutritionTarget, deltaKcal: number, startDate: string, why: string): ProposedAction {
  const kcal = target.kcal + deltaKcal
  const carbsG = Math.max(0, round(target.carbsG + deltaKcal / 4, 5))
  const dir = deltaKcal < 0 ? 'Lower' : 'Raise'
  return {
    kind: 'nutrition_target',
    payload: { kcal, proteinG: target.proteinG, carbsG, fatG: target.fatG, deltaKcal, startDate, rationale: why },
    summary: `${dir} calorie target by ${Math.abs(deltaKcal)} kcal to ${fmtN(kcal)} kcal (protein stays at ${target.proteinG} g)`,
  }
}

export function evaluateNutritionTrend(input: NutritionTrendInput): TrendResult {
  const window = input.windowDays ?? MIN_TREND_DAYS
  const weights = [...input.weights].sort((a, b) => a.ts.localeCompare(b.ts))
  const lastWeightDate = weights.length ? dateOf(weights[weights.length - 1].ts) : null
  const lastIntakeDate = input.intake.length ? [...input.intake].map((d) => d.date).sort().pop()! : null
  const today = input.today ?? [lastWeightDate, lastIntakeDate].filter((d): d is string => !!d).sort().pop() ?? todayStr()

  const pts = weights.map((w) => ({ ts: w.ts, value: w.value }))
  const avg7 = rollingAverage(pts, 7, today)
  const prevAvg7 = rollingAverage(pts, 7, addDays(today, -7))
  const rate = avg7 != null && prevAvg7 != null ? avg7 - prevAvg7 : null
  const spanDays = weights.length ? daysBetween(dateOf(weights[0].ts), today) + 1 : 0
  const enoughWeight = rate != null && spanDays >= MIN_TREND_DAYS && weights.length >= 6

  const windowStart = addDays(today, -(window - 1))
  const inWindow = input.intake.filter((d) => d.date >= windowStart && d.date <= today)
  const logged = inWindow.filter((d) => d.logged)
  const loggedDays = logged.length
  const adherencePct = Math.round((loggedDays / window) * 100)
  const avgKcal = loggedDays ? logged.reduce((a, d) => a + d.kcal, 0) / loggedDays : null
  const avgProteinG = loggedDays ? logged.reduce((a, d) => a + d.proteinG, 0) / loggedDays : null

  const flags: TrendFlag[] = []
  let proposal: ProposedAction | null = null

  if (!enoughWeight) {
    flags.push({ kind: 'insufficient_data', message: weights.length ? `Only ${spanDays} day${spanDays === 1 ? '' : 's'} of weight data — need 14 to judge the trend.` : 'No weight data yet — weigh in most mornings.' })
  }

  if (avgKcal != null && loggedDays >= 5 && avgKcal < UNDER_EATING_KCAL) {
    flags.push({ kind: 'under_eating', message: `Averaging ${fmtN(avgKcal)} kcal over ${loggedDays} logged days — that is under 1,500 and not sustainable.` })
  }
  if (avgProteinG != null && loggedDays >= 3 && avgProteinG < LOW_PROTEIN_FRACTION * input.target.proteinG) {
    flags.push({ kind: 'low_protein', message: `Protein averaging ${Math.round(avgProteinG)} g vs ${input.target.proteinG} g target (${Math.round((avgProteinG / input.target.proteinG) * 100)}%).` })
  }

  if (enoughWeight && rate != null) {
    if (rate < RAPID_LOSS_RATE_KG) {
      flags.push({ kind: 'rapid_loss', message: `Losing ${Math.abs(rate).toFixed(2)} kg/wk — faster than the 1.2 kg/wk ceiling; strength is at risk.` })
      proposal = targetProposal(input.target, KCAL_STEP, today, `Weight is dropping ${Math.abs(rate).toFixed(2)} kg/wk, beyond the sustainable ceiling.`)
    } else if (rate > -FLAT_RATE_KG) {
      const flat = Math.abs(rate) < FLAT_RATE_KG
      const base = flat ? `Weight flat (${fmtRate(rate)}) over the last ${spanDays >= 21 ? '3' : '2'} weeks` : `Weight trending up (${fmtRate(rate)})`
      if (adherencePct >= ADHERENCE_FOR_CHANGE) {
        flags.push({ kind: 'flat', message: `${base} with ${adherencePct}% of days logged — the target needs a nudge.` })
        if (!flags.some((f) => f.kind === 'under_eating')) {
          proposal = targetProposal(input.target, -KCAL_STEP, today, `${base} with ${adherencePct}% logging adherence.`)
        }
      } else {
        flags.push({ kind: 'flat', message: `${base}, but only ${adherencePct}% of days logged — log every meal before changing the target.` })
      }
    } else {
      flags.push({ kind: 'on_track', message: `Losing ${Math.abs(rate).toFixed(2)} kg/wk — on track.` })
    }
  }

  if (!proposal && flags.some((f) => f.kind === 'under_eating')) {
    proposal = targetProposal(input.target, KCAL_STEP, today, `Averaging ${fmtN(avgKcal as number)} kcal over ${loggedDays} logged days — too low to hold strength.`)
  }

  const evidence: Evidence[] = []
  if (avg7 != null) evidence.push({ label: '7-day avg weight', value: `${avg7.toFixed(1)} kg` })
  if (prevAvg7 != null) evidence.push({ label: 'Previous 7-day avg', value: `${prevAvg7.toFixed(1)} kg` })
  if (rate != null) evidence.push({ label: 'Weekly rate', value: fmtRate(rate) })
  const waists = [...input.waists].sort((a, b) => a.ts.localeCompare(b.ts))
  if (waists.length >= 2) {
    const first = waists[0], lastW = waists[waists.length - 1]
    evidence.push({ label: 'Waist', value: `${first.value.toFixed(1)} → ${lastW.value.toFixed(1)} cm` })
  }
  evidence.push({ label: 'Logging adherence', value: `${adherencePct}% (${loggedDays}/${window} days)` })
  if (avgKcal != null) evidence.push({ label: 'Avg intake', value: `${fmtN(avgKcal)} kcal vs ${fmtN(input.target.kcal)} target` })
  if (avgProteinG != null) evidence.push({ label: 'Avg protein', value: `${Math.round(avgProteinG)} g vs ${input.target.proteinG} g target` })

  return { weeklyRateKg: rate, avg7Kg: avg7, prevAvg7Kg: prevAvg7, loggedDays, adherencePct, avgKcal, avgProteinG, flags, proposal, evidence }
}
