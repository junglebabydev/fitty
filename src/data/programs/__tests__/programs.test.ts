// Programme data test (docs/PRD_TRAINING_PROGRAMS.md §5.1): every series, every path, every week.
import { describe, expect, it } from 'vitest'
import type { Block, Enrollment, Program, ProgramSession } from '../../../domain/programs'
import { PROGRAM_KEY_PREFIX } from '../../../domain/programs'
import type { PlannedExercise } from '../../../domain/types'
import { EXERCISES, EXERCISE_BY_ID } from '../../exercises'
import { PROGRAM_LIST, getProgram } from '../index'
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

/** Rung index sets to test: the default (0), every ladder at rung 2 and every ladder at its top rung. */
function rungSets(p: Program): Record<string, number>[] {
  const at = (i: number) => Object.fromEntries((p.ladders ?? []).map((l) => [l.slot, Math.min(i, l.rungs.length - 1)]))
  return p.ladders?.length ? [{}, at(1), at(99)] : [{}]
}

/** Each path alone, and every ordered pair of non-standard paths (a path plus a standing flag's path). */
function pathLists(p: Program): string[][] {
  const named = Object.keys(p.paths).filter((x) => x !== 'standard')
  return [...Object.keys(p.paths).map((x) => [x]), ...named.flatMap((a) => named.filter((b) => b !== a).map((b) => [a, b]))]
}

/** Every session of every week on every path list, at every tested rung set (rungs resolved before the swaps). */
function allPathSessions(p: Program): { path: string; session: ProgramSession }[] {
  return pathLists(p).flatMap((paths) => rungSets(p).flatMap((rungs) =>
    weeks(p).flatMap((w) => sessionsForWeek(p, w, paths, EXERCISES, rungs).map((session) => ({ path: paths.join('+'), session })))))
}

const swapIdOf = (t: unknown): string | null => (t == null ? null : typeof t === 'string' ? t : (t as { id: string }).id)

describe.each(PROGRAM_LIST.map((p) => [p.id, p] as const))('programme %s', (_id, p) => {
  it('has the expected status', () => {
    expect(p.status).toBe(READY.includes(p.id) ? 'ready' : 'preview')
  })

  it('uses only exercise ids that exist in the library', () => {
    const ids = new Set<string>()
    for (const s of p.sessions) for (const b of s.blocks) blockIds(b).forEach((id) => ids.add(id))
    for (const spec of Object.values(p.paths)) for (const t of Object.values(spec.swaps ?? {})) { const id = swapIdOf(t); if (id) ids.add(id) }
    for (const l of p.ladders ?? []) l.rungs.forEach((id) => ids.add(id))
    for (const l of p.ladders ?? []) Object.keys(l.rungSpecs ?? {}).forEach((id) => ids.add(id))
    for (const { session } of allPathSessions(p)) {
      for (const b of session.blocks) blockIds(b).forEach((id) => ids.add(id))
      toPlannedExercises(p, session).forEach((e) => ids.add(e.exerciseId))
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
      const work = toPlannedExercises(p, session).filter((e) => !e.role).map((e) => e.exerciseId)
      expect(work.length, `${path} ${session.key}`).toBeGreaterThan(0)
      const seen = new Set<string>()
      for (const id of work) {
        if (seen.has(id) && allowed.includes(session.key) && EXERCISE_BY_ID[id]?.timed) allowedHit.add(session.key)
        else if (seen.has(id)) dupes.push(`${path} ${session.key} ${id}`)
        seen.add(id)
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

  it('gives every sets block exactly one of reps or seconds, on every path and rung', () => {
    for (const s of p.sessions) {
      for (const b of s.blocks) if (b.shape === 'sets') expect(!!b.reps !== !!b.seconds, `${s.key} ${b.exerciseId}`).toBe(true)
    }
    for (const { path, session } of allPathSessions(p)) {
      for (const b of session.blocks) if (b.shape === 'sets') expect(!!b.reps !== !!b.seconds, `${path} ${session.key} ${b.exerciseId}`).toBe(true)
    }
    const specs = [
      ...(p.ladders ?? []).flatMap((l) => Object.entries(l.rungSpecs ?? {})),
      ...Object.values(p.paths).flatMap((spec) => Object.entries(spec.swaps ?? {}).filter(([, t]) => t && typeof t === 'object')),
    ] as [string, { reps?: unknown; seconds?: unknown }][]
    for (const [id, spec] of specs) expect(!!spec.reps && !!spec.seconds, id).toBe(false)
  })

  it('names rung specs only for rungs of that ladder', () => {
    for (const l of p.ladders ?? []) for (const id of Object.keys(l.rungSpecs ?? {})) expect(l.rungs, `${l.slot} ${id}`).toContain(id)
  })

  it('cites only sources that exist, and every source has an https URL', () => {
    const ns = new Set(p.sources.map((s) => s.n))
    for (const w of p.why) expect(ns.has(w.source), `why [${w.source}]`).toBe(true)
    for (const n of p.honestLine?.sources ?? []) expect(ns.has(n), `honestLine [${n}]`).toBe(true)
    for (const s of p.sources) expect(s.url, `source ${s.n}`).toMatch(/^https:\/\/\S+$/)
  })

  it('keeps impact and deep knee flexion off the low-impact path (warm-ups, every rung and path order included)', () => {
    if (!p.paths['low-impact']) return
    const bad: string[] = []
    for (const { path, session } of allPathSessions(p)) {
      if (!path.split('+').includes('low-impact')) continue
      for (const e of toPlannedExercises(p, session)) {
        const tags = EXERCISE_BY_ID[e.exerciseId]?.safetyTags ?? []
        if (tags.includes('impact') || tags.includes('deep_knee_flexion')) bad.push(`${path} ${session.key} ${e.exerciseId}`)
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('keeps overhead moves off the no-overhead path at every rung', () => {
    if (!p.paths['no-overhead']) return
    const bad: string[] = []
    for (const { path, session } of allPathSessions(p)) {
      if (!path.split('+').includes('no-overhead')) continue
      for (const e of toPlannedExercises(p, session)) {
        if (EXERCISE_BY_ID[e.exerciseId]?.safetyTags.includes('overhead')) bad.push(`${path} ${session.key} ${e.exerciseId}`)
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('marks a seconds target on an exercise that is not timed with unit "sec"', () => {
    for (const { path, session } of allPathSessions(p)) {
      for (const e of toPlannedExercises(p, session)) {
        const ex = EXERCISE_BY_ID[e.exerciseId]
        if (e.unit === 'sec') expect(ex?.timed, `${path} ${session.key} ${e.exerciseId}`).toBe(false)
      }
    }
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

// --- per-series rules from the docs (review findings 2, 5, 6, 7) ------------------------------------------------

describe('series rules', () => {
  const bw = getProgram('bodyweight')!
  const home = getProgram('home-dumbbells')!
  const planned = (p: Program, key: string, paths: string[], rungs: Record<string, number> = {}): PlannedExercise[] => {
    const week = Number(/^w(\d+)/.exec(key)![1])
    const s = sessionsForWeek(p, week, paths, EXERCISES, rungs).find((x) => x.key === key)!
    return toPlannedExercises(p, s).filter((e) => !e.role)
  }
  const pick = (list: PlannedExercise[], slot: string) => list.find((e) => e.slot === slot && !e.circuit)!

  it('Bodyweight push-capped never serves decline or archer push-ups, at any push rung', () => {
    for (const push of [2, 3]) {
      const a = pick(planned(bw, 'w3d1', ['push-capped'], { push }), 'push')
      expect(a).toMatchObject({ exerciseId: 'push_up', repMin: 6, repMax: 12 })
      expect(a.perSide).toBeUndefined()
      const circuit = planned(bw, 'w3d2', ['push-capped'], { push }).map((e) => e.exerciseId)
      expect(circuit).not.toContain('decline_push_up')
      expect(circuit).not.toContain('archer_push_up')
    }
    expect(pick(planned(bw, 'w3d1', ['standard'], { push: 3 }), 'push').exerciseId).toBe('archer_push_up')
  })

  it('Bodyweight: a knee flag path and a shoulder flag path both apply', () => {
    const a = planned(bw, 'w3d1', ['standard', 'low-impact', 'push-capped'], { push: 3, squat: 2 })
    expect(pick(a, 'squat')).toMatchObject({ exerciseId: 'sit_to_stand_chair', repMin: 10, repMax: 15 })
    expect(pick(a, 'squat').perSide).toBeUndefined()
    expect(pick(a, 'push').exerciseId).toBe('push_up')
    const circuit = planned(bw, 'w3d2', ['standard', 'low-impact', 'push-capped'], { push: 3, squat: 2 }).map((e) => e.exerciseId)
    expect(circuit).toEqual(['push_up', 'sit_to_stand_chair', 'towel_door_row', 'glute_bridge', 'dead_bug'])
  })

  it('Bodyweight: a new rung brings its own range and per-side flag; sets and rest stay as written', () => {
    const a = planned(bw, 'w3d1', ['standard'], { squat: 1, push: 3, coreA: 1 })
    expect(pick(a, 'squat')).toMatchObject({ exerciseId: 'bw_split_squat', sets: 3, repMin: 8, repMax: 12, restSec: 60, perSide: true })
    expect(pick(a, 'push')).toMatchObject({ exerciseId: 'archer_push_up', repMin: 4, repMax: 8, perSide: true })
    const plank = pick(a, 'coreA')
    expect(plank).toMatchObject({ exerciseId: 'plank', sets: 2, repMin: 20, repMax: 45, restSec: 45 })
    expect(plank.perSide).toBeUndefined()
    const b = planned(bw, 'w3d3', ['standard'], { coreB: 1 })
    expect(pick(b, 'coreB')).toMatchObject({ exerciseId: 'side_plank_reach', repMin: 6, repMax: 10, perSide: true })
    expect(pick(b, 'coreB').unit).toBeUndefined()
  })

  it('Bodyweight circuits: a seconds station on a reps exercise is a seconds target', () => {
    const c = planned(bw, 'w1d2', ['standard'])
    expect(c[0]).toMatchObject({ exerciseId: 'incline_push_up', repMin: 30, repMax: 30, unit: 'sec' })
    expect(c.find((e) => e.exerciseId === 'mountain_climber')!.unit).toBeUndefined() // timed already
    expect(planned(bw, 'w1d2', ['push-capped']).find((e) => e.exerciseId === 'dead_bug')).toMatchObject({ repMin: 30, unit: 'sec' })
  })

  it('Home low-impact: goblet_squat becomes a 3 × 30–60 s wall sit (doc §4)', () => {
    for (const squat of [0, 1, 2]) {
      const a = planned(home, 'w1d1', ['low-impact'], { squat })
      const leg = pick(a, 'squat')
      expect(leg.exerciseId, `squat rung ${squat}`).not.toMatch(/bulgarian|deficit|goblet/)
    }
    expect(pick(planned(home, 'w1d1', ['low-impact']), 'squat')).toMatchObject({ exerciseId: 'wall_sit', sets: 3, repMin: 30, repMax: 60 })
  })

  it('Home no-overhead: the shoulder press becomes lateral raises 3 × 12–20 (doc §4), arnold_press too', () => {
    for (const overhead_press of [0, 1]) {
      const c = planned(home, 'w1d3', ['no-overhead'], { overhead_press })
      expect(pick(c, 'overhead_press')).toMatchObject({ exerciseId: 'lateral_raise', sets: 3, repMin: 12, repMax: 20 })
    }
  })

  it('Home: a unilateral rung is per side and keeps the session range (P4)', () => {
    const a = planned(home, 'w3d1', ['standard'], { squat: 1, hinge: 1 })
    expect(pick(a, 'squat')).toMatchObject({ exerciseId: 'bulgarian_split_squat', sets: 3, repMin: 8, repMax: 15, perSide: true })
    expect(pick(a, 'hinge')).toMatchObject({ exerciseId: 'db_single_leg_rdl', perSide: true })
  })
})
