// Google Gemini provider, called straight from the browser with the owner's own API key (single-user,
// local-first app; the key lives in the local settings table). Plain fetch, no SDK.
//
// Checked against ai.google.dev on 2026-09-18:
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
//   - the key travels in the x-goog-api-key header, never in the URL; the CORS preflight allows that header
//     from any origin, so browser calls work
//   - systemInstruction, contents[] (roles 'user' | 'model'), parts { text } | { inlineData: { mimeType, data } }
//   - structured output: generationConfig.responseMimeType 'application/json' + responseJsonSchema (JSON Schema,
//     limited keyword set — see toGeminiSchema). The reference now marks responseSchema / responseJsonSchema as
//     deprecated in favour of generationConfig.responseFormat.text { mimeType: 'APPLICATION_JSON', schema }; they
//     are still accepted, and a rejected request (HTTP 400) is retried once as a plain prompt-only JSON request.
//   - gemini-3.8-flash is the current stable Flash model (text, image, video, audio and PDF in; structured outputs).
import { MEAL_RECOGNITION_SCHEMA, MEAL_SYSTEM_PROMPT, extractJson, parseMealRecognition, stripDataUrl } from './anthropic'
import { AIError, type AIProvider, type ChatTurn, type JsonRequest, type MealContext, type MealImage, type MealRecognition } from './types'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_TIMEOUT_MS = 120_000

export interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
  /** Set by the API on thought summaries; never part of the answer. */
  thought?: boolean
}
export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}
export interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] }
  contents: GeminiContent[]
  generationConfig: Record<string, unknown>
}

// --- request builders -----------------------------------------------------------------------------

/** Accepts 'gemini-3.8-flash' or 'models/gemini-3.8-flash'. The key is never part of the URL. */
export function geminiUrl(model: string): string {
  const id = model.trim().replace(/^models\//, '')
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(id)}:generateContent`
}

export function toGeminiMimeType(mediaType: string): string {
  const mt = (mediaType ?? '').toLowerCase().trim()
  if (mt === 'image/jpg') return 'image/jpeg'
  return mt || 'image/jpeg'
}

/** thinkingLevel exists from Gemini 3 on; earlier models answer 400 when it is set. */
export function supportsThinkingLevel(model: string): boolean {
  const m = model.trim().replace(/^models\//, '').match(/^gemini-(\d+)/)
  return !!m && Number(m[1]) >= 3
}

// Keywords generationConfig.responseJsonSchema documents as supported. Everything else is dropped.
const SCHEMA_KEYWORDS = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items', 'prefixItems',
  'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties', 'additionalProperties', 'required', 'propertyOrdering',
])

/**
 * JSON Schema → the subset Gemini accepts. Unsupported keywords (pattern, default, const, minLength, $schema…)
 * are dropped, and so is the boolean form of additionalProperties: Gemini only emits declared properties, and the
 * older schema field rejects the keyword outright. Property names are never treated as keywords.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (!SCHEMA_KEYWORDS.has(k)) continue
    if (k === 'additionalProperties') {
      if (v && typeof v === 'object') out[k] = toGeminiSchema(v)
    } else if (k === 'properties' || k === '$defs') {
      const map: Record<string, unknown> = {}
      if (v && typeof v === 'object') for (const [name, sub] of Object.entries(v as Record<string, unknown>)) map[name] = toGeminiSchema(sub)
      out[k] = map
    } else if (k === 'items') {
      out[k] = toGeminiSchema(v)
    } else if (k === 'anyOf' || k === 'oneOf' || k === 'prefixItems') {
      out[k] = Array.isArray(v) ? v.map(toGeminiSchema) : v
    } else {
      out[k] = v
    }
  }
  return out
}

/** Coach chat: leading assistant turns and empty turns are dropped; 'assistant' becomes 'model'. */
export function buildChatRequest(system: string, turns: ChatTurn[]): GeminiRequest {
  const firstUser = turns.findIndex((t) => t.role === 'user')
  const usable = (firstUser >= 0 ? turns.slice(firstUser) : []).filter((t) => t.content.trim().length > 0)
  if (!usable.length || usable[0].role !== 'user') throw new AIError('unknown', 'Nothing to send to the coach yet.')
  return {
    ...(system.trim() ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: usable.map((t) => ({ role: t.role === 'assistant' ? ('model' as const) : ('user' as const), parts: [{ text: t.content }] })),
    // Thinking tokens count toward the output budget, so leave room beyond the visible answer.
    generationConfig: { maxOutputTokens: 8192 },
  }
}

function jsonParts(req: JsonRequest, promptSuffix: string): GeminiPart[] {
  const parts: GeminiPart[] = (req.attachments ?? []).map((a) => ({
    inlineData: { mimeType: toGeminiMimeType(a.mediaType), data: stripDataUrl(a.base64) },
  }))
  parts.push({ text: `${req.prompt}${promptSuffix}` })
  return parts
}

/** Structured call: images and PDFs ride along as inlineData parts, the schema goes in generationConfig. */
export function buildJsonRequest(req: JsonRequest, opts: { maxOutputTokens?: number; thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH' } = {}): GeminiRequest {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: jsonParts(req, '\n\nReturn the JSON object only.') }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: toGeminiSchema(req.schema),
      maxOutputTokens: opts.maxOutputTokens ?? 16384,
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
    },
  }
}

/** Fallback when the API rejects the structured request: no format options at all, the schema rides in the prompt. */
export function buildPlainJsonRequest(req: JsonRequest, maxOutputTokens = 16384): GeminiRequest {
  const suffix = `\n\nRespond with ONLY one JSON object that validates against this JSON Schema. No prose, no code fences.\n${JSON.stringify(req.schema)}`
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: jsonParts(req, suffix) }],
    generationConfig: { maxOutputTokens },
  }
}

// --- response parsing -----------------------------------------------------------------------------

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY'])

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Pulls the answer text out of a generateContent response body, or throws the matching AIError. */
export function parseGeminiResponse(body: unknown): string {
  const root = obj(body)
  const blockReason = obj(root?.promptFeedback)?.blockReason
  if (typeof blockReason === 'string' && blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED') {
    throw new AIError('refusal', `Gemini blocked this request (${blockReason.toLowerCase().replace(/_/g, ' ')}).`)
  }
  const candidates = Array.isArray(root?.candidates) ? root.candidates : []
  const candidate = obj(candidates[0])
  const finish = typeof candidate?.finishReason === 'string' ? candidate.finishReason : ''
  if (BLOCKED_FINISH.has(finish)) {
    throw new AIError('refusal', `Gemini declined to answer (${finish.toLowerCase().replace(/_/g, ' ')}).`)
  }
  const parts = obj(candidate?.content)?.parts
  const text = (Array.isArray(parts) ? parts : [])
    .map((p) => obj(p))
    .filter((p): p is Record<string, unknown> => !!p && p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim()
  if (finish === 'MAX_TOKENS') throw new AIError('unknown', 'The AI reply was cut off at the output limit. Try again, or ask for something shorter.')
  if (!text) throw new AIError('unknown', 'The AI returned an empty reply.')
  return text
}

// --- error mapping --------------------------------------------------------------------------------

/** Maps an HTTP error from the Gemini API ({ error: { code, message, status, details[] } }) to an AIError. */
export function mapGeminiError(status: number, body: unknown): AIError {
  const err = obj(obj(body)?.error)
  const message = typeof err?.message === 'string' ? err.message : ''
  const details = Array.isArray(err?.details) ? err.details : []
  const keyInvalid = details.some((d) => obj(d)?.reason === 'API_KEY_INVALID') || /api key not valid/i.test(message)
  if (keyInvalid) return new AIError('auth', 'Google rejected this Gemini API key. Check it in Settings → AI.')
  if (status === 401 || status === 403) {
    return new AIError('auth', message ? `Google refused this Gemini API key: ${message}` : 'Google refused this Gemini API key. Check it in Settings → AI.')
  }
  if (status === 429) return new AIError('rate_limit', 'Gemini is rate-limiting this key (free-tier quotas are small). Wait a minute and try again.')
  if (status === 404) return new AIError('unknown', 'Gemini does not know this model. Check the model name in Settings → AI.')
  if (status >= 500) return new AIError('network', 'Gemini is temporarily unavailable. Try again shortly.')
  if (status === 400) return new AIError('unknown', `Gemini rejected the request${message ? `: ${message}` : '.'}`)
  return new AIError('unknown', message || `Gemini answered with HTTP ${status}.`)
}

// --- provider -------------------------------------------------------------------------------------

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const
  readonly name = 'Google Gemini'
  readonly model: string
  private readonly apiKey: string

  constructor(apiKey: string, model: string = DEFAULT_GEMINI_MODEL) {
    this.apiKey = (apiKey ?? '').trim()
    this.model = (model ?? '').trim() || DEFAULT_GEMINI_MODEL
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private async post(body: GeminiRequest): Promise<{ status: number; ok: boolean; json: unknown }> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS)
    try {
      const res = await fetch(geminiUrl(this.model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const json: unknown = await res.json().catch(() => null)
      return { status: res.status, ok: res.ok, json }
    } catch (e) {
      if (ctrl.signal.aborted) throw new AIError('network', 'Gemini took too long to respond. Try again.', e)
      throw new AIError('network', undefined, e)
    } finally {
      clearTimeout(timer)
    }
  }

  /** Sends `preferred`; when the API rejects it as a bad request (not a bad key), retries once with `fallback`. */
  private async generate(preferred: GeminiRequest, fallback?: GeminiRequest): Promise<string> {
    if (!this.isConfigured()) throw new AIError('not_configured')
    let reply = await this.post(preferred)
    if (reply.status === 400 && fallback && mapGeminiError(400, reply.json).kind !== 'auth') reply = await this.post(fallback)
    if (!reply.ok) throw mapGeminiError(reply.status, reply.json)
    return parseGeminiResponse(reply.json)
  }

  async recognizeMeal(img: MealImage, context: MealContext): Promise<MealRecognition> {
    const parts: string[] = ['Identify the foods in this photo and estimate portions and nutrition.']
    if (context.mealType) parts.push(`Meal type: ${context.mealType}.`)
    if (context.hint?.trim()) parts.push(`User note: ${context.hint.trim()}`)
    const req: JsonRequest = {
      system: MEAL_SYSTEM_PROMPT,
      prompt: parts.join(' '),
      schema: MEAL_RECOGNITION_SCHEMA,
      attachments: [{ base64: img.base64, mediaType: img.mediaType, name: 'meal' }],
    }
    // Low thinking keeps the photo → estimate round trip short (the Anthropic provider disables thinking here too).
    const thinkingLevel = supportsThinkingLevel(this.model) ? 'LOW' : undefined
    const text = await this.generate(buildJsonRequest(req, { maxOutputTokens: 8192, thinkingLevel }), buildPlainJsonRequest(req, 8192))
    return parseMealRecognition(text)
  }

  async completeJson(req: JsonRequest): Promise<unknown> {
    const text = await this.generate(buildJsonRequest(req), buildPlainJsonRequest(req))
    try {
      return extractJson(text)
    } catch {
      throw new AIError('unknown', 'The AI reply was not valid JSON. Try again.')
    }
  }

  async coachChat(system: string, turns: ChatTurn[]): Promise<string> {
    return this.generate(buildChatRequest(system, turns))
  }
}
