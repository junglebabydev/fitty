// Mind repositories and the demo seed through the real sql.js engine (node loader), like database.test.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { addDays, isoAt, todayStr } from '../../../lib/util'
import { db } from '../../database'
import {
  addJournalEntry, addMindSession, addMoodLog, deleteJournalEntry, deleteMoodLog, getJournalEntries, getMindSessions,
  getMoodLogs, getSetting, latestMoodLog, mindfulMinutes, moodLogsForDate, setSetting, tableCounts, updateJournalEntry,
} from '..'
import { MIND_DEMO_SETTING, SEED_MOOD_VALENCE, mindSeries, reseed, seedIfEmpty } from '../../seed'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const TODAY = todayStr()

beforeAll(async () => {
  await db.init()
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('mind repositories', () => {
  it('round-trips mood logs, ascending, with per-date and latest lookups', () => {
    const a = addMoodLog({ ts: isoAt(addDays(TODAY, -2), 21), kind: 'daily', valence: 2, labels: ['Proud'], contexts: ['Training'], note: 'good one' })
    const b = addMoodLog({ ts: isoAt(TODAY, 8), kind: 'momentary', valence: -1, labels: [], contexts: ['Sleep'], note: '' })
    addMoodLog({ ts: isoAt(addDays(TODAY, -40), 8), kind: 'daily', valence: 9, labels: [], contexts: [], note: '' })
    const logs = getMoodLogs(14)
    expect(logs.map((l) => l.id)).toEqual([a, b])
    expect(logs[0]).toEqual({ id: a, ts: isoAt(addDays(TODAY, -2), 21), kind: 'daily', valence: 2, labels: ['Proud'], contexts: ['Training'], note: 'good one' })
    expect(moodLogsForDate(TODAY).map((l) => l.id)).toEqual([b])
    expect(latestMoodLog()?.id).toBe(b)
    expect(getMoodLogs(60)[0].valence).toBe(3) // clamped to -3..3
    deleteMoodLog(b)
    expect(moodLogsForDate(TODAY)).toEqual([])
  })

  it('sums mindful minutes over an inclusive date range', () => {
    addMindSession({ ts: isoAt(TODAY, 7), kind: 'breathing', technique: 'box', durationSec: 180, completed: true, valenceBefore: -1, valenceAfter: 0 })
    addMindSession({ ts: isoAt(TODAY, 22), kind: 'breathing', technique: '478', durationSec: 76, completed: false, valenceBefore: null, valenceAfter: null })
    addMindSession({ ts: isoAt(addDays(TODAY, -3), 22), kind: 'winddown', technique: '', durationSec: 300, completed: true, valenceBefore: null, valenceAfter: null })
    expect(mindfulMinutes(TODAY, TODAY)).toBe(4) // 256 s
    expect(mindfulMinutes(addDays(TODAY, -6), TODAY)).toBe(9)
    expect(mindfulMinutes(addDays(TODAY, -10), addDays(TODAY, -5))).toBe(0)
    const sessions = getMindSessions(7)
    expect(sessions.map((s) => s.technique)).toEqual(['', 'box', '478'])
    expect(sessions[1]).toMatchObject({ completed: true, valenceBefore: -1, valenceAfter: 0 })
    expect(sessions[2].completed).toBe(false)
  })

  it('journal: newest first, patch and delete', () => {
    const a = addJournalEntry({ ts: isoAt(addDays(TODAY, -1), 21), promptId: 'win_today', prompt: 'What went right today?', text: 'first', tags: ['win'] })
    const b = addJournalEntry({ ts: isoAt(TODAY, 9), promptId: '', prompt: '', text: 'second', tags: [] })
    expect(getJournalEntries().map((e) => e.id)).toEqual([b, a])
    expect(getJournalEntries(1).map((e) => e.id)).toEqual([b])
    updateJournalEntry(a, { text: 'edited', tags: ['win', 'gym'] })
    expect(getJournalEntries().find((e) => e.id === a)).toMatchObject({ text: 'edited', tags: ['win', 'gym'], promptId: 'win_today' })
    deleteJournalEntry(b)
    expect(getJournalEntries().map((e) => e.id)).toEqual([a])
  })
})

describe('mind demo seed', () => {
  it('mindSeries: 8 days of moods with one -1 today, 3 breathing sessions, 2 journal entries', () => {
    const m = mindSeries(TODAY)
    expect(m.moods).toHaveLength(8)
    expect(m.moods.map((x) => x.valence)).toEqual(SEED_MOOD_VALENCE)
    expect(m.moods.filter((x) => x.valence < 0)).toHaveLength(1)
    expect(m.moods[7].valence).toBe(-1)
    expect(m.moods[7].ts).toBe(isoAt(TODAY, 7, 25))
    expect(m.moods[0].ts).toBe(isoAt(addDays(TODAY, -7), 21, 40))
    expect(m.sessions).toHaveLength(3)
    expect(m.sessions.every((s) => s.kind === 'breathing')).toBe(true)
    expect(m.journal).toHaveLength(2)
  })

  it('reseed writes the mind rows once and seedIfEmpty does not duplicate them', async () => {
    await reseed()
    expect(getSetting(MIND_DEMO_SETTING, false)).toBe(true)
    const counts = () => { const c = tableCounts(); return [c.mood_logs, c.mind_sessions, c.journal_entries] }
    expect(counts()).toEqual([8, 3, 2])
    await seedIfEmpty()
    await seedIfEmpty()
    expect(counts()).toEqual([8, 3, 2])
  })

  it('tops up a demo database seeded before the Mind pillar exactly once', async () => {
    for (const t of ['mood_logs', 'mind_sessions', 'journal_entries']) db.run(`DELETE FROM ${t}`)
    db.run('DELETE FROM settings WHERE key = ?', [MIND_DEMO_SETTING])
    await seedIfEmpty()
    const c = tableCounts()
    expect([c.mood_logs, c.mind_sessions, c.journal_entries]).toEqual([8, 3, 2])
    expect(getSetting(MIND_DEMO_SETTING, false)).toBe(true)
    db.run('DELETE FROM mood_logs')
    await seedIfEmpty()
    expect(tableCounts().mood_logs).toBe(0) // the marker makes it one-time
  })

  it('does not top up when seed.skipDemo is set, or over mind data the user already has', async () => {
    db.run('DELETE FROM settings WHERE key = ?', [MIND_DEMO_SETTING])
    setSetting('seed.skipDemo', true)
    await seedIfEmpty()
    expect(tableCounts().mood_logs).toBe(0)
    expect(getSetting(MIND_DEMO_SETTING, false)).toBe(false)

    db.run('DELETE FROM settings WHERE key = ?', ['seed.skipDemo'])
    addMoodLog({ ts: isoAt(TODAY, 8), kind: 'momentary', valence: 1, labels: [], contexts: [], note: '' })
    await seedIfEmpty()
    expect(tableCounts().mood_logs).toBe(1)
    expect(getSetting(MIND_DEMO_SETTING, false)).toBe(true)
  })
})
