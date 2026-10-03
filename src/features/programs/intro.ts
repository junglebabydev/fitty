// Pure helpers for the programme intro (/train/program/:id) and the safety check sheet
// (docs/PRD_TRAINING_PROGRAMS.md §4.3, §4.4). No React, no database.
import type { PathId, Program, ProgramSession } from '../../domain/programs'
import { parseProgramKey } from '../../domain/programs'
import type { Exercise, Region, WorkoutSession } from '../../domain/types'
import { EXERCISES } from '../../data/exercises'
import { expandSessions, noImpactPath, regionGroup, regionLabel, type ScreenResult } from '../../engine'
import { addDays, startOfWeek } from '../../lib/util'

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "Seven", "Ten"; digits past twelve. Capitalised: it opens a sentence. */
export function countWord(n: number): string {
  const w = WORDS[n] ?? String(n)
  return w[0].toUpperCase() + w.slice(1)
}

/** "26–40", or "30" when both ends match. */
export function rangeText([a, b]: [number, number]): string {
  return a === b ? String(a) : `${a}–${b}`
}

/** The plan strip: every week with its sessions on the standard path (repeats resolved, alt-only sessions left out). */
export function planWeeks(p: Program): { week: number; sessions: ProgramSession[] }[] {
  const all = expandSessions(p)
  return Array.from({ length: p.weeks }, (_, i) => ({ week: i + 1, sessions: all.filter((s) => s.week === i + 1) }))
}

/**
 * A running or jumping series: one with a no-impact path (walk-first or low-impact) whose standard sessions use at
 * least one impact-tagged exercise. Only these offer "I'd rather not run".
 */
export function isRunJumpSeries(p: Program, library: Exercise[] = EXERCISES): boolean {
  if (!noImpactPath(p)) return false
  const impact = new Set(library.filter((e) => e.safetyTags.includes('impact')).map((e) => e.id))
  return expandSessions(p).some((s) => s.blocks.some((b) => {
    if (b.shape === 'sets' || b.shape === 'steady') return impact.has(b.exerciseId)
    if (b.shape === 'intervals') return impact.has(b.work.exerciseId)
    return b.stations.some((st) => impact.has(st.exerciseId))
  }))
}

/** "I'd rather not run": a start outcome on the standard or knee-checked path of a running/jumping series. */
export function offersNoRun(p: Program, result: Pick<ScreenResult, 'kind' | 'path'>, noImpact: boolean, library: Exercise[] = EXERCISES): boolean {
  if (noImpact || result.kind !== 'start') return false
  if (result.path !== 'standard' && result.path !== 'knee-checked') return false
  return isRunJumpSeries(p, library)
}

/** The user's flags that pre-answer this question, as labels ("Left knee, hip"). Empty when none. */
export function flagNote(fromFlags: Region[] | undefined, flags: Region[]): string {
  const hit = (fromFlags ?? []).filter((r) => flags.includes(r))
  const text = hit.map(regionLabel).join(', ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

/** The outcome card for a start: the yes-copy of the question that chose the path, then the notes. */
export function outcomeLines(p: Program, answers: Record<string, boolean>, flags: Region[], result: Pick<ScreenResult, 'path' | 'notes'>): string[] {
  const chose = p.screen.filter((q) => q.onYes === `path:${result.path}` && (answers[q.id] === true || flagNote(q.fromFlags, flags) !== ''))
  return [...new Set([...chose.map((q) => q.yesCopy), ...result.notes])]
}

/**
 * Why the intro's "Your path" differs from standard, or null when it does not. An explicit screen answer first, then
 * the no-impact choice, then the standing flags (the same order `screenResult` picks the path in).
 */
export function pathReason(p: Program, path: PathId, answers: Record<string, boolean>, flags: Region[], noImpact: boolean): string | null {
  if (path === 'standard' || !p.paths[path]) return null
  const answered = p.screen.find((q) => q.onYes === `path:${path}` && answers[q.id] === true && !flagNote(q.fromFlags, flags))
  if (answered) return answered.yesCopy
  if (noImpact && noImpactPath(p) === path) return 'You chose not to run or jump.'
  // Only the flags that select this path (a shoulder flag says nothing about a knee path).
  const flagged = flags.filter((r) => { const g = regionGroup(r); return g !== 'other' && p.flagPaths[g] === path })
  if (flagged.length) return `From your profile: ${flagNote(flagged, flagged)}.`
  return null
}

/** Planned sessions `enrollInProgram({ replaceTierWeek })` would replace: today to the end of this calendar week, not programme or workout rows. */
export function tierWeekRows(rows: WorkoutSession[], today: string): WorkoutSession[] {
  const end = addDays(startOfWeek(today), 6)
  return rows.filter((s) => s.scheduledDate >= today && s.scheduledDate <= end && s.status === 'planned' && !parseProgramKey(s.templateKey))
}

/** Engine notes inside a stop-sign action that must never reach the screen. */
const ENGINE_WORDS = /\b[RPEG]\d+[a-z]?\b|\bshow the\b|\bprompt\b|\bgate\b|symptomGate|\bthe app\b|\bseries\b|\bLogs?\b|\bSuggest\b|\bRuns the\b|\bTier \d/i

/** Turn an instruction to the app into one to the user, and cut the engine's bookkeeping off a sentence. */
function userSentence(sentence: string): string {
  const s = sentence
    .replace(/^Tier \d+,\s*/i, '')
    .replace(/\s*\((?:[RPE]\d+[,\s]*)+\)/g, '')
    .replace(/^Suggest\s+/i, 'Get ')
    .replace(/^Advise seeing\s+/i, 'See ')
    .replace(/(?:\s+and|;)\s+log\b.*$/i, '.')
    .replace(/\.\.$/, '.')
    .trim()
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * Stop signs for the intro: the sign and what to do. The action is the quoted line when there is one, else its
 * leading sentences up to the first engine note (at most three). "Not a stop sign" and "No alarm" rows are left out.
 */
export function stopSignLines(p: Program): { sign: string; advice: string | null }[] {
  return p.stopSigns
    .filter((s) => !/^(not a stop sign|no alarm)/i.test(s.action.trim()))
    .map((s) => {
      const quoted = /"([^"]+)"/.exec(s.action)?.[1]
      let raw = quoted ?? ''
      if (!quoted) {
        const lead: string[] = []
        for (const sentence of s.action.trim().split(/(?<=\.)\s+/).map(userSentence)) {
          if (!sentence) continue
          if (ENGINE_WORDS.test(sentence) || lead.length === 3) break
          lead.push(sentence)
        }
        raw = lead.join(' ')
      }
      raw = raw.replace(/\{emergency\}/g, 'emergency services').trim()
      if (raw && !/[.!?]$/.test(raw)) raw += '.'
      return { sign: s.sign, advice: raw && !ENGINE_WORDS.test(raw) ? raw : null }
    })
}
