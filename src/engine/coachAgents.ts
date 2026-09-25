// Specialist coach agents and deterministic routing (docs/PRD_COACH_CHAT.md §11). An agent is a list of prompt
// sections: the same guardrail prefix for every agent, the always-on facts (readiness, symptom gate, today's
// session, the computed priority), then its own facts. The generalist `coach` is the full prompt and the fallback,
// so a wrong route only ever costs focus, never safety.
import {
  SECTION_ORDER, assembleCoachPrompt, baselineSection, coachingSection, factsSectionFor, identitySection, prioritySection, profileSection,
  proposalContractSection, rulesSection, safetyNoteSection, type FactKey, type PromptContext, type PromptSection,
} from './coachPrompt'
import { parseRegion } from './voice'

export type AgentId = 'coach' | 'training' | 'nutrition' | 'recovery' | 'symptoms' | 'mind'

export const AGENT_IDS: AgentId[] = ['coach', 'training', 'nutrition', 'recovery', 'symptoms', 'mind']

/** Never trimmed: every agent sees these, so "sore knee, what should I eat?" still sees the gate. */
const ALWAYS_ON: FactKey[] = ['date', 'readiness', 'gate', 'session']

interface AgentSpec {
  focus: string
  facts: FactKey[]
}

const SPECS: Record<Exclude<AgentId, 'coach'>, AgentSpec> = {
  training: { focus: 'training: sessions, exercises, sets, progression and plan changes', facts: ['week', 'stalls'] },
  nutrition: { focus: 'food: meals, protein, calories against target and food choices', facts: ['intake', 'meals', 'weight', 'logging', 'trend'] },
  recovery: { focus: 'recovery: sleep, readiness, rest days and ordinary muscle soreness', facts: ['sleep', 'week'] },
  symptoms: { focus: 'pain and symptoms. Be conservative: the symptom gate decides what is safe to train', facts: ['week'] },
  mind: { focus: 'stress and mood, as context for training and recovery. Warm, plain, never clinical', facts: ['mind', 'sleep'] },
}

const focusSection = (focus: string): PromptSection => () => [`FOCUS: This message is about ${focus}. Answer that; use the facts below.`]

/** The ordered sections for an agent. `coach` is the full prompt (SECTION_ORDER). */
export function agentSections(agent: AgentId): PromptSection[] {
  if (agent === 'coach') return SECTION_ORDER
  const spec = SPECS[agent]
  return [
    identitySection,
    rulesSection,
    coachingSection,
    proposalContractSection,
    safetyNoteSection,
    focusSection(spec.focus),
    profileSection,
    factsSectionFor([...ALWAYS_ON, ...spec.facts]),
    prioritySection,
    baselineSection,
  ]
}

export function buildAgentPrompt(agent: AgentId, ctx: PromptContext): string {
  return assembleCoachPrompt(ctx, agentSections(agent))
}

// --- deterministic routing (§11.2 step 2) ----------------------------------------------------------------

/** Pain words that mean symptoms on their own. */
const PAIN_STRONG = /\b(pain\w*|hurts?|hurting|hurt|ache|aches|aching|achy|injur\w*|tweak\w*|twinge\w*|sprain\w*|swell\w*|swollen|numb\w*|tingl\w*|locking|locked up|giving way|gave way|popped)\b/
/** Words that mean symptoms only next to a body region ("sore knee"); on their own they are ordinary soreness. */
const PAIN_WEAK = /\b(sore\w*|stiff\w*|tight\w*|click\w*|clunk\w*|grind\w*|weird|funny)\b/

const DOMAINS: [Exclude<AgentId, 'coach' | 'symptoms'>, RegExp][] = [
  ['training', /\b(train\w*|workouts?|sessions?|gym|lift\w*|exercis\w*|sets?|reps?|squat\w*|bench\w*|deadlift\w*|press|rows?|pull-?ups?|program\w*|deload\w*|progress(ion)? load|swap)\b/],
  ['nutrition', /\b(eat\w*|ate|food\w*|meals?|lunch|dinner|breakfast|snacks?|protein|calorie\w*|kcal|carbs?|fats?|hungry|diet|cook\w*|drink\w*|coffee)\b/],
  ['recovery', /\b(sleep\w*|slept|nap\w*|tired|exhausted|fatigue\w*|rest days?|recover\w*|readiness|sore\w*|doms)\b/],
  ['mind', /\b(stress\w*|mood|anxious|anxiety|overwhelm\w*|breath\w*|calm|worried|feel(ing)? (down|low|flat)|sad|burn(ed|t)? out)\b/],
]

const FOLLOW_UP = /^(and|but|so|ok|okay|why|how come|what about|then|really|and if|what if)\b/

export interface RouteDecision { agent: AgentId | null; via: 'symptoms' | 'keyword' | 'follow_up' | 'none' }

/**
 * Deterministic routing. Pain goes to `symptoms` whatever else the message says. One clear domain goes to that
 * agent. A short follow-up with no domain stays with the previous agent. Otherwise `agent` is null: the caller
 * asks the classifier, or uses `coach`.
 */
export function routeDeterministic(text: string, previous: AgentId | null): RouteDecision {
  const t = text.toLowerCase().replace(/[’‘]/g, "'")
  if (PAIN_STRONG.test(t) || (PAIN_WEAK.test(t) && parseRegion(t) !== null)) return { agent: 'symptoms', via: 'symptoms' }
  const hits = DOMAINS.filter(([, re]) => re.test(t)).map(([id]) => id)
  if (hits.length === 1) return { agent: hits[0], via: 'keyword' }
  if (hits.length === 0 && previous && (FOLLOW_UP.test(t.trim()) || t.trim().split(/\s+/).length <= 4)) return { agent: previous, via: 'follow_up' }
  return { agent: null, via: 'none' }
}

export function isAgentId(v: unknown): v is AgentId {
  return typeof v === 'string' && (AGENT_IDS as string[]).includes(v)
}
