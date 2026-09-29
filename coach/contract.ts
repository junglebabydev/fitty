// The contract between the app and the coach Worker (docs/PRD_COACH_CHAT.md §13). The app imports these as types
// only, so no coach code ships in the app bundle. A change here that the deployed app can't send or read is a
// breaking change: bump COACH_CONTRACT_VERSION and accept the old version until phones have updated.
import type { SafetyKind } from '../src/engine/chatSafety'
import type { CoachFacts, CoachPriority } from '../src/engine/coach'
import type { AgentId } from './agents'

export const COACH_CONTRACT_VERSION = 1

/** A read-only tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
/** `arguments` is the JSON text the model wrote. */
export interface ToolCall { id: string; name: string; arguments: string }

/** Redacted history and the current message, then this message's tool calls and results. */
export type CoachTurnTurn =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

/** Optional prompt context: onboarding baseline, opted-in report lines, and a recent safety screen hit (its kind only). */
export interface CoachPromptExtras { baseline?: string; reports?: string[]; safetyKind?: SafetyKind }

/** One step of a coach turn. The app runs the tool loop, so a message is 1–3 of these. */
export interface CoachTurnRequest {
  v: typeof COACH_CONTRACT_VERSION
  turns: CoachTurnTurn[]
  /** Computed by the app's rules engine; the coach never recomputes numbers. */
  facts: CoachFacts
  priority: CoachPriority
  profileSummary: string
  extras: CoachPromptExtras
  /** The agent of the last coach reply, for short follow-ups. Opaque to the app; the coach validates it. */
  previousAgent: string | null
  /** Step 1 leaves it out and the coach routes; steps 2–3 send back the agent step 1 chose. */
  agent?: AgentId
  step: 1 | 2 | 3
}

export type CoachTurnResponse =
  | { v: typeof COACH_CONTRACT_VERSION; kind: 'reply'; agent: AgentId; text: string }
  | { v: typeof COACH_CONTRACT_VERSION; kind: 'tool_calls'; agent: AgentId; toolCalls: ToolCall[] }
  /** The reply check (L3) rejected the model's reply: the app answers from its own data instead. */
  | { v: typeof COACH_CONTRACT_VERSION; kind: 'withheld'; agent: AgentId; reason: string }

/** Model calls per message: at most two rounds of tools, then a forced text answer. */
export const MAX_COACH_STEPS = 3
