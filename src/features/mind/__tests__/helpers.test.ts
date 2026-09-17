import { describe, expect, it } from 'vitest'
import type { MoodLog } from '../../../domain/types'
import { isoAt } from '../../../lib/util'
import { clipWords, dailyMoodSeries, fmtValence, keepValidLabels, mindGreeting, moodDeltaSentence, moodHeadline, moodKindFor, nextPrompt, promptBody, suggestReason, toggleIn } from '../helpers'

const WORDS: Record<number, string> = { [-3]: 'Very unpleasant', [-2]: 'Unpleasant', [-1]: 'Slightly unpleasant', 0: 'Neutral', 1: 'Slightly pleasant', 2: 'Pleasant', 3: 'Very pleasant' }

let nextId = 1
const log = (date: string, hour: number, valence: number): MoodLog => ({ id: nextId++, ts: isoAt(date, hour), kind: 'momentary', valence, labels: [], contexts: [], note: '' })

describe('dailyMoodSeries', () => {
  it('returns one point per day ending today, averaging several logs and leaving gaps null', () => {
    const series = dailyMoodSeries([log('2026-09-15', 9, 2), log('2026-09-15', 20, -1), log('2026-09-17', 8, 1)], '2026-09-17', 4)
    expect(series).toEqual([
      { x: '2026-09-14', y: null },
      { x: '2026-09-15', y: 0.5 },
      { x: '2026-09-16', y: null },
      { x: '2026-09-17', y: 1 },
    ])
    expect(dailyMoodSeries([], '2026-09-17')).toHaveLength(14)
  })
})

describe('moodHeadline', () => {
  it('describes without judging', () => {
    expect(moodHeadline({ avg7: null, trend: null, daysCheckedIn7: 0 }, WORDS)).toMatch(/Check in on a few days/)
    expect(moodHeadline({ avg7: 1.2, trend: 'up', daysCheckedIn7: 5 }, WORDS)).toMatch(/lighter/)
    expect(moodHeadline({ avg7: -0.4, trend: 'down', daysCheckedIn7: 5 }, WORDS)).toMatch(/heavier/)
    expect(moodHeadline({ avg7: 0.2, trend: 'flat', daysCheckedIn7: 6 }, WORDS)).toMatch(/steady/)
    expect(moodHeadline({ avg7: 1.6, trend: null, daysCheckedIn7: 3 }, WORDS)).toBe('Mostly pleasant over the last 7 days.')
  })
})

describe('valence formatting', () => {
  it('uses explicit signs', () => {
    expect(fmtValence(0.44)).toBe('+0.4')
    expect(fmtValence(-1.25)).toBe('−1.3')
    expect(fmtValence(0.04)).toBe('0.0')
    expect(fmtValence(-2, 0)).toBe('−2')
  })

  it('never celebrates or scolds a re-rate', () => {
    expect(moodDeltaSentence(-2, 0)).toMatch(/lighter/)
    expect(moodDeltaSentence(1, -1)).toMatch(/still count/)
    expect(moodDeltaSentence(1, 1)).toMatch(/Steady/)
    expect(moodDeltaSentence(null, 2)).toMatch(/Noted/)
  })
})

describe('nextPrompt', () => {
  const prompts = [
    { id: 'a', kind: 'gratitude' }, { id: 'b', kind: 'gratitude' }, { id: 'c', kind: 'win' }, { id: 'd', kind: 'reframe' },
  ]
  it('moves to the next prompt of a different kind and wraps', () => {
    expect(nextPrompt(prompts, 'a')?.id).toBe('c')
    expect(nextPrompt(prompts, 'c')?.id).toBe('d')
    expect(nextPrompt(prompts, 'd')?.id).toBe('a')
    expect(nextPrompt(prompts, 'missing')?.id).toBe('a')
    expect(nextPrompt([], 'a')).toBeNull()
  })
  it('still advances when every prompt shares a kind', () => {
    expect(nextPrompt([{ id: 'x', kind: 'win' }, { id: 'y', kind: 'win' }], 'x')?.id).toBe('y')
  })
})

describe('small rules', () => {
  it('first log of the day is the daily one', () => {
    expect(moodKindFor(0)).toBe('daily')
    expect(moodKindFor(2)).toBe('momentary')
  })
  it('drops feeling words that left the band and toggles chips', () => {
    expect(keepValidLabels(['Calm', 'Happy'], ['Happy', 'Proud'])).toEqual(['Happy'])
    expect(toggleIn(['Work'], 'Sleep')).toEqual(['Work', 'Sleep'])
    expect(toggleIn(['Work', 'Sleep'], 'Work')).toEqual(['Sleep'])
  })
  it('drops the thinking-tool lead-in only when present', () => {
    expect(promptBody('Thinking tool: write down a worry.')).toBe('Write down a worry.')
    expect(promptBody('What went right today?')).toBe('What went right today?')
  })
  it('greets by time of day', () => {
    expect(mindGreeting(7)).toMatch(/morning/)
    expect(mindGreeting(14)).toMatch(/middle of the day/)
    expect(mindGreeting(19)).toMatch(/Evening/)
    expect(mindGreeting(22)).toMatch(/slow down/)
    expect(mindGreeting(2)).toMatch(/Still up/)
  })
})

describe('suggestReason', () => {
  const base = { stress: null, valence: null, hourNow: 10, sleepLastNightMin: null }
  it('gives three words, in the same priority as the technique pick', () => {
    expect(suggestReason({ ...base, hourNow: 22, stress: 9 })).toBe('Late, slow down')
    expect(suggestReason({ ...base, stress: 8, valence: -3 })).toBe('Stress is high')
    expect(suggestReason({ ...base, valence: -2 })).toBe('Today feels heavy')
    expect(suggestReason({ ...base, sleepLastNightMin: 300 })).toBe('After short night')
    expect(suggestReason(base)).toBe('Good daily baseline')
    expect(suggestReason(base).split(' ')).toHaveLength(3)
  })
})

describe('clipWords', () => {
  it('cuts on a word boundary', () => {
    expect(clipWords('one two three', 5)).toBe('one two three')
    expect(clipWords('one two three four', 2)).toBe('one two…')
  })
})
