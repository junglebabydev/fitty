import { describe, expect, it } from 'vitest'
import { baselineContext, firstSentence, isLongReply, proposalsLabel, readSource, tagSource } from '../chat'

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
