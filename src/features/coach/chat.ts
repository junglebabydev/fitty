// Pure helpers for the Coach conversation (v3, DESIGN §10): reply source tags, clamping, the one-sentence brief
// and the extra context handed to the system prompt. No database access here.
import type { ChatTurn } from '../../ai'
import type { CoachDecision, CoachMessage, Evidence } from '../../domain/types'
import { REDACTED_SAFETY_TURN, isAgentId, isSafetyKind, type AgentId, type SafetyKind } from '../../engine'

/** Who wrote a coach reply. Stored as one reserved evidence entry so the message schema stays unchanged. */
export type ReplySource = 'ai' | 'local'
export const SOURCE_LABEL = '_source'
export const MAX_EVIDENCE = 3
/** Marks a fixed safety reply (L1, docs/PRD_COACH_CHAT.md §5). Hidden like the source tag. */
export const SAFETY_LABEL = '_safety'
/** Which specialist agent answered (docs/PRD_COACH_CHAT.md §11.1). Hidden; keeps follow-ups with the same agent. */
export const AGENT_LABEL = '_agent'
const RESERVED = new Set([SOURCE_LABEL, SAFETY_LABEL, AGENT_LABEL])
const visible = (evidence: Evidence[]) => evidence.filter((e) => !RESERVED.has(e.label))

export function tagSource(evidence: Evidence[], source: ReplySource): Evidence[] {
  const kept = evidence.filter((e) => e.label === SAFETY_LABEL || e.label === AGENT_LABEL)
  return [...visible(evidence).slice(0, MAX_EVIDENCE), ...kept, { label: SOURCE_LABEL, value: source }]
}

export function tagSafety(kind: SafetyKind): Evidence[] {
  return tagSource([{ label: SAFETY_LABEL, value: kind }], 'local')
}

export function tagAgent(evidence: Evidence[], agent: AgentId): Evidence[] {
  return [...evidence.filter((e) => e.label !== AGENT_LABEL), { label: AGENT_LABEL, value: agent }]
}

/** The agent that wrote the most recent coach reply among these messages, or null. */
export function latestAgent(messages: Pick<CoachMessage, 'role' | 'evidence'>[]): AgentId | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'coach') continue
    const v = messages[i].evidence.find((e) => e.label === AGENT_LABEL)?.value
    return isAgentId(v) ? v : null
  }
  return null
}

/** The safety kind of a fixed safety reply, or null. */
export function readSafety(evidence: Evidence[]): SafetyKind | null {
  const v = evidence.find((e) => e.label === SAFETY_LABEL)?.value
  return isSafetyKind(v) ? v : null
}

/** Stored messages as model turns. A user message that got a safety reply is replaced, so its text never leaves the device. */
export function toModelTurns(messages: Pick<CoachMessage, 'role' | 'content' | 'evidence'>[]): ChatTurn[] {
  return messages.map((m, i) => {
    const next = messages[i + 1]
    const screened = m.role === 'user' && next?.role === 'coach' && readSafety(next.evidence) !== null
    return { role: m.role === 'user' ? 'user' : 'assistant', content: screened ? REDACTED_SAFETY_TURN : m.content }
  })
}

/** The most recent safety kind among these messages (for the prompt's safety note), or null. */
export function latestSafetyKind(messages: Pick<CoachMessage, 'evidence'>[]): SafetyKind | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const k = readSafety(messages[i].evidence)
    if (k) return k
  }
  return null
}

/** Splits the reserved source entry from the visible evidence (at most three chips). Older messages have no source. */
export function readSource(evidence: Evidence[]): { source: ReplySource | null; evidence: Evidence[] } {
  const tag = evidence.find((e) => e.label === SOURCE_LABEL)
  const source = tag?.value === 'ai' || tag?.value === 'local' ? tag.value : null
  return { source, evidence: visible(evidence).slice(0, MAX_EVIDENCE) }
}

/** First sentence of a headline. Decimals ("84.0 kg") do not end a sentence because no space follows the dot. */
export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const m = t.match(/^.*?[.!?](?=\s|$)/)
  return m ? m[0] : t
}

/** Replies longer than this clamp behind "Read more". */
export const CLAMP_CHARS = 160
export function isLongReply(text: string): boolean {
  return text.length > CLAMP_CHARS || text.split('\n').length > 4
}

/** "1 proposal: Trim today's session" — the compact card on the Coach root. */
export function proposalsLabel(pending: Pick<CoachDecision, 'title'>[]): { count: string; title: string } | null {
  if (!pending.length) return null
  return { count: `${pending.length} proposal${pending.length === 1 ? '' : 's'}`, title: pending[0].title }
}

/**
 * The onboarding "Starting point" (setting `profile.baseline`) as one context string for the coach prompt.
 * Only the summary and watch-outs are used; returns undefined for anything malformed.
 */
export function baselineContext(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const b = raw as { summary?: unknown; watchouts?: unknown }
  const summary = typeof b.summary === 'string' ? b.summary.trim() : ''
  if (!summary) return undefined
  const watch = Array.isArray(b.watchouts) ? b.watchouts.filter((w): w is string => typeof w === 'string' && w.trim() !== '').slice(0, 4) : []
  return watch.length ? `${summary} Watch-outs: ${watch.join('; ')}.` : summary
}
