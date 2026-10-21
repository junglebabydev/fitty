import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { initTheme } from './lib/theme'
import App from './App'

// Offline-first shell: the service worker precaches the app bundle and sql-wasm.wasm (about 4 MB in all).
// Updates are applied automatically (registerType: 'autoUpdate'). A returning visit (a worker already controls the
// page) registers at once, so an update the browser finds on this navigation still reloads the app. Only a first
// visit waits until the page has loaded and the first screen had a moment, so the precache never competes with it.
initTheme()

const registerServiceWorker = () => registerSW({
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
const afterFirstScreen = () => window.setTimeout(registerServiceWorker, 3000)
if (navigator.serviceWorker?.controller) registerServiceWorker()
else if (document.readyState === 'complete') afterFirstScreen()
else window.addEventListener('load', afterFirstScreen, { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
