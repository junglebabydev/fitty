import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ANTHROPIC_MODEL, anthropicModel, buildChatParams, buildJsonParams, mapAnthropicError, readMessage } from '../anthropic'
import { BridgeError, type ChatRequest, type JsonRequest } from '../guard'

const chat: ChatRequest = {
  system: 'You are the coach.',
  turns: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'what is this?' }],
  attachments: [{ base64: 'QUJD', mediaType: 'image/webp' }],
}
const json: JsonRequest = {
  system: 'Extract.',
  prompt: 'Read the report.',
  schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false },
  attachments: [{ base64: 'UERG', mediaType: 'application/pdf' }, { base64: 'QUJD', mediaType: 'image/png' }],
}

const message = (text: string, stop_reason: Anthropic.Message['stop_reason']) =>
  ({ content: text ? [{ type: 'text', text, citations: null } as Anthropic.TextBlock] : [], stop_reason, model: 'claude-opus-5' })

function caught(fn: () => unknown): BridgeError {
  try { fn() } catch (e) { if (e instanceof BridgeError) return e }
  throw new Error('expected a BridgeError')
}

describe('anthropicModel', () => {
  it('defaults to claude-opus-5', () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-opus-5')
    expect(anthropicModel(undefined)).toBe('claude-opus-5')
    expect(anthropicModel(' claude-sonnet-5 ')).toBe('claude-sonnet-5')
  })
})

describe('buildChatParams', () => {
  it('caps the reply at 2048 tokens, caches the system prompt and attaches files to the last user turn', () => {
    const { preferred, fallback } = buildChatParams(chat, 'claude-opus-5')
    expect(preferred.max_tokens).toBe(2048)
    expect(preferred.thinking).toEqual({ type: 'disabled' })
    expect(fallback.thinking).toBeUndefined()
    expect(preferred.system).toEqual([{ type: 'text', text: 'You are the coach.', cache_control: { type: 'ephemeral' } }])
    expect(preferred.messages.slice(0, 2)).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }])
    expect(preferred.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'QUJD' } }, { type: 'text', text: 'what is this?' }],
    })
  })
})

describe('buildJsonParams', () => {
  it('asks for json_schema output first, with PDFs as document blocks', () => {
    const { preferred, fallback } = buildJsonParams(json, 'claude-opus-5')
    expect(preferred.max_tokens).toBe(8192)
    expect(preferred.output_config).toEqual({ format: { type: 'json_schema', schema: json.schema } })
    expect(preferred.messages[0].content).toEqual([
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'UERG' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
      { type: 'text', text: 'Read the report.\n\nReturn the JSON object only.' },
    ])
    // The fallback has no structured-output parameters, so the schema goes into the prompt instead.
    expect(fallback.output_config).toBeUndefined()
    expect(fallback.thinking).toBeUndefined()
    const blocks = fallback.messages[0].content as Anthropic.ContentBlockParam[]
    expect((blocks.at(-1) as Anthropic.TextBlockParam).text).toContain(JSON.stringify(json.schema))
  })
})

describe('readMessage', () => {
  it('returns the text and the model', () => {
    expect(readMessage(message('Hello', 'end_turn'))).toEqual({ text: 'Hello', model: 'claude-opus-5' })
  })
  it('maps stop_reason refusal', () => {
    const e = caught(() => readMessage(message('', 'refusal')))
    expect([e.kind, e.status]).toEqual(['refusal', 422])
  })
  it('reports cut-off and empty replies', () => {
    expect(caught(() => readMessage(message('{"a":', 'max_tokens'))).message).toMatch(/cut off/)
    expect(readMessage(message('Half an answer', 'max_tokens'), { partialOk: true }).text).toBe('Half an answer')
    expect(caught(() => readMessage(message('', 'end_turn'))).message).toMatch(/empty/)
  })
})

describe('mapAnthropicError', () => {
  const err = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'SECRET-UPSTREAM-DETAIL' } }, 'SECRET-UPSTREAM-DETAIL', new Headers())

  it('maps typed SDK errors to kinds', () => {
    expect(mapAnthropicError(err(401)).kind).toBe('auth')
    expect(mapAnthropicError(err(403)).kind).toBe('auth')
    expect(mapAnthropicError(err(429)).kind).toBe('busy')
    expect(mapAnthropicError(err(529)).kind).toBe('busy')
    expect(mapAnthropicError(err(400)).kind).toBe('failed')
    expect(mapAnthropicError(err(404)).message).toMatch(/COACH_MODEL/)
    expect(mapAnthropicError(err(500)).kind).toBe('failed')
    expect(mapAnthropicError(new Anthropic.APIConnectionTimeoutError()).kind).toBe('timeout')
    expect(mapAnthropicError(new Anthropic.APIConnectionError({ message: 'x' })).kind).toBe('failed')
    expect(mapAnthropicError(new Error('boom')).kind).toBe('failed')
  })
  it('passes our own errors through and never forwards upstream text', () => {
    const own = new BridgeError('refusal', 'declined', 422)
    expect(mapAnthropicError(own)).toBe(own)
    for (const status of [400, 401, 404, 429, 500]) expect(mapAnthropicError(err(status)).message).not.toContain('SECRET-UPSTREAM-DETAIL')
  })
})
