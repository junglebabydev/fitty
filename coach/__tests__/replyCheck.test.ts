import { describe, expect, it } from 'vitest'
import { checkReply } from '../replyCheck'

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

  it('a number from a tool result counts as received (PRD §12.2)', () => {
    const tool = '{"averageOnLoggedDays":{"kcal":1840,"proteinG":118}}'
    expect(checkReply('You averaged 1,840 kcal and 118 g protein on logged days.', RECEIVED).ok).toBe(false)
    expect(checkReply('You averaged 1,840 kcal and 118 g protein on logged days.', [RECEIVED, tool].join('\n')).ok).toBe(true)
  })

  it('keeps a PROPOSAL line intact after cleanup', () => {
    const r = checkReply('Reasoning here.\n**PROPOSAL:** Swap leg press for hip thrust.', RECEIVED)
    expect(r.ok && r.text.endsWith('PROPOSAL: Swap leg press for hip thrust.')).toBe(true)
  })
})
