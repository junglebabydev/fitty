# The iPhone app (Capacitor + TestFlight)

The iPhone app is the same Vite build as the web app, bundled into a native shell with
[Capacitor](https://capacitorjs.com). The Xcode project is in `ios/`, and the settings are in
`capacitor.config.ts`. The app's files ship inside the app, so there is no service worker, and a new
version reaches the phone through TestFlight. Background: [PRD_PHONE_AND_FOCUS_PANEL.md](PRD_PHONE_AND_FOCUS_PANEL.md) §1 and
[research/IOS_INSTALL.md](research/IOS_INSTALL.md).

## How it differs from the web app

| | Web (Home Screen PWA) | iPhone app |
|---|---|---|
| Served from | the Worker's https origin | `capacitor://localhost`, bundled |
| AI calls | same-origin `/api/ai` | `VITE_API_BASE` + `/api/ai`, through native HTTP (`CapacitorHttp`), so they carry no browser Origin and need no CORS. The PIN is still required. |
| Updates | service worker, automatic | a new TestFlight build |
| Data | the browser's IndexedDB for that origin | the app's own storage. It starts empty: unlock with the PIN to load the owner profile. History logged in the PWA does not move across. |
| Apple Health | export file import only | HealthKit reads too: sleep, resting HR and weight (below) |

**Cloudflare Access must be off** for the Worker (Workers & Pages → `fitty` → Access). Native requests can't
complete the Access login. With Access off, the PIN is the only lock on `/api/ai/*`, including `/api/ai/owner`,
so `COACH_BRIDGE_PIN` must be a long random token (DEPLOY.md §2).

## One-time setup

1. **Install Xcode** from the Mac App Store. Then run `sudo xcode-select -s /Applications/Xcode.app` and open Xcode once
   to accept the license and install the iOS platform.
2. **Pick how to sign.**
   - A **free Apple ID** is enough to run the app and read HealthKit. Add it under Xcode → Settings → Accounts.
     Each install expires after 7 days; press ▶ in Xcode again, and your data stays as long as you don't delete
     the app first.
   - The **Apple Developer Program** (US$99/yr) adds TestFlight and installs that last a year. That's the plan
     for the Watch app.
3. **Tell the build where the Worker is.** Create `.env.ios` in the repo root. It is git-ignored, and
   `npm run ios` refuses to build without it.

   ```
   VITE_API_BASE=https://<your worker host>
   ```

4. **Signing.** `npm run ios:open`. In Xcode select the **App** target → Signing & Capabilities → choose your
   Team: "(Personal Team)" on a free Apple ID. HealthKit is already switched on through `App/App.entitlements`. The bundle ID is `com.vadayve.coach` (`capacitor.config.ts` and the Xcode project). Change both
   before the first upload if you want another one.
5. **App Store Connect** (paid program only). At appstoreconnect.apple.com → Apps → **+** → New App: iOS, name "Coach" (it must be
   unique on the App Store; add a word if it is taken), bundle ID `com.vadayve.coach`, any SKU.

## Run it on your phone from Xcode

1. Run `npm run ios`. It typechecks, builds into `dist-ios`, and copies the files into `ios/`.
2. Plug in the iPhone and turn on Developer Mode (Settings → Privacy & Security). In Xcode, pick the phone as
   the run destination and press ▶.
3. The first time on a free Apple ID, trust yourself on the iPhone: Settings → General → VPN & Device Management.

## Ship a TestFlight build (paid program)

1. Bump **Build** (`CURRENT_PROJECT_VERSION`) in the App target's General tab. Each upload needs a new number.
2. `npm run ios`
3. In Xcode, set the destination to **Any iOS Device (arm64)**, then Product → **Archive**.
4. In the Organizer that opens, choose **Distribute App** → **App Store Connect** → Upload. Export compliance is
   already answered in `Info.plist` (`ITSAppUsesNonExemptEncryption` = NO).
5. In App Store Connect → the app → **TestFlight**, add yourself to an **internal** testing group. Internal
   builds need no Beta App Review and last 90 days.
6. On the iPhone, install **TestFlight** from the App Store and accept the invite.

If the upload is refused for a missing `NSHealthUpdateUsageDescription`, add one to `Info.plist`. The app doesn't
write to Health yet, so it hasn't been added.

## Apple Health (HealthKit)

- **What it reads:** sleep, resting heart rate and weight, through `@capgo/capacitor-health` (MPL-2.0, used
  unmodified). The mapping in `src/native/healthKit.ts` reuses the export importer's rules, so live reads and
  file imports dedupe each other.
- **How you turn it on:** Settings → Health → switch on the types; iOS shows its permission sheet once. After that
  the app imports once a day, at launch and whenever it comes back to the front (`importHealthIfDue`), and
  **Import now** pulls 30 days on demand.
- **Permission quirk:** HealthKit never tells an app it was refused, so a refusal just looks like no data. To change
  access later: Health app → your profile → Apps → Coach.
- **No writes yet.** The "Write to Health" switches are hidden (`FEATURES.healthWrites`). The planned Watch app
  will save workouts to Health itself.

## Checks after a new build

- The app gets past the loading screen. That proves sql.js and its wasm file load under `capacitor://`.
- After the PIN unlock, the app opens with your profile loaded.
- Health on the simulator: in the simulator's Health app, add a sleep entry and a weight by hand (Browse → the
  category → Add Data). Then switch the types on in Settings → Health and tap Import now: one night and one weigh-in
  should appear.
- Settings → AI shows the Worker as connected, and a Coach message gets a reply.
- Taking a photo, or using the mic in Coach, asks for permission and doesn't crash. The purpose strings are in
  `ios/App/App/Info.plist`.
- Focus Mode keeps the screen awake. WKWebView may not offer Screen Wake Lock, and the app feature-detects it, so
  a failure shows as the screen going to sleep. A keep-awake plugin is the fix.
- The status bar's clock and battery stay readable with the phone in Light and in Dark. iOS picks their colour
  from the phone's appearance, not the app's theme.

Before the first device run, with Access off: `curl https://<worker host>/api/ai/health` should answer with the
Worker's JSON (PIN required), not a 302. The same call with `-H 'Origin: capacitor://localhost'` should get a 403,
which is the refusal to look for if the app ever reports a cross-origin error.
