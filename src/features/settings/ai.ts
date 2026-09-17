// AI-service settings helpers: masking, live reconfiguration and the
// "Test connection" probe (which records itself in the privacy ledger).
import { AI_ERROR_MESSAGES, AIError, getProvider, isAIError, isOnline, type AIErrorKind, type ChatTurn } from '../../ai'
import { addLedgerEntry } from '../../db/repositories'
import { nowIso } from '../../lib/util'
import { applyAISettings } from '../ai/config'
import { writeAISettings, type AISettings } from './keys'

export function maskApiKey(key: string): string {
  const k = key.trim()
  if (!k) return 'Not set'
  if (k.length <= 12) return '•'.repeat(Math.max(4, k.length))
  return `${k.slice(0, 7)}…${k.slice(-4)}`
}

/** Persist AI settings and reconfigure the gateway so the next call uses them. */
export function saveAISettings(patch: Partial<AISettings>): void {
  writeAISettings(patch)
  applyAISettings()
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  kind?: AIErrorKind
}

const TEST_SYSTEM = 'You are a connection test for a fitness app. Reply with exactly one word: ready.'
const TEST_TURNS: ChatTurn[] = [{ role: 'user', content: 'Reply with one word: ready' }]

/**
 * Sends a one-word prompt through the configured provider. Goes to the
 * provider directly (not the coach chat wrapper) so the ledger purpose is
 * honest: nothing but the test prompt leaves the device.
 */
export async function testConnection(): Promise<ConnectionTestResult> {
  applyAISettings()
  const p = getProvider()
  const bytes = JSON.stringify({ system: TEST_SYSTEM, turns: TEST_TURNS }).length
  const base = { ts: nowIso(), provider: p.id, dataType: 'coach_context', purpose: 'Connection test (one-word prompt, no personal data)', bytes } as const

  if (p.id === 'mock') {
    const reply = await p.coachChat(TEST_SYSTEM, TEST_TURNS)
    addLedgerEntry({ ...base, status: 'local_only' })
    return { ok: true, message: `${p.name} answered locally: "${trimReply(reply)}"` }
  }
  if (!p.isConfigured()) return { ok: false, message: AI_ERROR_MESSAGES.not_configured, kind: 'not_configured' }
  if (!isOnline()) return { ok: false, message: AI_ERROR_MESSAGES.offline, kind: 'offline' }

  try {
    const reply = await p.coachChat(TEST_SYSTEM, TEST_TURNS)
    addLedgerEntry({ ...base, status: 'sent' })
    return { ok: true, message: `${p.name} replied: "${trimReply(reply)}"` }
  } catch (e) {
    addLedgerEntry({ ...base, status: 'failed' })
    const err = isAIError(e) ? e : new AIError('unknown', e instanceof Error && e.message ? e.message : undefined, e)
    return { ok: false, message: err.message, kind: err.kind }
  }
}

function trimReply(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 80 ? `${t.slice(0, 77)}…` : t
}
