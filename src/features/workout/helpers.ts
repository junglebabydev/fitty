// Shared, mostly pure helpers for the Train / Workout / ExerciseDetail screens.
import type { Exercise, ExerciseSet, RedFlags, Region, SafetyTag, SessionType, WorkoutSession } from '../../domain/types'
import {
  BatteryLow, Bike, CalendarClock, Check, CircleDot, Droplets, Dumbbell, Lock, MoveDown, Play, RotateCcw, SkipForward, StretchHorizontal, Waves, Zap, ZapOff,
  type LucideIcon,
} from 'lucide-react'
import type { Tone } from '../../components'
import { getExercises } from '../../db/repositories'
import { EXERCISES } from '../../data'
import { estimate1RM } from '../../engine'

export type Tier = 'minimum' | 'target' | 'stretch'

/** Settings key holding the active weekly tier (read by Train; siblings may read it for CoachFacts.weekTier). */
export const TRAIN_TIER_SETTING = 'train.tier'

export const TIER_OPTIONS: { value: Tier; label: string; sub: string }[] = [
  { value: 'minimum', label: 'Minimum', sub: '3 strength' },
  { value: 'target', label: 'Target', sub: '+ conditioning' },
  { value: 'stretch', label: 'Stretch', sub: '+ swim & mobility' },
]

const TIER_RANK: Record<Tier, number> = { minimum: 0, target: 1, stretch: 2 }

export function tierRank(t: Tier): number { return TIER_RANK[t] }

/** Highest tier present among a week's sessions (minimum when the week is empty). */
export function weekTierOf(sessions: WorkoutSession[]): Tier {
  let best: Tier = 'minimum'
  for (const s of sessions) if (TIER_RANK[s.tier] > TIER_RANK[best]) best = s.tier
  return best
}

export const SESSION_TYPE_META: Record<SessionType, { label: string; tone: Tone; dot: string; icon: LucideIcon }> = {
  strength: { label: 'Strength', tone: 'accent', dot: 'bg-indigo-500', icon: Dumbbell },
  conditioning: { label: 'Conditioning', tone: 'amber', dot: 'bg-amber-500', icon: Bike },
  swim: { label: 'Swim', tone: 'default', dot: 'bg-sky-500', icon: Waves },
  mobility: { label: 'Mobility', tone: 'green', dot: 'bg-emerald-500', icon: StretchHorizontal },
}

export function isMissed(s: WorkoutSession, today: string): boolean {
  return s.status === 'planned' && s.scheduledDate < today
}

/** Status word + icon for a session. Missed is neutral on purpose: it gets rescheduled, not judged. */
export function sessionStatusInfo(s: WorkoutSession, today: string): { label: string; tone: Tone; icon: LucideIcon } {
  switch (s.status) {
    case 'in_progress': return { label: 'In progress', tone: 'accent', icon: Play }
    case 'completed': return { label: 'Done', tone: 'green', icon: Check }
    case 'skipped': return { label: 'Skipped', tone: 'neutral', icon: SkipForward }
    default:
      if (s.scheduledDate < today) return { label: 'Missed', tone: 'neutral', icon: RotateCcw }
      if (s.scheduledDate === today) return { label: 'Today', tone: 'accent', icon: CircleDot }
      return { label: 'Planned', tone: 'neutral', icon: CalendarClock }
  }
}

/** Exercise library from the database, falling back to the bundled list before the seed has run. */
export function libraryExercises(): Exercise[] {
  const list = getExercises()
  return list.length ? list : EXERCISES
}

export function exerciseMap(list: Exercise[]): Map<string, Exercise> {
  return new Map(list.map((e) => [e.id, e]))
}

// --- set formatting -----------------------------------------------------------

export function fmtLoad(kg: number | null): string {
  if (kg == null) return 'BW'
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`
}

export function fmtSec(sec: number): string {
  if (sec >= 120 && sec % 60 === 0) return `${sec / 60} min`
  if (sec >= 90) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec} s`
}

/** "26 kg × 10 · RIR 2" / "45 s" / "BW × 12". */
export function formatSetLine(s: ExerciseSet, timed: boolean): string {
  const parts: string[] = []
  if (timed) {
    if (s.loadKg != null) parts.push(fmtLoad(s.loadKg))
    parts.push(s.durationSec != null ? fmtSec(s.durationSec) : s.reps != null ? `${s.reps} reps` : '—')
    return parts.join(' × ')
  }
  const base = `${fmtLoad(s.loadKg)} × ${s.reps ?? (s.durationSec != null ? fmtSec(s.durationSec) : '—')}`
  const tail: string[] = []
  if (s.rir != null) tail.push(`RIR ${s.rir}`)
  else if (s.rpe != null) tail.push(`RPE ${s.rpe}`)
  return tail.length ? `${base} · ${tail.join(' · ')}` : base
}

/** "26 kg × 10, 10, 9" — collapses same-load sets; mixed loads are listed per set. */
export function summarizeSets(sets: ExerciseSet[], timed: boolean): string {
  if (!sets.length) return '—'
  if (timed) {
    const d = sets.map((s) => (s.durationSec != null ? fmtSec(s.durationSec) : s.reps != null ? `${s.reps}` : '—'))
    return d.join(', ')
  }
  const loads = new Set(sets.map((s) => s.loadKg ?? -1))
  if (loads.size === 1) {
    return `${fmtLoad(sets[0].loadKg)} × ${sets.map((s) => s.reps ?? '—').join(', ')}`
  }
  return sets.map((s) => `${fmtLoad(s.loadKg)}×${s.reps ?? '—'}`).join(', ')
}

export function rirSummary(sets: ExerciseSet[]): string | null {
  const r = sets.map((s) => s.rir).filter((x): x is number => x != null)
  if (!r.length) return null
  const min = Math.min(...r), max = Math.max(...r)
  return min === max ? `RIR ${min}` : `RIR ${min}–${max}`
}

/** Highest Epley estimate across sets with both load and reps. */
export function bestE1RM(sets: ExerciseSet[]): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.loadKg == null || s.reps == null || s.reps <= 0) continue
    const v = estimate1RM(s.loadKg, s.reps)
    if (best == null || v > best) best = v
  }
  return best
}

/** The strongest set: by e1RM when loaded, otherwise by reps / duration. */
export function bestSet(sets: ExerciseSet[], timed: boolean): ExerciseSet | null {
  if (!sets.length) return null
  const score = (s: ExerciseSet) => {
    if (timed) return s.durationSec ?? s.reps ?? 0
    if (s.loadKg != null && s.reps != null) return estimate1RM(s.loadKg, s.reps)
    return (s.reps ?? 0) / 1000
  }
  return sets.reduce((a, b) => (score(b) > score(a) ? b : a))
}

export function bestEffort(sets: ExerciseSet[], timed: boolean): number | null {
  if (timed) {
    const d = sets.map((s) => s.durationSec ?? s.reps).filter((x): x is number => x != null)
    return d.length ? Math.max(...d) : null
  }
  const e = bestE1RM(sets)
  if (e != null) return e
  const r = sets.map((s) => s.reps).filter((x): x is number => x != null)
  return r.length ? Math.max(...r) : null
}

/** Total load moved: Σ load × reps over sets that have both. */
export function sessionVolumeKg(sets: ExerciseSet[]): number {
  let v = 0
  for (const s of sets) if (s.loadKg != null && s.reps != null) v += s.loadKg * s.reps
  return Math.round(v)
}

/** "12,480" — grouped thousands for big volume numbers. */
export function fmtVolume(kg: number): string {
  return Math.round(kg).toLocaleString('en-SG')
}

/** Group a session's sets by exercise, preserving log order. */
export function setsByExercise(sets: ExerciseSet[]): Map<string, ExerciseSet[]> {
  const out = new Map<string, ExerciseSet[]>()
  for (const s of sets) {
    const list = out.get(s.exerciseId) ?? []
    list.push(s)
    out.set(s.exerciseId, list)
  }
  return out
}

// --- safety / regions ---------------------------------------------------------

export const SAFETY_TAG_PLAIN: Record<SafetyTag, string> = {
  knee_load: 'Loads the knee — go lighter or shorten the range on a sore-knee day',
  deep_knee_flexion: 'Deep knee bend — skipped when a knee is sore or swollen',
  impact: 'Impact — skipped when a knee or hip is flaring',
  spinal_load: 'Loads the spine — keep it neutral; skipped on a bad back day',
  spinal_flexion: 'Rounds the spine under load — avoided when the back is sore',
  axial_load: 'Compresses the spine — use supported variations when the back is sore',
  neck_load: 'Works the neck — skipped on a sore-neck day',
  overhead: 'Overhead — avoided with a sore neck or shoulder',
}

export const SAFETY_TAG_SHORT: Record<SafetyTag, string> = {
  knee_load: 'Knee load',
  deep_knee_flexion: 'Deep knee bend',
  impact: 'Impact',
  spinal_load: 'Spine load',
  spinal_flexion: 'Spinal flexion',
  axial_load: 'Axial load',
  neck_load: 'Neck load',
  overhead: 'Overhead',
}

export const REGION_LABELS: Record<Region, string> = {
  knee_left: 'Left knee',
  knee_right: 'Right knee',
  back_lower: 'Lower back',
  back_mid: 'Mid back',
  back_upper: 'Upper back',
  neck: 'Neck',
  shoulder: 'Shoulder',
  hip: 'Hip',
  other: 'Other',
}

export const ALL_REGIONS: Region[] = ['knee_left', 'knee_right', 'back_lower', 'back_mid', 'back_upper', 'neck', 'shoulder', 'hip', 'other']

export const KNEE_FLAGS: (keyof RedFlags)[] = ['locking', 'givingWay', 'swelling']
export const SPINE_FLAGS: (keyof RedFlags)[] = ['numbness', 'weakness', 'radiating']

export const RED_FLAG_OPTIONS: { key: keyof RedFlags; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'locking', label: 'Locking', hint: 'joint catches or will not straighten', icon: Lock },
  { key: 'givingWay', label: 'Giving way', hint: 'buckles under you', icon: MoveDown },
  { key: 'swelling', label: 'Swelling', hint: 'visibly puffy', icon: Droplets },
  { key: 'numbness', label: 'Numbness', hint: 'pins and needles or dead patches', icon: ZapOff },
  { key: 'weakness', label: 'Weakness', hint: 'new loss of strength', icon: BatteryLow },
  { key: 'radiating', label: 'Radiating', hint: 'travels down an arm or leg', icon: Zap },
]

/** Red-flag choices that make sense for a region. */
export function flagsForRegion(region: Region): (keyof RedFlags)[] {
  if (region === 'knee_left' || region === 'knee_right') return KNEE_FLAGS
  if (region === 'hip') return ['locking', 'givingWay', 'radiating']
  if (region === 'shoulder') return ['weakness', 'numbness', 'swelling']
  if (region === 'other') return ['swelling', 'numbness', 'weakness']
  return SPINE_FLAGS
}

/** Regions the pre-workout gate always asks about (knees, back, neck). */
export const GATE_REGIONS: Region[] = ['knee_left', 'knee_right', 'back_lower', 'neck']

export function activeFlagKeys(flags: RedFlags | null | undefined): (keyof RedFlags)[] {
  if (!flags) return []
  return (Object.keys(flags) as (keyof RedFlags)[]).filter((k) => flags[k] === true)
}

/** Best-guess region for a Pain/Issue report on this exercise, from its safety tags. */
export function guessRegion(ex: Exercise): Region {
  const t = ex.safetyTags
  if (t.includes('knee_load') || t.includes('deep_knee_flexion') || t.includes('impact')) return 'knee_left'
  if (t.includes('overhead') || t.includes('neck_load')) return 'neck'
  if (t.includes('spinal_load') || t.includes('spinal_flexion') || t.includes('axial_load')) return 'back_lower'
  if (ex.pattern.includes('shoulder') || ex.pattern.includes('vertical')) return 'shoulder'
  if (ex.pattern.includes('hip') || ex.pattern === 'hinge') return 'hip'
  return 'other'
}

// --- time ---------------------------------------------------------------------

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function elapsedMinutes(startedAt: string | null, now: Date = new Date()): number {
  if (!startedAt) return 0
  return Math.max(0, Math.round((now.getTime() - new Date(startedAt).getTime()) / 60_000))
}

/** Reads a per-session ephemeral value (survives reload, cleared with the tab). */
export function readSessionFlag<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeSessionFlag(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — the flag is a convenience only
  }
}
