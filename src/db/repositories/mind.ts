// Mind pillar: mood check-ins, breathing / wind-down sessions and the local-only journal.
// Journal text never leaves this device: nothing in the coach facts or the AI gateway reads journal_entries.
import { db } from '../database'
import type { JournalEntry, MindSession, MoodLog } from '../../domain/types'
import { updateById, type ColumnMap } from './common'
import { dayRange, mapJournal, mapMindSession, mapMood, sinceIso, type JournalRow, type MindSessionRow, type MoodRow } from './mappers'

// --- mood ---------------------------------------------------------------------

export function addMoodLog(m: Omit<MoodLog, 'id'>): number {
  return db.run(
    `INSERT INTO mood_logs (ts, kind, valence, labels_json, contexts_json, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [m.ts, m.kind, Math.max(-3, Math.min(3, Math.round(m.valence))), JSON.stringify(m.labels ?? []), JSON.stringify(m.contexts ?? []), m.note ?? ''],
  )
}

/** Logs from the last `days` calendar days (today inclusive), ascending by ts. */
export function getMoodLogs(days: number): MoodLog[] {
  return db.all<MoodRow>('SELECT * FROM mood_logs WHERE ts >= ? ORDER BY ts ASC, id ASC', [sinceIso(days)]).map(mapMood)
}

/** Logs on one local calendar date, ascending by ts. */
export function moodLogsForDate(date: string): MoodLog[] {
  const [start, end] = dayRange(date)
  return db.all<MoodRow>('SELECT * FROM mood_logs WHERE ts >= ? AND ts < ? ORDER BY ts ASC, id ASC', [start, end]).map(mapMood)
}

export function latestMoodLog(): MoodLog | null {
  const row = db.get<MoodRow>('SELECT * FROM mood_logs ORDER BY ts DESC, id DESC LIMIT 1')
  return row ? mapMood(row) : null
}

export function deleteMoodLog(id: number): void {
  db.run('DELETE FROM mood_logs WHERE id = ?', [id])
}

// --- breathing / wind-down sessions ------------------------------------------------

export function addMindSession(s: Omit<MindSession, 'id'>): number {
  return db.run(
    `INSERT INTO mind_sessions (ts, kind, technique, duration_sec, completed, valence_before, valence_after) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [s.ts, s.kind, s.technique, Math.max(0, Math.round(s.durationSec)), s.completed ? 1 : 0, s.valenceBefore ?? null, s.valenceAfter ?? null],
  )
}

/** Sessions from the last `days` calendar days (today inclusive), ascending by ts. */
export function getMindSessions(days: number): MindSession[] {
  return db.all<MindSessionRow>('SELECT * FROM mind_sessions WHERE ts >= ? ORDER BY ts ASC, id ASC', [sinceIso(days)]).map(mapMindSession)
}

/** Whole minutes of mind sessions between two local dates, both inclusive ('YYYY-MM-DD'). Time spent counts even if a session ended early. */
export function mindfulMinutes(from: string, to: string): number {
  const start = dayRange(from)[0]
  const end = dayRange(to)[1]
  const row = db.get<{ sec: number | null }>('SELECT SUM(duration_sec) AS sec FROM mind_sessions WHERE ts >= ? AND ts < ?', [start, end])
  return Math.round((row?.sec ?? 0) / 60)
}

// --- journal ------------------------------------------------------------------------

export function addJournalEntry(e: Omit<JournalEntry, 'id'>): number {
  return db.run(
    `INSERT INTO journal_entries (ts, prompt_id, prompt, text, tags_json) VALUES (?, ?, ?, ?, ?)`,
    [e.ts, e.promptId ?? '', e.prompt ?? '', e.text ?? '', JSON.stringify(e.tags ?? [])],
  )
}

const JOURNAL_COLUMNS: ColumnMap<Omit<JournalEntry, 'id'>> = {
  ts: 'ts',
  promptId: 'prompt_id',
  prompt: 'prompt',
  text: 'text',
  tags: 'tags_json',
}

export function updateJournalEntry(id: number, patch: Partial<Omit<JournalEntry, 'id'>>): void {
  updateById('journal_entries', JOURNAL_COLUMNS, id, patch)
}

export function deleteJournalEntry(id: number): void {
  db.run('DELETE FROM journal_entries WHERE id = ?', [id])
}

/** Newest first. */
export function getJournalEntries(limit = 50): JournalEntry[] {
  return db.all<JournalRow>('SELECT * FROM journal_entries ORDER BY ts DESC, id DESC LIMIT ?', [Math.max(1, Math.floor(limit))]).map(mapJournal)
}
