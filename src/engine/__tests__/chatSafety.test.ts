import { describe, expect, it } from 'vitest'
import { SAFETY_REPLIES, checkReply, screenMessage, type SafetyKind } from '../chatSafety'

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

describe('checkReply (L3)', () => {
  const RECEIVED = 'Intake today: 5 / 2,050 kcal, protein 0 / 150 g (expected ~45 g by now). 42 g still to go.'

  // PRD §7 "Must pass": ordinary coaching that a careless check would reject.
  const MUST_PASS = [
    "Don't take sets to failure today.",
    'No guilt about the coffee.',
    'That sounds like a good plan.',
    'You have 42 g protein left today.',
    'Take the 25–35 minute version of the session.',
    'Creatine is a question for your doctor.',
    'You have a conditioning session on Saturday.',
    'Drink 500 ml of water with lunch.',
    'Target is 2,050 kcal and 150 g protein.',
    'I cannot diagnose that. Log it in the app so the symptom gate re-checks the plan.',
  ]
  for (const r of MUST_PASS) {
    it(`passes: "${r}"`, () => {
      expect(checkReply(r, RECEIVED)).toEqual({ ok: true, text: r })
    })
  }

  const MUST_REJECT: [string, string][] = [
    ['Honestly that was lazy.', 'shaming'],
    ['No excuses this week.', 'shaming'],
    ['Take 400 mg of ibuprofen before training.', 'dose'],
    ['Try 3 mg melatonin at night.', 'dose'],
    ['Add 5 g of creatine a day.', 'dose'],
    ['You probably have tendinitis in that knee.', 'diagnosis'],
    ['That sounds like a meniscus tear.', 'diagnosis'],
    ['Classic sciatica.', 'diagnosis'],
    ['Aim for 1,800 kcal today.', 'invented_number'],
    ['You still need 105 g protein.', 'invented_number'],
    ['**', 'empty'],
  ]
  for (const [r, reason] of MUST_REJECT) {
    it(`rejects (${reason}): "${r}"`, () => {
      expect(checkReply(r, RECEIVED)).toEqual({ ok: false, reason })
    })
  }

  it('cleans markdown and emoji instead of rejecting', () => {
    expect(checkReply('## Plan\n- **Protein first** 💪\n1. Walk after dinner', RECEIVED)).toEqual({ ok: true, text: 'Plan\nProtein first\nWalk after dinner' })
  })

  it('keeps a PROPOSAL line intact after cleanup', () => {
    const r = checkReply('Reasoning here.\n**PROPOSAL:** Swap leg press for hip thrust.', RECEIVED)
    expect(r.ok && r.text.endsWith('PROPOSAL: Swap leg press for hip thrust.')).toBe(true)
  })
})
