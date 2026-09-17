// Wires the AI gateway to the persisted `ai.*` settings, the privacy ledger and the local Claude bridge.
// Called once at boot (App.tsx) and again by Settings after any ai.* change.
//
// ai.mode:
//   'auto' (default)  → Claude through Claude Code on the Mac when the bridge answers, else the API key, else on-device demo
//   'claude-code'     → always the bridge (Claude subscription via the Mac)
//   'anthropic'       → always the API key
//   'mock'            → on-device demo estimates only, nothing leaves the phone
import { useSyncExternalStore } from 'react'
import { configureAI, probeBridge, type AIProviderId, type BridgeHealth } from '../../ai'
import { addLedgerEntry, getSetting } from '../../db/repositories'
import { nowIso } from '../../lib/util'

export type AIMode = 'auto' | 'claude-code' | 'anthropic' | 'mock'

export interface AISettings {
  mode: AIMode
  /** Provider the legacy UI reads; mirrors the active provider for explicit modes. */
  providerId: AIProviderId
  /** Trimmed key, '' when unset. Never leaves the device except inside the provider's own request. */
  apiKey: string
  /** '' means the provider default (DEFAULT_ANTHROPIC_MODEL). */
  model: string
  /** Claude Code model alias for the bridge: '' | sonnet | opus | haiku | default. */
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
    rawMode === 'claude-code' || rawMode === 'anthropic' || rawMode === 'mock' || rawMode === 'auto' ? rawMode
    : legacy === 'anthropic' ? 'anthropic'
    : 'auto'
  return {
    mode,
    providerId: mode === 'anthropic' ? 'anthropic' : mode === 'claude-code' ? 'claude-code' : 'mock',
    apiKey: str(getSetting<unknown>('ai.apiKey', '')),
    model: str(getSetting<unknown>('ai.model', '')),
    bridgeModel: str(getSetting<unknown>('ai.bridgeModel', '')),
    bridgePin: str(getSetting<unknown>('ai.bridgePin', '')),
  }
}

// --- status store ------------------------------------------------------------------------------------

let bridge: BridgeHealth | null = null
let status: AIStatus = { mode: 'auto', active: 'mock', connected: false, checking: false, bridge: null, message: 'Checking AI connection…' }
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

function resolveActive(s: AISettings): AIProviderId {
  if (s.mode === 'mock') return 'mock'
  if (s.mode === 'anthropic') return 'anthropic'
  if (s.mode === 'claude-code') return 'claude-code'
  if (bridge?.ok) return 'claude-code'
  if (s.apiKey) return 'anthropic'
  return 'mock'
}

function describe(s: AISettings, active: AIProviderId, checking: boolean): string {
  if (checking && active === 'mock') return 'Checking AI connection…'
  if (active === 'claude-code') {
    if (bridge?.ok) return 'Connected to Claude through Claude Code on your Mac (your subscription).'
    if (bridge?.auth === 'signed_out') return bridge.message
    if (bridge && !bridge.installed) return 'Claude Code is not installed on the Mac that serves this app.'
    return bridge ? bridge.message : 'The AI bridge on your Mac is not answering. Start the app server on your Mac.'
  }
  if (active === 'anthropic') return s.apiKey ? 'Connected with your Anthropic API key.' : 'Add an API key in Settings → AI to connect.'
  if (s.mode === 'mock') return 'On-device demo mode. Nothing leaves this phone; estimates are placeholders.'
  if (bridge?.auth === 'signed_out') return bridge.message
  return 'AI is not connected yet. Sign in to Claude Code on your Mac, or add an API key in Settings → AI.'
}

function configure(s: AISettings, checking: boolean): void {
  const active = resolveActive(s)
  configureAI({
    providerId: active,
    apiKey: s.apiKey || null,
    model: s.model || null,
    bridgeModel: s.bridgeModel || null,
    bridgePin: s.bridgePin || null,
    onLedger: (e) => { addLedgerEntry({ ...e, ts: nowIso() }) },
  })
  const connected = active === 'claude-code' ? !!bridge?.ok : active === 'anthropic' ? !!s.apiKey : false
  setStatus({ mode: s.mode, active, connected, checking, bridge, message: describe(s, active, checking) })
}

let probing: Promise<void> | null = null

/** Probes the Mac bridge (one tiny real call so sign-in problems surface) and reconfigures. */
export function refreshAI(): Promise<void> {
  if (probing) return probing
  const s = readAISettings()
  if (s.mode === 'mock' || s.mode === 'anthropic') { configure(s, false); return Promise.resolve() }
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
