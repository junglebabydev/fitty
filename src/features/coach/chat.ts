// Pure helpers for the Coach conversation (v3, DESIGN §10): reply source tags, clamping, the one-sentence brief
// and the extra context handed to the system prompt. No database access here.
import type { CoachDecision, Evidence } from '../../domain/types'

/** Who wrote a coach reply. Stored as one reserved evidence entry so the message schema stays unchanged. */
export type ReplySource = 'ai' | 'local'
export const SOURCE_LABEL = '_source'
export const MAX_EVIDENCE = 3

export function tagSource(evidence: Evidence[], source: ReplySource): Evidence[] {
  return [...evidence.filter((e) => e.label !== SOURCE_LABEL).slice(0, MAX_EVIDENCE), { label: SOURCE_LABEL, value: source }]
}

/** Splits the reserved source entry from the visible evidence (at most three chips). Older messages have no source. */
export function readSource(evidence: Evidence[]): { source: ReplySource | null; evidence: Evidence[] } {
  const tag = evidence.find((e) => e.label === SOURCE_LABEL)
  const source = tag?.value === 'ai' || tag?.value === 'local' ? tag.value : null
  return { source, evidence: evidence.filter((e) => e.label !== SOURCE_LABEL).slice(0, MAX_EVIDENCE) }
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
