# Apple Health and Apple Watch data

Facts checked on 2026-09-17. Sources are linked inline; anything not verified is marked as such.

## Summary

- **Yes, in two ways.** Today, with the PWA as it is: export from the Health app and import the file on the device (built: `importAppleHealthExport` in `src/native/healthExport.ts`). For live sync: wrap the app in a Capacitor iOS shell and read HealthKit through a plugin.
- **A web app or PWA cannot read HealthKit.** There is no browser API. HealthKit needs a native iOS app carrying the HealthKit entitlement.
- **No watch app is needed.** Apple Watch data syncs into the iPhone's HealthKit store on its own, so reading HealthKit on the iPhone is reading the Watch.
- **Recommended plugin:** `@capgo/capacitor-health` (Capacitor 8, MPL-2.0). It is the only maintained option that covers sleep stages, HRV, resting HR, body mass, workouts and writes.
- **Prerequisites for the native route:** full Xcode 26+ (this Mac has only the Command Line Tools), an Apple ID, and an iPhone. A free Apple ID works, including the HealthKit capability, but the app expires every 7 days. The paid Apple Developer Program (USD 99/yr) removes that.

## 1. What is and is not possible

| Question | Answer |
|---|---|
| Web/PWA API for HealthKit? | None. Apple's docs define HealthKit access only through the [`com.apple.developer.healthkit` entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit) on a native app, enabled as a capability in Xcode ([Configuring HealthKit access](https://developer.apple.com/documentation/xcode/configuring-healthkit-access)). Safari exposes nothing equivalent. Third-party write-ups agree there is "no web or server-side API" ([Open Wearables](https://openwearables.io/blog/apple-healthkit-api-what-data-you-can-access-and-how)). |
| Do I need a watchOS app? | No. Sleep stages, resting HR, HRV, workouts, active energy and steps recorded by the Watch, and body mass from a connected scale, are written to the iPhone's HealthKit store. A native iPhone app with read permission sees all of it. |
| iPad? | HealthKit on iPad exists since iPadOS 17, but the Watch pairs to the iPhone. Target the iPhone. |
| Can the user tell if read access was denied? | No. HealthKit hides read denial by design; a denied type just returns no samples. `src/native/health.ts` already documents treating "granted but empty" as granted. |

## 2. Capacitor plugin comparison

Versions, dates, licences and peer dependencies were read from the npm registry on 2026-09-17. Data types are from each README.

| Plugin | Latest release | Capacitor | Licence | Sleep stages | HRV | Resting HR | Body mass | Workouts | Write |
|---|---|---|---|---|---|---|---|---|---|
| [`@capgo/capacitor-health`](https://github.com/Cap-go/capacitor-health) | 8.11.3, 2026-09-16 | 8 (v7 line "on demand") | MPL-2.0 | Yes (`inBed, asleep, awake, rem, deep, light`) | Yes | Yes | Yes | Yes (`queryWorkouts`: type, duration, energy, distance) | Yes (`saveSample`: weight, sleep, HR, steps and more) |
| [`capacitor-health`](https://github.com/mley/capacitor-health) (mley) | 8.2.0, 2026-08-19 | 8 | MIT | No sleep at all | No | No | Yes | Yes (with heart rate and route) | Workouts only |
| [`@flomentumsolutions/capacitor-health-extended`](https://github.com/Flomentum-Solutions/capacitor-health-extended) | 0.8.3, 2026-02-05 | 8 | MIT | Sleep with REM duration | Yes | Yes | Yes | Yes | Workouts, weight, height, body fat, resting HR |
| [`@perfood/capacitor-healthkit`](https://github.com/perfood/capacitor-healthkit) | 1.3.2, 2025-02-13 (v2 alpha last published 2023-10) | peer dep `@capacitor/core ^4` | MIT | Not documented | No | No | Yes | Yes | Untested per its README |
| [`cordova-plugin-health`](https://github.com/dariosalvi78/cordova-plugin-health) | 3.2.4, 2024-12-23 | Cordova plugin; Capacitor via manual setup | MIT | Yes | Yes | Yes | Yes | Yes (`activity`) | Yes (`store`) |
| Official Ionic/Capacitor plugin | None. `@capacitor/health` does not exist on npm. `@awesome-cordova-plugins/health-kit` (9.6.0, 2026-09-07) is only a typed wrapper around the old Cordova HealthKit plugin. | | | | | | | | |

**Recommendation: `@capgo/capacitor-health`.**

1. It is the only one that covers every type this app needs (sleep stages, HRV, resting HR, body mass, workouts, steps, active energy) and also writes workouts and body mass, which `HealthBridge.writeWorkout` / `writeBodyMass` need.
2. It tracks the current Capacitor major and shipped a release the day before this was written. It also has `queryAggregated` (daily sums for steps and energy computed natively, which handles the iPhone + Watch double count for us).
3. Trade-offs to accept: MPL-2.0 is file-level copyleft (fine for a private app; changes to the plugin's own files must be shared if distributed). Release cadence is very high (three releases in 24 hours), so pin an exact version. Its README documents no background delivery or observer API.

Runner-up: `capacitor-health-extended` (MIT) if the MPL licence is a problem, accepting a pre-1.0 fork with its last release seven months ago. `@perfood/capacitor-healthkit` is effectively stale. `capacitor-health` (mley) is healthy but lacks sleep, HRV and resting HR, which rules it out here.

## 3. Wrapping this Vite app in Capacitor for iOS

### Prerequisites (be honest about these)

1. **Full Xcode 26.0 or newer.** [Capacitor 8 requires it](https://capacitorjs.com/docs/getting-started/environment-setup). This machine has only the Command Line Tools (`xcode-select -p` returns `/Library/Developer/CommandLineTools`; `xcodebuild` fails). Xcode is a free, multi-gigabyte download from the Mac App Store, plus the iOS platform component.
2. **Node 22+** (Capacitor 8 requirement). This machine has v22.17.0.
3. **A real iPhone.** The simulator has a HealthKit store but no Watch or real data.
4. **An Apple ID.**
   - *Free (personal team):* on-device installs work. Apple's [membership comparison](https://developer.apple.com/support/compare-memberships/) lists on-device testing for free accounts, with provisioning profiles that expire after 7 days, so the app must be rebuilt and reinstalled from Xcode weekly. Reinstalling over the top normally keeps the app's data (not verified here); export a backup from Settings → Data first anyway.
   - **HealthKit on a free team: supported.** Apple's [Supported capabilities (iOS)](https://developer.apple.com/help/account/reference/supported-capabilities-ios) table has three columns (ADP, ADEP, Apple Developer). The HealthKit row is checked in all three, including the free "Apple Developer" column. For contrast, Push Notifications, iCloud and Siri are unchecked for free accounts, and "HealthKit Estimate Recalibration" is paid-only. Verified by parsing the page HTML on 2026-09-17. Not verified on a device, because Xcode is not installed here.
   - *Paid [Apple Developer Program](https://developer.apple.com/programs/), USD 99/yr (the long-standing published price; the pricing page could not be fetched today, so confirm at enrolment):* one-year profiles, TestFlight, and no weekly rebuild. Worth it only once the weekly reinstall becomes annoying.
   - *Unverified:* whether the HealthKit **background delivery** sub-entitlement provisions on a free team. The table has no separate row for it.

### Steps

```bash
# 1. Capacitor core + iOS platform (pin the plugin version)
npm i @capacitor/core @capacitor/ios
npm i -D @capacitor/cli
npm i @capgo/capacitor-health@8.11.3

# 2. Initialise. App id must be unique to you, e.g. com.example.coach
npx cap init "Coach" "com.example.coach" --web-dir dist

# 3. Build the web app, create the Xcode project, copy assets in
npm run build
npx cap add ios          # Capacitor 8 uses Swift Package Manager by default
npx cap sync ios

# 4. Open in Xcode
npx cap open ios
```

Commands follow the [Capacitor getting-started guide](https://capacitorjs.com/docs/getting-started). Then in Xcode:

1. Target **App** → **Signing & Capabilities** → choose your Team (personal team is fine) → **+ Capability** → **HealthKit**. This writes `com.apple.developer.healthkit` into `App.entitlements`.
2. Add both usage strings to `ios/App/App/Info.plist`. iOS terminates the app on the permission request if they are missing:

```xml
<key>NSHealthShareUsageDescription</key>
<string>Coach reads sleep, weight, resting heart rate, HRV, steps, active energy and workouts to adjust your plan. Data stays on this iPhone.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>Coach saves workouts and weigh-ins you log to Apple Health, only when you turn this on in Settings.</string>
```

3. Plug in the iPhone, enable **Developer Mode** on it (Settings → Privacy & Security), select it as the run destination and press Run. With a free Apple ID, also trust the developer profile under Settings → General → VPN & Device Management.
4. Every web change needs `npm run build && npx cap sync ios` before the next Run.

### Things that change inside the shell

- `vite-plugin-pwa`'s service worker is unnecessary in a `capacitor://` WebView. Disable registration when `Capacitor.isNativePlatform()` is true.
- sql.js + IndexedDB keeps working in WKWebView. `src/db/database.ts` already names `@capacitor-community/sqlite` as the later swap point. Not required for HealthKit.
- Web Speech recognition may not be available inside WKWebView (not verified here). If it is missing, voice capture needs a native speech plugin.

### Background delivery

`HKObserverQuery` plus [`enableBackgroundDelivery`](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)) wakes the app when new samples arrive. It needs the extra `com.apple.developer.healthkit.background-delivery` entitlement (a checkbox under the HealthKit capability), some types such as step count are limited to hourly delivery, and **HealthKit cannot be read while the iPhone is locked**. None of the plugins above document this API, so it means a small custom Swift plugin. It is not needed at first: reading the last few days each time the app opens gives the same result for a once-a-morning app.

## 4. Options that work with the PWA today (no native code)

### (a) Health app export, imported on the device. Built.

Health app → Summary → profile picture (top right) → **Export All Health Data** → save `export.zip` to Files ([Apple Support](https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios)). The zip holds `apple_health_export/export.xml` (every record and workout), `export_cda.xml`, GPX routes and ECG CSVs.

`importAppleHealthExport(file, { days, onProgress })` takes the zip or the bare XML, streams it (unzip → decode → tag scan), keeps the last 90 days and writes to the tables in section 6. Measured here on a generated 480 MB `export.xml` (as a plain zip, as a streamed zip with data descriptors, and as bare XML): 3 to 4 seconds under Node on this Mac, peak process memory 160 to 300 MB including the Node runtime, and a second import writes zero rows. An iPhone will be slower; it has not been run on one yet.

Limits:

1. Manual, and the export itself is slow: several minutes on the phone for a multi-year history, and the zip is often 50 to 300 MB.
2. It is a snapshot. The export day is partial, so the importer leaves that day's steps and active energy out; the next export fills it in.
3. Already-imported days are skipped rather than updated, which is what makes re-import safe.
4. Afternoon naps are counted into the following night, a side effect of the noon-to-noon grouping.
5. If the streamed unzip ever fails on a particular archive, unzip in Files and pick `export.xml` directly.
6. Demo (seed) rows block real rows for the same dates. Delete demo data first in Settings → Data; the importer warns when this happens.

### (b) Third-party export apps and Shortcuts

| Option | What it does | Realistic limits |
|---|---|---|
| [Health Auto Export](https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069) | Exports 150+ metrics and workouts as JSON or CSV; automations to iCloud Drive, Dropbox, or [REST POST](https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/) ([API docs](https://github.com/Lybron/health-auto-export)) | Automations need its paid tier (pricing not re-checked today). Per its [FAQ](https://help.healthyapps.dev/en/health-auto-export/faq/), they run only while the iPhone is unlocked and only when iOS grants background time, so no guaranteed schedule. REST needs a server to receive the POST, which this local-first app does not have. The practical use is "export JSON to Files, then pick the file in the app", which needs a second small importer for its JSON shape. |
| iOS Shortcuts, **Find Health Samples** | A shortcut can query a type and date range, build JSON, and save it to Files or iCloud Drive. Can run as a time-of-day personal automation ([worked example](https://blog.maximeheckel.com/posts/build-personal-health-api-shortcuts-serverless/), [heartbridge](https://github.com/mm/heartbridge)) | One action per data type, so the shortcut gets long. Sleep stage samples are awkward to reshape in Shortcuts. It fails when the phone is locked, since Health data is encrypted then. Large ranges are slow. A PWA cannot watch a folder, so the user still has to pick the file. Good for a daily top-up of weight, resting HR and steps, not for history. |

Neither beats (a) for history or the native shell for daily use. They are stopgaps.

## 5. WorkoutKit: later work

[WorkoutKit](https://developer.apple.com/documentation/workoutkit) (iOS 17+, watchOS 10+) creates structured workouts (custom intervals, single-goal, pacer, multisport) and, with user permission, schedules them into the Workout app on the Watch under the app's own name via `WorkoutScheduler`. It is a Swift-only framework with no Capacitor plugin, so it needs a custom Swift plugin inside the shell. It fits this app's conditioning and swim sessions well. The Watch's built-in strength workout has no sets-and-reps model, so strength sessions cannot be pushed in any useful form.

## 6. Recommended path

| Stage | What | Needs |
|---|---|---|
| **Today** | Settings → Health gets an "Import Apple Health export" file picker calling `importAppleHealthExport`. Re-export every week or two. | Nothing. Importer and tests exist; the screen wiring is the remaining step. |
| **Next** | Capacitor shell + `@capgo/capacitor-health`. Write a `CapacitorHealthBridge implements HealthBridge` and register it at boot with `setHealthBridge()`. The existing `importHealthData()` in `src/features/settings/healthImport.ts` then works unchanged. Pull the last 7 days on every app open. | Xcode 26+, Apple ID (free is enough to start), iPhone, about a day of work. |
| **Later** | Custom Swift plugin for WorkoutKit scheduling and HealthKit background delivery. Move to the paid program once the 7-day reinstall is a nuisance. | Swift, paid program recommended. |

### Mapping: HealthKit type → app table

| HealthKit identifier | App table | Row written | Bridge method |
|---|---|---|---|
| `HKCategoryTypeIdentifierSleepAnalysis` (AsleepCore, AsleepDeep, AsleepREM, AsleepUnspecified; InBed only as fallback) | `sleep_records` | One row per night: `start_ts` first asleep, `end_ts` last asleep, `duration_min` summed asleep minutes, `source 'healthkit'` | `readSleep(days)` |
| `HKQuantityTypeIdentifierBodyMass` | `body_metrics` | `type 'weight'`, kg (lb, st, g converted), one row per weigh-in | `readBodyMass(days)`, `writeBodyMass(kg, ts)` |
| `HKQuantityTypeIdentifierRestingHeartRate` | `health_metrics` | `type 'resting_hr'`, bpm, daily mean | `readRestingHr(days)` |
| `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `health_metrics` | `type 'hrv'`, ms, daily mean | not on `HealthBridge` yet |
| `HKQuantityTypeIdentifierStepCount` | `health_metrics` | `type 'steps'`, count, daily sum, Watch preferred over iPhone | not on `HealthBridge` yet |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | `health_metrics` | `type 'active_energy'`, kcal (kJ converted), daily sum | not on `HealthBridge` yet |
| `HKWorkout` (`workoutActivityType`, duration, distance and average HR statistics) | `cardio_sessions` | `modality` friendly name (Running, Walking, Cycling, Swimming, Strength training, HIIT, Yoga), `duration_min`, `distance_km`, `avg_hr`, `source 'healthkit'` | `readWorkouts(days)`, `writeWorkout(summary)` |

The export importer already fills all seven rows. `HealthBridge` covers four of them; adding `readHrv`, `readSteps` and `readActiveEnergy` is a small additive change to make in the "Next" stage. With the recommended plugin, use `queryAggregated` (bucket `day`, `sum`) for steps and active energy. HealthKit's statistics queries de-duplicate iPhone and Watch samples natively; confirm the plugin uses them by comparing one day against the Health app. Use `readSamples` for sleep and HRV, which that plugin does not aggregate.
