// Google Gemini behind the /api/ai contract, over plain REST (no SDK).
//
// Checked against the docs on 2026-09-18:
//   https://ai.google.dev/api/generate-content         POST /v1beta/models/{model}:generateContent, header x-goog-api-key,
//                                                       systemInstruction, contents[].role 'user' | 'model',
//                                                       parts { text } | { inlineData: { mimeType, data } },
//                                                       generationConfig { responseMimeType, responseJsonSchema, maxOutputTokens, thinkingConfig }
//   https://ai.google.dev/gemini-api/docs/structured-output   JSON Schema subset
//   https://ai.google.dev/gemini-api/docs/models        gemini-3.8-flash = current stable Flash (text, image, video, audio, PDF in; text out)
//   https://ai.google.dev/gemini-api/docs/thinking      thinking tokens count toward maxOutputTokens, so keep the level low

import { BridgeError, CHAT_MAX_TOKENS, JSON_MAX_TOKENS, schemaInstruction, type Attachment, type ChatRequest, type JsonRequest, type ProviderReply } from './guard'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 90_000

/** Only ids that look like model codes reach the URL path. */
export function geminiModel(configured: string | undefined): string {
  const m = (configured ?? '').trim().replace(/^models\//, '')
  return /^[a-z0-9][a-z0-9.\-_]{0,80}$/i.test(m) ? m : DEFAULT_GEMINI_MODEL
}

// --- schema adapter --------------------------------------------------------------------------------------

// The keywords generationConfig.responseJsonSchema documents as supported. Everything else is dropped.
const KEEP = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items', 'prefixItems',
  'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties', 'additionalProperties', 'required',
  'propertyOrdering',
])
const FORMATS = new Set(['date-time', 'date', 'time'])
const MAX_DEPTH = 32

type Schema = Record<string, unknown>
const isObject = (v: unknown): v is Schema => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Converts one of the app's JSON Schemas into the subset Gemini accepts: unsupported keywords are removed
 * (pattern, minLength, default, examples, $schema, ...), `const` becomes a one-value enum, enums keep only
 * strings and numbers, unknown string formats are dropped, `required` only names declared properties, and a
 * `$ref` node keeps nothing but its `$` keywords. Pure: the input is never mutated.
 */
export function toGeminiSchema(schema: unknown, depth = 0): Schema {
  if (!isObject(schema) || depth > MAX_DEPTH) return {}
  if (typeof schema.$ref === 'string') {
    return Object.fromEntries(Object.entries(schema).filter(([k, v]) => k.startsWith('$') && KEEP.has(k) && typeof v === 'string'))
  }
  const out: Schema = {}
  const sub = (v: unknown) => toGeminiSchema(v, depth + 1)
  for (const [key, value] of Object.entries(schema)) {
    if (!KEEP.has(key)) continue
    if (key === 'properties' || key === '$defs') {
      if (isObject(value)) out[key] = Object.fromEntries(Object.entries(value).map(([name, s]) => [name, sub(s)]))
    } else if (key === 'items') {
      if (isObject(value)) out.items = sub(value)
    } else if (key === 'prefixItems' || key === 'anyOf' || key === 'oneOf') {
      if (Array.isArray(value) && value.length) out[key] = value.map(sub)
    } else if (key === 'additionalProperties') {
      if (typeof value === 'boolean') out.additionalProperties = value
      else if (isObject(value)) out.additionalProperties = sub(value)
    } else if (key === 'enum') {
      const values = Array.isArray(value) ? value.filter((v) => typeof v === 'string' || typeof v === 'number') : []
      if (values.length) out.enum = values
    } else if (key === 'format') {
      if (typeof value === 'string' && FORMATS.has(value)) out.format = value
    } else if (key === 'required' || key === 'propertyOrdering') {
      if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === 'string')
    } else {
      out[key] = value
    }
  }
  if (!('enum' in out) && (typeof schema.const === 'string' || typeof schema.const === 'number')) out.enum = [schema.const]
  if (isObject(out.properties)) {
    const names = new Set(Object.keys(out.properties))
    for (const key of ['required', 'propertyOrdering'] as const) {
      if (Array.isArray(out[key])) out[key] = (out[key] as string[]).filter((name) => names.has(name))
    }
  }
  if (Array.isArray(out.required) && !out.required.length) delete out.required
  return out
}

// --- request ---------------------------------------------------------------------------------------------

interface Part { text?: string; inlineData?: { mimeType: string; data: string } }
interface Content { role: 'user' | 'model'; parts: Part[] }
export interface GeminiRequest {
  systemInstruction?: { parts: Part[] }
  contents: Content[]
  generationConfig: Record<string, unknown>
}

const mediaParts = (attachments: Attachment[]): Part[] =>
  attachments.map((a) => ({ inlineData: { mimeType: a.mediaType, data: a.base64 } }))

/** Gemini 3 and later take a thinking level (enum ThinkingLevel); earlier models reject the field. */
function thinkingConfig(model: string): Record<string, unknown> {
  const major = Number(/^gemini-(\d+)/.exec(model)?.[1] ?? 0)
  return major >= 3 ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}
}

function withSystem(system: string, rest: Omit<GeminiRequest, 'systemInstruction'>): GeminiRequest {
  return system.trim() ? { systemInstruction: { parts: [{ text: system }] }, ...rest } : rest
}

/** `tuned: false` is the one-shot fallback without the optional thinking setting. */
export function buildChatRequest(req: ChatRequest, model: string, tuned = true): GeminiRequest {
  const contents: Content[] = req.turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] }))
  // Files ride along with the message being answered.
  const last = contents[contents.length - 1]
  last.parts = [...mediaParts(req.attachments), ...last.parts]
  return withSystem(req.system, { contents, generationConfig: { maxOutputTokens: CHAT_MAX_TOKENS, ...(tuned ? thinkingConfig(model) : {}) } })
}

/** `withSchema: false` is the one-shot fallback: JSON mode only, with the schema spelled out in the prompt. */
export function buildJsonRequest(req: JsonRequest, model: string, withSchema: boolean): GeminiRequest {
  const prompt = withSchema ? `${req.prompt}\n\nReturn the JSON object only.` : `${req.prompt}\n\n${schemaInstruction(req.schema)}`
  return withSystem(req.system, {
    contents: [{ role: 'user', parts: [...mediaParts(req.attachments), { text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      ...(withSchema ? { responseJsonSchema: toGeminiSchema(req.schema) } : {}),
      maxOutputTokens: JSON_MAX_TOKENS,
      ...(withSchema ? thinkingConfig(model) : {}),
    },
  })
}

// --- response --------------------------------------------------------------------------------------------

// finishReason / blockReason values that mean the content was filtered rather than answered.
const REFUSED = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'ESCALATION'])

const REFUSAL_MESSAGE = 'The AI declined to answer this request.'

/**
 * Reads a generateContent response body. Throws BridgeError('refusal') for a blocked prompt or a filtered
 * candidate, and a clear 'failed' error when the reply hit the token cap or came back empty.
 * `partialOk` (chat) returns whatever text arrived before the cap instead of failing.
 */
export function parseGeminiResponse(body: unknown, opts: { partialOk?: boolean } = {}): ProviderReply {
  const root = isObject(body) ? body : {}
  const candidates = Array.isArray(root.candidates) ? root.candidates : []
  const feedback = isObject(root.promptFeedback) ? root.promptFeedback : {}
  const blockReason = typeof feedback.blockReason === 'string' ? feedback.blockReason : ''
  if (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED' && !candidates.length) {
    throw new BridgeError('refusal', REFUSAL_MESSAGE, 422)
  }
  const candidate = isObject(candidates[0]) ? candidates[0] : {}
  const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : ''
  if (REFUSED.has(finishReason)) throw new BridgeError('refusal', REFUSAL_MESSAGE, 422)

  const content = isObject(candidate.content) ? candidate.content : {}
  const parts = Array.isArray(content.parts) ? content.parts : []
  const text = parts
    .filter((p): p is Schema => isObject(p) && typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('')
    .trim()

  if (finishReason === 'MAX_TOKENS' && !(opts.partialOk && text)) {
    throw new BridgeError('failed', 'The AI reply was cut off before it finished. Try a shorter request.', 502)
  }
  if (!text) throw new BridgeError('failed', 'The AI returned an empty reply. Try again.', 502)
  return { text, model: typeof root.modelVersion === 'string' ? root.modelVersion : null }
}

/** True when the API says the key itself is the problem (HTTP 400 API_KEY_INVALID and relatives). */
function isKeyError(body: unknown): boolean {
  const error = isObject(body) && isObject(body.error) ? body.error : {}
  const details = Array.isArray(error.details) ? error.details : []
  return details.some((d) => isObject(d) && typeof d.reason === 'string' && d.reason.startsWith('API_KEY_'))
}

/** Maps a non-2xx upstream reply to our error kinds. The upstream body is inspected, never forwarded. */
export function mapGeminiHttpError(status: number, body: unknown): BridgeError {
  if (status === 401 || status === 403 || (status === 400 && isKeyError(body))) {
    return new BridgeError('auth', 'Google rejected the Gemini API key on the server. Check the GEMINI_API_KEY secret.', 401)
  }
  if (status === 429) return new BridgeError('busy', 'The Gemini API is rate-limiting this key. Wait a minute and try again.', 429)
  if (status === 404) return new BridgeError('failed', 'The configured Gemini model was not found. Check COACH_GEMINI_MODEL.', 502)
  if (status === 400) return new BridgeError('failed', 'The Gemini API rejected the request.', 502)
  if (status === 504) return new BridgeError('timeout', 'The Gemini API took too long to answer. Try again.', 504)
  return new BridgeError('failed', 'The Gemini API is temporarily unavailable. Try again shortly.', 502)
}

// --- transport -------------------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function send(url: string, apiKey: string, init: RequestInit, fetcher: FetchLike): Promise<{ status: number; ok: boolean; body: unknown }> {
  let res: Response
  try {
    res = await fetcher(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') throw new BridgeError('timeout', 'The Gemini API took too long to answer. Try again.', 504)
    throw new BridgeError('failed', "Couldn't reach the Gemini API. Try again.", 502)
  }
  const body: unknown = await res.json().catch(() => null)
  return { status: res.status, ok: res.ok, body }
}

const post = (model: string, apiKey: string, request: GeminiRequest, fetcher: FetchLike) =>
  send(`${GEMINI_BASE}/models/${model}:generateContent`, apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }, fetcher)

/** A 400 that is not about the key gets one retry with the plain request (a model may reject an optional field). */
export async function geminiChat(apiKey: string, model: string, req: ChatRequest, fetcher: FetchLike = fetch): Promise<ProviderReply> {
  let res = await post(model, apiKey, buildChatRequest(req, model), fetcher)
  if (res.status === 400 && !isKeyError(res.body)) res = await post(model, apiKey, buildChatRequest(req, model, false), fetcher)
  if (!res.ok) throw mapGeminiHttpError(res.status, res.body)
  return parseGeminiResponse(res.body, { partialOk: true })
}

/** Tries schema-constrained output first; a 400 that is not about the key gets one retry in plain JSON mode (schema in the prompt). */
export async function geminiJson(apiKey: string, model: string, req: JsonRequest, fetcher: FetchLike = fetch): Promise<ProviderReply> {
  let res = await post(model, apiKey, buildJsonRequest(req, model, true), fetcher)
  if (res.status === 400 && !isKeyError(res.body)) res = await post(model, apiKey, buildJsonRequest(req, model, false), fetcher)
  if (!res.ok) throw mapGeminiHttpError(res.status, res.body)
  return parseGeminiResponse(res.body)
}

/** Free key + model check (models.get): no tokens are generated and no user data is sent. */
export async function geminiCheck(apiKey: string, model: string, fetcher: FetchLike = fetch): Promise<void> {
  const res = await send(`${GEMINI_BASE}/models/${model}`, apiKey, { method: 'GET' }, fetcher)
  if (!res.ok) throw mapGeminiHttpError(res.status, res.body)
}
