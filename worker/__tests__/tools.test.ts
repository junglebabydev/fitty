// Tool calling pass-through (docs/PRD_COACH_CHAT.md §12.3).
import { describe, expect, it } from 'vitest'
import { BridgeError, parseChatRequest } from '../guard'
import { buildChatRequest, parseOpenRouterResponse } from '../openrouter'

const TOOL = { name: 'get_sleep', description: 'Sleep for the last N days.', parameters: { type: 'object', properties: { days: { type: 'integer', enum: [7, 14, 30] } }, required: ['days'] } }
const turns = [
  { role: 'user', content: 'how did I sleep the last two weeks?' },
  { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_sleep', arguments: '{"days":14}' }] },
  { role: 'tool', toolCallId: 'c1', content: '{"averageMinutes":402}' },
]

describe('chat request with tools', () => {
  it('keeps tool turns and an assistant turn with only tool calls; a tool turn may be last', () => {
    const r = parseChatRequest({ system: 's', turns, tools: [TOOL] })
    expect(r.tools).toEqual([TOOL])
    expect(r.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'tool'])
    expect(r.turns[1].toolCalls).toEqual([{ id: 'c1', name: 'get_sleep', arguments: '{"days":14}' }])
  })

  it('rejects malformed tools and tool turns', () => {
    const bad = [
      { system: 's', turns, tools: [{ ...TOOL, name: 'Get-Sleep' }] },
      { system: 's', turns, tools: Array(9).fill(TOOL) },
      { system: 's', turns, tools: [{ ...TOOL, parameters: { big: 'x'.repeat(2_100) } }] },
      { system: 's', turns: [turns[0], { role: 'tool', content: 'x' }] },
      { system: 's', turns: [turns[0], { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'bad name', arguments: '{}' }] }, turns[2]] },
    ]
    for (const b of bad) expect(() => parseChatRequest(b)).toThrow(BridgeError)
  })

  it('maps to OpenRouter tools, tool_calls and tool messages', () => {
    const r = buildChatRequest(parseChatRequest({ system: 's', turns, tools: [TOOL] }), 'm/x', 'deny')
    expect(r.tools).toEqual([{ type: 'function', function: TOOL }])
    expect(r.messages[2]).toEqual({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_sleep', arguments: '{"days":14}' } }] })
    expect(r.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"averageMinutes":402}' })
  })

  it('sends no tools key when there are none', () => {
    expect('tools' in buildChatRequest(parseChatRequest({ system: 's', turns: [turns[0]] }), 'm/x', 'deny')).toBe(false)
  })

  it('returns tool calls instead of failing on the empty text', () => {
    const body = { model: 'm/x', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'c2', type: 'function', function: { name: 'get_training', arguments: '{"days":7}' } }] } }] }
    expect(parseOpenRouterResponse(body)).toEqual({ text: '', model: 'm/x', toolCalls: [{ id: 'c2', name: 'get_training', arguments: '{"days":7}' }] })
  })
})

describe('tool_choice none', () => {
  it('passes through only alongside tools', () => {
    const withTools = buildChatRequest(parseChatRequest({ system: 's', turns, tools: [TOOL], toolChoice: 'none' }), 'm/x', 'deny')
    expect(withTools.tool_choice).toBe('none')
    const without = buildChatRequest(parseChatRequest({ system: 's', turns: [turns[0]], toolChoice: 'none' }), 'm/x', 'deny')
    expect('tool_choice' in without).toBe(false)
  })
})
