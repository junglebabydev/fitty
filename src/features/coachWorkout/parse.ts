// What a typed reply means during a coach-led workout. Numbers are read in the current step's unit: reps for a reps
// step, seconds for a hold, minutes for a steady block. Anything not understood is 'other' and goes to the coach. Pure.
import type { StepKind } from './step'

export type WorkoutReply =
  | { kind: 'reps'; reps: number; loadKg: number | null }
  | { kind: 'seconds'; sec: number }
  | { kind: 'done' }
  | { kind: 'start' }
  | { kind: 'skip' }
  | { kind: 'how' }
  | { kind: 'pain' }
  | { kind: 'undo' }
  | { kind: 'finish' }
  | { kind: 'other' }

const LB_PER_KG = 2.20462

const NUM = String.raw`(\d+(?:\.\d+)?)`
const LOAD_UNIT = String.raw`(kg|kgs|kilos?|lb|lbs|pounds?)`
const TIME_UNIT = String.raw`(s|sec|secs|seconds?|m|min|mins|minutes?)`

function toKg(n: number, unit: string): number {
  const kg = /^(lb|lbs|pound)/.test(unit) ? n / LB_PER_KG : n
  return Math.round(kg * 2) / 2
}

function toSec(n: number, unit: string): number {
  return Math.round(/^m/.test(unit) ? n * 60 : n)
}

const PAIN = /\b(pain|painful|hurts?|hurting|hurt|sore|aches?|aching|twinge|tweak(ed)?|pinch(ing)?|sharp|injur(ed|y))\b/

const lower = (raw: string) => raw.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
/** "no pain" and "pain-free" are reassurance, not a report. */
const withoutReassurance = (t: string) => t.replace(/\b(no pain|pain[- ]free|without pain|doesn't hurt|didn't hurt|nothing hurts)\b/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The answer to "Anything hurting?" before the first set. Any pain word wins ("no, but my knee hurts"); only a short
 * all-clear on its own starts the session at 0 everywhere.
 */
export function parseGateReply(raw: string): 'all_good' | 'hurts' | 'other' {
  const t = lower(raw)
  if (/^(all good|all fine|all clear|no|nope|none|nothing|fine|good|ok(ay)?|i'm (good|fine)|no pain|nothing hurts|pain[- ]free)[.! ]*$/.test(t)) return 'all_good'
  if (PAIN.test(withoutReassurance(t))) return 'hurts'
  return 'other'
}

export function parseWorkoutReply(raw: string, kind: StepKind | null): WorkoutReply {
  const t = withoutReassurance(lower(raw))
  if (!t) return { kind: 'other' }

  if (/^(undo|oops|wrong|that's wrong|not \d+|delete that|scratch that)\b/.test(t)) return { kind: 'undo' }
  if (/\b(finish|i'm done for today|done for today|end (the |this )?(workout|session)|stop the (workout|session)|wrap (it )?up|call it a day|that's it for today)\b/.test(t)) return { kind: 'finish' }
  if (PAIN.test(t)) return { kind: 'pain' }

  // "10 at 16 kg", "10 x 16", "10 reps @ 35 lb"
  const repsLoad = t.match(new RegExp(String.raw`\b${NUM}\s*(?:reps?)?\s*(?:@|at|x|×|with)\s*${NUM}\s*${LOAD_UNIT}?`))
  if (repsLoad && kind !== 'hold' && kind !== 'steady') {
    return { kind: 'reps', reps: Math.round(Number(repsLoad[1])), loadKg: toKg(Number(repsLoad[2]), repsLoad[3] ?? 'kg') }
  }
  const time = t.match(new RegExp(String.raw`\b${NUM}\s*${TIME_UNIT}\b`))
  if (time && kind !== 'reps') return { kind: 'seconds', sec: toSec(Number(time[1]), time[2]) }
  const load = t.match(new RegExp(String.raw`\b${NUM}\s*${LOAD_UNIT}\b`))
  const bare = t.match(new RegExp(String.raw`\b${NUM}\b`))
  if (bare && kind) {
    // A load on its own ("16 kg") is not a set; one number besides it is the reps.
    const nums = [...t.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => Number(m[1]))
    const loadKg = load ? toKg(Number(load[1]), load[2]) : null
    const rest = load ? nums.filter((n) => n !== Number(load[1])) : nums
    if (rest.length) {
      const n = rest[0]
      if (kind === 'reps') return { kind: 'reps', reps: Math.round(n), loadKg }
      return { kind: 'seconds', sec: kind === 'steady' ? Math.round(n * 60) : Math.round(n) }
    }
  }

  if (/^skip rest\b|^(go|start|begin|ready|let's go|let's do it)\b/.test(t)) return { kind: 'start' }
  if (/^(skip|pass|next exercise|not this one|can't do (it|this|that)|cannot do (it|this|that))\b|\bskip (it|this)\b/.test(t)) return { kind: 'skip' }
  if (/\b(how do i|how to|how should i|show me|what is this|what's this|explain|technique|form)\b|^how\b/.test(t)) return { kind: 'how' }
  if (/^(done|did it|did that|finished|complete(d)?|ok(ay)?|yes|yep|yeah|y|got it|next|all done)\b/.test(t)) return { kind: 'done' }
  return { kind: 'other' }
}
