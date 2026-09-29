// Coach logic (PRD §13): one daily priority, discrete proposals, weekly review, LLM system prompt,
// and deterministic local answers. Demanding on adherence, conservative on symptoms, never guilt.
import type { CoachDecision, Evidence, Macros, NutritionTarget, WorkoutSession } from '../domain/types'
import { addDays, dayName, fmtDuration, startOfWeek } from '../lib/util'
import { HIGH_STRESS, LOW_VALENCE, VALENCE_WORDS, breathingTechnique, suggestTechnique } from './mind'
import type { TrendResult } from './nutrition'
import { STRENGTH_MINIMUM } from './planner'
import type { ReadinessResult } from './readiness'
import { type GateResult, regionLabel, capitalize } from './symptomGate'
import { projectDate } from './trends'
import { assembleCoachPrompt, type CoachPromptExtras } from './coachPrompt'

export interface CoachFacts {
  today: string
  hourNow: number
  readiness: ReadinessResult
  gate: GateResult
  plannedToday: WorkoutSession | null
  sessionsThisWeek: WorkoutSession[]
  weekTier: 'minimum' | 'target' | 'stretch'
  intakeToday: Macros
  target: NutritionTarget
  /** Grams of protein the user should have eaten by this hour to be on pace. */
  proteinPaceExpected: number
  savedMealNames: string[]
  recentHighProteinFoods: string[]
  weight: { latest: number | null; avg7: number | null; prevAvg7: number | null; goal: number | null }
  sleepLastNightMin: number | null
  sleepAvg7Min: number | null
  missedThisWeek: number
  nutritionTrend: TrendResult | null
  stalls: { exerciseName: string }[]
  loggedMealDaysLast7: number
  /** Mind context (optional). Mood and stress inform tone and one breathing directive; they never block training. Journal text is never part of the facts. */
  mind?: { stressToday: number | null; valenceToday: number | null; mindfulMinToday: number; support: boolean }
}

export type CoachTone = 'push' | 'steady' | 'protect'

export interface CoachPriority {
  headline: string
  directives: string[]
  evidence: Evidence[]
  tone: CoachTone
}

export type ProposalDraft = Omit<CoachDecision, 'id' | 'ts' | 'status' | 'resultNotes' | 'decidedAt'>

export const LATE_HOUR = 20
export const PROTEIN_BEHIND_FRACTION = 0.6
export const SHORT_SLEEP_MIN = 330

const fmtN = (n: number) => Math.round(n).toLocaleString('en-SG')

/** "upper-body session", "bike conditioning session", ... */
export function sessionShortName(s: WorkoutSession): string {
  switch (s.templateKey) {
    case 'upper_a': return 'upper-body session'
    case 'lower_a': return 'lower-body session'
    case 'full_b': return 'full-body session'
    case 'conditioning_bike': return 'bike conditioning session'
    case 'swim': return 'swim session'
    case 'mobility_hips': return 'hip mobility block'
    case 'mobility_upper': return 'upper-body mobility block'
    default:
      if (s.type === 'strength') return `${s.name.toLowerCase().replace(/\s*strength\s*/g, ' ').trim()} strength session`
      return `${s.name.toLowerCase()} session`
  }
}

function nextMealWord(hour: number): string {
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

function proteinFoods(f: CoachFacts): string {
  const picks = [...f.savedMealNames, ...f.recentHighProteinFoods].filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 2)
  return picks.join(' or ')
}

/** Directive when protein is materially behind (or, before 11:00, when almost nothing is in yet). */
function proteinDirective(f: CoachFacts): string | null {
  const have = f.intakeToday.proteinG
  const target = f.target.proteinG
  if (have >= target) return null
  const behind = f.hourNow >= 11 ? have < PROTEIN_BEHIND_FRACTION * f.proteinPaceExpected : have < 0.2 * target
  if (!behind) return null
  const foods = proteinFoods(f)
  const meal = nextMealWord(f.hourNow)
  return `Get a high-protein ${meal}${foods ? ` — ${foods}` : ''}. ${Math.round(target - have)} g still to go.`
}

/** One short breathing suggestion when stress is high (>= 7) or mood is logged low (<= -2). Never a diagnosis, never a reason to skip. */
function breathingDirective(f: CoachFacts): { directive: string; evidence: Evidence } | null {
  const m = f.mind
  if (!m) return null
  const stressed = m.stressToday != null && m.stressToday >= HIGH_STRESS
  const low = m.valenceToday != null && m.valenceToday <= LOW_VALENCE
  if (!stressed && !low) return null
  const pick = suggestTechnique({ stress: m.stressToday, valence: m.valenceToday, hourNow: f.hourNow, sleepLastNightMin: f.sleepLastNightMin })
  const name = breathingTechnique(pick.techniqueId)?.name ?? 'slow breathing'
  const lead = stressed ? `Stress is ${m.stressToday}/10 today` : 'Mood is logged low today'
  return {
    directive: `${lead} — take a few minutes to breathe in Mind (${name}).`,
    evidence: stressed
      ? { label: 'Stress', value: `${m.stressToday}/10 at check-in` }
      : { label: 'Mood', value: `${VALENCE_WORDS[m.valenceToday as number] ?? 'Low'} today` },
  }
}

function baseEvidence(f: CoachFacts): Evidence[] {
  const ev: Evidence[] = []
  if (f.sleepLastNightMin != null) {
    const avg = f.sleepAvg7Min != null ? `, 7-day avg ${fmtDuration(f.sleepAvg7Min)}` : ''
    ev.push({ label: 'Sleep', value: `${fmtDuration(f.sleepLastNightMin)} last night${avg}` })
  }
  for (const r of f.gate.regions) {
    if (r.painScore < 1 && !r.redFlags.length) continue
    const flags = r.redFlags.length ? r.redFlags.join(', ') : 'no red flags'
    ev.push({ label: capitalize(regionLabel(r.region)), value: `pain ${r.painScore}/10, ${flags} (${r.level})` })
  }
  ev.push({ label: 'Protein', value: `${Math.round(f.intakeToday.proteinG)} / ${f.target.proteinG} g so far` })
  ev.push({ label: 'Calories', value: `${fmtN(f.intakeToday.kcal)} / ${fmtN(f.target.kcal)} kcal so far` })
  if (f.weight.latest != null) {
    const avg = f.weight.avg7 != null ? `, 7-day avg ${f.weight.avg7.toFixed(1)} kg` : ''
    const goal = f.weight.goal != null ? `, target ${f.weight.goal} kg` : ''
    ev.push({ label: 'Weight', value: `${f.weight.latest.toFixed(1)} kg${avg}${goal}` })
  }
  if (f.missedThisWeek > 0) ev.push({ label: 'Missed this week', value: `${f.missedThisWeek} session${f.missedThisWeek === 1 ? '' : 's'}` })
  return ev
}

function strengthDoneThisWeek(f: CoachFacts): number {
  return f.sessionsThisWeek.filter((s) => s.type === 'strength' && s.status === 'completed').length
}

function strengthRemainingThisWeek(f: CoachFacts): number {
  return f.sessionsThisWeek.filter((s) => s.type === 'strength' && s.status === 'planned' && s.scheduledDate >= f.today).length
}

export function computeDailyPriority(f: CoachFacts): CoachPriority {
  const evidence = baseEvidence(f)
  const directives: string[] = []
  const planned = f.plannedToday
  const plannedPending = !!planned && planned.status === 'planned'
  const plannedDone = !!planned && planned.status === 'completed'
  const protein = proteinDirective(f)
  const breathe = breathingDirective(f)
  if (breathe) evidence.push(breathe.evidence)
  const mods = f.readiness.modifiers

  // --- RED: protect ---------------------------------------------------------------
  if (f.readiness.state === 'RED' || f.gate.overall === 'RED') {
    const headline = planned && !plannedDone
      ? `Protect it today — no ${sessionShortName(planned)}.`
      : 'Protect it today — recovery only.'
    directives.push(...f.gate.advice.slice(0, 2))
    if (!f.gate.advice.length) directives.push(`Skip provocative loading today: ${f.readiness.reasons[0] ?? 'symptoms flagged'}.`)
    directives.push('Easy walk or gentle mobility only if it is pain-free; log how it feels tonight.')
    if (f.gate.regions.some((r) => r.level === 'RED')) directives.push('Pain above 5/10, locking, giving way, numbness or weakness are not training problems — get them assessed if they persist.')
    if (protein) directives.push(protein)
    if (breathe) directives.push(breathe.directive)
    return { headline, directives, evidence: [...f.readiness.reasons.map((r) => ({ label: 'Readiness', value: r })), ...evidence], tone: 'protect' }
  }

  // --- 8 PM rule: shortened version before any skip --------------------------------------
  if (f.hourNow >= LATE_HOUR && plannedPending) {
    const headline = `It's ${f.hourNow}:00 — do the 25–35 minute version of the ${sessionShortName(planned!)}.`
    directives.push('Four compounds, two sets each, rest capped at 90 s. Start within 15 minutes.')
    if (mods.lowImpactOnly) directives.push('Keep it low impact and skip anything the gate flagged.')
    directives.push('Only if that is truly impossible, move it to tomorrow — it does not disappear.')
    if (protein) directives.push(protein)
    if (breathe) directives.push(breathe.directive)
    evidence.unshift({ label: 'Time', value: `${f.hourNow}:00, ${planned!.name} not started` })
    return { headline, directives, evidence, tone: 'push' }
  }

  // --- 3 missed days: rebuild around the 3-session minimum, no guilt -----------------------
  if (f.missedThisWeek >= 3) {
    const done = strengthDoneThisWeek(f)
    const need = Math.max(0, STRENGTH_MINIMUM - done)
    const weekEnd = addDays(startOfWeek(f.today), 6)
    const daysLeft = Math.max(0, Math.round((new Date(weekEnd).getTime() - new Date(f.today).getTime()) / 86_400_000)) + 1
    const headline = `Rebuild the rest of the week around ${STRENGTH_MINIMUM} strength sessions.`
    if (plannedPending) directives.push(`Start with the ${sessionShortName(planned!)} today.`)
    else if (need > 0) directives.push(`Do a strength session today — ${need} more ${need === 1 ? 'is' : 'are'} needed by ${dayName(weekEnd)} and there ${daysLeft === 1 ? 'is 1 day' : `are ${daysLeft} days`} left.`)
    directives.push('Accept the reflow proposal in Coach: it drops conditioning and swim before it drops strength.')
    if (mods.lowImpactOnly) directives.push('Keep conditioning low impact.')
    if (protein) directives.push(protein)
    if (breathe) directives.push(breathe.directive)
    evidence.unshift({ label: 'Strength this week', value: `${done} of ${STRENGTH_MINIMUM} minimum done, ${strengthRemainingThisWeek(f)} still planned` })
    return { headline, directives, evidence, tone: 'steady' }
  }

  // --- normal day ---------------------------------------------------------------------
  let headline: string
  let tone: CoachTone = f.readiness.state === 'AMBER' ? 'steady' : 'push'

  if (plannedPending) {
    headline = `Do the ${sessionShortName(planned!)} today.`
    const shortSleep = f.sleepLastNightMin != null && f.sleepLastNightMin < SHORT_SLEEP_MIN
    if (shortSleep) {
      directives.push(`Short night (${fmtDuration(f.sleepLastNightMin as number)}): drop the last set of each exercise and keep loads where they are — reduced volume, not a rest day.`)
    } else if (mods.reduceVolume && f.readiness.state === 'AMBER') {
      directives.push('Keep the habit, trim the dose: one set fewer per exercise, same loads.')
    }
    if (mods.lowImpactOnly) directives.push('Keep conditioning low impact.')
    if (f.gate.avoidTags.length) directives.push(`Substitutes are queued for anything with ${f.gate.avoidTags.slice(0, 2).map((t) => t.replace(/_/g, ' ')).join(' or ')}.`)
    if (planned!.type === 'strength' && f.readiness.state === 'GREEN' && f.gate.overall === 'OK') directives.push('Normal progression: add load where every set hit the top of the range last time.')
  } else if (plannedDone) {
    headline = `${planned!.name} done — finish the day on protein and sleep.`
    tone = 'steady'
    directives.push(`Lights out by ${f.sleepAvg7Min != null && f.sleepAvg7Min < 420 ? '22:30' : '23:00'} — sleep is the recovery lever this week.`)
  } else if (planned && planned.status === 'in_progress') {
    headline = `Finish the ${sessionShortName(planned)} you started.`
    directives.push('Log every set — unlogged sets do not count toward progression.')
  } else {
    const remaining = strengthRemainingThisWeek(f)
    const done = strengthDoneThisWeek(f)
    if (done + remaining < STRENGTH_MINIMUM) {
      headline = `Rest day on paper — but only ${done + remaining} strength sessions are lined up this week.`
      directives.push(`Add a strength session on a free day so the week hits the ${STRENGTH_MINIMUM}-session minimum.`)
    } else {
      headline = 'Rest day — walk, mobility, and hit the protein target.'
      directives.push('20–30 minutes of easy walking or the hips & hamstrings mobility block.')
    }
    tone = 'steady'
  }

  if (protein) directives.push(protein)
  if (breathe) directives.push(breathe.directive)
  if (f.missedThisWeek > 0 && f.missedThisWeek < 3) directives.push(`${f.missedThisWeek} session${f.missedThisWeek === 1 ? '' : 's'} missed this week — reflow it on Train or accept the reflow proposal in Coach; keep the remaining days.`)
  if (f.loggedMealDaysLast7 <= 3) directives.push(`Meals logged on only ${f.loggedMealDaysLast7} of the last 7 days — log every meal this week so the calorie call is based on data, not guesses.`)
  if (f.stalls.length) directives.push(`${f.stalls.map((s) => s.exerciseName).join(', ')} stalled two sessions running — a deload proposal is waiting in Coach.`)

  return { headline, directives, evidence, tone }
}

export function generateProposals(f: CoachFacts): ProposalDraft[] {
  const out: ProposalDraft[] = []
  const trend = f.nutritionTrend

  if (trend?.proposal) {
    const p = trend.proposal
    const kind = trend.flags.some((x) => x.kind === 'rapid_loss') ? 'rapid_loss' : trend.flags.some((x) => x.kind === 'under_eating') ? 'under_eating' : 'flat'
    const title = kind === 'flat'
      ? `Lower calories by ${Math.abs(Number(p.payload.deltaKcal ?? 150))} kcal`
      : `Raise calories by ${Math.abs(Number(p.payload.deltaKcal ?? 150))} kcal`
    const rationale = kind === 'flat'
      ? `Weight has been flat for two-plus weeks with ${trend.adherencePct}% of days logged, so the current target is your maintenance. A modest cut keeps the loss going without touching protein. Alternatively add one bike session — say the word.`
      : kind === 'rapid_loss'
        ? `Weight is dropping faster than 1.2 kg/wk. That costs strength and is not sustainable; ${Math.abs(Number(p.payload.deltaKcal ?? 150))} kcal more slows it to a rate you can hold.`
        : `You are averaging ${fmtN(trend.avgKcal ?? 0)} kcal on logged days — under 1,500. That undercuts training and recovery; raising the target is the right call.`
    out.push({ kind: 'nutrition_target', title, rationale, evidence: trend.evidence, action: p })
  }

  const missedPlanned = f.sessionsThisWeek.filter((s) => s.status === 'planned' && s.scheduledDate < f.today)
  if (missedPlanned.length) {
    const done = strengthDoneThisWeek(f)
    out.push({
      kind: 'reflow_week',
      title: `Reflow ${missedPlanned.length} missed session${missedPlanned.length === 1 ? '' : 's'}`,
      rationale: `${missedPlanned.map((s) => `${s.name} (${dayName(s.scheduledDate)})`).join(', ')} did not happen. Moving ${missedPlanned.length === 1 ? 'it' : 'them'} into the remaining days keeps the ${STRENGTH_MINIMUM}-session strength minimum; stretch-tier items are dropped first if days run out.`,
      evidence: [
        { label: 'Missed', value: missedPlanned.map((s) => `${s.name} — ${dayName(s.scheduledDate)}`).join('; ') },
        { label: 'Strength completed', value: `${done} of ${STRENGTH_MINIMUM} minimum` },
      ],
      action: { kind: 'reflow_week', payload: { today: f.today, sessionIds: missedPlanned.map((s) => s.id) }, summary: `Move missed sessions forward, one per day, strength first` },
    })
  }

  for (const stall of f.stalls) {
    out.push({
      kind: 'deload',
      title: `Deload ${stall.exerciseName} by 10%`,
      rationale: `${stall.exerciseName} missed the rep minimum two sessions in a row. A 10% deload resets the double-progression ladder so you climb back with clean reps in reserve.`,
      evidence: [{ label: 'Stall', value: `${stall.exerciseName}: below rep minimum in the last two sessions` }],
      action: { kind: 'deload', payload: { exerciseName: stall.exerciseName, pct: 10 }, summary: `Reduce ${stall.exerciseName} load by 10% and rebuild` },
    })
  }

  if (f.readiness.state === 'AMBER' && f.readiness.modifiers.reduceVolume && f.plannedToday?.status === 'planned' && f.plannedToday.type === 'strength') {
    out.push({
      kind: 'volume',
      title: `Trim today's ${f.plannedToday.name} by one set per exercise`,
      rationale: `Readiness is AMBER (${f.readiness.reasons.join('; ')}). Keeping the session but cutting one set per exercise preserves the habit and the loads without digging a deeper recovery hole.`,
      evidence: f.readiness.reasons.map((r) => ({ label: 'Readiness', value: r })),
      action: { kind: 'volume', payload: { sessionId: f.plannedToday.id, setsDelta: -1 }, summary: 'One set fewer per exercise today, same loads' },
    })
  }

  return out
}

export interface WeeklyReviewInput extends CoachFacts {
  completedSessions: number
  plannedSessions: number
  loggedDays: number
  sleepNights: number
  avgSleepMin: number | null
}

export interface WeeklyReview {
  training: number
  nutrition: number
  sleep: number
  highlights: string[]
  concerns: string[]
  summary: string
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function weeklyReview(f: WeeklyReviewInput): WeeklyReview {
  const training = f.plannedSessions > 0 ? pct((f.completedSessions / f.plannedSessions) * 100) : pct((f.completedSessions / STRENGTH_MINIMUM) * 100)
  const logging = pct((f.loggedDays / 7) * 100)
  const proteinPct = f.nutritionTrend?.avgProteinG != null ? pct((f.nutritionTrend.avgProteinG / f.target.proteinG) * 100) : null
  const nutrition = proteinPct != null ? pct(0.5 * logging + 0.5 * proteinPct) : logging
  const sleep = f.avgSleepMin != null && f.sleepNights > 0 ? pct(Math.min(100, (f.avgSleepMin / 420) * 100) * (Math.min(7, f.sleepNights) / 7)) : 0

  const highlights: string[] = []
  const concerns: string[] = []
  const strengthDone = strengthDoneThisWeek(f)

  if (strengthDone >= STRENGTH_MINIMUM) highlights.push(`${strengthDone} strength sessions — minimum met`)
  else concerns.push(`Only ${strengthDone} of ${STRENGTH_MINIMUM} minimum strength sessions done`)
  if (f.completedSessions >= f.plannedSessions && f.plannedSessions > 0) highlights.push(`All ${f.plannedSessions} planned sessions completed`)
  else if (f.missedThisWeek > 0) concerns.push(`${f.missedThisWeek} planned session${f.missedThisWeek === 1 ? '' : 's'} missed`)

  if (f.loggedDays >= 6) highlights.push(`Meals logged ${f.loggedDays}/7 days`)
  else if (f.loggedDays <= 3) concerns.push(`Meals logged on only ${f.loggedDays}/7 days — the calorie call is guesswork without data`)
  if (proteinPct != null) {
    if (proteinPct >= 90) highlights.push(`Protein averaging ${Math.round(f.nutritionTrend!.avgProteinG!)} g — on target`)
    else if (proteinPct < 70) concerns.push(`Protein averaging ${Math.round(f.nutritionTrend!.avgProteinG!)} g vs ${f.target.proteinG} g target`)
  }
  const rate = f.nutritionTrend?.weeklyRateKg ?? (f.weight.avg7 != null && f.weight.prevAvg7 != null ? f.weight.avg7 - f.weight.prevAvg7 : null)
  if (rate != null) {
    if (rate <= -0.15 && rate >= -1.2) highlights.push(`Weight down ${Math.abs(rate).toFixed(2)} kg on the 7-day average`)
    else if (rate < -1.2) concerns.push(`Weight dropping ${Math.abs(rate).toFixed(2)} kg/wk — too fast`)
    else concerns.push(`Weight flat on the 7-day average (${rate >= 0 ? '+' : ''}${rate.toFixed(2)} kg)`)
  }
  if (f.avgSleepMin != null) {
    if (f.avgSleepMin >= 420) highlights.push(`Sleep averaging ${fmtDuration(f.avgSleepMin)}`)
    else if (f.avgSleepMin < 390) concerns.push(`Sleep averaging ${fmtDuration(f.avgSleepMin)} — under 6h 30m`)
  }
  for (const r of f.gate.regions) if (r.level !== 'OK') concerns.push(`${capitalize(regionLabel(r.region))} ${r.level} — keep training around it, not through it`)
  for (const s of f.stalls) concerns.push(`${s.exerciseName} stalled — deload pending`)

  const summary = `Training ${training}%, nutrition ${nutrition}%, sleep ${sleep}%. ${highlights[0] ? highlights[0] + '. ' : ''}${concerns[0] ? `Biggest fix: ${concerns[0].toLowerCase()}.` : 'Nothing to fix — repeat the week.'}`
  return { training, nutrition, sleep, highlights, concerns, summary }
}

export type { CoachPromptExtras } from './coachPrompt'

/** The coach system prompt, assembled from ordered sections (see coachPrompt.ts). */
export function buildCoachSystemPrompt(f: CoachFacts, profileSummary: string, extras?: CoachPromptExtras): string {
  return assembleCoachPrompt({ facts: f, profileSummary, priority: computeDailyPriority(f), extras: extras ?? {} })
}

export function answerLocally(question: string, f: CoachFacts): { content: string; evidence: Evidence[] } {
  const q = question.toLowerCase()
  const priority = computeDailyPriority(f)

  if (/\b(how am i|how'?s (?:it|my week|the week|this week)|this week|progress|doing)\b/.test(q)) {
    const done = f.sessionsThisWeek.filter((s) => s.status === 'completed').length
    const plannedN = f.sessionsThisWeek.length
    const sd = strengthDoneThisWeek(f)
    const rate = f.weight.avg7 != null && f.weight.prevAvg7 != null ? f.weight.avg7 - f.weight.prevAvg7 : null
    const parts = [
      `${done} of ${plannedN} sessions done this week (${sd} strength; minimum is ${STRENGTH_MINIMUM}).`,
      f.missedThisWeek ? `${f.missedThisWeek} missed — reflow on Train or accept the reflow proposal in Coach.` : '',
      rate != null ? `Weight 7-day average ${f.weight.avg7!.toFixed(1)} kg, ${rate <= -0.15 ? `down ${Math.abs(rate).toFixed(2)} kg` : rate < 0.15 ? 'flat' : `up ${rate.toFixed(2)} kg`} on last week.` : '',
      f.loggedMealDaysLast7 <= 3 ? `Meals logged only ${f.loggedMealDaysLast7} of 7 days — that is the gap.` : `Meals logged ${f.loggedMealDaysLast7} of 7 days.`,
      f.sleepAvg7Min != null ? `Sleep averaging ${fmtDuration(f.sleepAvg7Min)}.` : '',
      `Next: ${priority.headline}`,
    ].filter(Boolean)
    return { content: parts.join(' '), evidence: priority.evidence }
  }

  if (/\b(eat|food|meal|lunch|dinner|protein|hungry|snack)\b/.test(q)) {
    const left = Math.max(0, f.target.proteinG - f.intakeToday.proteinG)
    const kcalLeft = Math.max(0, f.target.kcal - f.intakeToday.kcal)
    const foods = proteinFoods(f)
    const content = left > 0
      ? `${Math.round(left)} g protein and ${fmtN(kcalLeft)} kcal left today. Make the next meal protein-first${foods ? ` — ${foods}` : ''}. Coffee and a snack are fine; the protein is not optional.`
      : `Protein target hit (${Math.round(f.intakeToday.proteinG)} g). ${fmtN(kcalLeft)} kcal left — keep the rest light and stop when you are at the target.`
    return { content, evidence: priority.evidence.filter((e) => /protein|calories/i.test(e.label)) }
  }

  if (/\b(train|workout|session|gym|lift|rest|readiness|tired|ready|should i)\b/.test(q)) {
    const content = `${f.readiness.state}: ${f.readiness.reasons.join('; ')}. ${priority.headline} ${priority.directives.slice(0, 2).join(' ')}`
    return { content, evidence: priority.evidence }
  }

  if (/\b(weight|weigh|scale|kg|kilos|trend|heavy|lighter)\b/.test(q)) {
    const rate = f.weight.avg7 != null && f.weight.prevAvg7 != null ? f.weight.avg7 - f.weight.prevAvg7 : null
    const eta = rate != null && f.weight.avg7 != null && f.weight.goal != null ? projectDate(f.weight.avg7, f.weight.goal, rate, f.today) : null
    const content = f.weight.latest == null
      ? 'No weight logged yet — say "weight today 83.4 kilos" and I will track the 7-day average.'
      : `Latest ${f.weight.latest.toFixed(1)} kg; 7-day average ${f.weight.avg7?.toFixed(1) ?? '—'} kg${rate != null ? ` (${rate <= 0 ? '−' : '+'}${Math.abs(rate).toFixed(2)} kg vs last week)` : ''}${f.weight.goal != null ? `; goal ${f.weight.goal} kg` : ''}. ${eta ? `At this rate you reach ${f.weight.goal} kg around ${eta}.` : rate != null && rate > -0.15 ? 'Not moving yet — the trend, not a single weigh-in, decides the next calorie change.' : 'Judge it on the 7-day average, never on one weigh-in.'}`
    return { content, evidence: priority.evidence.filter((e) => /weight/i.test(e.label)) }
  }

  if (/\bsleep\b/.test(q)) {
    const content = f.sleepLastNightMin == null
      ? 'No sleep data for last night. Log it manually or connect Apple Health.'
      : `${fmtDuration(f.sleepLastNightMin)} last night${f.sleepAvg7Min != null ? `, 7-day average ${fmtDuration(f.sleepAvg7Min)}` : ''}. ${f.sleepLastNightMin < 420 ? 'One short night does not cancel training — it trims volume. Protect tonight: lights out by 23:00.' : 'Good. Keep the bedtime consistent.'}`
    return { content, evidence: priority.evidence.filter((e) => /sleep/i.test(e.label)) }
  }

  if (/\b(knee|back|neck|shoulder|hip|pain|hurt|sore)\b/.test(q)) {
    const content = f.gate.advice.length
      ? `${f.gate.advice.join(' ')} I will not push you through pain — log it if it changes.`
      : 'Nothing flagged today. If something hurts during a set, hit Pain/Issue on the exercise and I will substitute.'
    return { content, evidence: priority.evidence.filter((e) => /knee|back|neck|shoulder|hip/i.test(e.label)) }
  }

  if (/\b(stress\w*|mood|breath\w*|overwhelmed|anxious|calm)\b/.test(q)) {
    const pick = suggestTechnique({ stress: f.mind?.stressToday ?? null, valence: f.mind?.valenceToday ?? null, hourNow: f.hourNow, sleepLastNightMin: f.sleepLastNightMin })
    const name = breathingTechnique(pick.techniqueId)?.name ?? 'Coherent breathing'
    const content = `${pick.why} Open Mind and start ${name}. If it has been a rough stretch, talking to someone you trust can help — Support is on the Mind tab. Today's priority is unchanged: ${priority.headline}`
    return { content, evidence: priority.evidence.filter((e) => /stress|mood|sleep/i.test(e.label)) }
  }

  return {
    content: `${priority.headline} ${priority.directives.join(' ')} Ask me about training, food, weight, sleep or symptoms for specifics.`,
    evidence: priority.evidence,
  }
}
