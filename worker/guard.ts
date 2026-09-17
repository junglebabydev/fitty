// Pure helpers for the hosted AI endpoint: errors, limits, request validation, provider choice.
// Nothing in this file touches the Workers runtime beyond web-standard globals (crypto.subtle, URL,
// TextEncoder/TextDecoder, ReadableStream), so it is unit-tested under plain Node (worker/__tests__).

export type ErrorKind = 'auth' | 'busy' | 'timeout' | 'forbidden' | 'bad_request' | 'failed' | 'refusal'

/** Same error envelope as server/aiBridge.ts: { ok: false, kind, message }. Messages are ours, never upstream text. */
export class BridgeError extends Error {
  constructor(readonly kind: ErrorKind, message: string, readonly status = 500) {
    super(message)
    this.name = 'BridgeError'
  }
}

export type ProviderId = 'openrouter' | 'gemini' | 'anthropic'

/** The string-valued part of the Worker env that the pure helpers need. Secrets are never logged or echoed. */
export interface CoachEnv {
  COACH_BRIDGE_PIN?: string
  COACH_PROVIDER?: string
  OPENROUTER_API_KEY?: string
  COACH_OPENROUTER_MODEL?: string
  /** 'deny' (default) routes only to providers that do not retain or train on prompts. */
  COACH_OPENROUTER_DATA_COLLECTION?: string
  GEMINI_API_KEY?: string
  COACH_GEMINI_MODEL?: string
  ANTHROPIC_API_KEY?: string
  COACH_MODEL?: string
}

// --- limits ------------------------------------------------------------------------------------------

/**
 * Sized for the Workers Free plan (10 ms CPU per request): decoding and re-serialising a larger body can end in
 * Cloudflare error 1102. About a 1 MB file once base64-encoded. On Workers Paid, raise it (8 MB at most) together
 * with `limits.cpu_ms` in wrangler.jsonc; see docs/DEPLOY.md §8.
 */
export const MAX_BODY_BYTES = 1.5 * 1024 * 1024
export const MAX_SYSTEM_CHARS = 40_000
export const MAX_PROMPT_CHARS = 200_000
export const MAX_TURNS = 60
export const MAX_ATTACHMENTS = 4
export const MAX_SCHEMA_CHARS = 50_000
/** The PIN is a bearer token, not a 4-digit PIN: its length is what stops guessing, the lockout below is only a brake. */
export const MIN_PIN_LENGTH = 8
export const CHAT_MAX_TOKENS = 2048
export const JSON_MAX_TOKENS = 8192
/** AI calls per isolate. Isolates are per-location and recycled, so this is a brake, not a quota. */
export const RATE_LIMIT = { calls: 30, windowMs: 5 * 60_000 }
/** Wrong-PIN attempts per client address (per /64 for IPv6, see pinFailKey) per isolate. */
export const PIN_FAIL_LIMIT = { attempts: 8, windowMs: 10 * 60_000 }
export const MAX_CONCURRENT = 2
/** A concurrency slot frees itself after the worst-case upstream time (a timeout of up to 120 s, twice on a 400-retry path). */
export const LEASE_MS = 250_000
/** AI calls per UTC day across all isolates and locations, counted in the DailyBudget Durable Object. */
export const DAILY_CALL_LIMIT = 300

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const
export type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

export interface Attachment { base64: string; mediaType: MediaType; name?: string }
export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ChatRequest { system: string; turns: ChatTurn[]; attachments: Attachment[] }
export interface JsonRequest { system: string; prompt: string; schema: Record<string, unknown>; attachments: Attachment[] }

/** What a provider module returns for one call. */
export interface ProviderReply { text: string; model: string | null }

// --- PIN ---------------------------------------------------------------------------------------------

/**
 * Constant-time string comparison: both values are hashed to 32 bytes first, so neither the length nor
 * the position of the first differing character changes how long the comparison takes.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(da)
  const y = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export type PinState = 'ok' | 'unset' | 'too_short' | 'missing' | 'wrong'

/** `configured` is COACH_BRIDGE_PIN on the server, `provided` is the x-coach-pin request header. */
export async function checkPin(configured: string | undefined, provided: string | null): Promise<PinState> {
  const pin = (configured ?? '').trim()
  if (!pin) return 'unset'
  if (pin.length < MIN_PIN_LENGTH) return 'too_short'
  const given = (provided ?? '').trim()
  if (!given) return 'missing'
  return (await safeEqual(pin, given)) ? 'ok' : 'wrong'
}

/** Says nothing about keys or providers: this is all a caller without the right PIN ever learns. */
export function pinMessage(state: PinState): string {
  if (state === 'unset') return 'AI is switched off on this server: the owner has not set COACH_BRIDGE_PIN yet.'
  if (state === 'too_short') return `AI is switched off on this server: COACH_BRIDGE_PIN must be at least ${MIN_PIN_LENGTH} characters.`
  if (state === 'wrong') return 'That PIN is not right. Check it in Settings → AI.'
  return 'PIN required. Enter it in Settings → AI.'
}

/**
 * Key for the wrong-PIN counter: the address itself for IPv4, the /64 for IPv6, because one IPv6 client
 * controls every address in its /64. Handles "::" inside the first four groups.
 */
export function pinFailKey(ip: string): string {
  if (!ip.includes(':') || ip.includes('.')) return ip
  const [head, tail = ''] = ip.toLowerCase().split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = ip.includes('::') ? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')
}

// --- origin ------------------------------------------------------------------------------------------

/**
 * Same-origin only. Browsers send Origin on every POST and on cross-origin GETs; when it is present its
 * origin (scheme, host and port) must equal the origin of the URL being requested. Sec-Fetch-Site, when
 * present, must not say the request came from another site. Requests without either header (curl,
 * same-origin GET) pass this check and still need the PIN.
 */
export function isSameOrigin(requestUrl: string, origin: string | null, secFetchSite: string | null = null): boolean {
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') return false
  if (origin === null) return true
  try {
    return new URL(origin).origin === new URL(requestUrl).origin
  } catch {
    return false
  }
}

/** HTTPS only, so the PIN and the health payload never travel in clear text. Plain http is fine on localhost (`wrangler dev`). */
export function isSecureRequest(requestUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(requestUrl)
    return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

// --- rate limiting -----------------------------------------------------------------------------------

/** Sliding-window counter held in isolate memory. `take` records a hit unless the key is already at its limit. */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>()

  constructor(readonly limit: number, readonly windowMs: number, private readonly maxKeys = 1000) {}

  private fresh(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (list.length) this.hits.set(key, list)
    else this.hits.delete(key)
    return list
  }

  count(key: string, now: number): number {
    return this.fresh(key, now).length
  }

  take(key: string, now: number): boolean {
    const list = this.fresh(key, now)
    if (list.length >= this.limit) return false
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) {
      // Bounded memory: forget the oldest key rather than grow without limit.
      const oldest = this.hits.keys().next().value
      if (oldest !== undefined) this.hits.delete(oldest)
    }
    list.push(now)
    this.hits.set(key, list)
    return true
  }
}

// --- body --------------------------------------------------------------------------------------------

/** Reads a request body as text, refusing anything over `maxBytes` without buffering the excess. */
export async function readTextCapped(body: ReadableStream<Uint8Array> | null, contentLength: string | null, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const tooLarge = () => new BridgeError('bad_request', `Too large for the hosted AI endpoint (limit ${+(maxBytes / (1024 * 1024)).toFixed(1)} MB per request). Try a smaller file, or a photo of the page.`, 413)
  const declared = Number(contentLength)
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge()
  if (!body) return ''
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export function parseBody(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text || '{}')
  } catch {
    throw new BridgeError('bad_request', 'Body must be JSON.', 400)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BridgeError('bad_request', 'Body must be a JSON object.', 400)
  return parsed as Record<string, unknown>
}

// --- request validation ------------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Accepts raw base64 or a data: URL and returns raw base64. */
export function stripDataUrl(base64: string): string {
  const i = base64.indexOf('base64,')
  return i >= 0 ? base64.slice(i + 7) : base64
}

export function normalizeMediaType(mediaType: string): MediaType | null {
  const mt = mediaType.toLowerCase().trim()
  const fixed = mt === 'image/jpg' ? 'image/jpeg' : mt
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(fixed) ? (fixed as MediaType) : null
}

export function parseAttachments(raw: unknown): Attachment[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new BridgeError('bad_request', 'attachments must be an array.', 400)
  if (raw.length > MAX_ATTACHMENTS) throw new BridgeError('bad_request', `At most ${MAX_ATTACHMENTS} attachments per request.`, 400)
  return raw.map((item) => {
    const a = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const mediaType = normalizeMediaType(str(a.mediaType))
    if (!mediaType) throw new BridgeError('bad_request', 'Unsupported attachment type. Use a JPEG, PNG, WebP or GIF image, or a PDF.', 400)
    const base64 = stripDataUrl(str(a.base64)).trim()
    if (!base64) throw new BridgeError('bad_request', 'An attachment is empty.', 400)
    const name = str(a.name).slice(0, 120)
    return name ? { base64, mediaType, name } : { base64, mediaType }
  })
}

/** Long system prompts are cut at the limit, like the local bridge does. */
function parseSystem(raw: unknown): string {
  return str(raw).slice(0, MAX_SYSTEM_CHARS)
}

export function parseChatRequest(body: Record<string, unknown>): ChatRequest {
  if (!Array.isArray(body.turns)) throw new BridgeError('bad_request', 'turns[] is required.', 400)
  const turns: ChatTurn[] = []
  for (const item of body.turns.slice(-MAX_TURNS)) {
    const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const content = str(t.content).trim()
    if (!content) continue
    turns.push({ role: t.role === 'assistant' ? 'assistant' : 'user', content })
  }
  // Both upstream APIs want the conversation to open with the user.
  const firstUser = turns.findIndex((t) => t.role === 'user')
  const usable = firstUser >= 0 ? turns.slice(firstUser) : []
  if (!usable.length) throw new BridgeError('bad_request', 'turns[] is required.', 400)
  if (usable[usable.length - 1].role !== 'user') throw new BridgeError('bad_request', 'The last turn must be from the user.', 400)
  const chars = usable.reduce((n, t) => n + t.content.length, 0)
  if (chars > MAX_PROMPT_CHARS) throw new BridgeError('bad_request', 'The conversation is too long to send.', 400)
  return { system: parseSystem(body.system), turns: usable, attachments: parseAttachments(body.attachments) }
}

export function parseJsonRequest(body: Record<string, unknown>): JsonRequest {
  const prompt = str(body.prompt)
  const schema = body.schema
  if (!prompt.trim() || !schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new BridgeError('bad_request', 'prompt and schema are required.', 400)
  }
  if (prompt.length > MAX_PROMPT_CHARS) throw new BridgeError('bad_request', 'The prompt is too long to send.', 400)
  if (JSON.stringify(schema).length > MAX_SCHEMA_CHARS) throw new BridgeError('bad_request', 'The schema is too large.', 400)
  return { system: parseSystem(body.system), prompt, schema: schema as Record<string, unknown>, attachments: parseAttachments(body.attachments) }
}

/** Appended to the prompt when the upstream API is not given the schema as a parameter. */
export function schemaInstruction(schema: unknown): string {
  return `Respond with ONLY one JSON object that validates against this JSON Schema. No prose, no code fences.\n${JSON.stringify(schema)}`
}

/** Pulls the JSON value out of model text (tolerates code fences and stray prose). Throws when there is none. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* try a fenced block */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) } catch { /* try the outermost braces */ }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error('no JSON object in reply')
}

// --- provider choice ---------------------------------------------------------------------------------

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0

/** OpenRouter keys start with "sk-or-"; one may have been stored under GEMINI_API_KEY by mistake. */
const isOpenRouterKey = (v: string | undefined): boolean => !!v && v.trim().startsWith('sk-or-')

/** The OpenRouter key, wherever it was stored: its own secret, or a "sk-or-" key saved as GEMINI_API_KEY. */
export function openRouterKeyOf(env: CoachEnv): string {
  if (has(env.OPENROUTER_API_KEY)) return (env.OPENROUTER_API_KEY as string).trim()
  if (isOpenRouterKey(env.GEMINI_API_KEY)) return (env.GEMINI_API_KEY as string).trim()
  return ''
}

/** A real Google key: GEMINI_API_KEY is set and is not an OpenRouter key. */
const hasGoogleKey = (env: CoachEnv): boolean => has(env.GEMINI_API_KEY) && !isOpenRouterKey(env.GEMINI_API_KEY)

/** COACH_PROVIDER wins when set; otherwise OpenRouter if its key exists, then Gemini, then Anthropic. null = no usable key. */
export function pickProvider(env: CoachEnv): ProviderId | null {
  const want = (env.COACH_PROVIDER ?? '').trim().toLowerCase()
  if (want === 'openrouter') return openRouterKeyOf(env) ? 'openrouter' : null
  if (want === 'gemini') return hasGoogleKey(env) ? 'gemini' : openRouterKeyOf(env) ? 'openrouter' : null
  if (want === 'anthropic') return has(env.ANTHROPIC_API_KEY) ? 'anthropic' : null
  if (openRouterKeyOf(env)) return 'openrouter'
  if (hasGoogleKey(env)) return 'gemini'
  if (has(env.ANTHROPIC_API_KEY)) return 'anthropic'
  return null
}

/** Shown only to a caller that already presented the right PIN. */
export function noKeyMessage(env: CoachEnv): string {
  const want = (env.COACH_PROVIDER ?? '').trim().toLowerCase()
  if (want === 'openrouter') return 'COACH_PROVIDER is "openrouter" but the OPENROUTER_API_KEY secret is not set on the server.'
  if (want === 'gemini') return 'COACH_PROVIDER is "gemini" but the GEMINI_API_KEY secret is not set on the server.'
  if (want === 'anthropic') return 'COACH_PROVIDER is "anthropic" but the ANTHROPIC_API_KEY secret is not set on the server.'
  return 'No AI key is configured on the server. Add OPENROUTER_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY as a Worker secret.'
}
