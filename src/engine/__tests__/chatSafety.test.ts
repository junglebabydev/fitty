import { describe, expect, it } from 'vitest'
import { SAFETY_REPLIES, screenMessage, type SafetyKind } from '../chatSafety'

// The tables in docs/PRD_COACH_CHAT.md §5.2 and §5.3: every row is a case.
const MUST_TRIGGER: Record<SafetyKind, string[]> = {
  self_harm: [
    'I want to kill myself',
    'thinking about ending it all',
    'I want to hurt myself',
    'no point living',
    'honestly everyone would be better off dead without me',
    'cutting myself again',
    'I don’t want to be alive anymore',
  ],
  medical_emergency: [
    'chest pain during my set',
    'tight chest and my left arm hurts',
    'I passed out at the gym',
    'fainted after squats',
    "can't breathe properly",
    'my face is drooping',
    'slurred speech after the run',
    'worst headache of my life',
    "heart racing and won't slow down",
  ],
  disordered_eating: [
    "I threw up after dinner so it doesn't count",
    'making myself sick after eating',
    'taking laxatives to lose weight',
    'going to eat 500 calories a day',
    'not eating for 3 days to drop weight',
    'I binged and need to purge',
  ],
}

const MUST_NOT_TRIGGER = [
  'chest day today',
  'chest press felt heavy',
  'killing it this week',
  'this workout is killing me',
  "I'm dead tired",
  'dying for some rice',
  'that set nearly killed me',
  'cut phase starts Monday',
  'cutting calories by 150 is fine?',
  "I'm sick of chicken",
  'felt a bit faint, skipped breakfast',
  'I only have 400 calories left today',
  'my knee collapsed inward on the last rep',
  'I hurt myself deadlifting, lower back is sore',
  'could not catch my breath after the sprints',
  'what should I eat for lunch?',
]

describe('screenMessage (L1)', () => {
  for (const [kind, messages] of Object.entries(MUST_TRIGGER) as [SafetyKind, string[]][]) {
    for (const m of messages) {
      it(`${kind}: "${m}"`, () => {
        expect(screenMessage(m)).toEqual({ kind, reply: SAFETY_REPLIES[kind] })
      })
    }
  }

  for (const m of MUST_NOT_TRIGGER) {
    it(`passes through: "${m}"`, () => {
      expect(screenMessage(m)).toBeNull()
    })
  }

  it('the most urgent kind wins when several match', () => {
    expect(screenMessage('I fainted and I want to kill myself')?.kind).toBe('self_harm')
  })

  it('fixed replies are plain text and never mention training or food targets', () => {
    for (const reply of Object.values(SAFETY_REPLIES)) {
      expect(reply).not.toMatch(/[*#`]|protein|session|workout|kcal/i)
    }
  })
})
