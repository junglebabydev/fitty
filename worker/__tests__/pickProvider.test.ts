import { describe, expect, it } from 'vitest'
import { openRouterKeyOf, pickProvider } from '../guard'

describe('provider selection', () => {
  it('uses OpenRouter when its own secret is set', () => {
    expect(pickProvider({ OPENROUTER_API_KEY: 'sk-or-v1-x' })).toBe('openrouter')
  })

  it('recognises an OpenRouter key that was saved under GEMINI_API_KEY', () => {
    const env = { GEMINI_API_KEY: ' sk-or-v1-abc ' }
    expect(pickProvider(env)).toBe('openrouter')
    expect(openRouterKeyOf(env)).toBe('sk-or-v1-abc')
    // Even when the owner pinned COACH_PROVIDER=gemini, an OpenRouter key must never be sent to Google.
    expect(pickProvider({ ...env, COACH_PROVIDER: 'gemini' })).toBe('openrouter')
  })

  it('still uses Google Gemini for a real Google key', () => {
    expect(pickProvider({ GEMINI_API_KEY: 'AIzaSyFakeFakeFake' })).toBe('gemini')
    expect(openRouterKeyOf({ GEMINI_API_KEY: 'AIzaSyFakeFakeFake' })).toBe('')
  })

  it('prefers OpenRouter, then Gemini, then Anthropic, and honours COACH_PROVIDER', () => {
    const all = { OPENROUTER_API_KEY: 'sk-or-v1-x', GEMINI_API_KEY: 'AIzaFake', ANTHROPIC_API_KEY: 'sk-ant-fake' }
    expect(pickProvider(all)).toBe('openrouter')
    expect(pickProvider({ ...all, COACH_PROVIDER: 'anthropic' })).toBe('anthropic')
    expect(pickProvider({ ...all, COACH_PROVIDER: 'gemini' })).toBe('gemini')
    expect(pickProvider({ COACH_PROVIDER: 'openrouter' })).toBeNull()
    expect(pickProvider({})).toBeNull()
  })
})
