// Weekly-plan mutations used by the Train screen (tier changes, reflow, next-week generation).
import type { WorkoutSession } from '../../domain/types'
import { db } from '../../db/database'
import { createSession, deleteSession, getSessions, setSetting, updateSession } from '../../db/repositories'
import { buildWeek, reflowWeek, sessionFromTemplate, type ReflowMove } from '../../engine'
import { addDays, startOfWeek } from '../../lib/util'
import { TRAIN_TIER_SETTING, isMissed, tierRank, type Tier } from './helpers'

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

export function computeReflow(sessions: WorkoutSession[], today: string): ReflowMove[] {
  return reflowWeek(sessions, today)
}

/** Apply reflow moves: reschedule moved sessions, mark dropped ones skipped. */
export function applyReflow(sessions: WorkoutSession[], moves: ReflowMove[]): { moved: number; dropped: number } {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  let moved = 0, dropped = 0
  db.transaction(() => {
    for (const m of moves) {
      const s = byId.get(m.id)
      if (!s) continue
      if (m.drop) {
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
 */
export function applyTier(tier: Tier, weekStart: string, today: string): TierChange {
  const start = startOfWeek(weekStart)
  const end = addDays(start, 6)
  const change: TierChange = { added: [], removed: [] }
  db.transaction(() => {
    setSetting(TRAIN_TIER_SETTING, tier)
    const current = weekSessions(start)
    const present = new Set(current.map((s) => s.templateKey))
    const target = buildWeek(start, tier)

    // Remove planned sessions above the tier.
    const removedIds = new Set<number>()
    for (const s of current) {
      if (s.status !== 'planned') continue
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
