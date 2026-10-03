// Training programmes (docs/PRD_TRAINING_PROGRAMS.md §5, §6): expand weeks, apply paths, map blocks to planned
// exercises, place a week, close a week, ladders, the safety check, avoid-tags, the knee guard and reflow.
// Pure functions: no database, no React.
import type {
  Block, Enrollment, PathId, Program, ProgramId, ProgramSession, RungSpec, ScreenAnswers, SetsBlock, SwapTarget,
} from '../domain/programs'
import { isProgramSession, programTemplateKey } from '../domain/programs'
import type { Exercise, ExerciseSet, PlannedExercise, Region, SafetyTag, WorkoutSession } from '../domain/types'
import { EXERCISES } from '../data/exercises'
import { addDays, dateOf, daysBetween } from '../lib/util'
import { baselineAvoidTags, regionGroup } from './symptomGate'
import { isTimedTarget } from './planner'

type SwapValue = string | SwapTarget | null

const swapId = (v: SwapValue): string | null => (v == null ? null : typeof v === 'string' ? v : v.id)

/** A sets block with a rung's or a swap target's prescription: sets, then reps or seconds (the other cleared), then perSide. */
function withPrescription(b: SetsBlock, spec: RungSpec & { sets?: number }): SetsBlock {
  const out: SetsBlock = { ...b }
  if (spec.sets != null) out.sets = spec.sets
  if (spec.reps) { out.reps = spec.reps; delete out.seconds } else if (spec.seconds) { out.seconds = spec.seconds; delete out.reps }
  if (spec.perSide === true) out.perSide = true
  else if (spec.perSide === false) delete out.perSide
  return out
}

// --- weeks and paths --------------------------------------------------------------------------------------

/** 'w1d2' copied into week 4 → 'w4d2'; keys without a 'w<n>' prefix become 'w<week>d<n>'. */
function copyKey(key: string, week: number, index: number): string {
  return /^w\d+/.test(key) ? key.replace(/^w\d+/, `w${week}`) : `w${week}d${index + 1}`
}

function writtenWeek(p: Program, week: number, seen: Set<number> = new Set()): ProgramSession[] {
  const written = p.sessions.filter((s) => s.week === week && !s.altOnly)
  if (written.length) return written
  const rep = p.repeats?.find((r) => r.week === week)
  if (!rep || seen.has(week)) return []
  seen.add(week)
  return writtenWeek(p, rep.copyOf, seen).map((s, i) => ({ ...s, key: copyKey(s.key, week, i), week }))
}

/** Every week 1..p.weeks as concrete sessions on the standard path (repeats resolved, altOnly left out). */
export function expandSessions(p: Program): ProgramSession[] {
  const out: ProgramSession[] = []
  for (let w = 1; w <= p.weeks; w++) out.push(...writtenWeek(p, w))
  return out
}

/** Ids that count for the no-duplicate rule: work bouts only (no role blocks, no interval rest ids). */
function workIds(blocks: Block[]): string[] {
  const out: string[] = []
  for (const b of blocks) {
    if (b.role) continue
    if (b.shape === 'sets' || b.shape === 'steady') out.push(b.exerciseId)
    else if (b.shape === 'intervals') out.push(b.work.exerciseId)
    else out.push(...b.stations.map((s) => s.exerciseId))
  }
  return out
}

function allIds(blocks: Block[]): Set<string> {
  const out = new Set(workIds(blocks))
  for (const b of blocks) {
    if (b.shape === 'sets' || b.shape === 'steady') out.add(b.exerciseId)
    else if (b.shape === 'intervals') { out.add(b.work.exerciseId); if (b.rest.exerciseId) out.add(b.rest.exerciseId) }
    else b.stations.forEach((s) => out.add(s.exerciseId))
  }
  return out
}

/**
 * Walk the library substitution chain from `start` (breadth first) to the first id that is not taken, uses the
 * programme's equipment (or bodyweight) and carries no safety tag `start` lacks, so the walk never brings back
 * what the path removed. Null when nothing qualifies.
 */
function walkChain(start: Exercise, taken: Set<string>, p: Program, byId: Map<string, Exercise>): string | null {
  const seen = new Set([start.id])
  const queue = [...start.substitutions]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const ex = byId.get(id)
    if (!ex) continue
    const equipmentOk = ex.equipment === 'bodyweight' || p.equipment.includes(ex.equipment)
    const tagsOk = ex.safetyTags.every((t) => start.safetyTags.includes(t))
    if (!taken.has(id) && equipmentOk && tagsOk) return id
    queue.push(...ex.substitutions)
  }
  return null
}

/**
 * A path's swaps on one session. Work ids map per source id (the same source always gets the same target); a target
 * already present among the other work ids walks the chain, and drops the block when nothing fits. Role blocks and
 * interval rest ids take the raw target and are exempt from the duplicate rule. `null` drops the block. A SwapTarget's
 * prescription applies to sets blocks that land on its id (not to a chain-walk pick, nor to circuit stations).
 */
export function applySwaps(p: Program, session: ProgramSession, swaps: Record<string, SwapValue>, library: Exercise[] = EXERCISES): ProgramSession {
  const ids = allIds(session.blocks)
  const sources = Object.keys(swaps).filter((id) => ids.has(id))
  if (!sources.length) return session
  const byId = new Map(library.map((e) => [e.id, e]))
  const work0 = new Set(workIds(session.blocks))
  const taken = new Set([...work0].filter((id) => !(id in swaps)))
  const workMap = new Map<string, string | null>()
  // Only work-bout sources take part in the duplicate rule, so the order of the swap keys does not matter.
  for (const src of sources.filter((id) => work0.has(id))) {
    const target = swapId(swaps[src])
    if (target == null) { workMap.set(src, null); continue }
    let pick: string | null = target
    if (taken.has(target)) {
      const ex = byId.get(target)
      pick = ex ? walkChain(ex, new Set([...taken, src]), p, byId) : null
    }
    workMap.set(src, pick)
    if (pick) taken.add(pick)
  }
  const work = (id: string): string | null => (workMap.has(id) ? workMap.get(id)! : id)
  const raw = (id: string): string | null => (id in swaps ? swapId(swaps[id]) : id)

  const blocks: Block[] = []
  for (const b of session.blocks) {
    const pickId = b.role ? raw : work
    if (b.shape === 'sets') {
      const id = pickId(b.exerciseId)
      if (!id) continue
      const t = swaps[b.exerciseId]
      blocks.push(t && typeof t === 'object' && t.id === id && id !== b.exerciseId ? withPrescription({ ...b, exerciseId: id }, t) : { ...b, exerciseId: id })
    } else if (b.shape === 'steady') {
      const id = pickId(b.exerciseId)
      if (id) blocks.push({ ...b, exerciseId: id })
    } else if (b.shape === 'intervals') {
      const id = pickId(b.work.exerciseId)
      if (!id) continue
      const rest = b.rest.exerciseId ? raw(b.rest.exerciseId) : null
      blocks.push({ ...b, work: { ...b.work, exerciseId: id }, rest: { ...b.rest, exerciseId: rest } })
    } else {
      const stations = b.stations.flatMap((s) => { const id = pickId(s.exerciseId); return id ? [{ ...s, exerciseId: id }] : [] })
      if (stations.length) blocks.push({ ...b, stations })
    }
  }
  return { ...session, blocks }
}

const pathList = (path: PathId | PathId[]): PathId[] => [...new Set(Array.isArray(path) ? path : [path])]

/**
 * The paths that shape a user's sessions (§6.6): the enrolment's (or screened) path, then each standing flag's
 * `flagPaths` entry, then the no-impact path when chosen. Deduplicated, in that order; unknown ids left out.
 */
export function effectivePaths(p: Program, path: PathId, flags: Region[], noImpact: boolean): PathId[] {
  const out: PathId[] = [path]
  for (const r of flags) {
    const g = regionGroup(r)
    const fp = g === 'other' ? undefined : p.flagPaths[g]
    if (fp) out.push(fp)
  }
  const ni = noImpact ? noImpactPath(p) : null
  if (ni) out.push(ni)
  return [...new Set(out)].filter((id) => id === path || !!p.paths[id])
}

/** The rung's id for a slot, while the block holds one of that ladder's ids. */
function rungId(p: Program, slot: string | undefined, id: string, rungs: Record<string, number> | undefined): string {
  if (!slot) return id
  const ladder = p.ladders?.find((l) => l.slot === slot)
  if (!ladder || !ladder.rungs.includes(id) || !ladder.rungs.length) return id
  const i = Math.min(Math.max(0, rungs?.[slot] ?? 0), ladder.rungs.length - 1)
  return ladder.rungs[i]
}

/**
 * Ladder rungs on one session: a slot block takes the user's rung id and, for sets blocks, that rung's `rungSpecs`
 * range and per-side flag (sets and restSec stay). Circuit stations take the id only. Runs before any path swap.
 */
export function resolveRungs(p: Program, session: ProgramSession, rungs?: Record<string, number>): ProgramSession {
  if (!p.ladders?.length) return session
  const specOf = (slot: string, id: string) => p.ladders?.find((l) => l.slot === slot)?.rungSpecs?.[id]
  const blocks = session.blocks.map((b): Block => {
    if (b.shape === 'sets' && b.slot) {
      const id = rungId(p, b.slot, b.exerciseId, rungs)
      if (id === b.exerciseId) return b
      const spec = specOf(b.slot, id)
      return spec ? withPrescription({ ...b, exerciseId: id }, spec) : { ...b, exerciseId: id }
    }
    if (b.shape === 'circuit') return { ...b, stations: b.stations.map((st) => ({ ...st, exerciseId: rungId(p, st.slot, st.exerciseId, rungs) })) }
    return b
  })
  return { ...session, blocks }
}

/**
 * One session on its paths: the ladder rungs first, then each path's swaps in turn (`replaceSessions` is a week-level
 * choice). Rung first, so a path that removes a rung (Bodyweight push-capped: decline_push_up → push_up) catches it.
 */
export function sessionOnPath(
  p: Program,
  session: ProgramSession,
  path: PathId | PathId[],
  library: Exercise[] = EXERCISES,
  rungs?: Record<string, number>,
): ProgramSession {
  let out = resolveRungs(p, session, rungs)
  for (const id of pathList(path)) {
    const swaps = p.paths[id]?.swaps
    if (swaps) out = applySwaps(p, out, swaps, library)
  }
  return out
}

/** The sessions of `week` on its paths: replaced sessions first (the first path naming one wins), then rungs and swaps. */
export function sessionsForWeek(
  p: Program,
  week: number,
  path: PathId | PathId[],
  library: Exercise[] = EXERCISES,
  rungs?: Record<string, number>,
): ProgramSession[] {
  const specs = pathList(path).map((id) => p.paths[id]).filter(Boolean)
  return expandSessions(p)
    .filter((s) => s.week === week)
    .map((s) => {
      const alt = specs.map((spec) => spec.replaceSessions?.[s.key]).find(Boolean)
      const replaced = alt ? p.sessions.find((x) => x.key === alt) : undefined
      return replaced ? { ...replaced, week } : s
    })
    .map((s) => sessionOnPath(p, s, path, library, rungs))
}

// --- blocks → planned exercises ------------------------------------------------------------------------------

function entry(p: Program, base: PlannedExercise, extra: Partial<PlannedExercise>): PlannedExercise {
  const out: PlannedExercise = { ...base, program: true }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) (out as unknown as Record<string, unknown>)[k] = v
  const cue = p.cues[out.exerciseId]
  if (cue) out.cue = cue
  return out
}

/**
 * PRD §5.3: one entry per sets / steady / intervals block, one per circuit station. Every entry has `program: true`.
 * A target given in seconds for an exercise that is not timed gets `unit: 'sec'`. Ladder rungs are not resolved here:
 * pass the session through `sessionOnPath` / `sessionsForWeek` with the rungs first (`opts.rungs` is ignored).
 */
export function toPlannedExercises(
  p: Program,
  session: ProgramSession,
  opts: { /** @deprecated ignored: pass rungs to sessionOnPath / sessionsForWeek. */ rungs?: Record<string, number>; library?: Exercise[] } = {},
): PlannedExercise[] {
  const byId = new Map((opts.library ?? EXERCISES).map((e) => [e.id, e]))
  const sec = (id: string): 'sec' | undefined => (isTimedTarget({ exerciseId: id }, byId.get(id)) ? undefined : 'sec')
  const out: PlannedExercise[] = []
  session.blocks.forEach((b, bi) => {
    if (b.shape === 'sets') {
      const [repMin, repMax] = b.reps ?? b.seconds ?? [0, 0]
      const unit = !b.reps && b.seconds ? sec(b.exerciseId) : undefined
      out.push(entry(p, { exerciseId: b.exerciseId, sets: b.sets, repMin, repMax, loadKg: null, restSec: b.restSec }, { perSide: b.perSide, slot: b.slot, role: b.role, unit }))
    } else if (b.shape === 'steady') {
      const s = Math.round(b.minutes * 60)
      out.push(entry(p, { exerciseId: b.exerciseId, sets: 1, repMin: s, repMax: s, loadKg: null, restSec: 0 }, { role: b.role, unit: sec(b.exerciseId) }))
    } else if (b.shape === 'intervals') {
      out.push(entry(
        p,
        { exerciseId: b.work.exerciseId, sets: b.rounds, repMin: b.work.seconds, repMax: b.work.seconds, loadKg: null, restSec: b.rest.seconds },
        { restExerciseId: b.rest.exerciseId ?? undefined, role: b.role, unit: sec(b.work.exerciseId) },
      ))
    } else {
      for (const s of b.stations) {
        const [repMin, repMax] = s.reps ?? (s.seconds != null ? [s.seconds, s.seconds] : [0, 0])
        const unit = !s.reps && s.seconds != null ? sec(s.exerciseId) : undefined
        out.push(entry(
          p,
          { exerciseId: s.exerciseId, sets: b.rounds, repMin, repMax, loadKg: null, restSec: b.restBetweenStationsSec },
          { circuit: `c${bi}`, roundRestSec: b.restBetweenRoundsSec, perSide: s.perSide, slot: s.slot, role: b.role, unit },
        ))
      }
    }
  })
  return out
}

// --- windows and placement -----------------------------------------------------------------------------------

/** Programme window of `date`: 7-day blocks from the enrolment start (negative before it). */
export function windowIndex(startDate: string, date: string): number {
  return Math.floor(daysBetween(startDate, date) / 7)
}

export function windowDates(startDate: string, k: number): string[] {
  const first = addDays(startDate, 7 * k)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

/** Day offsets inside a window: spread out with a rest day between sessions where the count allows. */
export function defaultOffsets(sessionsPerWeek: number): number[] {
  const n = Math.max(0, Math.min(7, Math.floor(sessionsPerWeek)))
  if (n === 2) return [0, 3]
  if (n === 3) return [0, 2, 4]
  if (n === 4) return [0, 1, 3, 4]
  if (n <= 1) return n ? [0] : []
  const step = 6 / (n - 1)
  return Array.from({ length: n }, (_, i) => Math.round(i * step))
}

/**
 * The current window's sessions as rows (§6.1). Each lands on its default day; a day that is taken or already past
 * moves it to the next free day of the window (order kept); one that no longer fits is not created.
 */
export function programWeekSessions(
  p: Program,
  enrollment: Enrollment,
  today: string,
  existing: WorkoutSession[],
  library: Exercise[] = EXERCISES,
  /** The effective paths (see `effectivePaths`); default the enrolment's path alone. */
  paths: PathId[] = [enrollment.path],
): Omit<WorkoutSession, 'id'>[] {
  const k = Math.max(0, windowIndex(enrollment.startDate, today))
  const dates = windowDates(enrollment.startDate, k)
  const sessions = sessionsForWeek(p, enrollment.week, paths, library, enrollment.rungs)
  const offsets = defaultOffsets(sessions.length)
  const inWindow = existing.filter((s) => s.scheduledDate >= dates[0] && s.scheduledDate <= dates[6])
  const occupied = new Set(inWindow.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate))
  const present = new Set(inWindow.map((s) => s.templateKey))
  const out: Omit<WorkoutSession, 'id'>[] = []
  let prev = -1
  sessions.forEach((s, i) => {
    const templateKey = programTemplateKey(p.id, s.key)
    if (present.has(templateKey)) return
    let d = Math.max(offsets[i] ?? 0, prev + 1)
    while (d < 7 && (dates[d] < today || occupied.has(dates[d]))) d++
    if (d >= 7) return
    prev = d
    occupied.add(dates[d])
    out.push({
      templateKey,
      name: s.name,
      type: s.type,
      tier: 'minimum',
      scheduledDate: dates[d],
      status: 'planned',
      startedAt: null,
      completedAt: null,
      durationMin: null,
      readiness: null,
      sessionRpe: null,
      notes: '',
      exercises: toPlannedExercises(p, s, { library }),
    })
  })
  return out
}

// --- week close ------------------------------------------------------------------------------------------------

export interface WindowClose {
  decision: 'advance' | 'repeat' | 'drop_back'
  nextWeek: number
  /** 'done' after advancing out of the last week. */
  status: Enrollment['status']
  reason: string
}

function sessionKeyOf(templateKey: string): string {
  const parts = templateKey.split(':')
  return parts.slice(2).join(':')
}

/**
 * §6.2. Zero completed repeats; pain at or above `dropBackPainAtLeast` drops back one week (never below 1); too few
 * sessions, pain above `maxPainToAdvance` or a "Too hard" repeats; otherwise advance (the last week → done).
 * Only rows dated on or after the enrolment start count (an earlier enrolment's rows never close this one's week).
 */
export function closeWindow(p: Program, enrollment: Enrollment, windowRows: WorkoutSession[], painScores: number[], today: string): WindowClose {
  const week = enrollment.week
  const rule = p.advance
  const completed = windowRows.filter((r) => r.status === 'completed' && r.scheduledDate >= enrollment.startDate)
  const need = rule.minCompleted === 'all' ? p.sessionsPerWeek : rule.minCompleted
  const pain = painScores.length ? Math.max(...painScores) : 0
  const keys = new Set(completed.map((r) => sessionKeyOf(r.templateKey)))
  const hard = rule.repeatIfFeltHard && enrollment.feel.some((f) => f.week === week && f.value === 'hard' && keys.has(f.sessionKey))
  const repeat = (reason: string): WindowClose => ({ decision: 'repeat', nextWeek: week, status: enrollment.status, reason })

  if (!completed.length) return repeat(`No sessions were done, so week ${week} runs again.`)
  if (pain >= rule.dropBackPainAtLeast) {
    const nextWeek = Math.max(1, week - 1)
    return {
      decision: 'drop_back', nextWeek, status: enrollment.status,
      reason: nextWeek < week ? `Pain reached ${pain}/10, so you go back to week ${nextWeek}.` : `Pain reached ${pain}/10, so week 1 runs again.`,
    }
  }
  if (completed.length < need) return repeat(`You did ${completed.length} of ${need} sessions, so week ${week} runs again.`)
  if (pain > rule.maxPainToAdvance) return repeat(`Pain reached ${pain}/10, above ${rule.maxPainToAdvance}, so week ${week} runs again.`)
  if (hard) return repeat(`A session felt too hard, so week ${week} runs again.`)
  if (week >= p.weeks) return { decision: 'advance', nextWeek: week, status: 'done', reason: `You finished the last week of ${p.title}.` }
  return { decision: 'advance', nextWeek: week + 1, status: enrollment.status, reason: `Week ${week} done, so week ${week + 1} starts.` }
}

/** Value logged against a target: reps, or seconds for timed sets. */
function setValue(s: ExerciseSet): number {
  return s.reps ?? s.durationSec ?? 0
}

/** Library equipment whose progression is load (double progression), not the ladder. */
const LOADABLE_EQUIPMENT = new Set(['dumbbell', 'barbell', 'kettlebell', 'machine', 'cable'])

/**
 * Ladder rungs after a window (§6.4): a pain flag on that slot's exercise moves down one; otherwise every planned set
 * logged at the top of its range moves up one. Only sets-block entries still on the ladder's current rung count
 * (circuit stations never move a rung, Bodyweight P7). A loaded set holds the rung, and a rung on loadable equipment
 * never moves up here: load progression owns it. Never climbs to a rung that a swap on the active `paths` removes.
 */
export function nextRungs(
  p: Program,
  enrollment: Enrollment,
  completed: { session: WorkoutSession; sets: ExerciseSet[] }[],
  opts: { paths?: PathId[]; library?: Exercise[] } = {},
): Record<string, number> {
  const rungs = { ...(enrollment.rungs ?? {}) }
  const capped = new Set((opts.paths ?? [enrollment.path]).flatMap((id) => Object.keys(p.paths[id]?.swaps ?? {})))
  const byId = new Map((opts.library ?? EXERCISES).map((e) => [e.id, e]))
  for (const ladder of p.ladders ?? []) {
    if (!ladder.rungs.length) continue
    const cur = Math.min(rungs[ladder.slot] ?? 0, ladder.rungs.length - 1)
    const id = ladder.rungs[cur]
    // TODO(home-dumbbells rulesText.P2-P4): a loaded rung moves up once the dumbbells are maxed out (every capped-stage
    // set reaches 30 reps at heaviestDumbbellKg). Needs heaviestDumbbellKg (P0), which is not stored yet.
    const loadable = LOADABLE_EQUIPMENT.has(byId.get(id)?.equipment ?? '')
    let seen = false, allTop = true, pain = false
    for (const { session, sets } of completed) {
      for (const pe of session.exercises) {
        if (pe.slot !== ladder.slot || pe.exerciseId !== id || pe.role || pe.circuit) continue
        seen = true
        const logged = sets.filter((s) => s.exerciseId === id)
        if (logged.some((s) => s.painFlag)) pain = true
        if (logged.length < pe.sets || logged.some((s) => setValue(s) < pe.repMax || (s.loadKg ?? 0) > 0)) allTop = false
      }
    }
    if (pain) rungs[ladder.slot] = Math.max(0, cur - 1)
    else if (seen && allTop && !loadable) {
      const up = Math.min(ladder.rungs.length - 1, cur + 1)
      rungs[ladder.slot] = capped.has(ladder.rungs[up]) ? cur : up
    }
  }
  return rungs
}

// --- the safety check ----------------------------------------------------------------------------------------

export interface ScreenResult {
  kind: 'start' | 'wait' | 'suggest'
  path: PathId
  notes: string[]
  waitCopy?: string
  suggest?: ProgramId
  unanswered: string[]
}

/** Walk-first, else low-impact: the path the no-impact choice selects, when the series has one. */
export function noImpactPath(p: Program): PathId | null {
  if (p.paths['walk-first']) return 'walk-first'
  if (p.paths['low-impact']) return 'low-impact'
  return null
}

/** The path a standing flag selects (first flag with a mapping wins). */
export function flagPath(p: Program, flags: Region[]): PathId | null {
  for (const r of flags) {
    const g = regionGroup(r)
    if (g === 'other') continue
    const path = p.flagPaths[g]
    if (path && p.paths[path]) return path
  }
  return null
}

/**
 * §4.4. A `fromFlags` question with a matching flag counts as yes. Wait beats suggest beats start. Path: an explicit
 * screen answer, then the no-impact choice, then the flags' path, then standard.
 */
export function screenResult(p: Program, answers: Record<string, boolean>, flags: Region[], noImpact: boolean): ScreenResult {
  const flagged = (q: Program['screen'][number]) => !!q.fromFlags?.some((r) => flags.includes(r))
  const yeses = p.screen.filter((q) => answers[q.id] === true || flagged(q))
  const unanswered = p.screen.filter((q) => answers[q.id] === undefined && !flagged(q)).map((q) => q.id)
  const wait = yeses.find((q) => q.onYes === 'wait')
  const suggest = yeses.find((q) => q.onYes.startsWith('suggest:'))
  const notes = yeses.filter((q) => q.onYes === 'note').map((q) => q.yesCopy)
  const pathQs = yeses.filter((q) => q.onYes.startsWith('path:') && p.paths[q.onYes.slice(5)])
  // A flag-driven question (pre-answered from the profile) ranks with the flags, below the no-impact choice.
  const answered = pathQs.find((q) => !flagged(q))
  const fromFlag = pathQs.find(flagged)
  const path = (answered && answered.onYes.slice(5))
    ?? (noImpact ? noImpactPath(p) : null)
    ?? (fromFlag && fromFlag.onYes.slice(5))
    ?? flagPath(p, flags)
    ?? 'standard'
  const base = { path, notes, unanswered }
  if (wait) return { ...base, kind: 'wait', waitCopy: wait.yesCopy }
  if (suggest) return { ...base, kind: 'suggest', suggest: suggest.onYes.slice(8) as ProgramId }
  return { ...base, kind: 'start' }
}

/** Stored answers for this series, younger than its re-ask age (default 90 days). */
export function isScreenCurrent(p: Program, saved: ScreenAnswers | undefined, today: string): boolean {
  if (!saved || saved.programId !== p.id) return false
  const answered = saved.answeredAt.length > 10 ? dateOf(saved.answeredAt) : saved.answeredAt
  return daysBetween(answered, today) < (p.screenMaxAgeDays ?? 90)
}

// --- safety tags, library, knee guard -------------------------------------------------------------------------

/** §6.6: the flags' AMBER set without impact, the series' extra tags for those flags, and impact on the user's choice. */
export function programAvoidTags(p: Program, flags: Region[], noImpact: boolean): SafetyTag[] {
  const out = new Set<SafetyTag>(baselineAvoidTags(flags, { allowImpact: true }))
  for (const r of flags) {
    const g = regionGroup(r)
    if (g !== 'other') for (const t of p.flagAvoid?.[g] ?? []) out.add(t)
  }
  if (noImpact) out.add('impact')
  return [...out]
}

/** Exercises the series may swap to: its equipment plus bodyweight. */
export function programLibrary(p: Program, library: Exercise[]): Exercise[] {
  return library.filter((e) => e.equipment === 'bodyweight' || p.equipment.includes(e.equipment))
}

export interface GuardScore { date: string; region: Region; pain: number; ts?: string; id?: number }

/**
 * §6.6 next-morning monitor: true while the latest score (since `since`) of ANY flagged knee or hip region is 4/10 or
 * more, i.e. the walk / low-impact version is needed until that region scores 3/10 or less. Latest per region by date,
 * then ts, then id (then input order). One region's good score never clears another's.
 */
export function kneeGuard(scores: GuardScore[], flags: Region[], since: string): boolean {
  const watched = new Set(flags.filter((r) => regionGroup(r) === 'knee' || regionGroup(r) === 'hip'))
  const later = (a: GuardScore, b: GuardScore): boolean => {
    if (a.date !== b.date) return a.date > b.date
    if ((a.ts ?? '') !== (b.ts ?? '')) return (a.ts ?? '') > (b.ts ?? '')
    return (a.id ?? 0) >= (b.id ?? 0)
  }
  const latest = new Map<Region, GuardScore>()
  for (const s of scores) {
    if (s.date < since || !watched.has(s.region)) continue
    const cur = latest.get(s.region)
    if (!cur || later(s, cur)) latest.set(s.region, s)
  }
  return [...latest.values()].some((s) => s.pain >= 4)
}

// --- reflow ----------------------------------------------------------------------------------------------------

/**
 * §6.5: missed planned programme sessions of this window move to the next free days up to `windowEnd`, in order,
 * one per day. Never drops: what does not fit stays where it is and counts as missed.
 */
export function reflowProgramWeek(rows: WorkoutSession[], today: string, windowEnd: string): { id: number; scheduledDate: string }[] {
  const windowStart = addDays(windowEnd, -6)
  const missed = rows
    .filter((s) => isProgramSession(s) && s.status === 'planned' && s.scheduledDate < today && s.scheduledDate >= windowStart)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.id - b.id)
  if (!missed.length) return []
  const occupied = new Set(rows.filter((s) => !missed.includes(s) && s.status !== 'skipped').map((s) => s.scheduledDate))
  const free: string[] = []
  for (let d = today; d <= windowEnd; d = addDays(d, 1)) if (!occupied.has(d)) free.push(d)
  const out: { id: number; scheduledDate: string }[] = []
  for (const s of missed) {
    const day = free.shift()
    if (!day) break
    out.push({ id: s.id, scheduledDate: day })
  }
  return out
}
