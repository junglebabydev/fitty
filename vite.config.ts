import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { aiBridge } from './server/aiBridge'

// COACH_HTTPS=1 (npm run dev:https) serves a self-signed HTTPS origin so the iPhone gets a secure context:
// that is what enables the microphone / speech recognition and live camera over Wi-Fi.
const https = process.env.COACH_HTTPS === '1'

export default defineConfig({
  plugins: [
    react(),
    aiBridge(),
    ...(https ? [basicSsl()] : []),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sql-wasm.wasm'],
      manifest: {
        name: 'Coach',
        short_name: 'Coach',
        description: 'Personal fitness coach — local-first',
        theme_color: '#0a0b0d',
        background_color: '#0a0b0d',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Exercise photos (public-domain free-exercise-db) are cached after first view so workouts work offline.
        runtimeCaching: [{
          urlPattern: /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/.*\.(?:jpg|jpeg|png|gif)$/,
          handler: 'CacheFirst',
          options: { cacheName: 'exercise-media', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
        }], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, globPatterns: ['**/*.{js,css,html,svg,wasm,woff2}'] },
    }),
  ],
  // sql.js ships CJS/UMD only; pre-bundling makes its default import work in dev.
  optimizeDeps: { include: ['sql.js'] },
  test: { environment: 'node' },
} as any)
