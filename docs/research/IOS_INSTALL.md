# Research — Running the app on your own iPhone (and Watch) without the App Store (2026-09-29)

Input to [PRD_PHONE_AND_FOCUS_PANEL.md](../PRD_PHONE_AND_FOCUS_PANEL.md) §1. Current as of September 2026.

## Summary

- The PWA already works on a Home Screen. It cannot reach HealthKit, the Apple Watch or Bluetooth.
- Live heart rate from the Watch needs native code: a watchOS app that runs a workout session and
  mirrors it to the iPhone (iOS 17+).
- Apple's capability table shows that HealthKit, Background Modes and App Groups are available on a
  **free** Apple ID ("Personal Team"). The cost of free is that every install must be re-signed from
  Xcode **every 7 days**.
- The paid program (US$99/yr) removes that: development installs last about a year, and internal
  TestFlight builds last 90 days with no review.

## 1. The PWA on the Home Screen

**Works:**
- **Standalone.** Since iOS 26, sites added to the Home Screen open as web apps by default.
- **Offline.** Service workers run in standalone mode.
- **Screen Wake Lock.** Fixed for Home Screen apps in iOS 18.4.
- **Web Push.** Since iOS 16.4, for Home Screen apps only. No developer account needed.
- **Storage:**
  - Home Screen web apps are exempt from ITP's 7-day cap on script-writable storage, and their data
    is kept separate from Safari's.
  - The quota is the same as Safari's (up to about 60% of disk per site).
  - Under disk pressure, data is still evicted least-recently-used first. `navigator.storage.persist()`
    protects against that, and a Home Screen install counts toward granting it.

**Cannot work:** HealthKit, anything on the Apple Watch, Web Bluetooth (no iOS browser has it), and
background workout sessions.

**EU:** Apple's plan to remove Home Screen web apps was reversed in March 2024. It doesn't apply in
Singapore anyway.

## 2. Capacitor (v8) around the Vite app

Steps:
1. `npm i @capacitor/core @capacitor/cli @capacitor/ios`
2. `npx cap init` with `webDir: "dist"`
3. `npx cap add ios` (Swift Package Manager by default)
4. `vite build && npx cap sync ios`, then open in Xcode and run on the device.

Ship the **bundled** files. Capacitor's docs say `server.url` is for live reload during development,
"not intended for use in production".

Consequences for this app (checked in the code):
1. **Data does not carry over.** The bundled app runs on the `capacitor://localhost` origin, so the
   PWA's IndexedDB database is invisible to it. `/settings/data` can export but **cannot import**,
   so an import (restore) step is required.
2. **The AI bridge breaks.** `src/ai/bridge.ts` calls the relative `/api/ai`. Under
   `capacitor://localhost` that path resolves to nothing. It needs an absolute Worker URL, and the
   Worker needs CORS for that origin (the coach Worker too).
3. **HealthKit needs a plugin.** There is no official Capacitor HealthKit plugin, so it's a community
   plugin or a small custom Swift plugin. Which one to use isn't verified.

## 3. Ways to install without publishing

| Path | Cost | Expiry | Limits | Verdict |
|---|---|---|---|---|
| Home Screen PWA | $0 | none | no HealthKit or Watch | Use today |
| Xcode, free Personal Team | $0 | **7 days**, then re-run from Xcode (in-app data survives) | 3 devices; 10 App IDs per 7 days; 3 apps per device; Developer Mode on the iPhone (and the Watch) | Good for proving the shell |
| Xcode, paid program (development) | US$99/yr | about 1 year | none that matter here | Daily use |
| TestFlight, internal testing | paid program | 90 days per build | no Beta App Review for internal testers; one-tap install | Easiest long-term |
| Ad Hoc | paid program | about 1 year | 100 devices per type | Not needed |
| AltStore / SideStore / LiveContainer | $0 | automates the 7-day refresh | re-signing can strip entitlements (HealthKit, Watch) | Not worth it |
| EU / Japan alternative distribution | — | — | not available in Singapore | Not relevant |

Free-tier capabilities (Apple's "Supported capabilities" pages, "Apple Developer" column), verified
2026-09-29:
- iOS: HealthKit ✓, Background Modes ✓, App Groups ✓.
- The research agent read native push as ✗ on free. A direct fetch of the iOS table read it as ✓.
  **Treat it as unverified.** The app doesn't need native push.

## 4. Live heart rate from the Watch

| Route | Live? | Needs |
|---|---|---|
| HealthKit query on the iPhone | **No.** Watch-to-phone sync isn't real time (Apple forums). | iOS app + HealthKit |
| watchOS app: `HKWorkoutSession` + `HKLiveWorkoutBuilder`, sending samples over WatchConnectivity | Yes, within seconds | watchOS target, HealthKit, workout background mode |
| **Workout mirroring** (iOS 17 / watchOS 10): `startMirroringToCompanionDevice()` on the watch; the iPhone receives it through `workoutSessionMirroringStartHandler` and exchanges data with `sendToRemoteWorkoutSession(data:)` | Yes. This is Apple's recommended pattern (WWDC23 "Build a multi-device workout app"). | Same as above |
| Watch as a Bluetooth heart-rate sensor | No. watchOS doesn't advertise the standard heart-rate profile, and apps like HeartCast relay through the phone. | Third-party apps |
| Bluetooth chest strap via a Capacitor Bluetooth plugin | Yes. The cheapest live option. | Bluetooth permission text and background mode |
| From a PWA | **No** | — |

The Watch route works on a free team according to Apple's tables, but both apps expire every 7 days.

## 5. Recommendation ladder

1. **Today, $0:** Home Screen PWA from the deployed URL. Add `navigator.storage.persist()` and a
   restore/import step.
2. **Next, $0:** Capacitor shell on a free team, bundled assets, absolute Worker URL + CORS.
   Re-install weekly.
3. **Live heart rate, $99/yr:** Paid program, a small SwiftUI watchOS app using workout mirroring,
   distributed through internal TestFlight.

(A chest strap is the cheaper live-HR fallback, but the owner asked for the Watch.)

## Not verified

- Whether the watch app counts toward the free 3-app limit.
- HealthKit background delivery on a free team.
- Native push on a free team (sources conflict).
- Singapore pricing for the paid program.
- The best-maintained Capacitor HealthKit plugin.

## Sources

- [Apple: Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios)
- [Apple: Supported capabilities (watchOS)](https://developer.apple.com/help/account/reference/supported-capabilities-watchos)
- [Apple: Membership comparison](https://developer.apple.com/support/compare-memberships/)
- [Apple: Enabling Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
- [Apple: TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Apple: startMirroringToCompanionDevice](https://developer.apple.com/documentation/healthkit/hkworkoutsession/startmirroringtocompaniondevice(completion:))
- [WWDC23: Build a multi-device workout app](https://developer.apple.com/videos/play/wwdc2023/10023/)
- [Apple Developer Forums: HealthKit sync is not real-time](https://developer.apple.com/forums/thread/774953)
- [WebKit: Tracking Prevention](https://webkit.org/tracking-prevention/)
- [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit: Web Push for Web Apps on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [WebKit: Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [WebKit: Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [caniuse: Web Bluetooth](https://caniuse.com/web-bluetooth)
- [Capacitor config (v8)](https://capacitorjs.com/docs/config)
- [Announcing Capacitor 8](https://ionic.io/blog/announcing-capacitor-8)
- [HeartCast FAQ](https://www.heartcast.app/faq-help-support-issues/)
- [TechCrunch: Apple reverses EU web app decision](https://techcrunch.com/2024/03/01/apple-reverses-decision-about-blocking-web-apps-on-iphones-in-the-eu/)
