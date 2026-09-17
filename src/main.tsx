import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/lora/wght.css'
import '@fontsource-variable/lora/wght-italic.css'
import './index.css'
import { initTheme } from './lib/theme'
import App from './App'

// Offline-first shell: the service worker precaches the app bundle and sql-wasm.wasm.
// `immediate` registers on load; updates are applied automatically (registerType: 'autoUpdate').
initTheme()

registerSW({
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
