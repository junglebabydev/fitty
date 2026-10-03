// Programme data test (docs/PRD_TRAINING_PROGRAMS.md §5.1): every series, every path, every week.
import { describe, expect, it } from 'vitest'
import type { Block, Enrollment, Program, ProgramSession } from '../../../domain/programs'
import { PROGRAM_KEY_PREFIX } from '../../../domain/programs'
import { EXERCISE_BY_ID } from '../../exercises'
import { PROGRAM_LIST } from '../index'
import { expandSessions, programWeekSessions, sessionsForWeek, toPlannedExercises } from '../../../engine/programs'

const READY = ['gym-strength', 'home-dumbbells', 'bodyweight']
const TODAY = '2026-10-04'

/**
 * Sessions where the doc repeats one timed cardio id across work blocks (start-running.md "One id, many blocks":
 * 4 × 2 min then 1 × 90 s runs; week 8 intervals then a steady run). The contract has no other encoding. Only timed
 * ids, only these keys, only while the series is a preview (the interval player must log them as one entry).
 */
const TIMED_REPEATS: Record<string, string[]> = { 'start-running': ['w2d1', 'w2d2', 'w8d1', 'w8d2', 'w8d3'] }

function blockIds(b: Block): string[] {
  if (b.shape === 'sets' || b.shape === 'steady') return [b.exerciseId]
  if (b.shape === 'intervals') return b.rest.exerciseId ? [b.work.exerciseId, b.rest.exerciseId] : [b.work.exerciseId]
  return b.stations.map((s) => s.exerciseId)
}

const weeks = (p: Program): number[] => Array.from({ length: p.weeks }, (_, i) => i + 1)

/** Every session of every week on every path. */
function allPathSessions(p: Program): { path: string; session: ProgramSession }[] {
  return Object.keys(p.paths).flatMap((path) => weeks(p).flatMap((w) => sessionsForWeek(p, w, path).map((session) => ({ path, session }))))
}

/** Rung index sets to test: the default (0) and every ladder at its top rung. */
function rungSets(p: Program): Record<string, number>[] {
  const top = Object.fromEntries((p.ladders ?? []).map((l) => [l.slot, l.rungs.length - 1]))
  return p.ladders?.length ? [{}, top] : [{}]
}

describe.each(PROGRAM_LIST.map((p) => [p.id, p] as const))('programme %s', (_id, p) => {
  it('has the expected status', () => {
    expect(p.status).toBe(READY.includes(p.id) ? 'ready' : 'preview')
  })

  it('uses only exercise ids that exist in the library', () => {
    const ids = new Set<string>()
    for (const s of p.sessions) for (const b of s.blocks) blockIds(b).forEach((id) => ids.add(id))
    for (const spec of Object.values(p.paths)) for (const t of Object.values(spec.swaps ?? {})) if (t) ids.add(t)
    for (const l of p.ladders ?? []) l.rungs.forEach((id) => ids.add(id))
    for (const { session } of allPathSessions(p)) {
      for (const b of session.blocks) blockIds(b).forEach((id) => ids.add(id))
      for (const rungs of rungSets(p)) toPlannedExercises(p, session, { rungs }).forEach((e) => ids.add(e.exerciseId))
    }
    expect([...ids].filter((id) => !EXERCISE_BY_ID[id])).toEqual([])
  })

  it('expands every week to sessionsPerWeek sessions on the standard path, with unique keys', () => {
    for (const w of weeks(p)) expect(sessionsForWeek(p, w, 'standard').length, `week ${w}`).toBe(p.sessionsPerWeek)
    const keys = expandSessions(p).map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has a standard path, and every flag path, screen path and replaced session exists', () => {
    expect(p.paths.standard).toBeDefined()
    for (const path of Object.values(p.flagPaths)) expect(p.paths[path!], path).toBeDefined()
    for (const q of p.screen) if (q.onYes.startsWith('path:')) expect(p.paths[q.onYes.slice(5)], q.onYes).toBeDefined()
    const keys = new Set(p.sessions.map((s) => s.key))
    for (const spec of Object.values(p.paths)) {
      for (const [from, to] of Object.entries(spec.replaceSessions ?? {})) {
        expect(expandSessions(p).some((s) => s.key === from), from).toBe(true)
        expect(keys.has(to), to).toBe(true)
      }
    }
  })

  it('never repeats a work id within a session, on any path or rung, and never empties a session', () => {
    const dupes: string[] = []
    const allowed = TIMED_REPEATS[p.id] ?? []
    const allowedHit = new Set<string>()
    for (const { path, session } of allPathSessions(p)) {
      for (const rungs of rungSets(p)) {
        const work = toPlannedExercises(p, session, { rungs }).filter((e) => !e.role).map((e) => e.exerciseId)
        expect(work.length, `${path} ${session.key}`).toBeGreaterThan(0)
        const seen = new Set<string>()
        for (const id of work) {
          if (seen.has(id) && allowed.includes(session.key) && EXERCISE_BY_ID[id]?.timed) allowedHit.add(session.key)
          else if (seen.has(id)) dupes.push(`${path} ${session.key} ${id}`)
          seen.add(id)
        }
      }
    }
    expect([...new Set(dupes)]).toEqual([])
    // The allowance is exact: a fixed session or a new repeat fails here, and it never ships in a ready series.
    expect([...allowedHit].sort()).toEqual([...allowed].sort())
    if (allowed.length) expect(p.status).toBe('preview')
  })

  it('points every slot at a ladder that holds the block\'s exercise', () => {
    for (const s of p.sessions) {
      for (const b of s.blocks) {
        const slotted = b.shape === 'sets' ? [b] : b.shape === 'circuit' ? b.stations : []
        for (const x of slotted) {
          if (!x.slot) continue
          const ladder = p.ladders?.find((l) => l.slot === x.slot)
          expect(ladder?.rungs, `${s.key} slot ${x.slot}`).toContain(x.exerciseId)
        }
      }
    }
  })

  it('gives every sets block exactly one of reps or seconds', () => {
    for (const s of p.sessions) {
      for (const b of s.blocks) if (b.shape === 'sets') expect(!!b.reps !== !!b.seconds, `${s.key} ${b.exerciseId}`).toBe(true)
    }
  })

  it('cites only sources that exist, and every source has an https URL', () => {
    const ns = new Set(p.sources.map((s) => s.n))
    for (const w of p.why) expect(ns.has(w.source), `why [${w.source}]`).toBe(true)
    for (const n of p.honestLine?.sources ?? []) expect(ns.has(n), `honestLine [${n}]`).toBe(true)
    for (const s of p.sources) expect(s.url, `source ${s.n}`).toMatch(/^https:\/\/\S+$/)
  })

  it('keeps impact and deep knee flexion off the low-impact path (warm-ups and top rungs included)', () => {
    if (!p.paths['low-impact']) return
    const bad: string[] = []
    for (const w of weeks(p)) {
      for (const s of sessionsForWeek(p, w, 'low-impact')) {
        for (const rungs of rungSets(p)) {
          for (const e of toPlannedExercises(p, s, { rungs })) {
            const tags = EXERCISE_BY_ID[e.exerciseId]?.safetyTags ?? []
            if (tags.includes('impact') || tags.includes('deep_knee_flexion')) bad.push(`${s.key} ${e.exerciseId}`)
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('has a screen of the right size, with the shared questions outside Postpartum', () => {
    if (p.id === 'postpartum') {
      expect(p.screen.length).toBeLessThanOrEqual(10)
      return
    }
    expect(p.screen.length).toBeLessThanOrEqual(7)
    expect(p.screen.find((q) => q.shared === 'pregnant')?.onYes).toBe('wait')
    expect(p.screen.find((q) => q.shared === 'recent_birth')?.onYes).toBe('suggest:postpartum')
  })

  it('never adds impact for a knee or hip flag', () => {
    expect(p.flagAvoid?.knee ?? []).not.toContain('impact')
    expect(p.flagAvoid?.hip ?? []).not.toContain('impact')
  })

  it('names standalone workouts that exist (none for Postpartum, PRD §4.9)', () => {
    const keys = new Set([...expandSessions(p), ...p.sessions].map((s) => s.key))
    if (p.id === 'postpartum') expect(p.standalone).toEqual([])
    else expect(p.standalone.length).toBeGreaterThan(0)
    for (const s of p.standalone) expect(keys.has(s.sessionKey), s.sessionKey).toBe(true)
  })

  it.runIf(READY.includes(p.id))('materialises week 1 as programme rows', () => {
    const enrollment: Enrollment = { programId: p.id, path: 'standard', startDate: TODAY, week: 1, closedWindow: -1, status: 'active', feel: [], history: [] }
    const rows = programWeekSessions(p, enrollment, TODAY, [])
    expect(rows.length).toBe(p.sessionsPerWeek)
    expect(new Set(rows.map((r) => r.templateKey)).size).toBe(rows.length)
    for (const r of rows) {
      expect(r.status).toBe('planned')
      expect(r.templateKey.startsWith(`${PROGRAM_KEY_PREFIX}${p.id}:`)).toBe(true)
      expect(r.exercises.length).toBeGreaterThan(0)
      for (const e of r.exercises) expect(e.program).toBe(true)
    }
  })
})
