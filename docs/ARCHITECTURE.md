# Architecture

Local-first personal fitness coach. One user, one device, no account. The SQLite database on the phone is the system of record; cloud AI is an optional processor that only ever sees what the privacy ledger says it saw.

## Layers

| Layer | Directory | Rule |
|---|---|---|
| Screens | `src/screens/` | One file per route (see `docs/CONTRACTS.md`). Read via `useQuery`, write via repositories, never touch SQL. |
| Features | `src/features/` | Cross-screen flows: coach facts/apply, meal capture, voice sheet, workout logger pieces, AI settings. |
| UI kit + hooks | `src/components/`, `src/hooks/` | Tailwind v4 tokens, iOS-native feel, dark-mode aware. `useQuery` re-runs on every committed write. |
| Engine | `src/engine/` | Pure, deterministic, unit-tested: readiness, symptom gate, progression, nutrition targets/trends, planner, voice parser, coach priority/proposals. **No db or React imports.** |
| Data | `src/data/` | Bundled exercise library (84), Singapore + generic foods (215), mobility routines (11). |
| Repositories | `src/db/repositories/` | Synchronous typed access to every table; row mapping is internal. |
| Database | `src/db/database.ts`, `schema.ts`, `seed.ts` | sql.js (WASM SQLite) persisted to IndexedDB; ordered migrations; reference data on every boot, fictional demo seed in dev or with `?demo=1` (`shouldSeedDemo`). |
| AI | `src/ai/` | Provider abstraction (`mock`, `anthropic`) behind a gateway that checks connectivity, times out, and writes the privacy ledger. |
| Native | `src/native/` | Bridges for HealthKit (web stub + Capacitor swap notes), camera, speech, notifications, wake lock. |
| Boot | `src/main.tsx`, `src/App.tsx` | PWA service worker, boot state machine, router, onboarding guard + setup gate, shell, error boundary. |

## Module map

```mermaid
flowchart TB
  subgraph Boot
    main[main.tsx] --> App[App.tsx]
  end
  subgraph UI
    App --> Screens[screens/*]
    Screens --> Features[features/*]
    Screens --> Kit[components/* + hooks/*]
    Features --> Kit
  end
  subgraph Domain
    Features --> Engine[engine/*<br/>pure rules]
    Screens --> Engine
    Engine --> Data[data/*<br/>exercises · foods · mobility]
    Features --> Data
  end
  subgraph Storage
    Screens --> Repos[db/repositories/*]
    Features --> Repos
    Repos --> DB[(db/database.ts<br/>sql.js → IndexedDB)]
    Seed[db/seed.ts] --> Repos
    App --> Seed
    Kit -. useQuery subscribes .-> DB
  end
  subgraph External
    Features --> Gateway[ai/gateway.ts]
    Gateway --> Mock[MockProvider]
    Gateway --> Anthropic[AnthropicProvider]
    Gateway -. ledger entry .-> Repos
    Features --> Native[native/*]
    Native -. Capacitor later .-> HealthKit[(HealthKit · Camera · Speech)]
  end
```

Import direction is strictly downward: screens → features → engine/data/repositories → database. The engine never imports from `db/`, `ai/`, `native/` or React, which is what keeps every safety rule and every number auditable in unit tests.

## Boot sequence

```mermaid
sequenceDiagram
  participant B as Browser
  participant M as main.tsx
  participant A as App.tsx
  participant D as db/database.ts
  participant S as db/seed.ts
  participant AI as features/ai/config.ts

  B->>M: load /
  M->>M: registerSW({ immediate: true })
  M->>A: render <App/> (StrictMode)
  A->>D: db.init()  — load sql-wasm, read IndexedDB bytes, run migrations
  A->>S: seedIfEmpty() — always: exercise library + default settings. Demo scenario (PRD §21, fictional persona) only when no profile, no seed.skipDemo marker, and a dev build or ?demo=1
  A->>AI: applyAISettings() — configureAI(ai.provider, ai.apiKey, ai.model, onLedger → privacy_ledger)
  A->>A: state = ready → BrowserRouter · ToastProvider · AppShell
  A->>A: OnboardingGate: profile.onboarded || onboarding.skippedAt ? route : /onboarding
  Note over A: any step throws → ErrorState with Retry and "Reset local database" (db.wipe + reload)
```

## Daily data flow (Today screen)

```mermaid
flowchart LR
  HK[HealthKit / manual] --> Sleep[(sleep_records)]
  Scale[voice / manual / HealthKit] --> Body[(body_metrics)]
  CheckIn[Morning check-in] --> CI[(daily_checkins)]
  CheckIn --> Sym[(symptom_checks)]
  Sleep & Body & CI & Sym --> Facts[features/coach/facts.ts<br/>buildCoachFacts]
  Facts --> Readiness[engine/readiness<br/>GREEN · AMBER · RED + reasons]
  Facts --> Gate[engine/symptomGate<br/>avoid tags · substitutes]
  Facts --> Priority[engine/coach<br/>one headline + directives + evidence]
  Facts --> Proposals[engine/coach<br/>Accept / Reject proposals]
  Proposals --> Decisions[(coach_decisions)]
  Decisions -- accepted --> Apply[features/coach/apply.ts<br/>setNutritionTarget · updateSession · …]
  Readiness & Gate & Priority --> Today[Today screen]
```

## Write path and reactivity

1. A screen calls a repository function (synchronous; sql.js runs in-process).
2. `db.run`/`db.transaction` marks the database dirty, notifies subscribers once per commit, and schedules a debounced (250 ms) export of the whole database to IndexedDB.
3. `useQuery(fn, deps)` is a `useSyncExternalStore` over that subscription: every mounted query re-runs synchronously during render, so screens never hold stale copies of the data.

Multi-row writes (meals with items, seeding, reseeding, exercise upserts) run inside `db.transaction` so they are atomic and produce a single notification.

## Safety boundary

- **Setup gate.** The intake can be skipped (`onboarding.skippedAt`), but `profile.onboarded` stays the only key: `features/onboarding/setup.ts` locks starting a workout or mobility routine and every photo capture (meal, progress, report) until the intake is committed, so no session, target or photo is ever written against a profile the coach has never seen.
- **Deterministic first.** Readiness thresholds, red-flag rules, symptom → avoid-tag mapping, double progression, calorie/protein estimates and trend adjustments are pure functions in `src/engine/` with tests.
- **AI proposes, never mutates.** The LLM system prompt forbids calorie math and plan changes; any material change surfaces as a `CoachDecision` with rationale + evidence and requires Accept/Reject. Only `features/coach/apply.ts` applies an accepted decision.
- **Everything that leaves the device is logged.** `ai/gateway.ts` is the single choke point: offline check → provider call with 60 s timeout → `privacy_ledger` row (provider, data type, purpose, bytes, sent/failed/local_only).

## Persistence and portability

- sql.js keeps the whole database in memory; the exported byte image lives in IndexedDB (`coach-local` / `sqlite` / `main.db`). Export is the same byte image (`exportSqlite`) or a JSON dump of every table (`exportJson`).
- `db/schema.ts` is an ordered migration list; the applied version is stored in the `meta` table. Adding a column means appending a migration, never editing an existing one.
- Under Capacitor, `db/database.ts` is the one file to swap for `@capacitor-community/sqlite`; repositories and everything above stay unchanged.

## Native bridges (web now, Capacitor later)

| Capability | Web build | iOS shell |
|---|---|---|
| Sleep, body mass, resting HR, workouts | `WebHealthBridge` reports unavailable; manual entry everywhere | HealthKit plugin implementing `HealthBridge` (see the comment block in `native/health.ts`), registered with `setHealthBridge()` |
| Meal photo | `<input type=file capture=environment>` → canvas downscale to ≤1280 px JPEG | Same, or `@capacitor/camera` |
| Voice | Web Speech API (on-device where the OS provides it); text fallback when unavailable | Same API inside WKWebView |
| Notifications | Notification API via service worker | `@capacitor/local-notifications` |
| Keep awake during workouts | Screen Wake Lock API | `@capacitor-community/keep-awake` |
| Secrets | `settings` table (plain) — see README limitations | iOS Keychain |
