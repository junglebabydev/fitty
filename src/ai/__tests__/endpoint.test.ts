import { afterEach, describe, expect, it, vi } from 'vitest'

async function load() {
  vi.resetModules()
  return import('../endpoint')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('AI endpoint', () => {
  it('web build: same-origin /api/ai and the page hostname', async () => {
    vi.stubEnv('VITE_API_BASE', '')
    vi.stubGlobal('location', { hostname: 'fitty.example.workers.dev' })
    const { aiUrl, aiHostname } = await load()
    expect(aiUrl('/health?deep=1')).toBe('/api/ai/health?deep=1')
    expect(aiHostname()).toBe('fitty.example.workers.dev')
  })

  it('iPhone build: the Worker address, whatever the page hostname', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://fitty.example.workers.dev')
    // The shell serves the app from capacitor://localhost, which would otherwise read as the Mac bridge.
    vi.stubGlobal('location', { hostname: 'localhost' })
    const { aiUrl, aiHostname } = await load()
    expect(aiUrl('/coach/turn')).toBe('https://fitty.example.workers.dev/api/ai/coach/turn')
    expect(aiHostname()).toBe('fitty.example.workers.dev')
  })
})
