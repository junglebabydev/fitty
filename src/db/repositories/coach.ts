import { db } from '../database'
import type { CoachDecision, CoachMessage, DecisionStatus } from '../../domain/types'
import { nowIso } from '../../lib/util'
import { mapDecision, mapMessage, type DecisionRow, type MessageRow } from './mappers'

// --- decisions ---------------------------------------------------------------

export function addDecision(d: Omit<CoachDecision, 'id'>): number {
  return db.run(
    `INSERT INTO coach_decisions (ts, kind, title, rationale, evidence_json, action_json, status, result_notes, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.ts, d.kind, d.title, d.rationale, JSON.stringify(d.evidence ?? []), JSON.stringify(d.action),
      d.status, d.resultNotes ?? '', d.decidedAt ?? null,
    ],
  )
}

export function getDecision(id: number): CoachDecision | null {
  const row = db.get<DecisionRow>('SELECT * FROM coach_decisions WHERE id = ?', [id])
  return row ? mapDecision(row) : null
}

/** Most recent first. */
export function getDecisions(limit = 20): CoachDecision[] {
  return db.all<DecisionRow>('SELECT * FROM coach_decisions ORDER BY ts DESC, id DESC LIMIT ?', [limit]).map(mapDecision)
}

/** Proposals awaiting Accept/Reject, most recent first. */
export function getPendingDecisions(): CoachDecision[] {
  return db.all<DecisionRow>(`SELECT * FROM coach_decisions WHERE status = 'proposed' ORDER BY ts DESC, id DESC`).map(mapDecision)
}

/** Records the outcome; decided_at is stamped now (cleared when moving back to 'proposed'). Omit resultNotes to keep existing notes. */
export function setDecisionStatus(id: number, status: DecisionStatus, resultNotes?: string): void {
  db.run(
    `UPDATE coach_decisions SET status = ?, result_notes = COALESCE(?, result_notes), decided_at = ? WHERE id = ?`,
    [status, resultNotes ?? null, status === 'proposed' ? null : nowIso(), id],
  )
}

// --- messages ----------------------------------------------------------------

export function addMessage(m: Omit<CoachMessage, 'id'>): number {
  return db.run(
    `INSERT INTO coach_messages (ts, role, content, evidence_json) VALUES (?, ?, ?, ?)`,
    [m.ts, m.role, m.content, JSON.stringify(m.evidence ?? [])],
  )
}

/** The last `limit` messages in chronological order. */
export function getMessages(limit = 50): CoachMessage[] {
  return db
    .all<MessageRow>(
      `SELECT * FROM (SELECT * FROM coach_messages ORDER BY ts DESC, id DESC LIMIT ?) ORDER BY ts ASC, id ASC`,
      [limit],
    )
    .map(mapMessage)
}

export function clearMessages(): void {
  db.run('DELETE FROM coach_messages')
}
