// Cloudflare Worker entry: serves the built app (./dist) and the hosted AI endpoint.
//
//   browser ──(same-origin /api/ai/*, header x-coach-pin)──▶ this Worker ──▶ Gemini (default) or Anthropic
//
// Same contract as the local bridge in server/aiBridge.ts:
//   GET  /api/ai/health → { ok, installed, version, auth, message, model, pinRequired, host: 'cloud', provider, pinOk }
//   POST /api/ai/chat   { system, turns, attachments? }          → { ok, text, meta }
//   POST /api/ai/json   { system, prompt, schema, attachments? } → { ok, data, meta }
//   errors              → { ok: false, kind, message }
//
// The site is public, so every AI call needs COACH_BRIDGE_PIN (constant-time check), must be same-origin,
// and is size-, rate- and token-capped. Secrets and upstream error bodies never reach the client, and no
// CORS headers are ever sent. Validation and limits live in ./guard (pure, unit-tested).
//
// Secrets: GEMINI_API_KEY and/or ANTHROPIC_API_KEY, COACH_BRIDGE_PIN.
// Vars:    COACH_PROVIDER ('gemini' | 'anthropic'), COACH_GEMINI_MODEL, COACH_MODEL.

import { anthropicChat, anthropicCheck, anthropicJson, anthropicModel } from './anthropic'
import { geminiChat, geminiCheck, geminiJson, geminiModel } from './gemini'
import {
  BridgeError, MAX_CONCURRENT, PIN_FAIL_LIMIT, RATE_LIMIT, SlidingWindow, checkPin, extractJson, isSameOrigin, noKeyMessage,
  parseBody, parseChatRequest, parseJsonRequest, pickProvider, pinMessage, readTextCapped,
  type ChatRequest, type CoachEnv, type JsonRequest, type ProviderId, type ProviderReply,
} from './guard'

export interface Env extends CoachEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const VERSION = 'fitty-worker/1'
const HEALTH_TTL_MS = 10 * 60_000

// Per-isolate state. Isolates come and go, so none of this is a guarantee, only a brake.
const calls = new SlidingWindow(RATE_LIMIT.calls, RATE_LIMIT.windowMs)
const pinFailures = new SlidingWindow(PIN_FAIL_LIMIT.attempts, PIN_FAIL_LIMIT.windowMs)
let active = 0
let checked: { key: string; auth: 'ok' | 'signed_out' | 'unknown'; message: string; at: number } | null = null

function send(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

interface Upstream { provider: ProviderId; apiKey: string; model: string }

function upstream(env: Env): Upstream | null {
  const provider = pickProvider(env)
  if (provider === 'gemini') return { provider, apiKey: (env.GEMINI_API_KEY ?? '').trim(), model: geminiModel(env.COACH_GEMINI_MODEL) }
  if (provider === 'anthropic') return { provider, apiKey: (env.ANTHROPIC_API_KEY ?? '').trim(), model: anthropicModel(env.COACH_MODEL) }
  return null
}

const providerName = (p: ProviderId): string => (p === 'gemini' ? 'Google Gemini' : 'Anthropic Claude')

/** Health for a caller that presented the right PIN. The key is verified with a free metadata call, cached per isolate. */
async function health(env: Env): Promise<Record<string, unknown>> {
  const base = { installed: true, version: VERSION, pinRequired: true, pinOk: true, host: 'cloud' }
  const up = upstream(env)
  if (!up) return { ...base, ok: false, auth: 'signed_out', message: noKeyMessage(env), model: '', provider: null }
  const key = `${up.provider}:${up.model}`
  if (!checked || checked.key !== key || Date.now() - checked.at > HEALTH_TTL_MS) {
    try {
      await (up.provider === 'gemini' ? geminiCheck(up.apiKey, up.model) : anthropicCheck(up.apiKey, up.model))
      checked = { key, auth: 'ok', message: `Connected to ${providerName(up.provider)} through this site's server.`, at: Date.now() }
    } catch (e) {
      const err = e instanceof BridgeError ? e : new BridgeError('failed', 'The AI service did not respond.')
      checked = { key, auth: err.kind === 'auth' ? 'signed_out' : 'unknown', message: err.message, at: Date.now() }
    }
  }
  return { ...base, ok: checked.auth === 'ok', auth: checked.auth, message: checked.message, model: up.model, provider: up.provider }
}

async function run(env: Env, call: (up: Upstream) => Promise<ProviderReply>): Promise<{ reply: ProviderReply; up: Upstream; durationMs: number }> {
  const up = upstream(env)
  if (!up) throw new BridgeError('auth', noKeyMessage(env), 503)
  if (!calls.take('all', Date.now())) throw new BridgeError('busy', 'Too many AI requests in a short time. Wait a few minutes and try again.', 429)
  if (active >= MAX_CONCURRENT) throw new BridgeError('busy', 'The AI endpoint is busy. Try again in a moment.', 429)
  active++
  const started = Date.now()
  try {
    const reply = await call(up)
    checked = { key: `${up.provider}:${up.model}`, auth: 'ok', message: `Connected to ${providerName(up.provider)} through this site's server.`, at: Date.now() }
    return { reply, up, durationMs: Date.now() - started }
  } catch (e) {
    if (e instanceof BridgeError && e.kind === 'auth') checked = { key: `${up.provider}:${up.model}`, auth: 'signed_out', message: e.message, at: Date.now() }
    throw e
  } finally {
    active--
  }
}

const chat = (req: ChatRequest) => (up: Upstream) =>
  up.provider === 'gemini' ? geminiChat(up.apiKey, up.model, req) : anthropicChat(up.apiKey, up.model, req)

const json = (req: JsonRequest) => (up: Upstream) =>
  up.provider === 'gemini' ? geminiJson(up.apiKey, up.model, req) : anthropicJson(up.apiKey, up.model, req)

async function handleAi(request: Request, env: Env, path: string): Promise<Response> {
  try {
    if (!isSameOrigin(request.url, request.headers.get('origin'), request.headers.get('sec-fetch-site'))) {
      throw new BridgeError('forbidden', 'Cross-origin requests are not allowed.', 403)
    }
    const isHealth = path === '/health' && request.method === 'GET'
    if (!isHealth && request.method !== 'POST') throw new BridgeError('bad_request', 'POST only.', 405)

    // PIN first: nothing about keys, providers or models is revealed without it.
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
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
      const { reply, up, durationMs } = await run(env, chat(parseChatRequest(body)))
      return send(200, { ok: true, text: reply.text, meta: { durationMs, costUsd: null, model: reply.model ?? up.model, provider: up.provider } })
    }

    const { reply, up, durationMs } = await run(env, json(parseJsonRequest(body)))
    let data: unknown
    try { data = extractJson(reply.text) }
    catch { throw new BridgeError('failed', 'The AI did not return valid JSON. Try again.', 502) }
    return send(200, { ok: true, data, meta: { durationMs, costUsd: null, model: reply.model ?? up.model, provider: up.provider } })
  } catch (e) {
    if (e instanceof BridgeError) return send(e.status, { ok: false, kind: e.kind, message: e.message })
    // Unknown failures are logged for the owner (Workers Logs) and reported generically.
    console.error('ai endpoint error:', e instanceof Error ? e.name : typeof e)
    return send(500, { ok: false, kind: 'failed', message: 'The AI endpoint hit an unexpected error.' })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/ai/')) return handleAi(request, env, pathname.slice('/api/ai'.length))
    return env.ASSETS.fetch(request)
  },
}
