import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { initTheme } from './lib/theme'
import { setHealthBridge } from './native/health'
import App from './App'

// Offline-first shell: the service worker precaches the app bundle and sql-wasm.wasm.
// `immediate` registers on load; updates are applied automatically (registerType: 'autoUpdate').
initTheme()

// The iPhone app (mode 'ios') has no service worker: its files ship inside the app and update through TestFlight.
if (import.meta.env.MODE !== 'ios') registerSW({
  immediate: true,
  // The browser only looks for a new service worker on navigation. A home-screen app can stay open for days,
  // so ask again every minute while visible and whenever the app comes back to the foreground.
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => {})
    }
    setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
  },
})

// The iPhone app reads Apple Health through HealthKit (native/healthKit.ts), registered before the first render so
// no screen sees the web's "unavailable" bridge. The web build drops this branch.
const nativeReady = import.meta.env.MODE === 'ios'
  ? import('./native/healthKit').then(({ CapacitorHealthBridge }) => setHealthBridge(new CapacitorHealthBridge()))
  : Promise.resolve()

void nativeReady.catch((e: unknown) => console.error('[health]', e)).then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
))
