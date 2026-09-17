// The "Starting point" baseline written at the end of the intake conversation (DESIGN §10.3).
// With AI connected the model writes it from the structured answers; otherwise `localBaseline`
// produces the same shape deterministically. Nothing here touches the database: the caller stores
// the result under the `profile.baseline` setting.
import { aiConnected, aiJson } from '../../ai'

export interface Baseline {
  summary: string
  strengths: string[]
  watchouts: string[]
  firstWeek: string[]
  generatedBy: 'ai' | 'local'
  ts: string
}

export type BaselineBody = Pick<Baseline, 'summary' | 'strengths' | 'watchouts' | 'firstWeek'>

/** Structured intake answers. Labels, not internal codes, so both the model and the local rules read plain words. */
export interface BaselineAnswers {
  age: number | null
  sex: string
  heightCm: number | null
  weightKg: number | null
  waistCm: number | null
  goal: string | null
  targetWeightKg: number | null
  horizonMonths: number
  experience: string
  /** '0' | '1-2' | '3-4' | '5+' */
  recentSessions: string | null
  enjoys: string[]
  daysPerWeek: number
  minutesPerSession: number | null
  equipment: string[]
  conditions: { region: string; label: string; aggravators: string[] }[]
  mealsPerDay: string
  skipsBreakfast: boolean
  foods: string[]
  alcohol: string | null
  caffeine: string | null
  supplements: string
  sleepHours: number | null
  bedtime: string | null
  stress: number | null
  energy: number | null
  wants: string[]
  worked: string[]
  notWorked: string[]
  historyNote: string
  kcal: number | null
  proteinG: number | null
  coachStyle: string
}

export const BASELINE_LIMITS = { summaryWords: 45, strengths: 3, watchouts: 3, firstWeek: 4, itemWords: 16 } as const

export const BASELINE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'strengths', 'watchouts', 'firstWeek'],
  properties: {
    summary: { type: 'string', description: 'Where this person is starting from. At most 45 words. Second person.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'At most 3 items, each at most 12 words.' },
    watchouts: { type: 'array', items: { type: 'string' }, description: 'At most 3 items, each at most 12 words.' },
    firstWeek: { type: 'array', items: { type: 'string' }, description: 'At most 4 concrete actions for the first week, each at most 12 words.' },
  },
}

export const BASELINE_SYSTEM = [
  'You are a strength, nutrition and wellbeing coach writing a short "Starting point" for a new client from their intake answers.',
  'Voice: demanding but kind, specific, evidence-linked, never shaming. State, reason, action. Never use the words cheat, bad, earned, fail or lazy.',
  'Safety rules:',
  '- Never diagnose, never name a condition the client did not list, never make medical claims, never promise outcomes.',
  '- Respect every listed body area. When a knee, back or neck is flagged, the first week uses machines and dumbbells, low-impact conditioning (bike, incline walk, pool) and no running or jumping.',
  '- Report lines, when present, are context only. Do not interpret lab values; at most say which result to discuss with their clinician.',
  '- The calorie and protein targets are shown next to your text and stay editable: refer to them without restating the numbers, and never invent numbers.',
  'Format: summary at most 45 words; at most 3 strengths, 3 watch-outs and 4 first-week actions; each item at most 12 words, plain text, no markdown.',
].join('\n')

function line(label: string, value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  return `${label}: ${value}`
}

/** The user message: one fact per line. No name and no date of birth leave the device. */
export function baselinePrompt(a: BaselineAnswers, reportLines: string[] = []): string {
  const facts = [
    line('Primary goal', a.goal),
    line('Age', a.age),
    line('Sex', a.sex),
    line('Height (cm)', a.heightCm),
    line('Weight (kg)', a.weightKg),
    line('Waist (cm)', a.waistCm),
    line('Target weight (kg)', a.targetWeightKg),
    a.targetWeightKg != null ? line('Timeframe (months)', a.horizonMonths) : null,
    line('Training experience', a.experience),
    line('Sessions per week lately', a.recentSessions),
    line('Enjoys', a.enjoys.join(', ')),
    line('Days available per week', a.daysPerWeek),
    line('Minutes per session', a.minutesPerSession),
    line('Equipment', a.equipment.join(', ')),
    ...a.conditions.map((c) => `Area to look after: ${c.region} (${c.label})${c.aggravators.length ? `, aggravated by ${c.aggravators.join(', ')}` : ''}`),
    a.conditions.length === 0 ? 'Areas to look after: none listed' : null,
    line('Meals per day', a.mealsPerDay),
    `Skips breakfast: ${a.skipsBreakfast ? 'yes' : 'no'}`,
    line('Typical food', a.foods.join(', ')),
    line('Alcohol', a.alcohol),
    line('Caffeine', a.caffeine),
    line('Supplements', a.supplements),
    line('Usual sleep (hours)', a.sleepHours),
    line('Bedtime', a.bedtime),
    line('Stress now (0-10)', a.stress),
    line('Energy now (0-10)', a.energy),
    line('Wants more of', a.wants.join(', ')),
    line('Has worked before', a.worked.join(', ')),
    line('Has not worked before', a.notWorked.join(', ')),
    line('In their words', a.historyNote),
    line('Daily calorie target (kcal)', a.kcal),
    line('Daily protein target (g)', a.proteinG),
    line('Preferred coach style', a.coachStyle),
  ].filter((x): x is string => !!x)

  const reports = reportLines.length ? `\n\nReport context (shared by the client, context only):\n${reportLines.map((r) => `- ${r}`).join('\n')}` : ''
  return `Intake answers:\n${facts.map((f) => `- ${f}`).join('\n')}${reports}\n\nWrite the Starting point.`
}

// --- shaping -----------------------------------------------------------------------

export function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= max) return words.join(' ')
  return `${words.slice(0, max).join(' ').replace(/[,;:.]+$/, '')}…`
}

function cleanList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => capWords(x.replace(/^[-•*\s]+/, ''), BASELINE_LIMITS.itemWords))
    .filter(Boolean)
    .slice(0, max)
}

/** Enforces the contract on whatever the model returned. Null when it is unusable. */
export function sanitizeBaseline(raw: unknown): BaselineBody | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const summary = typeof r.summary === 'string' ? capWords(r.summary, BASELINE_LIMITS.summaryWords) : ''
  const firstWeek = cleanList(r.firstWeek, BASELINE_LIMITS.firstWeek)
  if (!summary || firstWeek.length === 0) return null
  return { summary, strengths: cleanList(r.strengths, BASELINE_LIMITS.strengths), watchouts: cleanList(r.watchouts, BASELINE_LIMITS.watchouts), firstWeek }
}

// --- deterministic fallback ------------------------------------------------------------

const JOINT_CARE = /knee|back|neck/i

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** "Left knee" + "Right knee" → "knees"; several back regions → "back". Lower-case, unique, at most `max`. */
export function areaNames(regions: string[], max = 3): string[] {
  const lower = regions.map((r) => r.trim().toLowerCase()).filter(Boolean)
  const knees = lower.filter((r) => r.includes('knee'))
  const backs = lower.filter((r) => r.includes('back'))
  const out: string[] = []
  for (const r of lower) {
    const name = r.includes('knee') && knees.length > 1 ? 'knees' : r.includes('back') && backs.length > 1 ? 'back' : r
    if (!out.includes(name)) out.push(name)
  }
  return out.slice(0, max)
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Sessions to aim for in week one: ramp from what they have actually been doing. */
export function firstWeekSessions(a: Pick<BaselineAnswers, 'recentSessions' | 'daysPerWeek'>): number {
  const days = Math.max(1, a.daysPerWeek)
  if (a.recentSessions === '0') return Math.min(days, 2)
  if (a.recentSessions === '1-2') return Math.min(days, 3)
  return days
}

/** Same shape as the AI baseline, built from rules only. Pure. */
export function localBaseline(a: BaselineAnswers): BaselineBody {
  const careful = a.conditions.filter((c) => JOINT_CARE.test(c.region))
  const sessions = firstWeekSessions(a)

  // Summary: where you are → what that means → the first lever.
  const s: string[] = []
  if (a.weightKg != null && a.targetWeightKg != null && Math.abs(a.targetWeightKg - a.weightKg) >= 0.5) {
    s.push(`You start at ${fmt(a.weightKg)} kg, aiming for ${fmt(a.targetWeightKg)} kg in ${a.horizonMonths} month${a.horizonMonths === 1 ? '' : 's'}.`)
  } else if (a.weightKg != null) {
    s.push(`You start at ${fmt(a.weightKg)} kg${a.goal ? `, and the goal is to ${a.goal.toLowerCase()}` : ''}.`)
  } else if (a.goal) {
    s.push(`The goal is to ${a.goal.toLowerCase()}.`)
  }
  if (a.recentSessions === '0') s.push('Training restarts from zero, so rhythm comes before intensity.')
  else if (a.recentSessions === '1-2') s.push('You have trained on and off, so the first job is a steady week.')
  else if (a.recentSessions) s.push('You already train regularly, so the work is precision: load, protein, sleep.')
  if (a.conditions.length) s.push(`Exercise choice works around your ${joinAnd(areaNames(a.conditions.map((c) => c.region)))}.`)
  else if (a.sleepHours != null && a.sleepHours < 6.5) s.push('Sleep is the first lever.')

  const strengths: string[] = []
  if (a.recentSessions === '3-4' || a.recentSessions === '5+') strengths.push(`Already training ${a.recentSessions === '5+' ? '5+' : '3–4'} times a week`)
  if (a.experience === 'Advanced' || a.experience === 'Intermediate') strengths.push(`${a.experience} lifting experience to build on`)
  if (a.worked.length) strengths.push(`${a.worked[0]} has worked before, so it stays`)
  if (a.sleepHours != null && a.sleepHours >= 7) strengths.push(`${fmt(a.sleepHours)} h of sleep supports recovery`)
  if (a.bedtime === 'Same time') strengths.push('A consistent bedtime')
  if (a.foods.some((f) => /home|prep/i.test(f))) strengths.push('Home-cooked meals make protein easier to hit')
  if (a.stress != null && a.stress <= 3) strengths.push('Stress is low right now')
  if (a.daysPerWeek >= 4) strengths.push(`${a.daysPerWeek} days a week set aside`)
  if (strengths.length === 0) strengths.push('A clear goal and an honest starting point')

  const watchouts: string[] = []
  if (careful.length) {
    watchouts.push(`${capFirst(joinAnd(areaNames(careful.map((c) => c.region))))}: machines and dumbbells, low impact, stop on sharp pain`)
  }
  const others = a.conditions.filter((c) => !JOINT_CARE.test(c.region))
  if (others.length) watchouts.push(`${capFirst(joinAnd(areaNames(others.map((c) => c.region))))}: pain-free range only, swap what aggravates it`)
  if (a.sleepHours != null && a.sleepHours < 6.5) watchouts.push(`Sleep near ${fmt(a.sleepHours)} h: volume is trimmed after short nights`)
  if (a.stress != null && a.stress >= 7) watchouts.push('Stress is high: three minutes of breathing on heavy days')
  if (a.weightKg != null && a.targetWeightKg != null && a.horizonMonths > 0) {
    const perWeek = Math.abs(a.targetWeightKg - a.weightKg) / (a.horizonMonths * 4.345)
    if (perWeek > a.weightKg * 0.01) watchouts.push('The target pace is fast; expect a longer runway')
  }
  if (a.recentSessions === '0' && a.daysPerWeek >= 4) watchouts.push(`0 to ${a.daysPerWeek} sessions is a big jump: build up over weeks`)
  if (a.alcohol === 'Most days') watchouts.push('Alcohol most days: log it like any other food')
  if (a.proteinG != null && a.proteinG >= 120 && a.mealsPerDay !== '3+') watchouts.push(`${a.proteinG} g protein in few meals needs big servings`)
  if (watchouts.length === 0) watchouts.push('Nothing flagged. Tell the coach when something changes')

  const firstWeek: string[] = []
  firstWeek.push(`${sessions} session${sessions === 1 ? '' : 's'}${a.minutesPerSession ? ` of about ${a.minutesPerSession} min` : ''}${careful.length ? ', machines and dumbbells' : ''}`)
  if (a.proteinG != null && a.kcal != null) firstWeek.push(`${a.proteinG} g protein a day, near ${a.kcal.toLocaleString('en-SG')} kcal`)
  firstWeek.push('Log every meal; a photo is enough')
  if (careful.length) firstWeek.push('Conditioning stays low impact: bike, incline walk or pool')
  else if ((a.sleepHours != null && a.sleepHours < 7) || (a.bedtime != null && a.bedtime !== 'Same time')) firstWeek.push('One fixed lights-out time, aiming for 7 h')
  else firstWeek.push('A 20-second check-in each morning')

  return {
    summary: capWords(s.join(' ') || 'This is your starting line. The first week sets the rhythm.', BASELINE_LIMITS.summaryWords),
    strengths: strengths.slice(0, BASELINE_LIMITS.strengths),
    watchouts: watchouts.slice(0, BASELINE_LIMITS.watchouts),
    firstWeek: firstWeek.slice(0, BASELINE_LIMITS.firstWeek),
  }
}

// --- build -----------------------------------------------------------------------------

/**
 * AI when connected, local rules otherwise, and local rules again on any AI failure:
 * this never throws, so finishing onboarding never depends on the network.
 */
export async function buildBaseline(answers: BaselineAnswers, opts: { reportLines?: string[]; now?: string } = {}): Promise<Baseline> {
  const ts = opts.now ?? new Date().toISOString()
  const local = (): Baseline => ({ ...localBaseline(answers), generatedBy: 'local', ts })
  if (!aiConnected()) return local()
  const reportLines = opts.reportLines ?? []
  try {
    const raw = await aiJson<unknown>(
      { system: BASELINE_SYSTEM, prompt: baselinePrompt(answers, reportLines), schema: BASELINE_SCHEMA },
      { dataType: 'intake_answers', purpose: `Starting point summary (intake answers${reportLines.length ? ', report summaries' : ''})` },
    )
    const clean = sanitizeBaseline(raw)
    return clean ? { ...clean, generatedBy: 'ai', ts } : local()
  } catch {
    return local()
  }
}
