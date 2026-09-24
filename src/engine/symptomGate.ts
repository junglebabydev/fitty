// Symptom gate: maps today's symptom checks to regions, avoid-tags and advice (PRD §9.3).
// Pure functions. Never diagnoses; RED only stops provocative recommendations and suggests assessment.
import type { Exercise, RedFlags, Region, SafetyTag, SymptomCheck } from '../domain/types'

export type GateLevel = 'OK' | 'AMBER' | 'RED'

export interface GateRegion {
  region: Region
  level: GateLevel
  reasons: string[]
  painScore: number
  redFlags: (keyof RedFlags)[]
}

export interface GateResult {
  regions: GateRegion[]
  avoidTags: SafetyTag[]
  overall: GateLevel
  advice: string[]
}

export type RegionGroup = 'knee' | 'back' | 'neck' | 'shoulder' | 'hip' | 'other'

/** Red-flag fields that force RED on their own (swelling is a caution, not a stop). */
export const RED_FLAG_KEYS: (keyof RedFlags)[] = ['locking', 'givingWay', 'numbness', 'weakness', 'radiating']

export const RED_FLAG_LABELS: Record<keyof RedFlags, string> = {
  locking: 'locking',
  givingWay: 'giving way',
  numbness: 'numbness',
  weakness: 'weakness',
  radiating: 'radiating symptoms',
  swelling: 'swelling',
}

export const SAFETY_TAG_LABELS: Record<SafetyTag, string> = {
  knee_load: 'knee loading',
  deep_knee_flexion: 'deep knee flexion',
  impact: 'impact',
  spinal_load: 'spinal loading',
  spinal_flexion: 'loaded spinal flexion',
  axial_load: 'axial loading',
  neck_load: 'neck loading',
  overhead: 'overhead work',
}

const TAGS_BY_GROUP: Record<RegionGroup, { amber: SafetyTag[]; red: SafetyTag[] }> = {
  knee: { amber: ['impact', 'deep_knee_flexion'], red: ['knee_load'] },
  back: { amber: ['spinal_flexion', 'axial_load'], red: ['spinal_load'] },
  neck: { amber: ['overhead'], red: ['neck_load'] },
  shoulder: { amber: ['overhead'], red: [] },
  hip: { amber: ['impact', 'deep_knee_flexion'], red: ['axial_load'] },
  other: { amber: [], red: [] },
}

/**
 * Standing avoid-tags for a baseline condition flag (not today's symptoms): the AMBER
 * set for that region's group. A user with no condition flags gets nothing back, which
 * is what keeps the whole exercise library reachable for everyone else.
 */
export function baselineAvoidTags(regions: Region[]): SafetyTag[] {
  const out = new Set<SafetyTag>()
  for (const r of regions) for (const t of TAGS_BY_GROUP[regionGroup(r)].amber) out.add(t)
  return [...out]
}

const LEVEL_RANK: Record<GateLevel, number> = { OK: 0, AMBER: 1, RED: 2 }

export function regionLabel(region: Region): string {
  switch (region) {
    case 'knee_left': return 'left knee'
    case 'knee_right': return 'right knee'
    case 'back_lower': return 'lower back'
    case 'back_mid': return 'mid back'
    case 'back_upper': return 'upper back'
    case 'neck': return 'neck'
    case 'shoulder': return 'shoulder'
    case 'hip': return 'hip'
    default: return 'other area'
  }
}

export function regionGroup(region: Region): RegionGroup {
  if (region === 'knee_left' || region === 'knee_right') return 'knee'
  if (region === 'back_lower' || region === 'back_mid' || region === 'back_upper') return 'back'
  if (region === 'neck') return 'neck'
  if (region === 'shoulder') return 'shoulder'
  if (region === 'hip') return 'hip'
  return 'other'
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

/** Red-flag keys that are set and force RED. */
export function activeRedFlags(flags: RedFlags | null | undefined): (keyof RedFlags)[] {
  if (!flags) return []
  return RED_FLAG_KEYS.filter((k) => flags[k] === true)
}

export interface RegionSnapshot {
  painScore: number
  redFlags: RedFlags
  latest: SymptomCheck
}

/**
 * One snapshot per region: pain from the most recent check (by ts), red flags unioned across
 * every check so a flag reported earlier in the day is not silently dropped.
 */
export function latestSymptomsByRegion(symptoms: SymptomCheck[]): Map<Region, RegionSnapshot> {
  const sorted = [...symptoms].sort((a, b) => a.ts.localeCompare(b.ts))
  const out = new Map<Region, RegionSnapshot>()
  for (const s of sorted) {
    const prev = out.get(s.region)
    const flags: RedFlags = { ...(prev?.redFlags ?? {}) }
    for (const k of Object.keys(s.redFlags ?? {}) as (keyof RedFlags)[]) {
      if (s.redFlags[k]) flags[k] = true
    }
    out.set(s.region, { painScore: s.painScore, redFlags: flags, latest: s })
  }
  return out
}

function painWord(pain: number): string {
  if (pain >= 6) return 'Significant'
  if (pain >= 3) return 'Moderate'
  return 'Mild'
}

/** Every RED advises assessment (PRD §9.3): pain > 5/10 on its own, and/or whichever red flags were reported. */
function assessmentTail(painScore: number, flags: (keyof RedFlags)[]): string {
  const parts = [...(painScore > 5 ? ['pain above 5/10'] : []), ...flags.map((f) => RED_FLAG_LABELS[f])]
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts[0] ?? 'this'
  const plural = parts[parts.length - 1] === RED_FLAG_LABELS.radiating
  return `${capitalize(what)} that ${plural ? 'persist or recur warrant' : 'persists or recurs warrants'} an appropriate clinical assessment — this app does not diagnose.`
}

function adviceFor(group: RegionGroup, level: GateLevel, label: string, painScore: number, flags: (keyof RedFlags)[]): string | null {
  const L = capitalize(label)
  if (level === 'OK') return null
  const base = (() => {
    switch (group) {
      case 'knee':
        return level === 'RED'
          ? `${L}: no knee-loading work today — no squats, lunges, running or jumping.`
          : `${L}: keep conditioning low impact (bike, incline walk, pool), avoid deep knee bends and drop the load.`
      case 'back':
        return level === 'RED'
          ? `${L}: skip loaded spine work today.`
          : `${L}: avoid loaded spinal flexion and heavy axial loading; use supported or machine variations.`
      case 'neck':
        return level === 'RED'
          ? `${L}: avoid overhead and neck-loading work.`
          : `${L}: no overhead pressing today; keep the neck neutral on rows and presses.`
      case 'shoulder':
        return `${L}: skip overhead work; use neutral-grip or machine pressing within a pain-free range.`
      case 'hip':
        return level === 'RED'
          ? `${L}: skip loaded lower-body work today.`
          : `${L}: avoid impact and deep hip or knee flexion; keep ranges comfortable.`
      default:
        return level === 'RED'
          ? `${L}: stop anything that provokes it today.`
          : `${L}: work around it — reduce load and range on anything that provokes it.`
    }
  })()
  return level === 'RED' ? `${base} ${assessmentTail(painScore, flags)}` : base
}

export function evaluateSymptomGate(symptoms: SymptomCheck[]): GateResult {
  const snapshots = latestSymptomsByRegion(symptoms)
  const regions: GateRegion[] = []
  const avoid = new Set<SafetyTag>()
  const advice: string[] = []
  let overall: GateLevel = 'OK'

  for (const [region, snap] of snapshots) {
    const label = regionLabel(region)
    const flags = activeRedFlags(snap.redFlags)
    const reasons: string[] = []
    let level: GateLevel = 'OK'

    if (flags.length) {
      level = 'RED'
      reasons.push(`${capitalize(label)}: ${flags.map((f) => RED_FLAG_LABELS[f]).join(', ')} reported`)
    }
    if (snap.painScore >= 6) {
      level = 'RED'
      reasons.push(`${painWord(snap.painScore)} ${label} pain (${snap.painScore}/10)`)
    } else if (snap.painScore >= 3) {
      if (level !== 'RED') level = 'AMBER'
      reasons.push(`${painWord(snap.painScore)} ${label} pain (${snap.painScore}/10)`)
    } else if (snap.painScore >= 1) {
      reasons.push(`Mild ${label} soreness (${snap.painScore}/10) — monitor`)
    }
    if (snap.redFlags.swelling) {
      if (level === 'OK') level = 'AMBER'
      reasons.push(`${capitalize(label)} swelling reported`)
    }
    if (!reasons.length) reasons.push(`${capitalize(label)}: no pain reported`)

    const group = regionGroup(region)
    const tags = TAGS_BY_GROUP[group]
    if (level === 'AMBER' || level === 'RED') tags.amber.forEach((t) => avoid.add(t))
    if (level === 'RED') tags.red.forEach((t) => avoid.add(t))

    const a = adviceFor(group, level, label, snap.painScore, flags)
    if (a) advice.push(a)
    else if (snap.painScore >= 1) advice.push(`${capitalize(label)}: proceed while monitoring — reduce range or load if it climbs.`)

    if (LEVEL_RANK[level] > LEVEL_RANK[overall]) overall = level
    regions.push({ region, level, reasons, painScore: snap.painScore, redFlags: Object.keys(snap.redFlags).filter((k) => snap.redFlags[k as keyof RedFlags]) as (keyof RedFlags)[] })
  }

  regions.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.painScore - a.painScore)
  return { regions, avoidTags: [...avoid], overall, advice }
}

/** Human explanation of why a tag is avoided, naming the region(s) driving it. */
function tagReason(tag: SafetyTag, gate: GateResult): string {
  const drivers = gate.regions.filter((r) => {
    const t = TAGS_BY_GROUP[regionGroup(r.region)]
    if (r.level === 'RED') return t.amber.includes(tag) || t.red.includes(tag)
    if (r.level === 'AMBER') return t.amber.includes(tag)
    return false
  })
  const who = drivers.map((r) => `${regionLabel(r.region)} ${r.level}`).join(', ')
  return `${capitalize(SAFETY_TAG_LABELS[tag])}${who ? ` — ${who}` : ''}`
}

export function isExerciseAllowed(ex: Exercise, gate: GateResult): { allowed: boolean; reasons: string[] } {
  const blocking = ex.safetyTags.filter((t) => gate.avoidTags.includes(t))
  return { allowed: blocking.length === 0, reasons: blocking.map((t) => tagReason(t, gate)) }
}

function equipmentRank(equipment: string): number {
  const e = equipment.toLowerCase()
  if (e.includes('machine') || e.includes('pulldown') || e.includes('leg press')) return 0
  if (e.includes('cable')) return 1
  if (e.includes('dumbbell')) return 2
  if (e.includes('bodyweight') || e === 'none' || e.includes('body')) return 3
  if (e.includes('kettlebell')) return 4
  if (e.includes('barbell')) return 6
  return 5
}

/**
 * Safer replacement: listed substitutions first (in order), then same-pattern exercises with no
 * avoided tags, preferring machines/cables/dumbbells over free bars.
 */
export function findSubstitute(ex: Exercise, gate: GateResult, library: Exercise[]): Exercise | null {
  const byId = new Map(library.map((e) => [e.id, e]))
  for (const id of ex.substitutions) {
    const cand = byId.get(id)
    if (cand && cand.id !== ex.id && isExerciseAllowed(cand, gate).allowed) return cand
  }
  const samePattern = library
    .filter((e) => e.id !== ex.id && e.pattern === ex.pattern && isExerciseAllowed(e, gate).allowed)
    .sort((a, b) => equipmentRank(a.equipment) - equipmentRank(b.equipment) || overlap(b, ex) - overlap(a, ex))
  return samePattern[0] ?? null
}

function overlap(a: Exercise, b: Exercise): number {
  return a.primaryMuscles.filter((m) => b.primaryMuscles.includes(m)).length
}
