import { describe, expect, it } from 'vitest'
import type { BridgeHealth } from '../../../ai'
import {
  CLOUD_PIN_MESSAGE,
  activeProviderLabel,
  aiStateLine,
  bridgeHostOf,
  cloudBridgeState,
  describeAI,
  inferBridgeHost,
  isConnected,
  resolveActive,
  type AISettings,
  type AIStatus,
  CLOUD_SECRETS_MESSAGE,
} from '../config'

const settings = (patch: Partial<AISettings> = {}): AISettings => ({
  mode: 'auto', providerId: 'mock', apiKey: '', model: '', geminiKey: '', geminiModel: '', bridgeModel: '', bridgePin: '', ...patch,
})

const mac = (patch: Partial<BridgeHealth> = {}): BridgeHealth => ({
  ok: true, installed: true, version: '2.1.0', auth: 'ok', message: 'Connected to Claude through Claude Code on this Mac.', model: 'sonnet', host: 'mac', ...patch,
})
const cloud = (patch: Partial<BridgeHealth> = {}): BridgeHealth => ({
  ok: true, installed: true, version: 'fitty-worker/1', auth: 'ok', message: "Connected to Google Gemini through this site's server.", model: 'gemini-3.8-flash',
  pinRequired: true, pinOk: true, host: 'cloud', provider: 'gemini', ...patch,
})
const cloudNoSecrets = cloud({ ok: false, auth: 'unknown', provider: null, pinOk: false, model: '', message: 'AI is switched off on this server: the owner has not set COACH_BRIDGE_PIN yet.' })
const cloudNoPin = cloud({ ok: false, auth: 'unknown', provider: undefined, pinOk: false, refused: true, model: '', message: 'PIN required. Enter it in Settings → AI.' })
const cloudWrongPin = cloud({ ...cloudNoPin, message: 'That PIN is not right. Check it in Settings → AI.' })
const cloudBadKey = cloud({ ok: false, auth: 'signed_out', message: 'Google rejected the GEMINI_API_KEY on the server.' })

function statusFor(s: AISettings, bridge: BridgeHealth | null, hostname = 'localhost', checking = false): AIStatus {
  const active = resolveActive(s, bridge)
  const host = bridgeHostOf(bridge, hostname)
  return {
    mode: s.mode, active, connected: isConnected(s, active, bridge), checking, bridge, host,
    cloud: host === 'cloud' ? cloudBridgeState(bridge) : 'none',
    message: describeAI(s, active, bridge, checking, host),
  }
}

describe('bridge host', () => {
  it('treats localhost and private addresses as the Mac, everything else as hosted', () => {
    for (const h of ['', 'localhost', '127.0.0.1', '192.168.1.20', '10.0.0.4', '172.16.5.5', '169.254.1.1', 'my-mac.local', '[::1]']) expect(inferBridgeHost(h)).toBe('mac')
    for (const h of ['fitty.example.workers.dev', 'coach.example.com', '172.32.0.1', '8.8.8.8']) expect(inferBridgeHost(h)).toBe('cloud')
  })

  it('believes the bridge over the hostname', () => {
    expect(bridgeHostOf(mac(), 'my-mac.tailnet.ts.net')).toBe('mac')
    expect(bridgeHostOf(cloud(), 'localhost')).toBe('cloud')
    expect(bridgeHostOf(null, 'fitty.example.workers.dev')).toBe('cloud')
  })
})

describe('resolveActive', () => {
  it('auto: bridge when ok → Gemini key → Anthropic key → demo', () => {
    const both = settings({ geminiKey: 'g', apiKey: 'a' })
    expect(resolveActive(both, mac())).toBe('claude-code')
    expect(resolveActive(both, cloud())).toBe('claude-code')
    expect(resolveActive(both, mac({ ok: false, auth: 'signed_out' }))).toBe('gemini')
    expect(resolveActive(both, cloudNoPin)).toBe('gemini')
    expect(resolveActive(both, null)).toBe('gemini')
    expect(resolveActive(settings({ apiKey: 'a' }), null)).toBe('anthropic')
    expect(resolveActive(settings(), null)).toBe('mock')
  })

  it('explicit modes always win', () => {
    expect(resolveActive(settings({ mode: 'gemini' }), mac())).toBe('gemini')
    expect(resolveActive(settings({ mode: 'anthropic', geminiKey: 'g' }), mac())).toBe('anthropic')
    expect(resolveActive(settings({ mode: 'claude-code', geminiKey: 'g' }), null)).toBe('claude-code')
    expect(resolveActive(settings({ mode: 'mock', geminiKey: 'g' }), mac())).toBe('mock')
  })

  it('connected means a real model is reachable', () => {
    expect(isConnected(settings({ mode: 'gemini', geminiKey: 'g' }), 'gemini', null)).toBe(true)
    expect(isConnected(settings({ mode: 'gemini' }), 'gemini', mac())).toBe(false)
    expect(isConnected(settings(), 'claude-code', cloudNoPin)).toBe(false)
    expect(isConnected(settings(), 'claude-code', cloud())).toBe(true)
    expect(isConnected(settings(), 'mock', mac())).toBe(false)
  })
})

describe('cloudBridgeState', () => {
  it('classifies what the Worker needs next', () => {
    expect(cloudBridgeState(null)).toBe('none')
    expect(cloudBridgeState(cloud())).toBe('ok')
    expect(cloudBridgeState(cloudNoSecrets)).toBe('secrets')
    expect(cloudBridgeState(cloud({ ok: false, auth: 'signed_out', provider: null, message: 'No AI key is configured on the server.' }))).toBe('secrets')
    expect(cloudBridgeState(cloudNoPin)).toBe('pin')
    expect(cloudBridgeState(cloudWrongPin)).toBe('pin')
    expect(cloudBridgeState(cloudBadKey)).toBe('error')
  })
})

describe('describeAI + aiStateLine', () => {
  it('Gemini with a key on this device', () => {
    const st = statusFor(settings({ mode: 'gemini', geminiKey: 'g' }), null)
    expect(st.active).toBe('gemini')
    expect(st.connected).toBe(true)
    expect(st.message).toBe('Connected to Gemini with your API key.')
    expect(aiStateLine(st)).toEqual({ line: 'Connected · Gemini with your API key', tone: 'ok' })
  })

  it('Gemini mode without a key', () => {
    const st = statusFor(settings({ mode: 'gemini' }), null)
    expect(st.connected).toBe(false)
    expect(st.message).toBe('Add a Gemini API key in Settings → AI to connect.')
    expect(aiStateLine(st)).toEqual({ line: 'Gemini API key needed', tone: 'warn' })
  })

  it('auto falls to the Gemini key when the bridge is not ok', () => {
    const st = statusFor(settings({ geminiKey: 'g' }), cloudNoPin, 'fitty.example.workers.dev')
    expect(st.active).toBe('gemini')
    expect(aiStateLine(st).line).toBe('Connected · Gemini with your API key')
  })

  it('hosted with no Worker secrets and a device Gemini key reads as connected, not as an error', () => {
    for (const bridge of [cloudNoSecrets, cloud({ ok: false, auth: 'signed_out', provider: null, message: 'No AI key is configured on the server.' }), null]) {
      const st = statusFor(settings({ geminiKey: 'g' }), bridge, 'fitty.example.workers.dev')
      expect(st.active).toBe('gemini')
      expect(st.connected).toBe(true)
      expect(st.message).toBe('Connected to Gemini with your API key.')
      expect(aiStateLine(st)).toEqual({ line: 'Connected · Gemini with your API key', tone: 'ok' })
    }
  })

  it('Cloudflare Worker, connected', () => {
    const st = statusFor(settings({ bridgePin: 'long-pin-1234' }), cloud(), 'fitty.example.workers.dev')
    expect(st.message).toBe('Connected to AI through your Cloudflare Worker (Gemini).')
    expect(aiStateLine(st)).toEqual({ line: 'Connected · Gemini through your Cloudflare Worker', tone: 'ok' })
    expect(statusFor(settings(), cloud({ provider: 'anthropic' }), 'x.example.com').message).toBe('Connected to AI through your Cloudflare Worker (Claude).')
  })

  it('Cloudflare Worker, PIN not entered yet', () => {
    for (const mode of ['auto', 'claude-code'] as const) {
      const st = statusFor(settings({ mode }), cloudNoPin, 'fitty.example.workers.dev')
      expect(st.connected).toBe(false)
      expect(st.message).toBe(CLOUD_PIN_MESSAGE)
      expect(st.message).toBe('Enter your bridge PIN in Settings → AI.')
      expect(aiStateLine(st)).toEqual({ line: 'Bridge PIN needed', tone: 'warn' })
    }
  })

  it('Cloudflare Worker, stored PIN refused: the Worker says what is wrong', () => {
    const st = statusFor(settings({ mode: 'claude-code', bridgePin: 'wrong-pin-0000' }), cloudWrongPin, 'fitty.example.workers.dev')
    expect(st.message).toBe('That PIN is not right. Check it in Settings → AI.')
    expect(aiStateLine(st).line).toBe('Bridge PIN needed')
  })

  it('Cloudflare Worker chosen but without secrets', () => {
    const st = statusFor(settings({ mode: 'claude-code' }), cloudNoSecrets, 'fitty.example.workers.dev')
    expect(st.message).toMatch(/COACH_BRIDGE_PIN/)
    expect(aiStateLine(st)).toEqual({ line: 'Worker secrets needed', tone: 'warn' })
    const silent = statusFor(settings({ mode: 'claude-code' }), { ...cloudNoSecrets, message: '' }, 'fitty.example.workers.dev')
    expect(silent.message).toBe(CLOUD_SECRETS_MESSAGE)
  })

  it('hosted, auto, nothing set up: points at the device key and stays in demo', () => {
    for (const bridge of [null, cloudNoSecrets]) {
      const st = statusFor(settings(), bridge, 'fitty.example.workers.dev')
      expect(st.active).toBe('mock')
      expect(st.message).toBe('AI is not connected yet. Add a Gemini API key in Settings → AI.')
      expect(aiStateLine(st)).toEqual({ line: 'Demo mode', tone: 'muted' })
    }
  })

  it('Cloudflare Worker with a rejected upstream key shows the Worker message, never the Mac sign-in line', () => {
    const st = statusFor(settings({ mode: 'claude-code', bridgePin: 'long-pin-1234' }), cloudBadKey, 'fitty.example.workers.dev')
    expect(st.message).toBe('Google rejected the GEMINI_API_KEY on the server.')
    expect(aiStateLine(st).line).not.toMatch(/Mac/)
    expect(aiStateLine(st).tone).toBe('warn')
  })

  it('keeps the Mac messages unchanged', () => {
    const ok = statusFor(settings(), mac())
    expect(ok.message).toBe('Connected to Claude through Claude Code on your Mac (your subscription).')
    expect(aiStateLine(ok)).toEqual({ line: 'Connected · Claude through your Mac', tone: 'ok' })

    const signedOut = statusFor(settings(), mac({ ok: false, auth: 'signed_out', message: 'Claude Code on this Mac is signed out.' }))
    expect(signedOut.message).toBe('Claude Code on this Mac is signed out.')
    expect(aiStateLine(signedOut)).toEqual({ line: 'Sign in needed on your Mac', tone: 'warn' })

    const missing = statusFor(settings({ mode: 'claude-code' }), mac({ ok: false, installed: false, auth: 'unknown', message: 'Claude Code is not installed on this Mac.' }))
    expect(missing.message).toBe('Claude Code is not installed on the Mac that serves this app.')

    const silent = statusFor(settings({ mode: 'claude-code' }), null)
    expect(silent.message).toBe('The AI bridge on your Mac is not answering. Start the app server on your Mac.')
    expect(aiStateLine(silent)).toEqual({ line: 'Your Mac is not answering', tone: 'warn' })

    const nothing = statusFor(settings(), null)
    expect(nothing.message).toBe('AI is not connected yet. Sign in to Claude Code on your Mac, or add an API key in Settings → AI.')
    expect(aiStateLine(nothing)).toEqual({ line: 'Demo mode', tone: 'muted' })
  })

  it('Anthropic key, demo and checking', () => {
    const key = statusFor(settings({ mode: 'anthropic', apiKey: 'a' }), null)
    expect(key.message).toBe('Connected with your Anthropic API key.')
    expect(aiStateLine(key).line).toBe('Connected · API key')
    expect(aiStateLine(statusFor(settings({ mode: 'anthropic' }), null))).toEqual({ line: 'API key needed', tone: 'warn' })
    const demo = statusFor(settings({ mode: 'mock' }), mac())
    expect(demo.message).toBe('On-device demo mode. Nothing leaves this phone; estimates are placeholders.')
    const checking = statusFor(settings(), null, 'localhost', true)
    expect(checking.message).toBe('Checking AI connection…')
    expect(aiStateLine(checking)).toEqual({ line: 'Checking…', tone: 'muted' })
  })
})

describe('activeProviderLabel', () => {
  it('says who receives a request', () => {
    expect(activeProviderLabel({ active: 'gemini', bridge: null, host: 'mac' })).toBe('Google Gemini, with your API key')
    expect(activeProviderLabel({ active: 'anthropic', bridge: null, host: 'mac' })).toBe('Claude, through the Anthropic API with your key')
    expect(activeProviderLabel({ active: 'claude-code', bridge: mac(), host: 'mac' })).toBe('Claude, through Claude Code on your Mac (your subscription)')
    expect(activeProviderLabel({ active: 'claude-code', bridge: cloud(), host: 'cloud' })).toBe('Gemini, through your Cloudflare Worker')
    expect(activeProviderLabel({ active: 'mock', bridge: null, host: 'mac' })).toBe('On-device demo (nothing is sent)')
  })
})
