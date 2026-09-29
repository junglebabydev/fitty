import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIError, MAX_TOOL_STEPS, aiDecide, coachChat, coachChatWithTools, configureAI, getProvider, isOnline, recognizeMeal, AI_TIMEOUT_MS } from '../gateway'
import { MOCK_CHAT_REPLY, MOCK_UNCERTAINTY } from '../mock'
import type { LedgerInput } from '../gateway'

const IMG = { base64: 'aGVsbG8gd29ybGQ=', mediaType: 'image/jpeg' }

describe('ai gateway', () => {
  let ledger: LedgerInput[]
  const onLedger = (e: LedgerInput) => { ledger.push(e) }

  beforeEach(() => {
    ledger = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('mock provider', () => {
    beforeEach(() => configureAI({ providerId: 'mock', apiKey: '', model: '', onLedger }))

    it('is the default provider before configureAI is called', () => {
      expect(getProvider().id).toBe('mock')
      expect(getProvider().isConfigured()).toBe(true)
    })

    it('recognizeMeal returns 2–3 low-confidence demo items and a local_only ledger entry', async () => {
      const r = await recognizeMeal(IMG, { mealType: 'lunch' })
      expect(r.items.length).toBeGreaterThanOrEqual(2)
      expect(r.items.length).toBeLessThanOrEqual(3)
      for (const it of r.items) {
        expect(it.confidence_0_1).toBeLessThanOrEqual(0.5)
        expect(it.confidence_0_1).toBeGreaterThan(0)
        expect(it.uncertainty_reason).toBe(MOCK_UNCERTAINTY)
        expect(it.kcal).toBeGreaterThan(0)
        expect(it.estimated_quantity_g).toBeGreaterThan(0)
      }
      expect(r.overall_confidence).toBeLessThanOrEqual(0.5)

      expect(ledger).toEqual([
        { provider: 'mock', dataType: 'meal_photo', purpose: 'Meal photo recognition (lunch)', bytes: IMG.base64.length, status: 'local_only' },
      ])
    })

    it('is deterministic for the same photo and context', async () => {
      const a = await recognizeMeal(IMG, { mealType: 'dinner' })
      const b = await recognizeMeal(IMG, { mealType: 'dinner' })
      expect(a).toEqual(b)
    })

    it('uses the hint to pick a plausible meal', async () => {
      const r = await recognizeMeal(IMG, { hint: 'fish soup with rice' })
      expect(r.items.some((it) => /fish/i.test(it.food_name))).toBe(true)
    })

    it('coachChat returns the canned configure-a-provider line and logs JSON size', async () => {
      const system = 'You are the coach.'
      const turns = [{ role: 'user' as const, content: 'How am I doing?' }]
      const reply = await coachChat(system, turns)
      expect(reply).toBe(MOCK_CHAT_REPLY)
      expect(ledger).toHaveLength(1)
      expect(ledger[0]).toMatchObject({
        provider: 'mock',
        dataType: 'coach_context',
        status: 'local_only',
        bytes: JSON.stringify({ system, turns }).length,
      })
    })

    it('still works offline because nothing leaves the device', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      expect(isOnline()).toBe(false)
      const r = await recognizeMeal(IMG, {})
      expect(r.items.length).toBeGreaterThan(0)
      expect(ledger[0].status).toBe('local_only')
    })
  })

  describe('remote provider (anthropic)', () => {
    it('throws AIError("offline") before sending and writes no ledger entry', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      configureAI({ providerId: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5', onLedger })
      expect(getProvider().id).toBe('anthropic')

      const err = await recognizeMeal(IMG, { mealType: 'lunch' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(AIError)
      expect((err as AIError).kind).toBe('offline')
      expect((err as AIError).message).toMatch(/offline/i)

      const chatErr = await coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
      expect((chatErr as AIError).kind).toBe('offline')

      expect(ledger).toEqual([])
    })

    it('throws AIError("not_configured") when the key is empty', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      configureAI({ providerId: 'anthropic', apiKey: '', model: '', onLedger })
      expect(getProvider().isConfigured()).toBe(false)
      const err = await coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
      expect((err as AIError).kind).toBe('not_configured')
      expect(ledger).toEqual([])
    })

    it('logs a failed entry when the provider call rejects', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      configureAI({ providerId: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5', onLedger })
      vi.spyOn(getProvider(), 'coachChat').mockRejectedValueOnce(new AIError('rate_limit'))
      const err = await coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
      expect((err as AIError).kind).toBe('rate_limit')
      expect(ledger).toEqual([
        { provider: 'anthropic', dataType: 'coach_context', purpose: expect.any(String), bytes: expect.any(Number), status: 'failed' },
      ])
    })

    it('logs a sent entry when the provider call succeeds', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      configureAI({ providerId: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5', onLedger })
      vi.spyOn(getProvider(), 'coachChat').mockResolvedValueOnce('Do the upper-body session today.')
      const reply = await coachChat('sys', [{ role: 'user', content: 'hi' }])
      expect(reply).toBe('Do the upper-body session today.')
      expect(ledger[0]).toMatchObject({ provider: 'anthropic', dataType: 'coach_context', status: 'sent' })
    })

    it('configures Gemini from geminiKey / geminiModel and records provider "gemini" in the ledger', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      configureAI({ providerId: 'gemini', geminiKey: 'test-key', geminiModel: null, onLedger })
      expect(getProvider().id).toBe('gemini')
      expect(getProvider().isConfigured()).toBe(true)
      vi.spyOn(getProvider(), 'coachChat').mockResolvedValueOnce('ready')
      expect(await coachChat('sys', [{ role: 'user', content: 'hi' }])).toBe('ready')
      expect(ledger[0]).toMatchObject({ provider: 'gemini', dataType: 'coach_context', status: 'sent' })

      configureAI({ providerId: 'gemini', geminiKey: '', onLedger })
      const err = await coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
      expect((err as AIError).kind).toBe('not_configured')
      expect(ledger).toHaveLength(1)
    })

    it('names the real recipient in the ledger when the bridge is the hosted Worker, and the Mac bridge otherwise', async () => {
      vi.stubGlobal('navigator', { onLine: true })
      const send = async () => {
        vi.spyOn(getProvider(), 'coachChat').mockResolvedValueOnce('ok')
        await coachChat('sys', [{ role: 'user', content: 'hi' }])
      }
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: 'gemini', onLedger })
      await send()
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: null, onLedger })
      await send()
      configureAI({ providerId: 'claude-code', bridgeHost: 'mac', bridgeUpstream: 'gemini', onLedger })
      await send()
      expect(ledger.map((e) => [e.provider, e.status])).toEqual([['worker:gemini', 'sent'], ['worker:unknown', 'sent'], ['claude-code', 'sent']])
    })

    it('times out after AI_TIMEOUT_MS and logs failed', async () => {
      vi.useFakeTimers()
      try {
        vi.stubGlobal('navigator', { onLine: true })
        configureAI({ providerId: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5', onLedger })
        vi.spyOn(getProvider(), 'recognizeMeal').mockReturnValueOnce(new Promise(() => {}))
        const pending = recognizeMeal(IMG, {}).catch((e: unknown) => e)
        await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS)
        const err = await pending
        expect((err as AIError).kind).toBe('network')
        expect(ledger[0].status).toBe('failed')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('aiDecide', () => {
    const REQ = { state: 'should I eat before I train?', instructions: 'Which coach?', options: { training: 'a', nutrition: 'b' } }
    const META = { dataType: 'coach_message', purpose: 'Pick which coach answers' }

    it('is not available on the mock or the Mac bridge, and writes no ledger row', async () => {
      for (const opts of [{ providerId: 'mock' as const }, { providerId: 'claude-code' as const, bridgeHost: 'mac' as const }]) {
        configureAI({ apiKey: '', model: '', onLedger, ...opts })
        await expect(aiDecide(REQ, META)).rejects.toMatchObject({ kind: 'not_configured' })
      }
      expect(ledger).toEqual([])
    })

    it('posts only the message and question to the Worker and records the call', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, choice: 'nutrition', confidence: 0.8 }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: 'openrouter', onLedger })
      expect(await aiDecide(REQ, META)).toEqual({ choice: 'nutrition', confidence: 0.8 })
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('/api/ai/decide')
      expect(JSON.parse(init.body as string)).toEqual(REQ)
      expect(ledger).toEqual([expect.objectContaining({ dataType: 'coach_message', status: 'sent', bytes: REQ.state.length })])
    })
  })

  describe('coachChatWithTools', () => {
    const TOOLS = [{ name: 'get_sleep', description: 'Sleep.', parameters: { type: 'object' } }]
    const TURNS = [{ role: 'user' as const, content: 'how did I sleep?' }]
    const toolCall = (id: string) => new Response(JSON.stringify({ ok: true, text: '', toolCalls: [{ id, name: 'get_sleep', arguments: '{"days":7}' }] }), { status: 200 })
    const text = (t: string) => new Response(JSON.stringify({ ok: true, text: t }), { status: 200 })
    const bodies = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string))

    it('runs tools locally and sends the results back, then returns the answer and the results', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(toolCall('c1')).mockResolvedValueOnce(text('You averaged 6h 40m.'))
      vi.stubGlobal('fetch', fetchMock)
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: 'openrouter', onLedger })
      const runTool = vi.fn(() => '{"averageMinutes":400}')
      const r = await coachChatWithTools('sys', TURNS, TOOLS, runTool)
      expect(r).toEqual({ text: 'You averaged 6h 40m.', toolResults: ['{"averageMinutes":400}'] })
      expect(runTool).toHaveBeenCalledWith('get_sleep', '{"days":7}')
      const second = bodies(fetchMock)[1]
      expect(second.turns.slice(1)).toEqual([
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_sleep', arguments: '{"days":7}' }] },
        { role: 'tool', toolCallId: 'c1', content: '{"averageMinutes":400}' },
      ])
      expect(ledger).toHaveLength(2)
    })

    it(`stops at ${MAX_TOOL_STEPS} calls: the last one sets toolChoice none, and a 4th tool request never happens`, async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(toolCall('c1')).mockResolvedValueOnce(toolCall('c2')).mockResolvedValueOnce(text('Answer.'))
      vi.stubGlobal('fetch', fetchMock)
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: 'openrouter', onLedger })
      const r = await coachChatWithTools('sys', TURNS, TOOLS, () => '{}')
      expect(r.text).toBe('Answer.')
      expect(fetchMock).toHaveBeenCalledTimes(MAX_TOOL_STEPS)
      expect(bodies(fetchMock).map((b) => b.toolChoice ?? null)).toEqual([null, null, 'none'])
    })

    it('answers without tools when the server refuses them, and uses plain chat where tools are not supported', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, kind: 'bad_request', message: 'Tools need the OpenRouter upstream.' }), { status: 400 }))
        .mockResolvedValueOnce(text('Plain answer.'))
      vi.stubGlobal('fetch', fetchMock)
      configureAI({ providerId: 'claude-code', bridgeHost: 'cloud', bridgeUpstream: 'gemini', onLedger })
      expect(await coachChatWithTools('sys', TURNS, TOOLS, () => '{}')).toEqual({ text: 'Plain answer.', toolResults: [] })
      expect(bodies(fetchMock)[1].tools).toBeUndefined()

      configureAI({ providerId: 'mock', apiKey: '', model: '', onLedger })
      const r = await coachChatWithTools('sys', TURNS, TOOLS, () => { throw new Error('never called') })
      expect(r.toolResults).toEqual([])
    })
  })
})

