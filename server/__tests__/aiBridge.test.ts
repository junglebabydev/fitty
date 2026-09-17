import { describe, expect, it } from 'vitest'
import { extractJson, mainModel, readCliResult } from '../aiBridge'

const result = (over: Record<string, unknown>) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'OK', total_cost_usd: 0.01, ...over })

describe('mainModel', () => {
  it('picks the model that wrote the most output, not the first key (Claude Code lists its Haiku housekeeping call first)', () => {
    // Shape recorded from a live `claude -p --model sonnet` run.
    const usage = { 'claude-haiku-4-5-20251001': { inputTokens: 462, outputTokens: 19 }, 'claude-sonnet-4-6': { inputTokens: 4, outputTokens: 2301 } }
    expect(mainModel(usage)).toBe('claude-sonnet-4-6')
    expect(mainModel({ only: { outputTokens: 0 } })).toBe('only')
    expect(mainModel({})).toBeNull()
    expect(mainModel(null)).toBeNull()
    expect(mainModel('sonnet')).toBeNull()
  })
})

describe('readCliResult', () => {
  it('returns the text, the structured output, the cost and the main model', () => {
    const r = readCliResult(result({ result: 'DONE', structured_output: { intent: 'question' }, modelUsage: { a: { outputTokens: 1 }, b: { outputTokens: 9 } } }), '', 0)
    expect(r).toEqual({ text: 'DONE', structured: { intent: 'question' }, costUsd: 0.01, model: 'b' })
    expect(readCliResult(result({}), '', 0).structured).toBeNull()
  })

  it('keeps a structured answer from a run that then ran out of turns, and fails one that has none', () => {
    const early = { is_error: true, subtype: 'error_max_turns', result: undefined }
    expect(readCliResult(result({ ...early, structured_output: { n: 7 } }), '', 1).structured).toEqual({ n: 7 })
    expect(() => readCliResult(result(early), '', 1)).toThrow(/stopped early \(error_max_turns\)/)
  })

  it('maps sign-in problems to the auth kind and unreadable output to failed', () => {
    expect(() => readCliResult(result({ is_error: true, result: 'Invalid API key · Please run /login' }), '', 1)).toThrow(/signed out/)
    expect(() => readCliResult('', 'OAuth token has expired', 1)).toThrow(/signed out/)
    expect(() => readCliResult('', "error: unknown option '--json-schema'", 1)).toThrow(/unknown option/)
    expect(() => readCliResult('[]', '', 0)).toThrow()
    // A healthy reply that merely mentions the word is not an auth failure.
    expect(readCliResult(result({ result: 'OAuth is unrelated to your squat.' }), '', 0).text).toMatch(/squat/)
  })
})

describe('extractJson', () => {
  it('reads plain, fenced and prose-wrapped objects', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Here you go:\n{"a":{"b":2}}\nHope that helps.')).toEqual({ a: { b: 2 } })
  })

  it('never passes off an empty or non-object reply as an answer', () => {
    for (const bad of ['', 'DONE', 'null', '[]', '42', '"text"', '{"a":']) expect(() => extractJson(bad)).toThrow()
  })
})
