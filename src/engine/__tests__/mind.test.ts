import { describe, expect, it } from 'vitest'
import type { MindSession, MoodLog, SleepRecord } from '../../domain/types'
import { addDays, isoAt } from '../../lib/util'
import { computeDailyPriority, answerLocally, type CoachFacts } from '../coach'
import {
  BREATHING_TECHNIQUES, INSIGHT_CAVEAT, JOURNAL_KIND_LABELS, JOURNAL_PROMPTS, MOOD_CONTEXTS, MOOD_LABELS, VALENCE_WORDS,
  breathingTechnique, cycleSeconds, labelsForValence, mindInsights, moodSummary, promptForDate, suggestContexts,
  suggestTechnique, supportSignal,
} from '../mind'
import { computeReadiness } from '../readiness'
import { evaluateSymptomGate } from '../symptomGate'
import { TARGET, TODAY, WEEK_START, checkIn, session, sym } from './fixtures'

// Words that would turn an observation into a label. None of the engine's strings may contain them.
const CLINICAL = /\b(depress\w*|anxiety|disorder|diagnos\w*|clinical|symptom\w*|therapy|therapist|treatment|patient|illness|condition|PHQ|GAD)\b/i

let moodId = 1
function mood(date: string, valence: number, hh = 21): MoodLog {
  return { id: moodId++, ts: isoAt(date, hh), kind: 'daily', valence, labels: [], contexts: [], note: '' }
}
const d = (n: number) => addDays(TODAY, -n)

describe('vocabulary', () => {
  it('names all seven valence stops', () => {
    expect(VALENCE_WORDS[-3]).toBe('Very unpleasant')
    expect(VALENCE_WORDS[0]).toBe('Neutral')
    expect(VALENCE_WORDS[3]).toBe('Very pleasant')
    expect(Object.keys(VALENCE_WORDS)).toHaveLength(7)
  })

  it('offers at most 8 feeling chips per band, filtered by valence', () => {
    for (const band of ['low', 'neutral', 'high'] as const) {
      expect(MOOD_LABELS[band].length).toBeGreaterThan(0)
      expect(MOOD_LABELS[band].length).toBeLessThanOrEqual(8)
    }
    expect(labelsForValence(-3)).toBe(MOOD_LABELS.low)
    expect(labelsForValence(-1)).toBe(MOOD_LABELS.low)
    expect(labelsForValence(0)).toBe(MOOD_LABELS.neutral)
    expect(labelsForValence(2)).toBe(MOOD_LABELS.high)
  })

  it('pre-selects contexts from app data, always from the known list', () => {
    expect(MOOD_CONTEXTS).toEqual(expect.arrayContaining(['Work', 'Family', 'Health', 'Sleep', 'Training', 'Food', 'Money', 'Social', 'Weather']))
    expect(suggestContexts({ trainedToday: false, sleepMin: null, painToday: false })).toEqual([])
    expect(suggestContexts({ trainedToday: true, sleepMin: 370, painToday: true })).toEqual(['Sleep', 'Training', 'Health'])
    expect(suggestContexts({ trainedToday: false, sleepMin: 450, painToday: false })).toEqual([])
    for (const c of suggestContexts({ trainedToday: true, sleepMin: 300, painToday: true })) expect(MOOD_CONTEXTS).toContain(c)
  })
})

describe('BREATHING_TECHNIQUES', () => {
  const phases = (id: string) => breathingTechnique(id)!.phases.map((p) => [p.phase, p.seconds])

  it('has exactly the four presets with the specified timings', () => {
    expect(BREATHING_TECHNIQUES.map((t) => t.id)).toEqual(['box', '478', 'sigh', 'coherent'])
    expect(phases('box')).toEqual([['inhale', 4], ['hold', 4], ['exhale', 4], ['hold', 4]])
    expect(phases('478')).toEqual([['inhale', 4], ['hold', 7], ['exhale', 8]])
    expect(breathingTechnique('478')!.maxCycles).toBe(4)
    expect(phases('sigh')).toEqual([['inhale', 2], ['inhale', 1], ['exhale', 6]])
    expect(phases('coherent')).toEqual([['inhale', 5.5], ['exhale', 5.5]])
    expect(breathingTechnique('box')!.maxCycles).toBeUndefined()
    expect(cycleSeconds(breathingTechnique('478')!)).toBe(19)
    expect(breathingTechnique('nope')).toBeNull()
  })

  it('every phase has a label and every technique a name, purpose and note', () => {
    for (const t of BREATHING_TECHNIQUES) {
      expect(t.name && t.purpose && t.note).toBeTruthy()
      for (const p of t.phases) expect(p.label).toBeTruthy()
      expect(`${t.name} ${t.purpose} ${t.note}`).not.toMatch(CLINICAL)
    }
  })
})

describe('suggestTechnique', () => {
  const base = { stress: null, valence: null, hourNow: 12, sleepLastNightMin: 430 }
  it('picks by time of day, stress, mood and sleep', () => {
    expect(suggestTechnique({ ...base, hourNow: 22, stress: 9 }).techniqueId).toBe('478')
    expect(suggestTechnique({ ...base, stress: 8 }).techniqueId).toBe('sigh')
    expect(suggestTechnique({ ...base, valence: -2 }).techniqueId).toBe('coherent')
    expect(suggestTechnique({ ...base, sleepLastNightMin: 320 }).techniqueId).toBe('box')
    expect(suggestTechnique(base).techniqueId).toBe('coherent')
  })
  it('always returns a known technique and a plain reason', () => {
    for (const hourNow of [3, 9, 15, 23]) for (const stress of [null, 2, 9]) for (const valence of [null, -3, 2]) {
      const pick = suggestTechnique({ stress, valence, hourNow, sleepLastNightMin: null })
      expect(breathingTechnique(pick.techniqueId)).not.toBeNull()
      expect(pick.why).not.toMatch(CLINICAL)
    }
  })
})

describe('journal prompts', () => {
  it('has at least 12 prompts across the four kinds with unique ids', () => {
    expect(JOURNAL_PROMPTS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(JOURNAL_PROMPTS.map((p) => p.id)).size).toBe(JOURNAL_PROMPTS.length)
    for (const kind of ['gratitude', 'win', 'reflection', 'reframe'] as const) {
      expect(JOURNAL_PROMPTS.filter((p) => p.kind === kind).length).toBeGreaterThanOrEqual(3)
    }
  })
  it('labels reframes as a thinking tool and stays non-clinical', () => {
    expect(JOURNAL_KIND_LABELS.reframe).toBe('Thinking tool')
    for (const p of JOURNAL_PROMPTS) {
      if (p.kind === 'reframe') expect(p.text).toMatch(/^Thinking tool:/)
      expect(p.text).not.toMatch(CLINICAL)
    }
  })
  it('promptForDate is deterministic and changes from day to day', () => {
    expect(promptForDate(TODAY)).toEqual(promptForDate(TODAY))
    expect(promptForDate(TODAY).id).not.toBe(promptForDate(addDays(TODAY, 1)).id)
    expect(JOURNAL_PROMPTS).toContain(promptForDate('2019-03-02'))
  })
})

describe('moodSummary', () => {
  it('is empty without logs', () => {
    expect(moodSummary([], TODAY)).toEqual({ todayValence: null, avg7: null, prevAvg7: null, trend: null, daysCheckedIn7: 0 })
  })
  it('uses the latest log today and daily means for the averages', () => {
    const logs = [mood(TODAY, -1, 8), mood(TODAY, 1, 20), mood(d(1), 2), mood(d(2), 1), mood(d(8), -1), mood(d(9), -1)]
    const s = moodSummary(logs, TODAY)
    expect(s.todayValence).toBe(1)
    expect(s.daysCheckedIn7).toBe(3)
    expect(s.avg7).toBe(1) // (0 + 2 + 1) / 3
    expect(s.prevAvg7).toBe(-1)
    expect(s.trend).toBe('up')
  })
  it('reports flat and down, and no trend without a previous week', () => {
    expect(moodSummary([mood(d(1), 1), mood(d(8), 1)], TODAY).trend).toBe('flat')
    expect(moodSummary([mood(d(1), -1), mood(d(8), 1)], TODAY).trend).toBe('down')
    expect(moodSummary([mood(d(1), 1)], TODAY).trend).toBeNull()
  })
})

describe('mindInsights', () => {
  let sid = 1
  const night = (date: string, durationMin: number): SleepRecord => ({ id: sid++, startTs: isoAt(date, 0), endTs: isoAt(date, 7), durationMin, source: 'manual', quality: null })
  const breath = (date: string): MindSession => ({ id: sid++, ts: isoAt(date, 18), kind: 'breathing', technique: 'box', durationSec: 180, completed: true, valenceBefore: null, valenceAfter: null })

  it('stays silent below 5 days with and 5 days without the factor', () => {
    const moods = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mood(d(n), n <= 4 ? 2 : 0))
    const sleep = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => night(d(n), n <= 4 ? 450 : 360))
    expect(mindInsights({ moods, sleep, sessions: [], mindSessions: [], today: TODAY })).toEqual([])
  })

  it('emits the sleep insight with both averages, both n and the caveat', () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const moods = days.map((n) => mood(d(n), n <= 5 ? 2 : 0))
    const sleep = days.map((n) => night(d(n), n <= 5 ? 450 : 360))
    const out = mindInsights({ moods, sleep, sessions: [], mindSessions: [], today: TODAY })
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'sleep_7h',
      text: 'On days when you slept 7 h or more the night before, your mood tends to be higher.',
      withAvg: 2, withoutAvg: 0, nWith: 5, nWithout: 5, caveat: INSIGHT_CAVEAT,
    })
    expect(out[0].caveat).toBe('Other factors can influence this.')
  })

  it('covers training and breathing days, says "lower" when it is lower, and skips differences too small to call', () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    const trainedDays = new Set([1, 3, 5, 7, 9, 11])
    const breathDays = new Set([1, 2, 3, 4, 5, 6])
    const moods = days.map((n) => mood(d(n), trainedDays.has(n) ? 2 : 1))
    const sessions = [...trainedDays].map((n) => session('upper_a', d(n), 'completed'))
    const out = mindInsights({ moods, sleep: [], sessions, mindSessions: [...breathDays].map((n) => breath(d(n))), today: TODAY })
    expect(out.map((i) => i.id)).toEqual(['trained']) // breathing split is 1.5 vs 1.5
    expect(out[0].text).toBe('On days when you trained, your mood tends to be higher.')
    expect([out[0].nWith, out[0].nWithout]).toEqual([6, 6])

    const lower = mindInsights({ moods: days.map((n) => mood(d(n), breathDays.has(n) ? -1 : 1)), sleep: [], sessions: [], mindSessions: [...breathDays].map((n) => breath(d(n))), today: TODAY })
    expect(lower.map((i) => i.id)).toEqual(['breathing'])
    expect(lower[0].text).toBe('On days when you did a breathing session, your mood tends to be lower.')
  })

  it('ignores planned sessions and leaves today out of the trained factor', () => {
    const days = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const moods = days.map((n) => mood(d(n), n < 5 ? 2 : 0))
    const sessions = days.filter((n) => n < 5).map((n) => session('upper_a', d(n), 'completed'))
    // today is excluded, so only 4 trained days remain: no insight
    expect(mindInsights({ moods, sleep: [], sessions, mindSessions: [], today: TODAY })).toEqual([])
    expect(mindInsights({ moods, sleep: [], sessions: days.map((n) => session('upper_a', d(n), 'planned')), mindSessions: [], today: TODAY })).toEqual([])
  })
})

describe('supportSignal', () => {
  it('is quiet for ordinary weeks', () => {
    expect(supportSignal([], TODAY)).toEqual({ show: false, message: '' })
    expect(supportSignal([mood(d(0), -2), mood(d(1), -3), mood(d(2), -2), mood(d(3), -1)], TODAY).show).toBe(false)
  })
  it('fires at 4 low days in 7 with an observation plus an option', () => {
    const logs = [0, 1, 2, 3, 4].map((n) => mood(d(n), -2))
    expect(supportSignal(logs, TODAY)).toEqual({ show: true, message: 'Low mood on 5 of the last 7 days. Talking to someone can help.' })
    expect(supportSignal(logs.slice(0, 4), TODAY).show).toBe(true)
  })
  it('counts a day once and fires at 9 of the last 14', () => {
    expect(supportSignal([mood(d(0), -3, 8), mood(d(0), -3, 12), mood(d(0), -2, 20), mood(d(1), -2)], TODAY).show).toBe(false)
    const logs = [0, 2, 4, 7, 8, 9, 10, 11, 12].map((n) => mood(d(n), -2))
    const s = supportSignal(logs, TODAY)
    expect(s.show).toBe(true)
    expect(s.message).toBe('Low mood on 9 of the last 14 days. Talking to someone can help.')
    expect(s.message).not.toMatch(CLINICAL)
  })
})

describe('coach: mind context', () => {
  function facts(mind?: CoachFacts['mind'], over: Partial<CoachFacts> = {}): CoachFacts {
    const symptoms = [sym('knee_left', 2)]
    const planned = session('upper_a', TODAY, 'planned')
    return {
      today: TODAY,
      hourNow: 12,
      readiness: computeReadiness({ sleepLastNightMin: 370, sleepAvg7Min: 425, symptoms, checkIn: checkIn({ soreness: 2 }), sessionsLast7: 2 }),
      gate: evaluateSymptomGate(symptoms),
      plannedToday: planned,
      sessionsThisWeek: [session('upper_a', WEEK_START, 'completed'), planned],
      weekTier: 'target',
      intakeToday: { kcal: 5, proteinG: 0, carbsG: 1, fatG: 0 },
      target: TARGET,
      proteinPaceExpected: 45,
      savedMealNames: ['Fish soup with rice'],
      recentHighProteinFoods: [],
      weight: { latest: 84, avg7: 84.2, prevAvg7: 84.6, goal: 74 },
      sleepLastNightMin: 370,
      sleepAvg7Min: 425,
      missedThisWeek: 0,
      nutritionTrend: null,
      stalls: [],
      loggedMealDaysLast7: 6,
      mind,
      ...over,
    }
  }
  const breathing = (p: { directives: string[] }) => p.directives.filter((x) => /breathe in Mind/.test(x))

  it('adds nothing without mind facts or on an ordinary day', () => {
    expect(breathing(computeDailyPriority(facts()))).toEqual([])
    expect(breathing(computeDailyPriority(facts({ stressToday: 4, valenceToday: -1, mindfulMinToday: 0, support: false })))).toEqual([])
    expect(computeDailyPriority(facts({ stressToday: 4, valenceToday: -1, mindfulMinToday: 0, support: false }))).toEqual(computeDailyPriority(facts()))
  })

  it('adds exactly one breathing directive for high stress or low mood and never drops the session', () => {
    const calm = computeDailyPriority(facts())
    const stressed = computeDailyPriority(facts({ stressToday: 8, valenceToday: -3, mindfulMinToday: 0, support: false }))
    expect(breathing(stressed)).toEqual(['Stress is 8/10 today — take a few minutes to breathe in Mind (Physiological sigh).'])
    expect(stressed.headline).toBe(calm.headline)
    expect(stressed.tone).toBe(calm.tone)
    expect(stressed.directives.filter((x) => !/breathe in Mind/.test(x))).toEqual(calm.directives)
    expect(stressed.evidence).toContainEqual({ label: 'Stress', value: '8/10 at check-in' })

    const low = computeDailyPriority(facts({ stressToday: null, valenceToday: -2, mindfulMinToday: 0, support: true }))
    expect(breathing(low)).toEqual(['Mood is logged low today — take a few minutes to breathe in Mind (Coherent breathing).'])
    expect(low.headline).toBe(calm.headline)
    expect(low.directives.join(' ')).not.toMatch(CLINICAL)
  })

  it('also applies in the late-evening and RED branches, once', () => {
    const mind = { stressToday: 9, valenceToday: null, mindfulMinToday: 0, support: false }
    expect(breathing(computeDailyPriority(facts(mind, { hourNow: 21 })))).toEqual(['Stress is 9/10 today — take a few minutes to breathe in Mind (4-7-8).'])
    const redSymptoms = [sym('knee_left', 7)]
    const red = facts(mind, { gate: evaluateSymptomGate(redSymptoms), readiness: computeReadiness({ sleepLastNightMin: 430, sleepAvg7Min: 430, symptoms: redSymptoms, checkIn: null, sessionsLast7: 2 }) })
    expect(breathing(computeDailyPriority(red))).toHaveLength(1)
  })

  it('answers a stress question locally with a technique and an option, keeping the priority', () => {
    const f = facts({ stressToday: 8, valenceToday: 0, mindfulMinToday: 0, support: false })
    const a = answerLocally("I'm really stressed today", f)
    expect(a.content).toMatch(/Physiological sigh/)
    expect(a.content).toMatch(/talking to someone you trust can help/)
    expect(a.content).toContain(computeDailyPriority(f).headline)
    expect(a.content).not.toMatch(CLINICAL)
  })
})
