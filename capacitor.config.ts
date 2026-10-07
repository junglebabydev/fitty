import type { CapacitorConfig } from '@capacitor/cli'

// The iPhone app: the same Vite build as the web app (`npm run ios`, mode 'ios', into dist-ios), bundled into a
// native shell. See docs/IOS.md.
const config: CapacitorConfig = {
  appId: 'com.vadayve.coach',
  appName: 'Coach',
  webDir: 'dist-ios',
  // The app runs on capacitor://localhost, so AI calls to the Worker are cross-origin. Native HTTP sends them
  // without a browser Origin, so neither CORS nor the Worker's same-origin check stands in the way; the PIN still does.
  plugins: { CapacitorHttp: { enabled: true } },
}

export default config
