// AI through the same-origin /api/ai/* bridge. No API key in the app. Two hosts speak the same protocol:
//   'mac'   — Claude through Claude Code on the owner's Mac (their Claude subscription), served by the Vite
//             dev/preview server (server/aiBridge.ts)
//   'cloud' — the hosted Cloudflare Worker, which holds GEMINI_API_KEY or ANTHROPIC_API_KEY plus COACH_BRIDGE_PIN
//             as Worker secrets and always needs the PIN
import { MEAL_RECOGNITION_SCHEMA, MEAL_SYSTEM_PROMPT, parseMealRecognition, stripDataUrl } from './anthropic'
import { AIError, type AIProvider, type AgentTurn, type ChatStep, type ChatTurn, type DecideRequest, type DecideResult, type JsonRequest, type ToolCall, type ToolSpec, type MealContext, type MealImage, type MealRecognition } from './types'

export type BridgeHost = 'mac' | 'cloud'

export interface BridgeHealth {
  ok: boolean
  installed: boolean
  version: string | null
  auth: 'ok' | 'signed_out' | 'unknown'
  message: string
  model: string
  pinRequired?: boolean
  /** Where the bridge runs. Absent on older Mac bridges, which means 'mac'. */
  host?: BridgeHost
  /** Cloud: the upstream the Worker is set up for ('gemini' | 'anthropic'); null when the server is not set up (no usable PIN, or no API key secret). Absent when the PIN was refused. */
  provider?: string | null
  /** Cloud: whether the PIN sent with the probe was accepted. */
  pinOk?: boolean
  /** Set by the client when the bridge refused the health probe itself (HTTP 401/403): a missing or wrong PIN. */
  refused?: boolean
}

interface BridgeReply { ok: boolean; kind?: string; message?: string; text?: string; data?: unknown }

// The Worker may answer with the app's own error kinds; the Mac bridge uses the names below.
const PASS_THROUGH_KINDS: AIError['kind'][] = ['auth', 'rate_limit', 'network', 'refusal', 'not_configured']

function mapKind(kind: string | undefined, status: number): AIError['kind'] {
  if (kind && (PASS_THROUGH_KINDS as string[]).includes(kind)) return kind as AIError['kind']
  if (kind === 'forbidden' || kind === 'pin') return 'auth'
  if (kind === 'busy') return 'rate_limit'
  if (kind === 'timeout') return 'network'
  if (kind === 'not_installed') return 'not_configured'
  if (status === 404) return 'not_configured'
  return 'unknown'
}

/** 'gemini' → 'Gemini', 'anthropic' → 'Claude', 'openrouter' → 'OpenRouter'. Used in status lines for the cloud bridge. */
export function bridgeProviderLabel(provider: string | null | undefined): string {
  const p = (provider ?? '').toLowerCase()
  if (p === 'gemini' || p === 'google') return 'Gemini'
  if (p === 'anthropic' || p === 'claude') return 'Claude'
  if (p === 'openrouter') return 'OpenRouter'
  return ''
}

/** Turns a /api/ai/health answer into a BridgeHealth, or null when nothing bridge-like answered. */
export function normalizeBridgeHealth(status: number, body: unknown): BridgeHealth | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const host: BridgeHost | undefined = b.host === 'cloud' || b.host === 'mac' ? b.host : undefined
  const provider = typeof b.provider === 'string' ? b.provider : b.provider === null ? null : undefined
  const message = typeof b.message === 'string' ? b.message : ''
  const extras = { ...(host ? { host } : {}), ...(provider !== undefined ? { provider } : {}), ...(typeof b.pinOk === 'boolean' ? { pinOk: b.pinOk } : {}) }

  if (status < 200 || status >= 300) {
    // 401/403: the bridge refused the probe itself — a missing or wrong PIN, or (Mac) a device outside the home network.
    const refused = status === 401 || status === 403
    // Anything else that still speaks the bridge's error shape (429 after too many wrong PINs…) keeps its message.
    if (!refused && !(b.ok === false && message)) return null
    return {
      ok: false, installed: true, version: null, auth: 'unknown', model: '',
      message: message || 'Bridge PIN required. Enter it in Settings → AI.',
      pinRequired: typeof b.pinRequired === 'boolean' ? b.pinRequired : refused,
      ...(refused ? { refused: true } : {}),
      ...extras,
    }
  }
  const macShape = typeof b.installed === 'boolean'
  const cloudShape = host === 'cloud' && typeof b.ok === 'boolean'
  if (!macShape && !cloudShape) return null
  return {
    ok: b.ok === true,
    installed: macShape ? b.installed === true : true,
    version: typeof b.version === 'string' ? b.version : null,
    auth: b.auth === 'ok' || b.auth === 'signed_out' ? b.auth : 'unknown',
    message,
    model: typeof b.model === 'string' ? b.model : '',
    ...(typeof b.pinRequired === 'boolean' ? { pinRequired: b.pinRequired } : {}),
    ...extras,
    // A bridge that reports `installed` without a host is the Mac bridge from before the Worker existed.
    ...(host ? {} : { host: 'mac' as const }),
  }
}

export class BridgeProvider implements AIProvider {
  readonly id = 'claude-code' as const
  readonly name: string

  constructor(private readonly model: string = '', private readonly pin: string = '', private readonly host: BridgeHost = 'mac') {
    this.name = host === 'cloud' ? 'AI through your Cloudflare Worker' : 'Claude (your subscription, via this Mac)'
    if (host === 'cloud') {
      this.decide = async (req) => {
        const reply = (await this.post('/decide', { state: req.state, instructions: req.instructions, options: req.options })) as BridgeReply & Partial<DecideResult>
        return { choice: String(reply.choice ?? ''), confidence: Number(reply.confidence) }
      }
      this.coachChatStep = async (system, turns, tools, toolChoice) => {
        const reply = (await this.post('/chat', { system, turns, tools, ...(toolChoice ? { toolChoice } : {}) })) as BridgeReply & { toolCalls?: ToolCall[] }
        return { text: (reply.text ?? '').trim(), toolCalls: Array.isArray(reply.toolCalls) ? reply.toolCalls : [] }
      }
    }
  }

  isConfigured(): boolean { return true }

  /** The Cloudflare Worker only: the Mac bridge has no decision model, so the app routes without one. */
  readonly decide?: (req: DecideRequest) => Promise<DecideResult>
  readonly coachChatStep?: (system: string, turns: AgentTurn[], tools: ToolSpec[], toolChoice?: 'none') => Promise<ChatStep>

  private async post(path: string, body: Record<string, unknown>): Promise<BridgeReply> {
    // The model alias (sonnet | opus | haiku) is a Claude Code setting; the Worker picks its own model.
    const model = this.host === 'mac' && this.model ? { model: this.model } : {}
    let res: Response
    try {
      res = await fetch(`/api/ai${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.pin ? { 'x-coach-pin': this.pin } : {}) },
        body: JSON.stringify({ ...body, ...model }),
      })
    } catch (e) {
      throw new AIError('network', this.host === 'cloud' ? "Couldn't reach the AI bridge on your Cloudflare Worker. Check your connection." : "Couldn't reach the AI bridge on your Mac. Is the app server running?", e)
    }
    let reply: BridgeReply
    try {
      reply = (await res.json()) as BridgeReply
    } catch {
      throw new AIError(res.status === 404 ? 'not_configured' : 'unknown', res.status === 404 ? 'The AI bridge is not available on this server.' : undefined)
    }
    if (!res.ok || !reply.ok) throw new AIError(mapKind(reply.kind, res.status), reply.message)
    return reply
  }

  async completeJson(req: JsonRequest): Promise<unknown> {
    const attachments = (req.attachments ?? []).map((a) => ({ ...a, base64: stripDataUrl(a.base64) }))
    const reply = await this.post('/json', { system: req.system, prompt: req.prompt, schema: req.schema, attachments })
    return reply.data
  }

  async recognizeMeal(img: MealImage, context: MealContext): Promise<MealRecognition> {
    const parts = ['Identify the foods in this photo and estimate portions and nutrition.']
    if (context.mealType) parts.push(`Meal type: ${context.mealType}.`)
    if (context.hint?.trim()) parts.push(`User note: ${context.hint.trim()}`)
    const data = await this.completeJson({
      system: MEAL_SYSTEM_PROMPT,
      prompt: parts.join(' '),
      schema: MEAL_RECOGNITION_SCHEMA,
      attachments: [{ base64: img.base64, mediaType: img.mediaType, name: 'meal' }],
    })
    return parseMealRecognition(JSON.stringify(data))
  }

  async coachChat(system: string, turns: ChatTurn[]): Promise<string> {
    const reply = await this.post('/chat', { system, turns })
    const text = (reply.text ?? '').trim()
    if (!text) throw new AIError('unknown', 'The AI returned an empty reply.')
    return text
  }
}

/** `deep` makes the bridge run one tiny real call so sign-in, key and PIN problems surface immediately. */
export async function probeBridge(deep = false, pin = ''): Promise<BridgeHealth | null> {
  try {
    const res = await fetch(`/api/ai/health${deep ? '?deep=1' : ''}`, { headers: pin ? { 'x-coach-pin': pin } : {} })
    return normalizeBridgeHealth(res.status, await res.json())
  } catch {
    return null
  }
}
