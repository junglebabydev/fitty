import { describe, expect, it } from 'vitest'
import { REDACTED_SAFETY_TURN } from '../../../engine'
import { baselineContext, firstSentence, isLongReply, latestSafetyKind, proposalsLabel, readSafety, readSource, tagSafety, tagSource, toModelTurns } from '../chat'

describe('reply source tag', () => {
  const evidence = [1, 2, 3, 4].map((n) => ({ label: `L${n}`, value: `${n}` }))

  it('keeps at most three visible chips and round-trips the source', () => {
    const stored = tagSource(evidence, 'ai')
    expect(stored).toHaveLength(4)
    expect(readSource(stored)).toEqual({ source: 'ai', evidence: evidence.slice(0, 3) })
  })

  it('reads older messages without a tag as unknown', () => {
    expect(readSource(evidence.slice(0, 2))).toEqual({ source: null, evidence: evidence.slice(0, 2) })
  })

  it('never stacks two tags', () => {
    expect(tagSource(tagSource([], 'ai'), 'local')).toEqual([{ label: '_source', value: 'local' }])
  })
})

describe('brief and clamp', () => {
  it('takes one sentence and does not split on decimals', () => {
    expect(firstSentence('Weight is 84.0 kg today. Train upper body.')).toBe('Weight is 84.0 kg today.')
    expect(firstSentence('Rest day')).toBe('Rest day')
  })

  it('clamps long or many-line replies only', () => {
    expect(isLongReply('Short answer.')).toBe(false)
    expect(isLongReply('x'.repeat(300))).toBe(true)
    expect(isLongReply('a\nb\nc\nd\ne')).toBe(true)
  })

  it('labels the compact proposals card', () => {
    expect(proposalsLabel([])).toBeNull()
    expect(proposalsLabel([{ title: "Trim today's session" }])).toEqual({ count: '1 proposal', title: "Trim today's session" })
    expect(proposalsLabel([{ title: 'A' }, { title: 'B' }])?.count).toBe('2 proposals')
  })
})

describe('baselineContext', () => {
  it('uses the summary and watch-outs, and ignores malformed settings', () => {
    expect(baselineContext(null)).toBeUndefined()
    expect(baselineContext({ summary: '  ' })).toBeUndefined()
    expect(baselineContext({ summary: 'Training twice a week.', watchouts: ['Left knee', 7, ''] })).toBe('Training twice a week. Watch-outs: Left knee.')
    expect(baselineContext({ summary: 'Training twice a week.' })).toBe('Training twice a week.')
  })
})

describe('safety tag and redaction', () => {
  const msg = (role: 'user' | 'coach', content: string, evidence: { label: string; value: string }[] = []) => ({ role, content, evidence })

  it('is hidden from chips, survives the three-chip cut and reads back', () => {
    const stored = tagSafety('self_harm')
    expect(readSafety(stored)).toBe('self_harm')
    expect(readSource(stored)).toEqual({ source: 'local', evidence: [] })
    const retagged = tagSource([...stored, ...[1, 2, 3, 4].map((n) => ({ label: `L${n}`, value: `${n}` }))], 'ai')
    expect(readSafety(retagged)).toBe('self_harm')
    expect(readSource(retagged).evidence).toHaveLength(3)
  })

  it('replaces a screened user message in model turns, and nothing else', () => {
    const turns = toModelTurns([
      msg('user', 'what should I eat'),
      msg('coach', 'Protein first.'),
      msg('user', 'I want to hurt myself'),
      msg('coach', 'fixed reply', tagSafety('self_harm')),
      msg('user', 'ok thanks'),
    ])
    expect(turns.map((t) => t.content)).toEqual(['what should I eat', 'Protein first.', REDACTED_SAFETY_TURN, 'fixed reply', 'ok thanks'])
    expect(JSON.stringify(turns)).not.toMatch(/hurt myself/)
  })

  it('finds the latest safety kind', () => {
    expect(latestSafetyKind([msg('coach', 'a'), msg('coach', 'b', tagSafety('disordered_eating')), msg('coach', 'c')])).toBe('disordered_eating')
    expect(latestSafetyKind([msg('coach', 'a')])).toBeNull()
  })
})
