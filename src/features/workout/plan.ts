// Weekly-plan mutations used by the Train screen (tier changes, reflow, next-week generation).
import type { WorkoutSession } from '../../domain/types'
import { db } from '../../db/database'
import { createSession, deleteSession, getSession, getSessions, getSetting, setSetting, updateSession } from '../../db/repositories'
import { PROGRAM_SETTING, isProgramDerived, isProgramSession, type Enrollment } from '../../domain/programs'
import { buildWeek, reflowProgramWeek, reflowWeek, sessionFromTemplate, type ReflowMove } from '../../engine'
import { addDays, dayName, startOfWeek } from '../../lib/util'
import { TRAIN_TIER_SETTING, isMissed, tierRank, type Tier } from './helpers'
import { currentWindowEnd } from './program'

export function weekSessions(weekStart: string): WorkoutSession[] {
  return getSessions(weekStart, addDays(weekStart, 6))
}

export function missedSessions(sessions: WorkoutSession[], today: string): WorkoutSession[] {
  return sessions.filter((s) => isMissed(s, today))
}

/** Days in [from, to] with no planned/in-progress/completed session. */
export function freeDays(sessions: WorkoutSession[], from: string, to: string): string[] {
  const occupied = new Set(sessions.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate))
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (!occupied.has(d)) out.push(d)
  return out
}

/**
 * Tier sessions reflow as before (reflowWeek leaves programme rows in place). Missed programme rows then move later
 * in their programme window with reflowProgramWeek, around where the tier moves landed; they are never dropped.
 */
export function computeReflow(sessions: WorkoutSession[], today: string): ReflowMove[] {
  const moves = reflowWeek(sessions, today)
  const windowEnd = currentWindowEnd(today)
  if (!windowEnd) return moves
  const byMove = new Map(moves.map((m) => [m.id, m]))
  const rows = new Map(getSessions(addDays(windowEnd, -6), windowEnd).map((s) => [s.id, s]))
  for (const s of sessions) rows.set(s.id, s)
  const after = [...rows.values()].map((s): WorkoutSession => {
    const m = byMove.get(s.id)
    return !m ? s : m.drop ? { ...s, status: 'skipped' } : { ...s, scheduledDate: m.scheduledDate }
  })
  const programMoves = reflowProgramWeek(after, today, windowEnd).map((m): ReflowMove => {
    const s = rows.get(m.id)!
    return { id: m.id, scheduledDate: m.scheduledDate, note: `Moved ${s.name} from ${dayName(s.scheduledDate)} to ${m.scheduledDate === today ? 'today' : dayName(m.scheduledDate)}` }
  })
  return [...moves, ...programMoves]
}

/** Apply reflow moves: reschedule moved sessions, mark dropped ones skipped. Programme rows are never dropped (§6.5). */
export function applyReflow(sessions: WorkoutSession[], moves: ReflowMove[]): { moved: number; dropped: number } {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  let moved = 0, dropped = 0
  db.transaction(() => {
    for (const m of moves) {
      // Programme moves may reach outside the calendar week shown (the window is 7 days from the enrolment).
      const s = byId.get(m.id) ?? getSession(m.id)
      if (!s) continue
      if (m.drop) {
        if (isProgramSession(s)) continue
        updateSession(m.id, { status: 'skipped', notes: s.notes ? `${s.notes}\n${m.note}` : m.note })
        dropped++
      } else if (m.scheduledDate !== s.scheduledDate) {
        updateSession(m.id, { scheduledDate: m.scheduledDate, notes: s.notes ? `${s.notes}\n${m.note}` : m.note })
        moved++
      }
    }
  })
  return { moved, dropped }
}

/** Create the full week from the planner. Returns the number of sessions created. */
export function planWeek(weekStart: string, tier: Tier): number {
  const rows = buildWeek(weekStart, tier)
  db.transaction(() => { for (const r of rows) createSession(r) })
  return rows.length
}

export function addSessionFromTemplate(templateKey: string, scheduledDate: string): number {
  return createSession(sessionFromTemplate(templateKey, scheduledDate))
}

export interface TierChange { added: string[]; removed: string[] }

/**
 * Switch the active tier and reconcile the given week:
 * - upgrading adds the templates of the new tier that are not yet in the week (on their layout day,
 *   or the next free day when that day has passed);
 * - downgrading removes untouched planned sessions above the new tier.
 * Completed, in-progress and skipped sessions are never touched.
 * Programme rows are never removed (PRD §6.5); while a programme is active this is a no-op.
 */
export function applyTier(tier: Tier, weekStart: string, today: string): TierChange {
  const start = startOfWeek(weekStart)
  const end = addDays(start, 6)
  const change: TierChange = { added: [], removed: [] }
  if (getSetting<Enrollment | null>(PROGRAM_SETTING, null)?.status === 'active') return change
  db.transaction(() => {
    setSetting(TRAIN_TIER_SETTING, tier)
    const current = weekSessions(start)
    const present = new Set(current.map((s) => s.templateKey))
    const target = buildWeek(start, tier)

    // Remove planned sessions above the tier.
    const removedIds = new Set<number>()
    for (const s of current) {
      if (s.status !== 'planned' || isProgramDerived(s)) continue
      if (tierRank(s.tier) > tierRank(tier)) {
        deleteSession(s.id)
        removedIds.add(s.id)
        change.removed.push(s.name)
      }
    }
    const remaining = current.filter((s) => !removedIds.has(s.id))
    const occupied = new Set(remaining.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate))

    // Add missing templates for the tier.
    for (const t of target) {
      if (present.has(t.templateKey)) continue
      let date = t.scheduledDate
      if (date < today || occupied.has(date)) {
        const free = freeDays(remaining, today > start ? today : start, end).filter((d) => !occupied.has(d))
        const pick = free[0]
        if (!pick) continue
        date = pick
      }
      occupied.add(date)
      createSession({ ...t, scheduledDate: date })
      change.added.push(t.name)
    }
  })
  return change
}
