// One step of a coach turn, with the model calls injected (docs/PRD_COACH_CHAT.md §13). The coach Worker wires the
// deps to OpenRouter (Jev and Gemini); the Vite dev bridge wires chat to Claude Code on the Mac, with no decide and
// no tools. Pure apart from the deps.
import { AGENT_QUESTION, AGENT_TOOLS, agentFromDecision, buildAgentPrompt, isAgentId, routeDeterministic, type AgentId } from './agents'
import {
  COACH_CONTRACT_VERSION, MAX_COACH_STEPS,
  type CoachPromptExtras, type CoachTurnRequest, type CoachTurnResponse, type CoachTurnTurn, type ToolCall, type ToolSpec,
} from './contract'
import { checkReply } from './replyCheck'
import { TOOL_SPECS } from './tools'
import { isSafetyKind } from '../src/engine/chatSafety'

export interface CoachDeps {
  chat(system: string, turns: CoachTurnTurn[], tools: ToolSpec[], toolChoice?: 'none'): Promise<{ text: string; toolCalls: ToolCall[] }>
  /** Absent where there is no decision model: undecided messages go to the generalist coach. */
  decide?(req: { state: string; instructions: string; options: Record<string, string> }): Promise<{ choice: string; confidence: number }>
}

export class CoachRequestError extends Error {}

/** The current message: the last user turn. */
function currentMessage(turns: CoachTurnTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === 'user') return turns[i].content
  return ''
}

export async function coachTurn(req: CoachTurnRequest, deps: CoachDeps): Promise<CoachTurnResponse> {
  const message = currentMessage(req.turns)
  let agent: AgentId | null = req.agent ?? null
  if (!agent) {
    agent = routeDeterministic(message, isAgentId(req.previousAgent) ? req.previousAgent : null).agent
    if (!agent && deps.decide) agent = await deps.decide({ state: message, ...AGENT_QUESTION }).then(agentFromDecision, () => 'coach' as const)
    agent ??= 'coach'
  }

  let system: string
  try {
    system = buildAgentPrompt(agent, { facts: req.facts, profileSummary: req.profileSummary, priority: req.priority, extras: req.extras })
  } catch {
    throw new CoachRequestError('facts or priority are not in the expected shape.')
  }

  const tools = AGENT_TOOLS[agent].map((n) => TOOL_SPECS[n])
  const last = req.step >= MAX_COACH_STEPS
  const reply = await deps.chat(system, req.turns, tools, last && tools.length ? 'none' : undefined)
  if (reply.toolCalls.length && tools.length && !last) {
    return { v: COACH_CONTRACT_VERSION, kind: 'tool_calls', agent, toolCalls: reply.toolCalls }
  }

  // L3: numbers from tool results count as facts the model was given.
  const received = [system, ...req.turns.flatMap((t) => (t.role === 'tool' ? [t.content] : []))].join('\n')
  const checked = checkReply(reply.text, received)
  return checked.ok
    ? { v: COACH_CONTRACT_VERSION, kind: 'reply', agent, text: checked.text }
    : { v: COACH_CONTRACT_VERSION, kind: 'withheld', agent, reason: checked.reason }
}

// --- request validation ---------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Checks the envelope; `turns` are validated by the caller's transport (worker/guard.ts parseChatRequest) and passed
 * in already clean. Facts and priority come from the app's own engine behind the PIN, so only their shape is checked.
 */
export function parseCoachTurnRequest(body: Record<string, unknown>, turns: CoachTurnTurn[]): CoachTurnRequest {
  if (body.v !== COACH_CONTRACT_VERSION) throw new CoachRequestError(`Unsupported coach contract version ${String(body.v)}.`)
  const facts = body.facts
  const priority = body.priority
  if (!isObj(facts) || typeof facts.today !== 'string' || !isObj(facts.readiness) || !isObj(facts.gate)) throw new CoachRequestError('facts are required.')
  if (!isObj(priority) || typeof priority.headline !== 'string' || !Array.isArray(priority.directives)) throw new CoachRequestError('priority is required.')
  const step = body.step
  if (step !== 1 && step !== 2 && step !== 3) throw new CoachRequestError('step must be 1, 2 or 3.')
  if (body.agent !== undefined && !isAgentId(body.agent)) throw new CoachRequestError('Unknown agent.')
  const x = isObj(body.extras) ? body.extras : {}
  const extras: CoachPromptExtras = {}
  if (typeof x.baseline === 'string' && x.baseline.trim()) extras.baseline = x.baseline.slice(0, 2_000)
  if (Array.isArray(x.reports)) extras.reports = x.reports.filter((r): r is string => typeof r === 'string').slice(0, 20).map((r) => r.slice(0, 1_000))
  if (isSafetyKind(x.safetyKind)) extras.safetyKind = x.safetyKind
  return {
    v: COACH_CONTRACT_VERSION,
    turns,
    facts: facts as unknown as CoachTurnRequest['facts'],
    priority: priority as unknown as CoachTurnRequest['priority'],
    profileSummary: typeof body.profileSummary === 'string' ? body.profileSummary.slice(0, 2_000) : '',
    extras,
    // Lenient: an agent id from another coach version is just ignored.
    previousAgent: isAgentId(body.previousAgent) ? body.previousAgent : null,
    ...(isAgentId(body.agent) ? { agent: body.agent } : {}),
    step,
  }
}
