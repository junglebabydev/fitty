// Deterministic trajectory sentences for the Progress screen. Pure; no AI involved.
import { FLAT_RATE_KG, RAPID_LOSS_RATE_KG } from '../../engine/nutrition'
import { daysBetween, fmtDate } from '../../lib/util'
import { adherenceTotals, type WeekAdherence } from './adherence'
import { signed, type WaistStats, type WeightStats } from './weight'

export interface TrajectoryInput {
  weight: WeightStats
  waist: WaistStats
  adherence: WeekAdherence[]
  today: string
}

function weightLine(w: WeightStats, today: string): string {
  if (w.latest == null) {
    return 'No weight logged yet. Weigh in most mornings — the 7-day average drives every calorie decision here.'
  }
  const avg = w.avg7 ?? w.latest
  if (w.goal == null) {
    return `Latest ${w.latest.toFixed(1)} kg, 7-day average ${avg.toFixed(1)} kg. Set a weight goal in Settings to get a projection.`
  }
  if (w.toGoal != null && w.toGoal <= 0) {
    return `${w.latest.toFixed(1)} kg — at or below the ${w.goal} kg goal. Hold here and let the coach propose a maintenance target.`
  }
  if (w.rateKg == null) {
    return `${w.latest.toFixed(1)} kg today, ${(w.toGoal ?? 0).toFixed(1)} kg to the ${w.goal} kg goal. Two weeks of morning weigh-ins are needed before a rate can be projected.`
  }
  const rate = w.rateKg
  if (rate <= -FLAT_RATE_KG) {
    let s = `Down ${Math.abs(rate).toFixed(2)} kg/week on the 7-day average (${avg.toFixed(1)} kg).`
    if (w.projected) {
      const weeks = Math.max(1, Math.round(daysBetween(today, w.projected) / 7))
      s += ` At this rate you reach ${w.goal} kg around ${fmtDate(w.projected)} — about ${weeks} week${weeks === 1 ? '' : 's'}.`
    } else {
      s += ' At this pace the goal is more than three years out — the trend needs to move first.'
    }
    if (rate < RAPID_LOSS_RATE_KG) s += ' That is faster than the 1.2 kg/week ceiling — expect a proposal to raise calories.'
    return s
  }
  if (Math.abs(rate) < FLAT_RATE_KG) {
    return `Weight is flat over the last two weeks (${signed(rate, 2)} kg/week, 7-day average ${avg.toFixed(1)} kg). One weigh-in never changes the plan; a flat 14-day trend with meals logged does.`
  }
  return `Up ${rate.toFixed(2)} kg/week on the 7-day average (${avg.toFixed(1)} kg). Check that meals are being logged before changing anything — the coach proposes a target change once the data is there.`
}

export function waistLine(w: WaistStats): string | null {
  if (w.latest == null) return null
  let s = `Waist ${w.latest.toFixed(1)} cm`
  if (w.goal != null && w.toGoal != null) s += w.toGoal > 0 ? `, ${w.toGoal.toFixed(1)} cm from the ${w.goal} cm goal` : `, at the ${w.goal} cm goal`
  if (w.change) s += `; ${signed(w.change.delta)} cm since ${fmtDate(w.change.sinceDate)}`
  return s + '.'
}

export function adherenceLine(weeks: WeekAdherence[]): string | null {
  if (!weeks.length) return null
  const t = adherenceTotals(weeks)
  if (t.sessionsPlanned === 0 && t.loggedDays === 0 && t.goodNights === 0) return null
  const span = t.weeks === 1 ? 'This week' : `Last ${t.weeks} weeks`
  const mindDays = weeks.reduce((a, w) => a + w.mind.checkedIn, 0)
  const mind = mindDays > 0 ? `, mind check-ins on ${mindDays} day${mindDays === 1 ? '' : 's'}` : ''
  return `${span}: ${t.sessionsDone}/${t.sessionsPlanned} sessions done, meals logged ${t.loggedDays}/${t.days} days, ${t.goodNights} night${t.goodNights === 1 ? '' : 's'} of 7 h or more${mind}.`
}

/** One to three short sentences: weight trend + projection, waist, adherence. */
export function trajectoryText(input: TrajectoryInput): string[] {
  const out: string[] = [weightLine(input.weight, input.today)]
  const waist = waistLine(input.waist)
  if (waist) out.push(waist)
  const adh = adherenceLine(input.adherence)
  if (adh) out.push(adh)
  return out
}
