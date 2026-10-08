import { describe, expect, it } from 'vitest'
import { PROGRAM_LIST, getProgram } from '../../../data/programs'
import type { WorkoutSession } from '../../../domain/types'
import { screenResult } from '../../../engine'
import {
  countWord, flagNote, isRunJumpSeries, offersNoRun, outcomeLines, pathReason, planWeeks, rangeText, stopSignLines, tierWeekRows,
} from '../intro'

const running = getProgram('start-running')!
const gym = getProgram('gym-strength')!

function row(id: number, scheduledDate: string, templateKey: string, status: WorkoutSession['status'] = 'planned'): WorkoutSession {
  return {
    id, templateKey, name: 'x', type: 'strength', tier: 'minimum', scheduledDate, status, startedAt: null, completedAt: null,
    durationMin: null, readiness: null, sessionRpe: null, notes: '', exercises: [],
  }
}

describe('copy helpers', () => {
  it('spells small counts and ranges', () => {
    expect(countWord(7)).toBe('Seven')
    expect(countWord(10)).toBe('Ten')
    expect(countWord(14)).toBe('14')
    expect(rangeText([26, 40])).toBe('26–40')
    expect(rangeText([30, 30])).toBe('30')
  })
})

describe('planWeeks', () => {
  it('has every week of every series with at least one session', () => {
    for (const p of PROGRAM_LIST) {
      const weeks = planWeeks(p)
      expect(weeks.map((w) => w.week)).toEqual(Array.from({ length: p.weeks }, (_, i) => i + 1))
      for (const w of weeks) {
        expect(w.sessions.length, `${p.id} week ${w.week}`).toBeGreaterThan(0)
        expect(w.sessions.some((s) => s.altOnly)).toBe(false)
      }
    }
  })
})

describe('running/jumping series', () => {
  it('is decided by the data', () => {
    const result = Object.fromEntries(PROGRAM_LIST.map((p) => [p.id, isRunJumpSeries(p)]))
    expect(result['start-running']).toBe(true)
    expect(result.hiit).toBe(true)
    expect(result['gym-strength']).toBe(false)
    expect(result['home-dumbbells']).toBe(false)
    expect(result).toMatchInlineSnapshot(`
      {
        "bft": true,
        "blueprint": true,
        "bodyweight": false,
        "gym-strength": false,
        "hiit": true,
        "home-dumbbells": false,
        "postpartum": true,
        "start-running": true,
      }
    `)
  })

  it('offers "I\'d rather not run" only on a start outcome on standard or knee-checked, before the choice', () => {
    expect(offersNoRun(running, { kind: 'start', path: 'standard' }, false)).toBe(true)
    expect(offersNoRun(running, { kind: 'start', path: 'knee-checked' }, false)).toBe(true)
    expect(offersNoRun(running, { kind: 'start', path: 'standard' }, true)).toBe(false)
    expect(offersNoRun(running, { kind: 'start', path: 'bike-first' }, false)).toBe(false)
    expect(offersNoRun(running, { kind: 'wait', path: 'standard' }, false)).toBe(false)
    expect(offersNoRun(gym, { kind: 'start', path: 'standard' }, false)).toBe(false)
  })
})

describe('flags and outcome copy', () => {
  it('names the flags that pre-answer a question', () => {
    expect(flagNote(['knee_left', 'knee_right', 'hip'], ['knee_left', 'back_lower'])).toBe('Left knee')
    expect(flagNote(['knee_left'], ['back_lower'])).toBe('')
    expect(flagNote(undefined, ['knee_left'])).toBe('')
  })

  it('collects the path question copy and the notes for a start', () => {
    const answers = { walk_pain: true, running_injury: true }
    const r = screenResult(running, answers, [], false)
    expect(r.path).toBe('bike-first')
    const lines = outcomeLines(running, answers, [], r)
    expect(lines[0]).toMatch(/^Get this checked/)
    expect(lines).toContain(running.screen.find((q) => q.id === 'running_injury')!.yesCopy)
  })

  it('counts a profile flag as the answer that chose the path', () => {
    const r = screenResult(running, {}, ['knee_left'], false)
    expect(r.path).toBe('knee-checked')
    expect(outcomeLines(running, {}, ['knee_left'], r)).toEqual([running.screen.find((q) => q.id === 'knee_hip_flag')!.yesCopy])
  })
})

describe('pathReason', () => {
  it('is null on the standard path', () => {
    expect(pathReason(running, 'standard', {}, [], false)).toBeNull()
  })
  it('prefers an explicit answer, then the no-impact choice, then the flags', () => {
    expect(pathReason(running, 'bike-first', { walk_pain: true }, [], false)).toMatch(/^Get this checked/)
    expect(pathReason(running, 'walk-first', {}, ['knee_left'], true)).toBe('You chose not to run or jump.')
    expect(pathReason(running, 'knee-checked', {}, ['knee_left'], false)).toBe('From your profile: Left knee.')
    expect(pathReason(gym, 'back', {}, ['back_lower'], false)).toBe('From your profile: Lower back.')
    expect(pathReason(running, 'knee-checked', {}, ['shoulder', 'knee_left'], false)).toBe('From your profile: Left knee.')
  })
})

describe('tierWeekRows', () => {
  // 2026-10-07 is a Wednesday; the week runs to Sunday 2026-10-11 whatever day startOfWeek picks.
  const today = '2026-10-07'
  it('matches what enrollInProgram replaces: planned, not programme or workout rows, today to week end', () => {
    const rows = [
      row(1, '2026-10-06', 'push'),                  // yesterday: kept
      row(2, '2026-10-07', 'push'),                  // today: replaced
      row(3, '2026-10-08', 'pull', 'completed'),     // done: kept
      row(4, '2026-10-08', 'prog:hiit:w1d1'),        // programme row: kept
      row(5, '2026-10-09', 'work:hiit:w1d1'),        // standalone workout: kept
      row(6, '2026-10-30', 'legs'),                  // next month: kept
    ]
    expect(tierWeekRows(rows, today).map((r) => r.id)).toEqual([2])
  })
})

describe('stopSignLines', () => {
  it('never shows engine notes or placeholders, in any series', () => {
    for (const p of PROGRAM_LIST) {
      const lines = stopSignLines(p)
      expect(lines.length, p.id).toBeGreaterThan(0)
      for (const l of lines) {
        expect(l.sign).toBeTruthy()
        if (l.advice) expect(l.advice, `${p.id}: ${l.advice}`).not.toMatch(/\b[RPEG]\d+[a-z]?\b|\bshow\b|gate|symptomGate|\{emergency\}|\bthe app\b/i)
      }
    }
  })
  it('keeps the advice whenever the action sends the user to a doctor or emergency care', () => {
    for (const p of PROGRAM_LIST) {
      const lines = stopSignLines(p)
      for (const s of p.stopSigns) {
        if (!/doctor|medical|clinician|995|A&E|emergency/i.test(s.action)) continue
        expect(lines.find((l) => l.sign === s.sign)?.advice, `${p.id}: ${s.sign}`).toBeTruthy()
      }
    }
  })
  it('uses the quoted line, and drops "Not a stop sign" rows', () => {
    const first = stopSignLines(running)[0]
    expect(first.advice).toBe('Stop now and sit down. If it does not settle within a few minutes, call emergency services.')
    expect(stopSignLines(gym).some((l) => /soreness/i.test(l.sign))).toBe(false)
  })
})
