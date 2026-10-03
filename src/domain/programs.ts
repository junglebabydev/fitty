// Training programmes (docs/PRD_TRAINING_PROGRAMS.md §5). Programmes are deterministic code, transcribed from
// docs/programs/<id>.md; the AI only matches a prompt to one and explains it. Nothing here touches the database.
import type { Region, SafetyTag, SessionType, WorkoutSession } from './types'

export type ProgramId = 'gym-strength' | 'home-dumbbells' | 'hiit' | 'postpartum' | 'start-running' | 'bodyweight'

export const PROGRAM_IDS: ProgramId[] = ['gym-strength', 'home-dumbbells', 'bodyweight', 'hiit', 'start-running', 'postpartum']

/**
 * `ready`: can be started. `preview`: intro and sources show, Start is replaced by "Coming soon"
 * (HIIT and Start Running wait for the interval player; Postpartum for its stage gates and a physio review).
 */
export type ProgramStatus = 'ready' | 'preview'

/** 'standard' always exists. Shared ids: 'low-impact' (knee, hip), 'back', 'no-overhead' (neck, shoulder). Series may add their own. */
export type PathId = string

export type Range = [number, number]
/** Warm-up, cool-down and interval rest blocks: not logged, exempt from the no-duplicate-id rule. */
export type BlockRole = 'warmup' | 'cooldown' | 'rest'

export interface SetsBlock {
  shape: 'sets'
  exerciseId: string
  sets: number
  /** Reps per set, or `seconds` for a timed exercise. Exactly one of the two. */
  reps?: Range
  seconds?: Range
  restSec: number
  perSide?: boolean
  role?: BlockRole
  /** Bodyweight ladders: the ladder slot this block fills; the rung in the enrolment replaces `exerciseId`. */
  slot?: string
}

export interface IntervalsBlock {
  shape: 'intervals'
  rounds: number
  work: { exerciseId: string; seconds: number; effort?: string }
  rest: { exerciseId: string | null; seconds: number; effort?: string }
  role?: BlockRole
}

export interface CircuitStation {
  exerciseId: string
  seconds?: number
  reps?: Range
  perSide?: boolean
  slot?: string
}

export interface CircuitBlock {
  shape: 'circuit'
  rounds: number
  stations: CircuitStation[]
  restBetweenStationsSec: number
  restBetweenRoundsSec: number
  role?: BlockRole
}

export interface SteadyBlock {
  shape: 'steady'
  exerciseId: string
  minutes: number
  effort: string
  role?: BlockRole
}

export type Block = SetsBlock | IntervalsBlock | CircuitBlock | SteadyBlock

export interface ProgramSession {
  /** Unique within the programme, e.g. 'w3d1'. */
  key: string
  week: number
  name: string
  type: SessionType
  minutes: number
  blocks: Block[]
  /** Postpartum stage (0, 1, 2). */
  stage?: number
  /** Only reachable through a path's `replaceSessions` (e.g. HIIT 'w3d2-li'); never materialised on the standard path. */
  altOnly?: boolean
}

/** Week `week` copies the sessions of week `copyOf`, with keys rewritten to 'w<week>d<n>'. */
export interface WeekRepeat { week: number; copyOf: number }

export interface PathSpec {
  label: string
  /** exerciseId → replacement id, or null to drop the block. A swap that would duplicate an id walks the library substitution chain. */
  swaps?: Record<string, string | null>
  /** sessionKey → replacement sessionKey (e.g. HIIT's low-impact circuits). */
  replaceSessions?: Record<string, string>
}

export interface WhyLine { text: string; source: number }

export interface ProgramSource {
  n: number
  citation: string
  url: string
  kind: 'guideline' | 'meta-analysis' | 'rct' | 'cohort' | 'consensus' | 'review' | 'programme' | 'retraction'
}

/**
 * A screen answer's outcome (PRD §4.4): switch path, block the start (`wait`), suggest another series, show a note,
 * or `setup` for a question asked after the screen. Questions with `fromFlags` are pre-answered from the profile.
 */
export type ScreenOutcome = `path:${string}` | 'wait' | `suggest:${ProgramId}` | 'note'

export interface ScreenQuestion {
  id: string
  text: string
  onYes: ScreenOutcome
  /** Shown on a yes (the wait reason, the note, or what the path means). */
  yesCopy: string
  /** Pre-answered yes when the profile has a standing flag for any of these regions. */
  fromFlags?: Region[]
  /** The two questions every non-postpartum series shares (PRD §4.4). */
  shared?: 'pregnant' | 'recent_birth'
}

export interface StopSign { sign: string; action: string }

/** Week-close rule (PRD §6.2). Every threshold is a coaching convention stated in the series doc. */
export interface AdvanceRule {
  /** Completed sessions needed to advance ('all' = sessionsPerWeek). */
  minCompleted: number | 'all'
  /** Highest pain score (0-10, any session or next-morning check in the week) that still allows advancing. */
  maxPainToAdvance: number
  /** Pain at or above this drops back one week (minimum week 1); between the two, the week repeats. */
  dropBackPainAtLeast: number
  /** "Too hard" on any session repeats the week (owner decision, PRD §4.7). */
  repeatIfFeltHard: boolean
  /** A gap of this many days or more since the last completed session repeats the last completed week. */
  longGapDays: number
}

/** A progression ladder (Bodyweight, Home Dumbbells): rungs from easiest to hardest for one slot. */
export interface Ladder {
  slot: string
  rungs: string[]
  /** Move up when every working set reached the top of the range (reps or seconds). */
  advanceWhen: string
}

export interface StandalonePick { sessionKey: string; name: string; fact: string }

export interface StageSpec {
  stage: number
  name: string
  weeks: Range
  summary: string
  /** The gate into this stage, in plain words (evaluated by series code, not here). */
  gateLabel?: string
}

export interface Program {
  id: ProgramId
  status: ProgramStatus
  title: string
  /** ≤ 12 words. */
  promise: string
  /** ≤ 60 words. */
  description: string
  weeks: number
  sessionsPerWeek: number
  minutes: Range
  /** Library `equipment` values the series may use; the gate never swaps outside this list plus 'bodyweight'. */
  equipment: string[]
  /** "What you need" copy. */
  needs: string
  timePerWeek: string
  why: [WhyLine, WhyLine, WhyLine]
  honestLine?: { text: string; sources: number[] }
  sources: ProgramSource[]
  screen: ScreenQuestion[]
  stopSigns: StopSign[]
  /** The standard path. Every week either written out or produced by `repeats`. */
  sessions: ProgramSession[]
  repeats?: WeekRepeat[]
  paths: Record<PathId, PathSpec>
  /** Which path a standing condition flag selects. */
  flagPaths: Partial<Record<'knee' | 'hip' | 'back' | 'neck' | 'shoulder', PathId>>
  /** Extra avoid tags a standing flag adds for this series (on top of the gate's AMBER set minus `impact`, PRD §6.6). */
  flagAvoid?: Partial<Record<'knee' | 'hip' | 'back' | 'neck' | 'shoulder', SafetyTag[]>>
  advance: AdvanceRule
  ladders?: Ladder[]
  standalone: StandalonePick[]
  /** Coach lines: by exercise id, plus 'start', 'rest', 'lastRound', 'finish'. ≤ 10 words each. */
  cues: Record<string, string>
  stages?: StageSpec[]
  /** Re-ask the safety check after this many days (Postpartum 28; default 90). */
  screenMaxAgeDays?: number
  /** Rules from the doc the engine does not implement yet, kept verbatim for later phases. */
  rulesText?: Record<string, string>
}

// ---- enrolment (setting 'train.program') ------------------------------------------------------------------

export type Feel = 'easy' | 'right' | 'hard'

export interface Enrollment {
  programId: ProgramId
  path: PathId
  /** 'YYYY-MM-DD' the enrolment started. Programme windows are 7-day blocks from here: window k = [start + 7k, start + 7k + 7). */
  startDate: string
  /** Programme week (content) being done in the current window, 1-based. Repeats keep it; advancing adds 1. */
  week: number
  /** Index of the last window whose week-close decision has been applied (−1 before any). */
  closedWindow: number
  status: 'active' | 'done' | 'left'
  /** Bodyweight ladders: slot → rung index. */
  rungs?: Record<string, number>
  /** One entry per finished programme session. */
  feel: { sessionKey: string; week: number; value: Feel }[]
  /** Programme weeks already closed (advance/repeat decided), with the decision. */
  history: { week: number; decision: 'advance' | 'repeat' | 'drop_back'; reason: string; at: string }[]
}

/** Stored safety-check answers per series (setting 'train.screens'): re-asked on the series' schedule. */
export interface ScreenAnswers {
  programId: ProgramId
  answers: Record<string, boolean>
  answeredAt: string
}

export const PROGRAM_SETTING = 'train.program'
export const SCREENS_SETTING = 'train.screens'
/** App-wide "I don't want to run or jump" (PRD §6.6). */
export const NO_IMPACT_SETTING = 'train.noImpact'

export const PROGRAM_KEY_PREFIX = 'prog:'
export const WORKOUT_KEY_PREFIX = 'work:'

/** 'prog:<programId>:<sessionKey>' — a session materialised from an enrolment. */
export function programTemplateKey(programId: ProgramId, sessionKey: string): string {
  return `${PROGRAM_KEY_PREFIX}${programId}:${sessionKey}`
}

/** 'work:<programId>:<sessionKey>' — a standalone ("Start now") workout taken from a programme. Never moves the programme. */
export function workoutTemplateKey(programId: ProgramId, sessionKey: string): string {
  return `${WORKOUT_KEY_PREFIX}${programId}:${sessionKey}`
}

export function isProgramSession(s: Pick<WorkoutSession, 'templateKey'>): boolean {
  return s.templateKey.startsWith(PROGRAM_KEY_PREFIX)
}

/** Programme or standalone-workout session: both carry programme prescriptions (PRD §6.4) and skip tier logic. */
export function isProgramDerived(s: Pick<WorkoutSession, 'templateKey'>): boolean {
  return s.templateKey.startsWith(PROGRAM_KEY_PREFIX) || s.templateKey.startsWith(WORKOUT_KEY_PREFIX)
}

export function parseProgramKey(templateKey: string): { programId: ProgramId; sessionKey: string; standalone: boolean } | null {
  const standalone = templateKey.startsWith(WORKOUT_KEY_PREFIX)
  if (!standalone && !templateKey.startsWith(PROGRAM_KEY_PREFIX)) return null
  const rest = templateKey.slice(standalone ? WORKOUT_KEY_PREFIX.length : PROGRAM_KEY_PREFIX.length)
  const i = rest.indexOf(':')
  if (i <= 0) return null
  const programId = rest.slice(0, i) as ProgramId
  if (!PROGRAM_IDS.includes(programId)) return null
  return { programId, sessionKey: rest.slice(i + 1), standalone }
}
