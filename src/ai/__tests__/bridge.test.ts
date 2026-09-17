import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeProvider, bridgeProviderLabel, normalizeBridgeHealth, probeBridge } from '../bridge'
import type { AIError } from '../types'

const MAC_OK = { ok: true, installed: true, version: '2.1.0', auth: 'ok', message: 'Connected to Claude through Claude Code on this Mac.', model: 'sonnet', pinRequired: false }
const CLOUD_BASE = { installed: true, version: 'fitty-worker/1', pinRequired: true, host: 'cloud' }

function respond(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('normalizeBridgeHealth', () => {
  it('reads the Mac bridge (no host field) as host "mac"', () => {
    expect(normalizeBridgeHealth(200, MAC_OK)).toEqual({ ...MAC_OK, host: 'mac' })
  })

  it('reads a connected Worker', () => {
    const h = normalizeBridgeHealth(200, { ...CLOUD_BASE, ok: true, auth: 'ok', message: 'Connected.', model: 'gemini-3.8-flash', provider: 'gemini', pinOk: true })
    expect(h).toMatchObject({ ok: true, host: 'cloud', provider: 'gemini', pinOk: true, pinRequired: true, model: 'gemini-3.8-flash' })
  })

  it('reads a Worker without secrets (200, provider null)', () => {
    const h = normalizeBridgeHealth(200, { ...CLOUD_BASE, ok: false, auth: 'unknown', message: 'AI is switched off on this server.', model: '', provider: null, pinOk: false })
    expect(h).toMatchObject({ ok: false, host: 'cloud', provider: null, pinOk: false })
  })

  it('reads a refused PIN (403) as refused, keeping the server message', () => {
    const h = normalizeBridgeHealth(403, { ...CLOUD_BASE, ok: false, kind: 'forbidden', auth: 'unknown', message: 'PIN required. Enter it in Settings → AI.', model: '', pinOk: false })
    expect(h).toMatchObject({ ok: false, refused: true, pinRequired: true, pinOk: false, host: 'cloud', message: 'PIN required. Enter it in Settings → AI.' })
    expect(h?.provider).toBeUndefined()
    expect(normalizeBridgeHealth(403, { ok: false, kind: 'forbidden' })?.message).toMatch(/PIN/)
  })

  it('keeps the message of other bridge-shaped errors and ignores everything else', () => {
    expect(normalizeBridgeHealth(429, { ok: false, kind: 'busy', message: 'Too many wrong PIN attempts.' })).toMatchObject({ ok: false, message: 'Too many wrong PIN attempts.' })
    expect(normalizeBridgeHealth(429, { ok: false, kind: 'busy', message: 'x' })?.refused).toBeUndefined()
    expect(normalizeBridgeHealth(404, { error: 'not found' })).toBeNull()
    expect(normalizeBridgeHealth(200, { hello: 'world' })).toBeNull()
    expect(normalizeBridgeHealth(200, 'ok')).toBeNull()
    expect(normalizeBridgeHealth(200, null)).toBeNull()
  })
})

describe('bridgeProviderLabel', () => {
  it('names the upstream in words', () => {
    expect(bridgeProviderLabel('gemini')).toBe('Gemini')
    expect(bridgeProviderLabel('anthropic')).toBe('Claude')
    expect(bridgeProviderLabel(null)).toBe('')
    expect(bridgeProviderLabel(undefined)).toBe('')
  })
})

describe('probeBridge', () => {
  it('sends the stored PIN with the deep probe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, MAC_OK))
    vi.stubGlobal('fetch', fetchMock)
    const h = await probeBridge(true, '4321')
    expect(h?.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/health?deep=1', { headers: { 'x-coach-pin': '4321' } })
  })

  it('returns null when nothing bridge-like answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }))
    expect(await probeBridge(true)).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await probeBridge(true)).toBeNull()
  })
})

describe('BridgeProvider', () => {
  it('sends the Claude model alias to the Mac bridge only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { ok: true, text: 'ready' }))
    vi.stubGlobal('fetch', fetchMock)

    await new BridgeProvider('opus', '', 'mac').coachChat('sys', [{ role: 'user', content: 'hi' }])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('opus')

    const cloud = new BridgeProvider('opus', 'long-pin-1234', 'cloud')
    expect(cloud.name).toMatch(/Cloudflare Worker/)
    await cloud.coachChat('sys', [{ role: 'user', content: 'hi' }])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('model')
    expect(fetchMock.mock.calls[1][1].headers['x-coach-pin']).toBe('long-pin-1234')
  })

  it('maps bridge error kinds, including the app kinds the Worker uses', async () => {
    const kindOf = async (status: number, body: unknown) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(status, body)))
      const e = await new BridgeProvider('', '', 'cloud').coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((err: unknown) => err)
      return e as AIError
    }
    expect((await kindOf(403, { ok: false, kind: 'forbidden', message: 'That PIN is not right. Check it in Settings → AI.' })).kind).toBe('auth')
    expect((await kindOf(403, { ok: false, kind: 'forbidden', message: 'That PIN is not right. Check it in Settings → AI.' })).message).toMatch(/PIN/)
    expect((await kindOf(429, { ok: false, kind: 'busy', message: 'Busy.' })).kind).toBe('rate_limit')
    expect((await kindOf(429, { ok: false, kind: 'rate_limit', message: 'Slow down.' })).kind).toBe('rate_limit')
    expect((await kindOf(503, { ok: false, kind: 'auth', message: 'No AI key is configured on the server.' })).kind).toBe('auth')
    expect((await kindOf(504, { ok: false, kind: 'timeout', message: 'Too slow.' })).kind).toBe('network')
    expect((await kindOf(502, { ok: false, kind: 'failed', message: 'Nope.' })).kind).toBe('unknown')
  })
})
