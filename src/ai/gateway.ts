import type { LedgerEntry } from '../domain/types'
import { AnthropicProvider } from './anthropic'
import { BridgeProvider } from './bridge'
import { GeminiProvider } from './gemini'
import { MockProvider } from './mock'
import { AIError, type AIProvider, type AIProviderId, type ChatTurn, type DecideRequest, type DecideResult, type JsonRequest, type MealContext, type MealImage, type MealRecognition } from './types'

export { AIError }
export type { AIErrorKind } from './types'

// Single choke point for anything that leaves the device. Every call:
//   1. refuses to send while offline (remote providers only — the mock sends nothing),
//   2. writes a privacy-ledger entry (provider, data type, purpose, byte size, status),
//   3. gives up after AI_TIMEOUT_MS.

export const AI_TIMEOUT_MS = 160_000

export type LedgerInput = Omit<LedgerEntry, 'id' | 'ts'>

export interface ConfigureAIOptions {
  providerId: AIProviderId
  apiKey?: string | null
  model?: string | null
  /** Gemini only: the owner's Google AI Studio key and an optional model id ('' → DEFAULT_GEMINI_MODEL). */
  geminiKey?: string | null
  geminiModel?: string | null
  /** Bridge only: model alias for Claude Code (sonnet | opus | haiku | default) and optional PIN. */
  bridgeModel?: string | null
  bridgePin?: string | null
  /** Bridge only: where the bridge runs. 'cloud' = the Cloudflare Worker, which picks its own model. */
  bridgeHost?: 'mac' | 'cloud' | null
  /** Cloud bridge only: the upstream the Worker reports in /api/ai/health ('gemini' | 'anthropic'). Named on the ledger row. */
  bridgeUpstream?: string | null
  onLedger: (e: LedgerInput) => void
}

let provider: AIProvider = new MockProvider()
/** What a privacy-ledger row calls the recipient: the provider id, or `worker:<upstream>` for the hosted Worker. */
let ledgerProvider: string = provider.id
let ledgerSink: (e: LedgerInput) => void = () => {}

export function configureAI(opts: ConfigureAIOptions): void {
  ledgerSink = opts.onLedger
  provider =
    opts.providerId === 'anthropic' ? new AnthropicProvider(opts.apiKey ?? '', opts.model ?? undefined)
    : opts.providerId === 'gemini' ? new GeminiProvider(opts.geminiKey ?? '', opts.geminiModel ?? undefined)
    : opts.providerId === 'claude-code' ? new BridgeProvider(opts.bridgeModel ?? '', opts.bridgePin ?? '', opts.bridgeHost ?? 'mac')
    : new MockProvider()
  ledgerProvider = provider.id === 'claude-code' && opts.bridgeHost === 'cloud' ? `worker:${opts.bridgeUpstream || 'unknown'}` : provider.id
}

/** True when a real model is connected (not the on-device demo provider). */
export function aiConnected(): boolean {
  return provider.id !== 'mock' && provider.isConfigured()
}

export function getProvider(): AIProvider {
  return provider
}

/** Treats unknown environments (no navigator, e.g. tests) as online. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function record(e: LedgerInput): void {
  try {
    ledgerSink(e)
  } catch (err) {
    console.warn('privacy ledger write failed', err)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new AIError('network', `${what} did not finish within ${Math.round(ms / 1000)} s. Try again.`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

function toAIError(e: unknown): AIError {
  if (e instanceof AIError) return e
  return new AIError('unknown', e instanceof Error && e.message ? e.message : undefined, e)
}

/** Shared pre-flight + ledger wrapper around a provider call. */
async function guarded<T>(
  entry: Omit<LedgerInput, 'status'>,
  what: string,
  run: (p: AIProvider) => Promise<T>,
): Promise<T> {
  const p = provider
  if (p.id === 'mock') {
    record({ ...entry, status: 'local_only' })
    return run(p)
  }
  if (!p.isConfigured()) throw new AIError('not_configured')
  if (!isOnline()) throw new AIError('offline')
  try {
    const result = await withTimeout(run(p), AI_TIMEOUT_MS, what)
    record({ ...entry, status: 'sent' })
    return result
  } catch (e) {
    record({ ...entry, status: 'failed' })
    throw toAIError(e)
  }
}

export function recognizeMeal(img: MealImage, context: MealContext = {}): Promise<MealRecognition> {
  const purpose = context.mealType ? `Meal photo recognition (${context.mealType})` : 'Meal photo recognition'
  return guarded(
    { provider: ledgerProvider, dataType: 'meal_photo', purpose, bytes: img.base64.length },
    'Meal recognition',
    (p) => p.recognizeMeal(img, context),
  )
}

export function coachChat(system: string, turns: ChatTurn[]): Promise<string> {
  const bytes = JSON.stringify({ system, turns }).length
  return guarded(
    { provider: ledgerProvider, dataType: 'coach_context', purpose: 'Coach chat (profile summary, today\'s facts, conversation)', bytes },
    'Coach chat',
    (p) => p.coachChat(system, turns),
  )
}

/**
 * Generic structured AI call with the same guard rails (offline check, privacy ledger, timeout).
 * `dataType` and `purpose` are what the user sees in the privacy ledger.
 */
export function aiJson<T>(req: JsonRequest, meta: { dataType: string; purpose: string }): Promise<T> {
  const bytes = JSON.stringify({ s: req.system, p: req.prompt }).length + (req.attachments ?? []).reduce((n, a) => n + a.base64.length, 0)
  return guarded(
    { provider: ledgerProvider, dataType: meta.dataType, purpose: meta.purpose, bytes },
    meta.purpose,
    (p) => p.completeJson(req) as Promise<T>,
  )
}

/** A decision should answer in ~100 ms; past this the caller uses its fallback. */
export const DECIDE_TIMEOUT_MS = 3_000

/**
 * One choice question to the decision model (docs/PRD_COACH_CHAT.md §11.6). Throws AIError('not_configured')
 * without a ledger row when the provider has none (Mac bridge, direct keys, mock), so callers fall back quietly.
 */
export function aiDecide(req: DecideRequest, meta: { dataType: string; purpose: string }): Promise<DecideResult> {
  const decide = provider.decide
  if (!decide) return Promise.reject(new AIError('not_configured'))
  return guarded(
    { provider: ledgerProvider, dataType: meta.dataType, purpose: meta.purpose, bytes: req.state.length },
    meta.purpose,
    (p) => withTimeout(decide.call(p, req), DECIDE_TIMEOUT_MS, meta.purpose),
  )
}
