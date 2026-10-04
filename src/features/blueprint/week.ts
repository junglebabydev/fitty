// The Blueprint week (src/data/programs/blueprint.ts) as Today shows it: which session a date gets, what kind of day
// it is, and the session's blocks as headed sections with one plain line each. Pure.
import type { Block, CircuitStation, ProgramSession } from '../../domain/programs'
import { parseProgramKey } from '../../domain/programs'
import type { WorkoutSession } from '../../domain/types'
import { addDays, parseDate, startOfWeek } from '../../lib/util'
import { artFrameUrl } from '../../data/exerciseMedia'

export const BLUEPRINT_ID = 'blueprint' as const

export type DayKind = 'strength' | 'hiit' | 'yoga' | 'play' | 'recovery'

/** Monday first, matching the programme's session keys w1d1 … w1d7. */
const WEEK_KINDS: DayKind[] = ['strength', 'hiit', 'yoga', 'hiit', 'strength', 'play', 'recovery']

export const KIND_META: Record<DayKind, { label: string; color: string; art: string }> = {
  // Deep hues so the white drawing reads on them in both themes.
  strength: { label: 'Strength', color: '#c93400', art: artFrameUrl('kettlebell-swing', 1) },
  hiit: { label: 'HIIT', color: '#d70015', art: artFrameUrl('assault-bike', 1) },
  yoga: { label: 'Strength + yoga', color: '#248a3d', art: artFrameUrl('cat-cow-stretch', 1) },
  play: { label: 'Play', color: '#1d6fd1', art: artFrameUrl('jumping-jack', 1) },
  recovery: { label: 'Recovery', color: '#8944ab', art: artFrameUrl('butterfly-stretch', 1) },
}

/** 0 = Monday … 6 = Sunday. */
function weekday(date: string): number {
  return (parseDate(date).getDay() + 6) % 7
}

/** The programme session a date gets: Monday → 'w1d1' … Sunday → 'w1d7'. */
export function dayKey(date: string): string {
  return `w1d${weekday(date) + 1}`
}

export function dayKind(date: string): DayKind {
  return WEEK_KINDS[weekday(date)]
}

/** Monday to Sunday of the week holding `date`. */
export function weekDates(date: string): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function isBlueprintRow(s: Pick<WorkoutSession, 'templateKey'>): boolean {
  return parseProgramKey(s.templateKey)?.programId === BLUEPRINT_ID
}

type RowLike = Pick<WorkoutSession, 'templateKey' | 'scheduledDate' | 'status' | 'id'>

/**
 * The row Today acts on for a session key on a date: in progress first, then completed, then an untouched planned
 * one. Without a key, any Blueprint row that date.
 */
export function rowForDate<T extends RowLike>(rows: T[], date: string, key?: string): T | null {
  const rank = { in_progress: 0, completed: 1, planned: 2, skipped: 3 } as const
  const own = rows.filter((r) => r.scheduledDate === date && isBlueprintRow(r) && r.status !== 'skipped' && (!key || r.templateKey.endsWith(`:${key}`)))
  return own.sort((a, b) => rank[a.status] - rank[b.status] || b.id - a.id)[0] ?? null
}

/** A day is done once any Blueprint session scheduled on it is finished (a day's own, or one moved to it). */
export function doneOn(rows: RowLike[], date: string): boolean {
  return rows.some((r) => r.scheduledDate === date && isBlueprintRow(r) && r.status === 'completed')
}

// --- sections and lines ----------------------------------------------------------------------------------------

export interface Section { title: string; meta: string | null; blocks: Block[] }

/** Consecutive blocks with the same `section` under one heading. A block without one starts an untitled section. */
export function sections(session: Pick<ProgramSession, 'blocks'>): Section[] {
  const out: Section[] = []
  for (const b of session.blocks) {
    const title = b.section ?? ''
    const last = out[out.length - 1]
    if (last && title && last.title === title) last.blocks.push(b)
    else out.push({ title, meta: null, blocks: [b] })
  }
  for (const s of out) {
    const rounds = s.blocks.length === 1 && (s.blocks[0].shape === 'circuit' || s.blocks[0].shape === 'intervals') ? s.blocks[0].rounds : null
    s.meta = rounds && rounds > 1 ? `${rounds} rounds` : null
  }
  return out
}

const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`)

/** "45 s", "4 min", "1 min 30 s". */
export function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60), s = sec % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

const each = (perSide?: boolean) => (perSide ? ' each side' : '')

/** One line for a sets, steady or intervals block ("3 × 10–15", "25 min", "20 s all-out, 20 s very easy"). */
export function blockLine(b: Exclude<Block, { shape: 'circuit' }>): string {
  if (b.shape === 'sets') return b.reps ? `${b.sets} × ${range(b.reps)}${each(b.perSide)}` : `${b.sets} × ${range(b.seconds!)} s${each(b.perSide)}`
  if (b.shape === 'steady') return `${b.minutes} min`
  return `${fmtSeconds(b.work.seconds)} ${b.work.effort ?? 'hard'}, ${fmtSeconds(b.rest.seconds)} ${b.rest.effort ?? 'easy'}`
}

/** One line for a circuit station ("30 s each side", "6–8 each side"). */
export function stationLine(s: CircuitStation): string {
  if (s.reps) return `${range(s.reps)}${each(s.perSide)}`
  return `${s.seconds ?? 0} s${each(s.perSide)}`
}

/** Exercise ids in the order they appear (circuit stations included), without repeats. */
export function sessionExerciseIds(session: Pick<ProgramSession, 'blocks'>): string[] {
  const ids = session.blocks.flatMap((b) => (b.shape === 'circuit' ? b.stations.map((s) => s.exerciseId) : b.shape === 'intervals' ? [b.work.exerciseId] : [b.exerciseId]))
  return [...new Set(ids)]
}
