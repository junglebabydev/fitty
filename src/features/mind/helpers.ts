// Pure presentation helpers for the Mind screens. No React, no db.
import type { MoodLog } from '../../domain/types'
import { addDays, dateOf } from '../../lib/util'
import { HIGH_STRESS, LOW_VALENCE } from '../../engine/mind'

/** Warm, plain, time-of-day greeting for Mind home. */
export function mindGreeting(hour: number): string {
  if (hour < 5) return 'Still up? Be easy on yourself.'
  if (hour < 12) return 'Good morning. Arrive slowly.'
  if (hour < 17) return 'A pause in the middle of the day.'
  if (hour < 21) return 'Evening. Let the day settle.'
  return 'Nearly done. Time to slow down.'
}

/** Three words on why a breathing technique is suggested. Same order of checks as `suggestTechnique`. */
export function suggestReason(i: { stress: number | null; valence: number | null; hourNow: number; sleepLastNightMin: number | null }): string {
  if (i.hourNow >= 21 || i.hourNow < 4) return 'Late, slow down'
  if (i.stress != null && i.stress >= HIGH_STRESS) return 'Stress is high'
  if (i.valence != null && i.valence <= LOW_VALENCE) return 'Today feels heavy'
  if (i.sleepLastNightMin != null && i.sleepLastNightMin < 360) return 'After short night'
  return 'Good daily baseline'
}

/** First `max` words, with an ellipsis when something was cut. */
export function clipWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/)
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`
}

export interface MoodPoint { x: string; y: number | null }

/** One point per calendar day (mean of that day's logs, null when none), oldest first, ending today. */
export function dailyMoodSeries(logs: MoodLog[], today: string, days = 14): MoodPoint[] {
  const byDate = new Map<string, number[]>()
  for (const l of logs) {
    const d = dateOf(l.ts)
    const cur = byDate.get(d)
    if (cur) cur.push(l.valence)
    else byDate.set(d, [l.valence])
  }
  const out: MoodPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i)
    const vs = byDate.get(d)
    out.push({ x: d, y: vs ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 100) / 100 : null })
  }
  return out
}

export interface MoodSummaryLike {
  avg7: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysCheckedIn7: number
}

/** The interpreted sentence above the mood chart. An observation only: no judgement, no targets. */
export function moodHeadline(s: MoodSummaryLike, words: Record<number, string>): string {
  if (s.avg7 == null || s.daysCheckedIn7 === 0) return 'Check in on a few days to see your pattern.'
  if (s.trend === 'up') return 'This week has felt a little lighter than last week.'
  if (s.trend === 'down') return 'This week has felt a little heavier than last week.'
  if (s.trend === 'flat') return 'Your mood has been steady across the last two weeks.'
  const word = (words[Math.round(s.avg7)] ?? 'Neutral').toLowerCase()
  return `Mostly ${word} over the last 7 days.`
}

/** "+0.4" / "−1.2" / "0.0" with a real minus sign. */
export function fmtValence(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits))
  if (r === 0) return (0).toFixed(digits)
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`
}

/** Plain sentence for a before → after re-rate. Never celebratory, never disappointed. */
export function moodDeltaSentence(before: number | null, after: number): string {
  if (before == null) return 'Noted. Thanks for checking in with yourself.'
  const d = after - before
  if (d > 0) return `A little lighter than before (${fmtValence(before, 0)} → ${fmtValence(after, 0)}).`
  if (d < 0) return `A little heavier than before (${fmtValence(before, 0)} → ${fmtValence(after, 0)}). That happens. The minutes still count.`
  return 'About the same as before. Steady is fine.'
}

export interface PromptLike { id: string; kind: string }

/** Shuffle: the next prompt in list order whose kind differs from the current one (wraps around). */
export function nextPrompt<T extends PromptLike>(prompts: T[], currentId: string): T | null {
  if (prompts.length === 0) return null
  const at = prompts.findIndex((p) => p.id === currentId)
  if (at < 0) return prompts[0]
  const kind = prompts[at].kind
  for (let step = 1; step <= prompts.length; step++) {
    const p = prompts[(at + step) % prompts.length]
    if (p.kind !== kind) return p
  }
  return prompts[(at + 1) % prompts.length]
}

/** Reframe prompts carry a "Thinking tool:" lead-in; drop it wherever the kind label is already shown next to the text. */
export function promptBody(text: string): string {
  const body = text.replace(/^thinking tool:\s*/i, '')
  return body === text ? text : body.charAt(0).toUpperCase() + body.slice(1)
}

/** First log of a local day is the daily check-in; later ones are momentary. */
export function moodKindFor(existingToday: number): 'daily' | 'momentary' {
  return existingToday === 0 ? 'daily' : 'momentary'
}

/** Keep only the chosen feeling words that still exist in the current band's list. */
export function keepValidLabels(chosen: string[], available: string[]): string[] {
  return chosen.filter((l) => available.includes(l))
}

export function toggleIn(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}
