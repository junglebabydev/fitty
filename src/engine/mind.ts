// Mind pillar rules (docs/DESIGN.md §6 Mind, §9). Pure: no db / react imports.
// Non-clinical by design: nothing here diagnoses, names a condition or scores a questionnaire.
// Copy is an observation plus an option; the Support sheet itself is hard-coded in the UI.
import type { MindSession, MoodLog, SleepRecord, WorkoutSession } from '../domain/types'
import { addDays, dateOf, daysBetween } from '../lib/util'

// --- vocabulary -------------------------------------------------------------------

export const VALENCE_MIN = -3
export const VALENCE_MAX = 3

export const VALENCE_WORDS: Record<number, string> = {
  [-3]: 'Very unpleasant',
  [-2]: 'Unpleasant',
  [-1]: 'Slightly unpleasant',
  [0]: 'Neutral',
  [1]: 'Slightly pleasant',
  [2]: 'Pleasant',
  [3]: 'Very pleasant',
}

export type MoodBand = 'low' | 'neutral' | 'high'

/** Feeling chips by valence band (≤ 8 each). Everyday words only. */
export const MOOD_LABELS: Record<MoodBand, string[]> = {
  low: ['Stressed', 'Worried', 'Sad', 'Drained', 'Irritated', 'Overwhelmed', 'Lonely', 'Disappointed'],
  neutral: ['Calm', 'Content', 'Okay', 'Tired', 'Restless', 'Focused', 'Indifferent', 'Unsure'],
  high: ['Happy', 'Grateful', 'Proud', 'Energised', 'Relaxed', 'Confident', 'Hopeful', 'Excited'],
}

export function bandForValence(v: number): MoodBand {
  if (v <= -1) return 'low'
  if (v >= 1) return 'high'
  return 'neutral'
}

export function labelsForValence(v: number): string[] {
  return MOOD_LABELS[bandForValence(v)]
}

export const MOOD_CONTEXTS: string[] = [
  'Work', 'Family', 'Partner', 'Social', 'Health', 'Sleep', 'Training', 'Food', 'Money', 'Weather', 'Travel', 'Downtime',
]

/** Nights under this count as short when pre-selecting the Sleep context. */
export const SHORT_NIGHT_MIN = 420

/** Context chips to pre-select from what the app already knows about today. Always a subset of MOOD_CONTEXTS. */
export function suggestContexts(facts: { trainedToday: boolean; sleepMin: number | null; painToday: boolean }): string[] {
  const out: string[] = []
  if (facts.sleepMin != null && facts.sleepMin < SHORT_NIGHT_MIN) out.push('Sleep')
  if (facts.trainedToday) out.push('Training')
  if (facts.painToday) out.push('Health')
  return out
}

// --- breathing ---------------------------------------------------------------------

export type BreathPhaseKind = 'inhale' | 'hold' | 'exhale' | 'rest'
export interface BreathPhase { phase: BreathPhaseKind; seconds: number; label: string }
export type BreathingTechniqueId = 'box' | '478' | 'sigh' | 'coherent'

export interface BreathingTechnique {
  id: BreathingTechniqueId
  name: string
  purpose: string
  phases: BreathPhase[]
  maxCycles?: number
  note: string
}

export const BREATHING_TECHNIQUES: BreathingTechnique[] = [
  {
    id: 'box',
    name: 'Box breathing',
    purpose: 'Steady focus',
    phases: [
      { phase: 'inhale', seconds: 4, label: 'Breathe in' },
      { phase: 'hold', seconds: 4, label: 'Hold' },
      { phase: 'exhale', seconds: 4, label: 'Breathe out' },
      { phase: 'hold', seconds: 4, label: 'Hold' },
    ],
    note: 'Four equal counts. Good before a session or a hard conversation.',
  },
  {
    id: '478',
    name: '4-7-8',
    purpose: 'Wind down for sleep',
    phases: [
      { phase: 'inhale', seconds: 4, label: 'Breathe in' },
      { phase: 'hold', seconds: 7, label: 'Hold' },
      { phase: 'exhale', seconds: 8, label: 'Breathe out slowly' },
    ],
    maxCycles: 4,
    note: 'Four cycles at most. Breathe normally if you feel light-headed.',
  },
  {
    id: 'sigh',
    name: 'Physiological sigh',
    purpose: 'Quick reset',
    phases: [
      { phase: 'inhale', seconds: 2, label: 'Breathe in' },
      { phase: 'inhale', seconds: 1, label: 'Top up' },
      { phase: 'exhale', seconds: 6, label: 'Long breath out' },
    ],
    note: 'Two breaths in through the nose, one long breath out. A minute is enough.',
  },
  {
    id: 'coherent',
    name: 'Coherent breathing',
    purpose: 'Settle and even out',
    phases: [
      { phase: 'inhale', seconds: 5.5, label: 'Breathe in' },
      { phase: 'exhale', seconds: 5.5, label: 'Breathe out' },
    ],
    note: 'Slow and even, about five and a half breaths a minute.',
  },
]

export function breathingTechnique(id: string): BreathingTechnique | null {
  return BREATHING_TECHNIQUES.find((t) => t.id === id) ?? null
}

/** Seconds for one full cycle of a technique. */
export function cycleSeconds(t: BreathingTechnique): number {
  return t.phases.reduce((sum, p) => sum + p.seconds, 0)
}

export const HIGH_STRESS = 7
export const LOW_VALENCE = -2

export function suggestTechnique(i: { stress: number | null; valence: number | null; hourNow: number; sleepLastNightMin: number | null }): { techniqueId: string; why: string } {
  if (i.hourNow >= 21 || i.hourNow < 4) return { techniqueId: '478', why: 'It is late. 4-7-8 slows things down before bed.' }
  if (i.stress != null && i.stress >= HIGH_STRESS) return { techniqueId: 'sigh', why: `Stress is ${i.stress}/10 today. A minute of long breaths out is the quickest reset.` }
  if (i.valence != null && i.valence <= LOW_VALENCE) return { techniqueId: 'coherent', why: 'Today feels heavy. A few minutes of slow, even breathing can take the edge off.' }
  if (i.sleepLastNightMin != null && i.sleepLastNightMin < 360) return { techniqueId: 'box', why: 'Short night. Box breathing helps steady focus.' }
  return { techniqueId: 'coherent', why: 'Slow, even breathing is a good daily baseline.' }
}

// --- journal -----------------------------------------------------------------------

export type JournalPromptKind = 'gratitude' | 'win' | 'reflection' | 'reframe'
export interface JournalPrompt { id: string; kind: JournalPromptKind; text: string }

/** Display names for prompt kinds. A reframe is a thinking tool, not therapy. */
export const JOURNAL_KIND_LABELS: Record<JournalPromptKind, string> = {
  gratitude: 'Gratitude',
  win: 'Win',
  reflection: 'Reflection',
  reframe: 'Thinking tool',
}

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  { id: 'gratitude_small', kind: 'gratitude', text: 'What is one small thing from today you are glad happened?' },
  { id: 'win_today', kind: 'win', text: 'What went right today, however small?' },
  { id: 'reflection_energy', kind: 'reflection', text: 'What gave you energy today, and what took it away?' },
  { id: 'reframe_friend', kind: 'reframe', text: 'Thinking tool: pick one thought that is weighing on you. What would you say to a friend who had it?' },
  { id: 'gratitude_person', kind: 'gratitude', text: 'Who made your day a little easier, and how?' },
  { id: 'win_showed_up', kind: 'win', text: 'Where did you show up today even though it was not easy?' },
  { id: 'reflection_tomorrow', kind: 'reflection', text: 'What is one thing you want tomorrow to have in it?' },
  { id: 'reframe_facts', kind: 'reframe', text: 'Thinking tool: write down a worry. Which parts are facts, and which parts are guesses?' },
  { id: 'gratitude_body', kind: 'gratitude', text: 'What did your body let you do today?' },
  { id: 'win_week', kind: 'win', text: 'What are you doing better now than a month ago?' },
  { id: 'reflection_noticed', kind: 'reflection', text: 'What did you notice about your mood today, and what was going on around it?' },
  { id: 'reframe_control', kind: 'reframe', text: 'Thinking tool: for something bothering you, what is in your control and what is not?' },
  { id: 'gratitude_place', kind: 'gratitude', text: 'Where did you feel most at ease today?' },
  { id: 'reflection_letgo', kind: 'reflection', text: 'What can you put down for the night?' },
]

/** Deterministic prompt of the day; consecutive days rotate through the kinds. */
export function promptForDate(date: string): JournalPrompt {
  const n = JOURNAL_PROMPTS.length
  const i = ((daysBetween('2026-01-01', date) % n) + n) % n
  return JOURNAL_PROMPTS[i]
}

// --- summaries ---------------------------------------------------------------------

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round2 = (n: number) => Math.round(n * 100) / 100

/** Mean valence per local calendar date. */
export function dailyValence(logs: MoodLog[]): Map<string, number> {
  const byDate = new Map<string, number[]>()
  for (const l of logs) {
    const d = dateOf(l.ts)
    const cur = byDate.get(d)
    if (cur) cur.push(l.valence)
    else byDate.set(d, [l.valence])
  }
  const out = new Map<string, number>()
  for (const [d, vs] of byDate) out.set(d, mean(vs) as number)
  return out
}

function windowAvg(daily: Map<string, number>, from: string, to: string): { avg: number | null; days: number } {
  const vs: number[] = []
  for (const [d, v] of daily) if (d >= from && d <= to) vs.push(v)
  return { avg: mean(vs), days: vs.length }
}

export interface MoodSummary {
  todayValence: number | null
  avg7: number | null
  prevAvg7: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysCheckedIn7: number
}

/** Difference between the two 7-day averages that counts as a change. */
export const MOOD_TREND_DELTA = 0.3

/** Today's latest valence plus 7-day averages of the daily means (several logs in one day count once). */
export function moodSummary(logs: MoodLog[], today: string): MoodSummary {
  const todays = logs.filter((l) => dateOf(l.ts) === today).sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id)
  const daily = dailyValence(logs)
  const cur = windowAvg(daily, addDays(today, -6), today)
  const prev = windowAvg(daily, addDays(today, -13), addDays(today, -7))
  let trend: MoodSummary['trend'] = null
  if (cur.avg != null && prev.avg != null) {
    const diff = cur.avg - prev.avg
    trend = diff >= MOOD_TREND_DELTA ? 'up' : diff <= -MOOD_TREND_DELTA ? 'down' : 'flat'
  }
  return {
    todayValence: todays.length ? todays[todays.length - 1].valence : null,
    avg7: cur.avg != null ? round2(cur.avg) : null,
    prevAvg7: prev.avg != null ? round2(prev.avg) : null,
    trend,
    daysCheckedIn7: cur.days,
  }
}

// --- insights ------------------------------------------------------------------------

export interface MindInsight {
  id: string
  text: string
  withAvg: number
  withoutAvg: number
  nWith: number
  nWithout: number
  caveat: string
}

export const INSIGHT_MIN_DAYS = 5
/** Averages closer than this are not reported as higher or lower. */
export const INSIGHT_MIN_DIFF = 0.25
export const INSIGHT_WINDOW_DAYS = 90
export const INSIGHT_CAVEAT = 'Other factors can influence this.'
export const GOOD_SLEEP_MIN = 420

export interface MindInsightsInput {
  moods: MoodLog[]
  sleep: SleepRecord[]
  sessions: WorkoutSession[]
  mindSessions: MindSession[]
  today: string
}

/**
 * Mood on days with a factor against days without it. An insight is only emitted with at least
 * 5 days on each side and a visible difference. Today is left out of the trained / breathing
 * factors because the day is not over; nights with no sleep record are left out of the sleep factor.
 */
export function mindInsights(input: MindInsightsInput): MindInsight[] {
  const { today } = input
  const from = addDays(today, -(INSIGHT_WINDOW_DAYS - 1))
  const daily = new Map([...dailyValence(input.moods)].filter(([d]) => d >= from && d <= today))

  const sleepByDate = new Map<string, number>()
  for (const s of input.sleep) {
    const d = dateOf(s.endTs)
    sleepByDate.set(d, Math.max(sleepByDate.get(d) ?? 0, s.durationMin))
  }
  const trainedDates = new Set(input.sessions.filter((s) => s.status === 'completed').map((s) => (s.completedAt ? dateOf(s.completedAt) : s.scheduledDate)))
  const breathDates = new Set(input.mindSessions.filter((s) => s.kind === 'breathing').map((s) => dateOf(s.ts)))

  const factors: { id: string; when: string; test: (d: string) => boolean | null }[] = [
    { id: 'sleep_7h', when: 'you slept 7 h or more the night before', test: (d) => (sleepByDate.has(d) ? (sleepByDate.get(d) as number) >= GOOD_SLEEP_MIN : null) },
    { id: 'trained', when: 'you trained', test: (d) => (d < today ? trainedDates.has(d) : null) },
    { id: 'breathing', when: 'you did a breathing session', test: (d) => (d < today ? breathDates.has(d) : null) },
  ]

  const out: MindInsight[] = []
  for (const f of factors) {
    const withVals: number[] = []
    const withoutVals: number[] = []
    for (const [d, v] of daily) {
      const has = f.test(d)
      if (has === null) continue
      if (has) withVals.push(v)
      else withoutVals.push(v)
    }
    if (withVals.length < INSIGHT_MIN_DAYS || withoutVals.length < INSIGHT_MIN_DAYS) continue
    const withAvg = mean(withVals) as number
    const withoutAvg = mean(withoutVals) as number
    const diff = withAvg - withoutAvg
    if (Math.abs(diff) < INSIGHT_MIN_DIFF) continue
    out.push({
      id: f.id,
      text: `On days when ${f.when}, your mood tends to be ${diff > 0 ? 'higher' : 'lower'}.`,
      withAvg: round2(withAvg),
      withoutAvg: round2(withoutAvg),
      nWith: withVals.length,
      nWithout: withoutVals.length,
      caveat: INSIGHT_CAVEAT,
    })
  }
  return out
}

// --- support signal ------------------------------------------------------------------

function lowDays(logs: MoodLog[], from: string, to: string): number {
  const days = new Set<string>()
  for (const l of logs) {
    if (l.valence > LOW_VALENCE) continue
    const d = dateOf(l.ts)
    if (d >= from && d <= to) days.add(d)
  }
  return days.size
}

/** An observation plus an option, never a label: 4+ low days in the last 7, or 9+ in the last 14. */
export function supportSignal(logs: MoodLog[], today: string): { show: boolean; message: string } {
  const in7 = lowDays(logs, addDays(today, -6), today)
  if (in7 >= 4) return { show: true, message: `Low mood on ${in7} of the last 7 days. Talking to someone can help.` }
  const in14 = lowDays(logs, addDays(today, -13), today)
  if (in14 >= 9) return { show: true, message: `Low mood on ${in14} of the last 14 days. Talking to someone can help.` }
  return { show: false, message: '' }
}
