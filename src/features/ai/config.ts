// Wires the AI gateway to the persisted `ai.*` settings, the privacy ledger and the same-origin AI bridge.
// Called once at boot (App.tsx) and again by Settings after any ai.* change.
//
// ai.mode:
//   'auto' (default)  → the bridge when it answers ok (Claude Code on the Mac locally, the Cloudflare Worker when hosted),
//                       else a Gemini key on this device, else an Anthropic key on this device, else on-device demo
//   'claude-code'     → always the bridge
//   'gemini'          → always the Gemini key ('ai.geminiKey', model 'ai.geminiModel')
//   'anthropic'       → always the Anthropic key ('ai.apiKey', model 'ai.model')
//   'mock'            → on-device demo estimates only, nothing leaves the phone
import { useSyncExternalStore } from 'react'
import { bridgeProviderLabel, configureAI, probeBridge, type AIProviderId, type BridgeHealth, type BridgeHost } from '../../ai'
import { addLedgerEntry, getSetting } from '../../db/repositories'
import { nowIso } from '../../lib/util'

export type AIMode = 'auto' | 'claude-code' | 'gemini' | 'anthropic' | 'mock'

export const AI_GEMINI_KEY = 'ai.geminiKey'
export const AI_GEMINI_MODEL = 'ai.geminiModel'

export interface AISettings {
  mode: AIMode
  /** Provider the legacy UI reads; mirrors the active provider for explicit modes. */
  providerId: AIProviderId
  /** Trimmed Anthropic key, '' when unset. Never leaves the device except inside the provider's own request. */
  apiKey: string
  /** '' means the provider default (DEFAULT_ANTHROPIC_MODEL). */
  model: string
  /** Trimmed Gemini key, '' when unset. Same rule: only ever sent to Google inside the request header. */
  geminiKey: string
  /** '' means DEFAULT_GEMINI_MODEL. */
  geminiModel: string
  /** Claude Code model alias for the Mac bridge: '' | sonnet | opus | haiku | default. */
  bridgeModel: string
  bridgePin: string
}

export interface AIStatus {
  mode: AIMode
  active: AIProviderId
  /** A real model is connected (not the demo provider). */
  connected: boolean
  checking: boolean
  bridge: BridgeHealth | null
  /** Where this origin's bridge runs: the bridge says so, otherwise guessed from the hostname. */
  host: BridgeHost
  /** Cloud host only: what the Worker bridge needs next ('none' on the Mac or when nothing answered). */
  cloud: CloudBridgeState
  /** One plain sentence for the UI. */
  message: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function readAISettings(): AISettings {
  const rawMode = str(getSetting<unknown>('ai.mode', ''))
  const legacy = str(getSetting<unknown>('ai.provider', ''))
  const mode: AIMode =
    rawMode === 'claude-code' || rawMode === 'gemini' || rawMode === 'anthropic' || rawMode === 'mock' || rawMode === 'auto' ? rawMode
    : legacy === 'anthropic' ? 'anthropic'
    : legacy === 'gemini' ? 'gemini'
    : 'auto'
  return {
    mode,
    providerId: mode === 'anthropic' ? 'anthropic' : mode === 'gemini' ? 'gemini' : mode === 'claude-code' ? 'claude-code' : 'mock',
    apiKey: str(getSetting<unknown>('ai.apiKey', '')),
    model: str(getSetting<unknown>('ai.model', '')),
    geminiKey: str(getSetting<unknown>(AI_GEMINI_KEY, '')),
    geminiModel: str(getSetting<unknown>(AI_GEMINI_MODEL, '')),
    bridgeModel: str(getSetting<unknown>('ai.bridgeModel', '')),
    bridgePin: str(getSetting<unknown>('ai.bridgePin', '')),
  }
}

// --- pure resolution + wording (unit-tested) ---------------------------------------------------------

/** localhost, *.local and private-network addresses are the Mac's dev server; anything else is a hosted deployment. */
export function inferBridgeHost(hostname: string): BridgeHost {
  const h = hostname.toLowerCase()
  const local =
    !h || h === 'localhost' || h === '[::1]' || h.endsWith('.local') || h.endsWith('.localhost') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)
  return local ? 'mac' : 'cloud'
}

export function bridgeHostOf(bridge: BridgeHealth | null, hostname: string): BridgeHost {
  return bridge?.host ?? inferBridgeHost(hostname)
}

export function resolveActive(s: AISettings, bridge: BridgeHealth | null): AIProviderId {
  if (s.mode === 'mock') return 'mock'
  if (s.mode === 'anthropic') return 'anthropic'
  if (s.mode === 'gemini') return 'gemini'
  if (s.mode === 'claude-code') return 'claude-code'
  if (bridge?.ok) return 'claude-code'
  if (s.geminiKey) return 'gemini'
  if (s.apiKey) return 'anthropic'
  return 'mock'
}

export function isConnected(s: AISettings, active: AIProviderId, bridge: BridgeHealth | null): boolean {
  return active === 'claude-code' ? !!bridge?.ok : active === 'gemini' ? !!s.geminiKey : active === 'anthropic' ? !!s.apiKey : false
}

export const CLOUD_PIN_MESSAGE = 'Enter your bridge PIN in Settings → AI.'
export const CLOUD_SECRETS_MESSAGE = 'Add an AI key (OPENROUTER_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY) and COACH_BRIDGE_PIN as Worker secrets to enable AI here.'

/**
 * What the hosted Cloudflare Worker bridge needs next (worker/index.ts health contract):
 *   'secrets' — the server is not set up: no usable COACH_BRIDGE_PIN, or no API key secret (provider: null)
 *   'pin'     — the PIN is missing or wrong (HTTP 403, pinOk: false)
 *   'error'   — set up and unlocked, but not ok (upstream key rejected, rate-limited, too many wrong PINs…)
 *   'none'    — nothing answered at /api/ai/health
 * The Worker is optional: the main hosted path is a Gemini key typed into this device.
 */
export type CloudBridgeState = 'ok' | 'secrets' | 'pin' | 'error' | 'none'

export function cloudBridgeState(bridge: BridgeHealth | null): CloudBridgeState {
  if (!bridge) return 'none'
  if (bridge.ok) return 'ok'
  if (bridge.provider === null) return 'secrets'
  if (bridge.refused || bridge.pinOk === false) return 'pin'
  return 'error'
}

/** Status sentence for the Worker bridge. The Worker's own message is more precise than a canned line, so it wins. */
function describeCloud(s: AISettings, bridge: BridgeHealth | null): string {
  const state = cloudBridgeState(bridge)
  if (state === 'ok') {
    const label = bridgeProviderLabel(bridge?.provider)
    return `Connected to AI through your Cloudflare Worker${label ? ` (${label})` : ''}.`
  }
  if (state === 'secrets') return bridge?.message || CLOUD_SECRETS_MESSAGE
  // No PIN on this device yet → ask for it; a stored PIN that was refused → the Worker says what is wrong with it.
  if (state === 'pin') return s.bridgePin && bridge?.message ? bridge.message : CLOUD_PIN_MESSAGE
  if (state === 'error' && bridge?.message) return bridge.message
  return 'The AI bridge on your Cloudflare Worker is not answering. Check its secrets, then redeploy.'
}

export function describeAI(s: AISettings, active: AIProviderId, bridge: BridgeHealth | null, checking: boolean, host: BridgeHost): string {
  if (checking && active === 'mock') return 'Checking AI connection…'
  if (active === 'claude-code') {
    if (host === 'cloud') return describeCloud(s, bridge)
    if (bridge?.ok) return 'Connected to Claude through Claude Code on your Mac (your subscription).'
    if (bridge?.auth === 'signed_out') return bridge.message
    if (bridge && !bridge.installed) return 'Claude Code is not installed on the Mac that serves this app.'
    return bridge?.message ? bridge.message : 'The AI bridge on your Mac is not answering. Start the app server on your Mac.'
  }
  if (active === 'gemini') return s.geminiKey ? 'Connected to Gemini with your API key.' : 'Add a Gemini API key in Settings → AI to connect.'
  if (active === 'anthropic') return s.apiKey ? 'Connected with your Anthropic API key.' : 'Add an API key in Settings → AI to connect.'
  if (s.mode === 'mock') return 'On-device demo mode. Nothing leaves this phone; estimates are placeholders.'
  if (host === 'cloud') {
    // Hosted, Auto, nothing connected. A Worker that is set up only needs its PIN; otherwise the device key is the way in.
    const state = cloudBridgeState(bridge)
    return state === 'pin' || state === 'error' ? describeCloud(s, bridge) : 'AI is not connected yet. Add a Gemini API key in Settings → AI.'
  }
  if (bridge?.auth === 'signed_out') return bridge.message
  return 'AI is not connected yet. Sign in to Claude Code on your Mac, or add an API key in Settings → AI.'
}

/** The big state line in Settings → AI. Words and an icon carry the state; colour only reinforces it. */
export function aiStateLine(s: AIStatus): { line: string; tone: 'ok' | 'warn' | 'muted' } {
  if (s.checking && !s.connected) return { line: 'Checking…', tone: 'muted' }
  if (s.connected) {
    if (s.active === 'gemini') return { line: 'Connected · Gemini with your API key', tone: 'ok' }
    if (s.active === 'anthropic') return { line: 'Connected · API key', tone: 'ok' }
    if (s.host === 'cloud') return { line: `Connected · ${bridgeProviderLabel(s.bridge?.provider) || 'AI'} through your Cloudflare Worker`, tone: 'ok' }
    return { line: 'Connected · Claude through your Mac', tone: 'ok' }
  }
  if (s.mode === 'mock') return { line: 'Demo mode', tone: 'muted' }
  if (s.mode === 'anthropic') return { line: 'API key needed', tone: 'warn' }
  if (s.mode === 'gemini') return { line: 'Gemini API key needed', tone: 'warn' }
  if (s.host === 'cloud') {
    if (s.cloud === 'pin') return { line: 'Bridge PIN needed', tone: 'warn' }
    if (s.cloud === 'error') return { line: 'Your Worker is not connected', tone: 'warn' }
    // The Worker is optional, so a server without secrets is only a problem when the owner chose it.
    if (s.mode === 'claude-code') return { line: s.cloud === 'secrets' ? 'Worker secrets needed' : 'Your Worker is not answering', tone: 'warn' }
    return { line: 'Demo mode', tone: 'muted' }
  }
  if (s.bridge?.auth === 'signed_out') return { line: 'Sign in needed on your Mac', tone: 'warn' }
  if (s.mode === 'claude-code') return { line: 'Your Mac is not answering', tone: 'warn' }
  return { line: 'Demo mode', tone: 'muted' }
}

/** Who receives a request right now, in words. For consent and privacy copy. */
export function activeProviderLabel(s: Pick<AIStatus, 'active' | 'bridge' | 'host'>): string {
  if (s.active === 'gemini') return 'Google Gemini, with your API key'
  if (s.active === 'anthropic') return 'Claude, through the Anthropic API with your key'
  if (s.active === 'claude-code') {
    if (s.host !== 'cloud') return 'Claude, through Claude Code on your Mac (your subscription)'
    return `${bridgeProviderLabel(s.bridge?.provider) || 'AI'}, through your Cloudflare Worker`
  }
  return 'On-device demo (nothing is sent)'
}

// --- status store ------------------------------------------------------------------------------------

let bridge: BridgeHealth | null = null
let status: AIStatus = { mode: 'auto', active: 'mock', connected: false, checking: false, bridge: null, host: 'mac', cloud: 'none', message: 'Checking AI connection…' }
const listeners = new Set<() => void>()

function setStatus(next: AIStatus): void {
  status = next
  for (const l of listeners) l()
}

export function getAIStatus(): AIStatus { return status }

export function useAIStatus(): AIStatus {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    getAIStatus,
    getAIStatus,
  )
}

function configure(s: AISettings, checking: boolean): void {
  const active = resolveActive(s, bridge)
  const host = bridgeHostOf(bridge, typeof location === 'undefined' ? '' : location.hostname)
  configureAI({
    providerId: active,
    apiKey: s.apiKey || null,
    model: s.model || null,
    geminiKey: s.geminiKey || null,
    geminiModel: s.geminiModel || null,
    bridgeModel: s.bridgeModel || null,
    bridgePin: s.bridgePin || null,
    bridgeHost: host,
    bridgeUpstream: bridge?.provider ?? null,
    onLedger: (e) => { addLedgerEntry({ ...e, ts: nowIso() }) },
  })
  const cloud = host === 'cloud' ? cloudBridgeState(bridge) : 'none'
  setStatus({ mode: s.mode, active, connected: isConnected(s, active, bridge), checking, bridge, host, cloud, message: describeAI(s, active, bridge, checking, host) })
}

let probing: Promise<void> | null = null

/** Probes the bridge with the stored PIN (one tiny real call so sign-in, key and PIN problems surface) and reconfigures. */
export function refreshAI(): Promise<void> {
  if (probing) return probing
  const s = readAISettings()
  if (s.mode === 'mock' || s.mode === 'anthropic' || s.mode === 'gemini') { configure(s, false); return Promise.resolve() }
  configure(s, true)
  probing = probeBridge(true, s.bridgePin)
    .then((h) => { bridge = h })
    .catch(() => { bridge = null })
    .finally(() => { probing = null; configure(readAISettings(), false) })
  return probing
}

/**
 * Configures the AI gateway from settings right away, then checks the bridge in the background.
 * Every remote call the gateway makes is recorded in the privacy ledger (provider, data type, purpose, bytes, status).
 */
export function applyAISettings(): void {
  configure(readAISettings(), false)
  void refreshAI()
}
