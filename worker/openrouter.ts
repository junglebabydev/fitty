// OpenRouter upstream (https://openrouter.ai): one key, many models, OpenAI-style chat completions.
// Default model is Gemini Flash through OpenRouter. Verified against the OpenRouter API reference and the
// public /api/v1/models list (google/gemini-3.8-flash accepts images and files and supports structured outputs).
//
// Privacy: every request sets provider.data_collection = "deny", so OpenRouter only routes to providers that do
// not retain or train on prompts. This is a health app; override with COACH_OPENROUTER_DATA_COLLECTION=allow.
import {
  BridgeError, CHAT_MAX_TOKENS, JSON_MAX_TOKENS, schemaInstruction,
  type Attachment, type ChatRequest, type DecideRequest, type DecideResult, type JsonRequest, type ProviderReply,
} from './guard'

export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.8-flash'
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const TIMEOUT_MS = 120_000
/** Flex requests can queue for minutes; after this long the chat retries once at the standard tier. */
export const FLEX_TIMEOUT_MS = 8_000
/** The decision model answers in ~100 ms; past this the app just uses the generalist coach. */
export const DECIDE_TIMEOUT_MS = 2_500
/** Pinned: a new Jev version is adopted only after replaying the routing set (docs/PRD_COACH_CHAT.md §11.6). */
export const DEFAULT_ROUTER_MODEL = 'typesafe/jev-1.13'

/** OpenRouter keys start with "sk-or-". Used to recognise one stored under another secret name. */
export function isOpenRouterKey(key: string | undefined): boolean {
  return !!key && key.trim().startsWith('sk-or-')
}

/** Model ids are "vendor/model" with an optional ":variant". Anything else falls back to the default. */
export function openRouterModel(configured: string | undefined): string {
  const m = (configured ?? '').trim()
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(m) ? m : DEFAULT_OPENROUTER_MODEL
}

/** The decision model for /decide: a valid "vendor/model" id, else the pinned default. */
export function routerModel(configured: string | undefined): string {
  const m = (configured ?? '').trim()
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(m) ? m : DEFAULT_ROUTER_MODEL
}

/** Flex unless COACH_SERVICE_TIER is "standard". */
export function serviceTier(configured: string | undefined): 'flex' | 'standard' {
  return (configured ?? '').trim().toLowerCase() === 'standard' ? 'standard' : 'flex'
}

export function dataCollection(configured: string | undefined): 'allow' | 'deny' {
  return (configured ?? '').trim().toLowerCase() === 'allow' ? 'allow' : 'deny'
}

// --- request builders (pure) -------------------------------------------------------------------------------

type Part =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

interface Message { role: 'system' | 'user' | 'assistant'; content: string | Part[] }

export interface OpenRouterRequest {
  model: string
  messages: Message[]
  max_tokens: number
  provider: { data_collection: 'allow' | 'deny' }
  /** OpenRouter service tier. Flex: half price, best effort, never falls back to standard on its own. */
  service_tier?: 'flex'
  response_format?: { type: 'json_schema'; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } } | { type: 'json_object' }
}

export function attachmentParts(attachments: Attachment[]): Part[] {
  return attachments.map((a, i): Part => {
    const dataUrl = `data:${a.mediaType};base64,${a.base64}`
    if (a.mediaType === 'application/pdf') return { type: 'file', file: { filename: `${a.name || `report-${i + 1}`}.pdf`.replace(/\.pdf\.pdf$/i, '.pdf'), file_data: dataUrl } }
    return { type: 'image_url', image_url: { url: dataUrl } }
  })
}

function userContent(text: string, attachments: Attachment[]): string | Part[] {
  if (!attachments.length) return text
  return [...attachmentParts(attachments), { type: 'text', text }]
}

export function buildChatRequest(req: ChatRequest, model: string, policy: 'allow' | 'deny'): OpenRouterRequest {
  const messages: Message[] = [{ role: 'system', content: req.system }]
  req.turns.forEach((t, i) => {
    const last = i === req.turns.length - 1
    messages.push({ role: t.role, content: last && t.role === 'user' ? userContent(t.content, req.attachments) : t.content })
  })
  return { model, messages, max_tokens: CHAT_MAX_TOKENS, provider: { data_collection: policy } }
}

/** `withSchema` false = plain JSON mode with the schema written into the prompt (fallback for models that reject json_schema). */
export function buildJsonRequest(req: JsonRequest, model: string, policy: 'allow' | 'deny', withSchema: boolean): OpenRouterRequest {
  const prompt = withSchema ? `${req.prompt}\n\nReturn the JSON object only.` : `${req.prompt}\n\n${schemaInstruction(req.schema)}`
  return {
    model,
    messages: [{ role: 'system', content: req.system }, { role: 'user', content: userContent(prompt, req.attachments) }],
    max_tokens: JSON_MAX_TOKENS,
    provider: { data_collection: policy },
    response_format: withSchema ? { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema: req.schema } } : { type: 'json_object' },
  }
}

// --- response parsing (pure) -------------------------------------------------------------------------------

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((p) => (typeof asRecord(p)?.text === 'string' ? (asRecord(p)!.text as string) : '')).join('')
  return ''
}

export function parseOpenRouterResponse(body: unknown, opts: { partialOk?: boolean } = {}): ProviderReply {
  const root = asRecord(body)
  // OpenRouter can answer HTTP 200 with an error object when the upstream provider failed mid-request.
  const embedded = asRecord(root?.error)
  if (embedded) throw mapOpenRouterHttpError(typeof embedded.code === 'number' ? embedded.code : 502, body)
  const choice = asRecord(Array.isArray(root?.choices) ? (root!.choices as unknown[])[0] : null)
  const message = asRecord(choice?.message)
  const text = contentText(message?.content).trim()
  const finish = typeof choice?.finish_reason === 'string' ? choice.finish_reason : ''
  const model = typeof root?.model === 'string' ? (root.model as string) : null
  if (finish === 'content_filter' || typeof message?.refusal === 'string') throw new BridgeError('refusal', 'The AI declined to answer this request.', 422)
  if (finish === 'length' && !(opts.partialOk && text)) throw new BridgeError('failed', 'The AI reply was cut off before it finished. Try again with less input.', 502)
  if (finish === 'error') throw new BridgeError('failed', 'The AI provider failed part-way through. Try again.', 502)
  if (!text) throw new BridgeError('failed', 'The AI returned an empty reply. Try again.', 502)
  return { text, model }
}

/** Never echoes the upstream body: it can contain request fragments. */
export function mapOpenRouterHttpError(status: number, _body: unknown): BridgeError {
  if (status === 401) return new BridgeError('auth', 'OpenRouter rejected the API key on the server. Check the OPENROUTER_API_KEY secret.', 401)
  if (status === 402) return new BridgeError('auth', 'The OpenRouter account has no credits left. Add credits at openrouter.ai, then try again.', 401)
  if (status === 403) return new BridgeError('refusal', 'The request was blocked by moderation.', 422)
  if (status === 404) return new BridgeError('failed', 'OpenRouter has no provider for this model under the current privacy setting. Check COACH_OPENROUTER_MODEL.', 502)
  if (status === 408) return new BridgeError('timeout', 'OpenRouter timed out. Try again.', 504)
  if (status === 429) return new BridgeError('busy', 'OpenRouter is rate-limiting this key. Wait a minute and try again.', 429)
  if (status === 400) return new BridgeError('failed', 'OpenRouter did not accept the request.', 502)
  return new BridgeError('failed', 'OpenRouter or the model provider is having trouble. Try again.', 502)
}

// --- transport -------------------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function send(path: string, apiKey: string, init: RequestInit, fetcher: FetchLike, timeoutMs = TIMEOUT_MS): Promise<{ status: number; ok: boolean; body: unknown }> {
  let res: Response
  try {
    res = await fetcher(`${OPENROUTER_BASE}${path}`, {
      ...init,
      // The key travels only in this header. No HTTP-Referer / X-Title: the site address is not shared with OpenRouter.
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') throw new BridgeError('timeout', 'OpenRouter took too long to answer. Try again.', 504)
    throw new BridgeError('failed', "Couldn't reach OpenRouter. Try again.", 502)
  }
  const body: unknown = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, body }
}

const post = (apiKey: string, request: OpenRouterRequest, fetcher: FetchLike, timeoutMs = TIMEOUT_MS) =>
  send('/chat/completions', apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }, fetcher, timeoutMs)

/**
 * Chat. With tier "flex", the Flex tier is tried first with a short timeout; a timeout, a 429 or a 5xx (Flex
 * capacity, preemption) is retried once at the standard tier (docs/PRD_COACH_CHAT.md §11.5). Other errors surface.
 */
export async function openRouterChat(
  apiKey: string, model: string, policy: 'allow' | 'deny', req: ChatRequest, fetcher: FetchLike = fetch, tier: 'flex' | 'standard' = 'standard',
): Promise<ProviderReply> {
  const request = buildChatRequest(req, model, policy)
  if (tier === 'flex') {
    try {
      const res = await post(apiKey, { ...request, service_tier: 'flex' }, fetcher, FLEX_TIMEOUT_MS)
      if (res.ok) return { ...parseOpenRouterResponse(res.body, { partialOk: true }), tier: 'flex' }
      if (res.status !== 429 && res.status < 500) throw mapOpenRouterHttpError(res.status, res.body)
    } catch (e) {
      // A timeout, or an HTTP 200 carrying an upstream error (preempted mid-request), falls through to standard.
      if (!(e instanceof BridgeError) || (e.kind !== 'timeout' && e.kind !== 'failed' && e.kind !== 'busy')) throw e
      if (e.kind === 'failed' && /did not accept|no provider/i.test(e.message)) throw e
    }
  }
  const res = await post(apiKey, request, fetcher)
  if (!res.ok) throw mapOpenRouterHttpError(res.status, res.body)
  return { ...parseOpenRouterResponse(res.body, { partialOk: true }), tier: 'standard' }
}

/** One choice question to a decision model (Jev) through OpenRouter's System One endpoint. Only the given text is sent. */
export async function openRouterDecide(apiKey: string, model: string, req: DecideRequest, fetcher: FetchLike = fetch): Promise<DecideResult & { model: string | null }> {
  const body = { model, state: req.state, questions: { pick: { type: 'choice', instructions: req.instructions, criteria: req.options } } }
  const res = await send('/systemone', apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, fetcher, DECIDE_TIMEOUT_MS)
  if (!res.ok) throw mapOpenRouterHttpError(res.status, res.body)
  return parseDecideResponse(res.body, req)
}

export function parseDecideResponse(body: unknown, req: DecideRequest): DecideResult & { model: string | null } {
  const root = asRecord(body)
  const pick = asRecord(asRecord(root?.answers)?.pick)
  const choice = typeof pick?.choice === 'string' ? pick.choice : ''
  const confidence = typeof pick?.confidence === 'number' ? pick.confidence : NaN
  if (!(choice in req.options) || !(confidence >= 0 && confidence <= 1)) throw new BridgeError('failed', 'The decision model returned an unexpected answer.', 502)
  return { choice, confidence, model: typeof root?.model === 'string' ? root.model : null }
}

/** Schema-constrained output first; a 400 gets one retry in plain JSON mode with the schema in the prompt. */
export async function openRouterJson(apiKey: string, model: string, policy: 'allow' | 'deny', req: JsonRequest, fetcher: FetchLike = fetch): Promise<ProviderReply> {
  let res = await post(apiKey, buildJsonRequest(req, model, policy, true), fetcher)
  if (res.status === 400) res = await post(apiKey, buildJsonRequest(req, model, policy, false), fetcher)
  if (!res.ok) throw mapOpenRouterHttpError(res.status, res.body)
  return parseOpenRouterResponse(res.body)
}

/** Free key check (GET /key returns the key's own limits): no tokens are generated and no user data is sent. */
export async function openRouterCheck(apiKey: string, fetcher: FetchLike = fetch): Promise<void> {
  const res = await send('/key', apiKey, { method: 'GET' }, fetcher)
  if (!res.ok) throw mapOpenRouterHttpError(res.status, res.body)
}
