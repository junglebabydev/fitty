import { db } from '../database'
import type { VoiceCommandRecord } from '../../domain/types'
import { addDays, isoAt, todayStr } from '../../lib/util'
import { changes, updateById, type ColumnMap } from './common'
import { mapVoice, type VoiceRow } from './mappers'

const VOICE_COLS: ColumnMap<Omit<VoiceCommandRecord, 'id'>> = {
  ts: 'ts', transcript: 'transcript', intent: 'intent', payload: 'payload_json', status: 'status',
}

export function addVoiceCommand(v: Omit<VoiceCommandRecord, 'id'>): number {
  return db.run(
    `INSERT INTO voice_commands (ts, transcript, intent, payload_json, status) VALUES (?, ?, ?, ?, ?)`,
    [v.ts, v.transcript, v.intent, JSON.stringify(v.payload ?? {}), v.status],
  )
}

export function updateVoiceCommand(id: number, patch: Partial<VoiceCommandRecord>): void {
  updateById('voice_commands', VOICE_COLS, id, patch)
}

/** Most recent first. */
export function getVoiceCommands(limit = 30): VoiceCommandRecord[] {
  return db.all<VoiceRow>('SELECT * FROM voice_commands ORDER BY ts DESC, id DESC LIMIT ?', [limit]).map(mapVoice)
}

/** Deletes commands older than `retentionDays` calendar days. Returns the number removed. */
export function pruneVoiceCommands(retentionDays: number): number {
  const cutoff = isoAt(addDays(todayStr(), -Math.max(0, Math.floor(retentionDays))), 0)
  db.run('DELETE FROM voice_commands WHERE ts < ?', [cutoff])
  return changes()
}

export function clearVoiceCommands(): void {
  db.run('DELETE FROM voice_commands')
}
