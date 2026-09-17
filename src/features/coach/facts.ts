// Assembles CoachFacts for the rules engine from the local database. Read-only:
// nothing in here writes, so it is safe to call from render (via useQuery).
import type { Exercise, NutritionTarget, SymptomCheck, WorkoutSession } from '../../domain/types'
import { addDays, dateOf, hourNow as clockHour, startOfWeek, todayStr } from '../../lib/util'
import {
  activeSession, completedSessionCount, dailyTotals, dailyTotalsRange, getBodyMetrics, getCheckIn, getExercise, getGoals,
  getHealthMetrics, getMoodLogs, getNutritionTarget, getProfile, getSavedMeals, getSessions, getSessionsForDate, getSetting,
  getSleepRecords, getSymptomChecks, lastNightSleep, lastSetsForExercise, latestBodyMetric, mindfulMinutes, moodLogsForDate,
  previousSetsForExercise, recentFoods, symptomsForDate,
} from '../../db/repositories'
import {
  computePillars, computeReadiness, estimateTargets, evaluateNutritionTrend, evaluateProgression, evaluateSymptomGate,
  rollingAverage, supportSignal,
  type CoachFacts, type GateResult, type ReadinessInput, type ReadinessResult, type Tier,
} from '../../engine'
import { EXERCISE_BY_ID, FOOD_BY_ID, HIGH_PROTEIN_IDS } from '../../data'
import { TRAIN_TIER_SETTING } from '../workout/helpers'

/** Days of weight / intake history fed to the nutrition trend (PRD §10: adjust from 14–21 day trends). */
export const TREND_WINDOW_DAYS = 21
/** Resting-HR baseline window. */
export const RHR_BASELINE_DAYS = 14

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// --- sleep ---------------------------------------------------------------------

export function sleepFacts(today: string): { lastNightMin: number | null; avg7Min: number | null } {
  const last = lastNightSleep(today)
  const nights = getSleepRecords(7)
  return { lastNightMin: last?.durationMin ?? null, avg7Min: mean(nights.map((n) => n.durationMin)) }
}

// --- resting HR ---------------------------------------------------------------

/** Latest resting HR (today or yesterday) against the mean of the previous readings in the window. */
export function restingHrFacts(today: string): { current: number | null; baseline: number | null } {
  const rows = getHealthMetrics('resting_hr', RHR_BASELINE_DAYS)
  if (!rows.length) return { current: null, baseline: null }
  const latest = rows[rows.length - 1]
  const fresh = dateOf(latest.ts) >= addDays(today, -1)
  const rest = rows.slice(0, -1).map((r) => r.value)
  return { current: fresh ? latest.value : null, baseline: rest.length >= 3 ? mean(rest) : null }
}

// --- readiness ----------------------------------------------------------------

export function readinessInputFor(today: string): ReadinessInput {
  const sleep = sleepFacts(today)
  const rhr = restingHrFacts(today)
  return {
    sleepLastNightMin: sleep.lastNightMin,
    sleepAvg7Min: sleep.avg7Min,
    symptoms: gateSymptoms(today),
    checkIn: getCheckIn(today),
    restingHr: rhr.current,
    restingHrBaseline: rhr.baseline,
    sessionsLast7: completedSessionCount(addDays(today, -6), today),
  }
}

export function todayReadiness(today: string = todayStr()): ReadinessResult {
  return computeReadiness(readinessInputFor(today))
}

// --- symptom gate -------------------------------------------------------------

/** Today's checks plus anything from the last 2 days, so yesterday's pain still gates today unless re-checked. */
export function gateSymptoms(today: string): SymptomCheck[] {
  const byId = new Map<number, SymptomCheck>()
  for (const s of getSymptomChecks(2)) byId.set(s.id, s)
  for (const s of symptomsForDate(today)) byId.set(s.id, s)
  return [...byId.values()]
}

export function gateFor(today: string = todayStr()): GateResult {
  return evaluateSymptomGate(gateSymptoms(today))
}

// --- sessions -----------------------------------------------------------------

const STATUS_RANK: Record<WorkoutSession['status'], number> = { in_progress: 0, planned: 1, completed: 2, skipped: 3 }

/** The most actionable session scheduled for the date: in progress > planned > completed > skipped. */
export function plannedSessionFor(today: string = todayStr()): WorkoutSession | null {
  const rows = getSessionsForDate(today)
  if (!rows.length) return null
  return [...rows].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.id - b.id)[0]
}

export function weekSessionsFor(today: string = todayStr()): WorkoutSession[] {
  const start = startOfWeek(today)
  return getSessions(start, addDays(start, 6))
}

/** Explicit setting first; otherwise the highest tier present in the week's plan. */
export function weekTierFor(sessions: WorkoutSession[]): Tier {
  const setting = getSetting<string | null>(TRAIN_TIER_SETTING, null)
  if (setting === 'minimum' || setting === 'target' || setting === 'stretch') return setting
  if (sessions.some((s) => s.tier === 'stretch')) return 'stretch'
  if (sessions.some((s) => s.tier === 'target')) return 'target'
  return 'minimum'
}

/** Planned-and-past only, matching Train's isMissed(); 'skipped' is a deliberate drop that has already been reflowed. */
export function missedThisWeek(sessions: WorkoutSession[], today: string): number {
  return sessions.filter((s) => s.status === 'planned' && s.scheduledDate < today).length
}

// --- nutrition ----------------------------------------------------------------

/** Active target, or an estimate from the profile + latest weight until one is set. */
export function currentTarget(today: string = todayStr()): NutritionTarget {
  const t = getNutritionTarget(today)
  if (t) return t
  const p = getProfile()
  const w = latestBodyMetric('weight')?.value
  if (p && w) {
    const est = estimateTargets({ sex: p.sex, dob: p.dob, heightCm: p.heightCm, weightKg: w, activity: 'moderate', goal: 'cut' }, today)
    return { id: 0, startDate: today, endDate: null, ...est }
  }
  return { id: 0, startDate: today, endDate: null, kcal: 2000, proteinG: 150, carbsG: 190, fatG: 65, rationale: 'Default until a target is set' }
}

export function proteinPaceExpected(proteinTarget: number, hour: number): number {
  return proteinTarget * Math.min(1, Math.max(0, hour - 9) / 12)
}

const HIGH_PROTEIN_NAMES = new Set(HIGH_PROTEIN_IDS.map((id) => FOOD_BY_ID[id]?.name.toLowerCase()).filter((n): n is string => !!n))

/** Names of recently logged foods that are protein-dense (or known high-protein records), most recent first. */
export function recentHighProteinFoods(limit = 5): string[] {
  const out: string[] = []
  for (const f of recentFoods(40)) {
    const dense = f.kcal > 0 && (f.proteinG * 4) / f.kcal >= 0.35
    const known = HIGH_PROTEIN_NAMES.has(f.foodName.trim().toLowerCase())
    if (!(f.proteinG >= 15 || dense || known)) continue
    if (!out.includes(f.foodName)) out.push(f.foodName)
    if (out.length >= limit) break
  }
  return out
}

// --- strength stalls -----------------------------------------------------------

function exerciseFor(id: string): Exercise | null {
  return getExercise(id) ?? EXERCISE_BY_ID[id] ?? null
}

/** Exercises in this week's pending strength sessions whose last two sessions both missed the rep minimum. */
export function stalledExercises(sessions: WorkoutSession[], plannedToday: WorkoutSession | null): { exerciseName: string }[] {
  const pending = sessions.filter((s) => s.type === 'strength' && (s.status === 'planned' || s.status === 'in_progress'))
  const pool = pending.length ? pending : plannedToday ? [plannedToday] : []
  const seen = new Set<string>()
  const active = activeSession()
  const out: { exerciseName: string }[] = []
  for (const s of pool) {
    for (const pe of s.exercises) {
      if (seen.has(pe.exerciseId)) continue
      seen.add(pe.exerciseId)
      const ex = exerciseFor(pe.exerciseId)
      if (!ex) continue
      const last = lastSetsForExercise(pe.exerciseId, active?.id)
      const prev = previousSetsForExercise(pe.exerciseId, active?.id)
      if (!last.length || !prev.length) continue
      if (evaluateProgression(pe, ex, last, prev).stalled) out.push({ exerciseName: ex.name })
    }
  }
  return out
}

// --- mind ------------------------------------------------------------------------

/** Mood / stress context for the coach. Reads mood logs, the check-in and session minutes only; never the journal. */
export function mindFacts(today: string = todayStr()): NonNullable<CoachFacts['mind']> {
  const todays = moodLogsForDate(today)
  return {
    stressToday: getCheckIn(today)?.stress ?? null,
    valenceToday: todays.length ? todays[todays.length - 1].valence : null,
    mindfulMinToday: mindfulMinutes(today, today),
    support: supportSignal(getMoodLogs(14), today).show,
  }
}

// --- pillars ---------------------------------------------------------------------

/** Sessions per week the active tier asks for: the profile's days for that tier, else the size of this week's plan. */
export function sessionsTargetFor(tier: Tier, sessions: WorkoutSession[]): number {
  const p = getProfile()
  if (p) return tier === 'minimum' ? p.trainingDaysMin : tier === 'target' ? p.trainingDaysTarget : p.trainingDaysStretch
  return sessions.filter((s) => s.status !== 'skipped').length
}

/** The four rings (train / eat / rest / mind) for Today and Coach. Read-only. */
export function buildPillars(today: string = todayStr()): ReturnType<typeof computePillars> {
  const sessions = weekSessionsFor(today)
  const tier = weekTierFor(sessions)
  const target = currentTarget(today)
  const intake = dailyTotals(today)
  return computePillars({
    sessionsDone: sessions.filter((s) => s.status === 'completed').length,
    sessionsTarget: sessionsTargetFor(tier, sessions),
    proteinG: intake.proteinG,
    proteinTarget: target.proteinG,
    kcal: intake.kcal,
    kcalTarget: target.kcal,
    sleepMin: lastNightSleep(today)?.durationMin ?? null,
    moodLoggedToday: moodLogsForDate(today).length > 0,
    mindfulMinToday: mindfulMinutes(today, today),
  })
}

// --- everything ------------------------------------------------------------------

export function buildCoachFacts(today: string = todayStr()): CoachFacts {
  const hour = clockHour()
  const sleep = sleepFacts(today)
  const readiness = computeReadiness(readinessInputFor(today))
  const gate = gateFor(today)
  const plannedToday = plannedSessionFor(today)
  const sessionsThisWeek = weekSessionsFor(today)
  const target = currentTarget(today)

  const weightRows = getBodyMetrics('weight', TREND_WINDOW_DAYS)
  const points = weightRows.map((w) => ({ ts: w.ts, value: w.value }))
  const goal = getGoals().find((g) => g.type === 'weight' && g.status === 'active')
  const weight = {
    latest: latestBodyMetric('weight')?.value ?? null,
    avg7: rollingAverage(points, 7, today),
    prevAvg7: rollingAverage(points, 7, addDays(today, -7)),
    goal: goal?.targetValue ?? null,
  }

  const intakeRange = dailyTotalsRange(addDays(today, -(TREND_WINDOW_DAYS - 1)), today)
  const nutritionTrend = evaluateNutritionTrend({
    weights: weightRows,
    waists: getBodyMetrics('waist', TREND_WINDOW_DAYS),
    intake: intakeRange,
    target,
    windowDays: TREND_WINDOW_DAYS,
    today,
  })
  const loggedMealDaysLast7 = intakeRange.filter((d) => d.date >= addDays(today, -6) && d.logged).length

  return {
    today,
    hourNow: hour,
    readiness,
    gate,
    plannedToday,
    sessionsThisWeek,
    weekTier: weekTierFor(sessionsThisWeek),
    intakeToday: dailyTotals(today),
    target,
    proteinPaceExpected: proteinPaceExpected(target.proteinG, hour),
    savedMealNames: getSavedMeals().map((m) => m.savedName).filter((n): n is string => !!n),
    recentHighProteinFoods: recentHighProteinFoods(),
    weight,
    sleepLastNightMin: sleep.lastNightMin,
    sleepAvg7Min: sleep.avg7Min,
    missedThisWeek: missedThisWeek(sessionsThisWeek, today),
    nutritionTrend,
    stalls: stalledExercises(sessionsThisWeek, plannedToday),
    loggedMealDaysLast7,
    mind: mindFacts(today),
  }
}
