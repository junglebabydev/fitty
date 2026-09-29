// Anthropic Claude behind the /api/ai contract, through the official SDK (it runs on Workers: fetch-based).
// Request shapes mirror src/ai/anthropic.ts: base64 image blocks, PDF document blocks,
// output_config.format json_schema with one fallback to prompt-only JSON, refusal via stop_reason,
// typed SDK errors mapped to our kinds.

import Anthropic from '@anthropic-ai/sdk'
import { BridgeError, CHAT_MAX_TOKENS, JSON_MAX_TOKENS, schemaInstruction, type Attachment, type ChatRequest, type JsonRequest, type ProviderReply } from './guard'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'
const TIMEOUT_MS = 90_000

type Params = Anthropic.MessageCreateParamsNonStreaming

export function anthropicModel(configured: string | undefined): string {
  return (configured ?? '').trim() || DEFAULT_ANTHROPIC_MODEL
}

function fileBlocks(attachments: Attachment[]): Anthropic.ContentBlockParam[] {
  return attachments.map((a): Anthropic.ContentBlockParam =>
    a.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.base64 } })
}

/**
 * `preferred` switches thinking off so the max_tokens cap is the visible answer, not thinking plus answer.
 * `fallback` is the plain request for a model that rejects an optional parameter with a 400.
 */
export function buildChatParams(req: ChatRequest, model: string): { preferred: Params; fallback: Params } {
  const messages: Anthropic.MessageParam[] = req.turns.map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.content }))
  if (req.attachments.length) {
    const last = req.turns[req.turns.length - 1]
    messages[messages.length - 1] = { role: 'user', content: [...fileBlocks(req.attachments), { type: 'text', text: last.content }] }
  }
  const fallback: Params = {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    ...(req.system.trim() ? { system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }] } : {}),
    messages,
  }
  return { preferred: { ...fallback, thinking: { type: 'disabled' } }, fallback }
}

export function buildJsonParams(req: JsonRequest, model: string): { preferred: Params; fallback: Params } {
  const base = (text: string): Params => ({
    model,
    max_tokens: JSON_MAX_TOKENS,
    ...(req.system.trim() ? { system: req.system } : {}),
    messages: [{ role: 'user', content: [...fileBlocks(req.attachments), { type: 'text', text }] }],
  })
  return {
    preferred: {
      ...base(`${req.prompt}\n\nReturn the JSON object only.`),
      thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema', schema: req.schema } },
    },
    fallback: base(`${req.prompt}\n\n${schemaInstruction(req.schema)}`),
  }
}

/** Maps SDK exceptions to our kinds, most specific first. Upstream messages are never forwarded. */
export function mapAnthropicError(e: unknown): BridgeError {
  if (e instanceof BridgeError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new BridgeError('auth', 'Anthropic rejected the API key on the server. Check the ANTHROPIC_API_KEY secret.', 401)
  }
  if (e instanceof Anthropic.RateLimitError) return new BridgeError('busy', 'The Anthropic API is rate-limiting this key. Wait a minute and try again.', 429)
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new BridgeError('timeout', 'Claude took too long to answer. Try again.', 504)
  if (e instanceof Anthropic.APIConnectionError) return new BridgeError('failed', "Couldn't reach the Anthropic API. Try again.", 502)
  if (e instanceof Anthropic.NotFoundError) return new BridgeError('failed', 'The configured Claude model was not found. Check COACH_MODEL.', 502)
  if (e instanceof Anthropic.BadRequestError) return new BridgeError('failed', 'The Anthropic API rejected the request.', 502)
  if (e instanceof Anthropic.APIError && e.status === 529) return new BridgeError('busy', 'The Anthropic API is overloaded. Try again in a moment.', 429)
  return new BridgeError('failed', 'The Anthropic API is temporarily unavailable. Try again shortly.', 502)
}

/** Text of a finished message. Throws 'refusal' on stop_reason "refusal" and 'failed' on an empty or cut-off reply. */
export function readMessage(message: Pick<Anthropic.Message, 'content' | 'stop_reason' | 'model'>, opts: { partialOk?: boolean } = {}): ProviderReply {
  if (message.stop_reason === 'refusal') throw new BridgeError('refusal', 'The AI declined to answer this request.', 422)
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (message.stop_reason === 'max_tokens' && !(opts.partialOk && text)) {
    throw new BridgeError('failed', 'The AI reply was cut off before it finished. Try a shorter request.', 502)
  }
  if (!text) throw new BridgeError('failed', 'The AI returned an empty reply. Try again.', 502)
  return { text, model: message.model ?? null }
}

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
}

/** Tries the preferred params; a 400 (parameter not supported by this model) gets one retry with the plain params. */
async function create(c: Anthropic, params: { preferred: Params; fallback: Params }): Promise<Anthropic.Message> {
  try {
    return await c.messages.create(params.preferred)
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) return await c.messages.create(params.fallback)
    throw e
  }
}

export async function anthropicChat(apiKey: string, model: string, req: ChatRequest): Promise<ProviderReply> {
  try {
    return readMessage(await create(client(apiKey), buildChatParams(req, model)), { partialOk: true })
  } catch (e) {
    throw mapAnthropicError(e)
  }
}

export async function anthropicJson(apiKey: string, model: string, req: JsonRequest): Promise<ProviderReply> {
  try {
    return readMessage(await create(client(apiKey), buildJsonParams(req, model)))
  } catch (e) {
    throw mapAnthropicError(e)
  }
}

/** Free key + model check (models.retrieve): no tokens are generated and no user data is sent. */
export async function anthropicCheck(apiKey: string, model: string): Promise<void> {
  try {
    await client(apiKey).models.retrieve(model)
  } catch (e) {
    throw mapAnthropicError(e)
  }
}
