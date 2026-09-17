import { db } from '../database'
import type { LedgerEntry } from '../../domain/types'
import { mapLedger, type LedgerRow } from './mappers'

export function addLedgerEntry(e: Omit<LedgerEntry, 'id'>): number {
  return db.run(
    `INSERT INTO privacy_ledger (ts, provider, data_type, purpose, bytes, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [e.ts, e.provider, e.dataType, e.purpose, e.bytes ?? 0, e.status],
  )
}

/** Most recent first. */
export function getLedger(limit = 50): LedgerEntry[] {
  return db.all<LedgerRow>('SELECT * FROM privacy_ledger ORDER BY ts DESC, id DESC LIMIT ?', [limit]).map(mapLedger)
}

export function clearLedger(): void {
  db.run('DELETE FROM privacy_ledger')
}
