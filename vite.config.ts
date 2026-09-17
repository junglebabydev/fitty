import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { aiBridge } from './server/aiBridge'

// COACH_HTTPS=1 (npm run dev:https) serves a self-signed HTTPS origin so the iPhone gets a secure context:
// that is what enables the microphone / speech recognition and live camera over Wi-Fi.
const https = process.env.COACH_HTTPS === '1'

// Shown in Settings → About so it is obvious which build a device is running (service workers cache old shells).
const commit = (process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 7)
const builtAt = new Date().toISOString()
const buildId = commit || builtAt.slice(0, 16).replace('T', ' ')

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId), __BUILD_TIME__: JSON.stringify(builtAt) },
  plugins: [
    react(),
    aiBridge(),
    ...(https ? [basicSsl()] : []),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Behind Cloudflare Access the manifest must be fetched WITH the login cookie, or the browser gets the
      // Access sign-in page instead and "Add to Home Screen" loses the app name and icon.
      useCredentials: true,
      includeAssets: ['sql-wasm.wasm'],
      manifest: {
        name: 'Coach',
        short_name: 'Coach',
        description: 'Personal fitness coach — local-first',
        theme_color: '#0a0b0d',
        background_color: '#0a0b0d',
        display: 'standalone',
        // iOS ignores SVG icons, so the PNGs (rendered from public/icon.svg) are what "Add to Home Screen" uses.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Exercise photos (public-domain free-exercise-db) are cached after first view so workouts work offline.
        runtimeCaching: [{
          urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/.*\.(?:jpg|jpeg|png|gif)$/,
          handler: 'CacheFirst',
          options: { cacheName: 'exercise-media', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
        }], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff2}'] },
    }),
  ],
  // sql.js ships CJS/UMD only; pre-bundling makes its default import work in dev.
  optimizeDeps: { include: ['sql.js'] },
  test: { environment: 'node' },
} as any)
