// Cloudflare Worker entry: serves the built app (./dist) and the hosted AI endpoint.
//
//   browser ──(same-origin /api/ai/*, header x-coach-pin)──▶ this Worker ──▶ Gemini (default) or Anthropic
//
// Same contract as the local bridge in server/aiBridge.ts:
//   GET  /api/ai/health → { ok, installed, version, auth, message, model, pinRequired, host: 'cloud', provider, pinOk }
//                         (without the right PIN: 403 and the same generic "PIN required" body whether or not a key exists)
//   POST /api/ai/chat   { system, turns, attachments? }          → { ok, text, meta }
//   POST /api/ai/json   { system, prompt, schema, attachments? } → { ok, data, meta }
//   errors              → { ok: false, kind, message }
//   GET  /api/ai/reauth → 302 to "/". Worker only: a navigation the service worker never answers from its cache, so an
//                         expired Cloudflare Access session gets the Access login and then lands back in the app.
//
// The site is public, so every AI call needs COACH_BRIDGE_PIN (constant-time check), must be same-origin and
// HTTPS, and is size-, rate- and token-capped. Secrets and upstream error bodies never reach the client, and no
// CORS headers are ever sent. Validation and limits live in ./guard (pure, unit-tested).
//
// Secrets:  OPENROUTER_API_KEY, GEMINI_API_KEY and/or ANTHROPIC_API_KEY, plus COACH_BRIDGE_PIN.
// Vars:     COACH_PROVIDER ('openrouter' | 'gemini' | 'anthropic'), COACH_OPENROUTER_MODEL, COACH_OPENROUTER_DATA_COLLECTION,
//           COACH_GEMINI_MODEL, COACH_MODEL.
// Bindings: AI_LIMITER (Workers Rate Limiting, per client address), DAILY_BUDGET (Durable Object, calls per day).

import { anthropicChat, anthropicCheck, anthropicJson, anthropicModel } from './anthropic'
import { geminiChat, geminiCheck, geminiJson, geminiModel } from './gemini'
import { dataCollection, openRouterChat, openRouterCheck, openRouterJson, openRouterModel } from './openrouter'
import {
  BridgeError, DAILY_CALL_LIMIT, LEASE_MS, MAX_CONCURRENT, PIN_FAIL_LIMIT, RATE_LIMIT, SlidingWindow, checkPin, extractJson, isSameOrigin,
  isSecureRequest, noKeyMessage, parseBody, parseChatRequest, parseJsonRequest, pickProvider, pinFailKey, pinMessage, readTextCapped,
  type ChatRequest, type CoachEnv, type JsonRequest, type ProviderId, type ProviderReply, openRouterKeyOf,
} from './guard'

export interface Env extends CoachEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
  /** Workers Rate Limiting binding (wrangler.jsonc → ratelimits). Optional so tests and bare setups run without it. */
  AI_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
  /** Durable Object namespace of DailyBudget (wrangler.jsonc → durable_objects). */
  DAILY_BUDGET?: { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string): Promise<Response> } }
}

/** The part of ExecutionContext this Worker uses. */
interface Ctx { waitUntil(promise: Promise<unknown>): void }

const VERSION = 'fitty-worker/1'
const HEALTH_TTL_MS = 10 * 60_000
/** An inconclusive check (network blip upstream) is retried soon instead of being remembered for ten minutes. */
const HEALTH_RETRY_MS = 30_000

// Per-isolate state. Isolates come and go, so none of this is a guarantee, only a brake.
// The limits that outlive an isolate are the AI_LIMITER binding and the DailyBudget Durable Object.
const calls = new SlidingWindow(RATE_LIMIT.calls, RATE_LIMIT.windowMs)
const pinFailures = new SlidingWindow(PIN_FAIL_LIMIT.attempts, PIN_FAIL_LIMIT.windowMs)
/**
 * Start times of the calls in flight. These are leases, not a counter: when the client disconnects, workerd
 * cancels the request and `finally` never runs, so a slot has to free itself after LEASE_MS.
 */
const inflight: number[] = []
let checked: { key: string; auth: 'ok' | 'signed_out' | 'unknown'; message: string; at: number } | null = null

function send(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

interface Upstream { provider: ProviderId; apiKey: string; model: string; policy: 'allow' | 'deny' }

function upstream(env: Env): Upstream | null {
  const provider = pickProvider(env)
  const policy = dataCollection(env.COACH_OPENROUTER_DATA_COLLECTION)
  if (provider === 'openrouter') return { provider, apiKey: openRouterKeyOf(env), model: openRouterModel(env.COACH_OPENROUTER_MODEL), policy }
  if (provider === 'gemini') return { provider, apiKey: (env.GEMINI_API_KEY ?? '').trim(), model: geminiModel(env.COACH_GEMINI_MODEL), policy }
  if (provider === 'anthropic') return { provider, apiKey: (env.ANTHROPIC_API_KEY ?? '').trim(), model: anthropicModel(env.COACH_MODEL), policy }
  return null
}

const providerName = (p: ProviderId): string => (p === 'openrouter' ? 'OpenRouter' : p === 'gemini' ? 'Google Gemini' : 'Anthropic Claude')

/** Health for a caller that presented the right PIN. The key is verified with a free metadata call, cached per isolate. */
async function health(env: Env): Promise<Record<string, unknown>> {
  const base = { installed: true, version: VERSION, pinRequired: true, pinOk: true, host: 'cloud' }
  const up = upstream(env)
  if (!up) return { ...base, ok: false, auth: 'signed_out', message: noKeyMessage(env), model: '', provider: null }
  const key = `${up.provider}:${up.model}`
  const ttl = checked?.auth === 'unknown' ? HEALTH_RETRY_MS : HEALTH_TTL_MS
  if (!checked || checked.key !== key || Date.now() - checked.at > ttl) {
    try {
      await (up.provider === 'openrouter' ? openRouterCheck(up.apiKey) : up.provider === 'gemini' ? geminiCheck(up.apiKey, up.model) : anthropicCheck(up.apiKey, up.model))
      checked = { key, auth: 'ok', message: `Connected to ${providerName(up.provider)} through this site's server.`, at: Date.now() }
    } catch (e) {
      const err = e instanceof BridgeError ? e : new BridgeError('failed', 'The AI service did not respond.')
      checked = { key, auth: err.kind === 'auth' ? 'signed_out' : 'unknown', message: err.message, at: Date.now() }
    }
  }
  return { ...base, ok: checked.auth === 'ok', auth: checked.auth, message: checked.message, model: up.model, provider: up.provider }
}

/** One object counts AI calls per UTC day, so the cap holds across isolates, locations and restarts. */
export class DailyBudget {
  constructor(private readonly state: { storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> } }) {}

  /** Takes one call from today's budget: 204, or 429 once it is spent. */
  async fetch(): Promise<Response> {
    const day = new Date().toISOString().slice(0, 10)
    const saved = await this.state.storage.get<{ day: string; used: number }>('calls')
    const used = saved?.day === day ? saved.used : 0
    if (used >= DAILY_CALL_LIMIT) return new Response(null, { status: 429 })
    await this.state.storage.put('calls', { day, used: used + 1 })
    return new Response(null, { status: 204 })
  }
}

async function run(env: Env, ctx: Ctx | undefined, call: (up: Upstream) => Promise<ProviderReply>): Promise<{ reply: ProviderReply; up: Upstream; durationMs: number }> {
  const up = upstream(env)
  if (!up) throw new BridgeError('auth', noKeyMessage(env), 503)
  const started = Date.now()
  for (let i = inflight.length - 1; i >= 0; i--) if (started - inflight[i] > LEASE_MS) inflight.splice(i, 1)
  if (inflight.length >= MAX_CONCURRENT) throw new BridgeError('busy', 'The AI endpoint is busy. Try again in a moment.', 429)
  if (!calls.take('all', started)) throw new BridgeError('busy', 'Too many AI requests in a short time. Wait a few minutes and try again.', 429)
  inflight.push(started)
  try {
    if (env.DAILY_BUDGET) {
      const budget = await env.DAILY_BUDGET.get(env.DAILY_BUDGET.idFromName('calls')).fetch('https://daily-budget/take')
      if (budget.status === 429) throw new BridgeError('busy', "Today's AI budget on this server is used up. It resets at midnight UTC.", 429)
    }
    const pending = call(up)
    // Extra measure: a short client disconnect no longer cancels the call before `finally` (waitUntil adds up to 30 s).
    ctx?.waitUntil(pending.catch(() => undefined))
    const reply = await pending
    checked = { key: `${up.provider}:${up.model}`, auth: 'ok', message: `Connected to ${providerName(up.provider)} through this site's server.`, at: Date.now() }
    return { reply, up, durationMs: Date.now() - started }
  } catch (e) {
    if (e instanceof BridgeError && e.kind === 'auth') checked = { key: `${up.provider}:${up.model}`, auth: 'signed_out', message: e.message, at: Date.now() }
    throw e
  } finally {
    const i = inflight.indexOf(started)
    if (i >= 0) inflight.splice(i, 1)
  }
}

const chat = (req: ChatRequest) => (up: Upstream) =>
  up.provider === 'openrouter' ? openRouterChat(up.apiKey, up.model, up.policy, req) : up.provider === 'gemini' ? geminiChat(up.apiKey, up.model, req) : anthropicChat(up.apiKey, up.model, req)

const json = (req: JsonRequest) => (up: Upstream) =>
  up.provider === 'openrouter' ? openRouterJson(up.apiKey, up.model, up.policy, req) : up.provider === 'gemini' ? geminiJson(up.apiKey, up.model, req) : anthropicJson(up.apiKey, up.model, req)

async function handleAi(request: Request, env: Env, path: string, ctx?: Ctx): Promise<Response> {
  try {
    if (!isSecureRequest(request.url)) throw new BridgeError('forbidden', 'HTTPS only.', 403)
    if (!isSameOrigin(request.url, request.headers.get('origin'), request.headers.get('sec-fetch-site'))) {
      throw new BridgeError('forbidden', 'Cross-origin requests are not allowed.', 403)
    }
    const isHealth = path === '/health' && request.method === 'GET'
    if (!isHealth && request.method !== 'POST') throw new BridgeError('bad_request', 'POST only.', 405)

    // Per client address: the address for IPv4, the /64 for IPv6.
    const ip = pinFailKey(request.headers.get('cf-connecting-ip') ?? 'unknown')
    // Counted by Cloudflare per location, not in isolate memory, and before the PIN is looked at.
    if (env.AI_LIMITER && !(await env.AI_LIMITER.limit({ key: ip })).success) {
      throw new BridgeError('busy', 'Too many requests from this address. Wait a minute and try again.', 429)
    }

    // PIN first: nothing about keys, providers or models is revealed without it.
    if (pinFailures.count(ip, Date.now()) >= PIN_FAIL_LIMIT.attempts) {
      throw new BridgeError('busy', 'Too many wrong PIN attempts. Wait ten minutes and try again.', 429)
    }
    const pin = await checkPin(env.COACH_BRIDGE_PIN, request.headers.get('x-coach-pin'))
    if (pin === 'wrong') pinFailures.take(ip, Date.now())
    if (pin !== 'ok') {
      if (!isHealth) throw new BridgeError('forbidden', pinMessage(pin), 403)
      // Health without the right PIN is the same generic answer whether or not a key exists.
      const locked = { ok: false, installed: true, version: VERSION, auth: 'unknown', message: pinMessage(pin), model: '', pinRequired: true, pinOk: false, host: 'cloud' }
      // Server not set up (no usable PIN): 200 + provider null, which the app reads as "add the Worker secrets".
      if (pin === 'unset' || pin === 'too_short') return send(200, { ...locked, provider: null })
      // Missing or wrong PIN: refused like the local bridge does (403), with the health fields alongside.
      return send(403, { ...locked, kind: 'forbidden' })
    }

    if (isHealth) return send(200, await health(env))

    if (path !== '/chat' && path !== '/json') throw new BridgeError('bad_request', 'Unknown endpoint.', 404)
    const body = parseBody(await readTextCapped(request.body, request.headers.get('content-length')))

    if (path === '/chat') {
      const { reply, up, durationMs } = await run(env, ctx, chat(parseChatRequest(body)))
      return send(200, { ok: true, text: reply.text, meta: { durationMs, costUsd: null, model: reply.model ?? up.model, provider: up.provider } })
    }

    const { reply, up, durationMs } = await run(env, ctx, json(parseJsonRequest(body)))
    let data: unknown
    try { data = extractJson(reply.text) }
    catch { throw new BridgeError('failed', 'The AI did not return valid JSON. Try again.', 502) }
    return send(200, { ok: true, data, meta: { durationMs, costUsd: null, model: reply.model ?? up.model, provider: up.provider } })
  } catch (e) {
    if (e instanceof BridgeError) return send(e.status, { ok: false, kind: e.kind, message: e.message })
    // Unknown failures are reported generically. Only the error's class name is logged, and with observability off
    // (wrangler.jsonc) nothing is stored: the line shows up in a live `npx wrangler tail` session and nowhere else.
    console.error('ai endpoint error:', e instanceof Error ? e.name : typeof e)
    return send(500, { ok: false, kind: 'failed', message: 'The AI endpoint hit an unexpected error.' })
  }
}

export default {
  async fetch(request: Request, env: Env, ctx?: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    // Before the same-origin check: the return from the Access login arrives with Sec-Fetch-Site: cross-site.
    if (pathname === '/api/ai/reauth' && request.method === 'GET') {
      return new Response(null, { status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' } })
    }
    if (pathname.startsWith('/api/ai/')) return handleAi(request, env, pathname.slice('/api/ai'.length), ctx)
    return env.ASSETS.fetch(request)
  },
}
