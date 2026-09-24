# Coach — local-first personal fitness coach

A single-user, iPhone-style web app (PWA, Capacitor-ready) that unifies strength training, low-impact conditioning, nutrition, sleep, mobility and recovery behind one proactive coach. The phone's SQLite database is the canonical record; cloud AI is an optional, logged processor. Built from `docs/PRD.md`; module boundaries are pinned in `docs/CONTRACTS.md`; the technical map is in `docs/ARCHITECTURE.md`.

Deterministic rules own every number and every safety gate — readiness, symptom gates, progression, calorie/protein targets, trend adjustments. The AI interprets and proposes; you accept or reject; nothing changes a plan silently.

## Run it

```bash
npm install          # once
npm run dev          # Vite dev server on http://localhost:5173 (also on your LAN for a phone)
npm run build        # tsc -b && vite build → dist/ (PWA with precached sql-wasm.wasm)
npm run preview      # serve the production build
npm test             # vitest (engine, data, repositories, AI gateway, seed helpers)
npm run typecheck    # tsc -b
```

Stack: Vite 6 · React 18 · TypeScript strict · Tailwind v4 · react-router-dom v6 · lucide-react · sql.js · `@anthropic-ai/sdk` (optional provider).

First launch depends on the build:

- **Dev server (`npm run dev`)** seeds the fictional demo scenario below and opens on **Today**.
- **Production build (`npm run build`, any hosted deployment)** starts clean: only reference data (the exercise library and default settings) is seeded, the profile is empty and the app opens on **onboarding**. Open the site once with **`?demo=1`** (for example `https://<your-host>/?demo=1`) to load the demo instead; the choice is remembered for that browser tab's session and never overwrites an existing profile.
- **Settings → Reseed demo data** replaces everything with the demo in any build; **Settings → Data & storage → Delete all data** returns to an empty profile and keeps the demo away (even in dev).

Add the site to the iPhone home screen for the standalone, safe-area-aware experience.

## What you get

| Tab | Screen(s) |
|---|---|
| Today | Readiness (Green/Amber/Red + reasons), one coach priority with evidence, today's workout, calories + protein, sleep, body trend; camera + mic quick actions |
| Train | Weekly plan with Minimum/Target/Stretch tiers and reflow, guided workout logger (Log set · Substitute · Pain/Issue on every exercise), exercise detail + history, mobility routines |
| Eat | Meal timeline with protein prominent, photo → editable estimate review, voice corrections ("half the rice, no skin"), food search (Singapore hawker/cafe + generic), saved/recent meals |
| Progress | 7-day weight average, waist, target trajectory, strength trend, adherence across training/nutrition/sleep |
| Coach | Chat, daily brief, weekly review, discrete proposals with Why + evidence + Accept/Reject, decision history |
| Settings | Profile, goals, condition flags, Apple Health permissions (granular, with unavailable/denied states), AI provider + key, privacy ledger, export/delete, media retention |

Universal voice commands (one mic everywhere): "Weight today 83.4 kilos", "Three eggs, two toast and a latte", "Bench 70 kilos for eight, RIR two", "Start today's workout", "My left knee hurts today", "Swap squats for something easier on my knee", "Same lunch as Tuesday", "How am I doing this week?" — each parses into a previewable action before anything is written.

## Architecture in one paragraph

`src/screens/*` render from `useQuery` (a `useSyncExternalStore` over the database's change counter) and write through synchronous repositories in `src/db/repositories/*`. Storage is sql.js (SQLite compiled to WASM) held in memory and exported to IndexedDB after every commit; `src/db/schema.ts` is an ordered migration list. All rules live in `src/engine/*` as pure, unit-tested functions with no database or React imports. `src/ai/*` is a provider abstraction (`mock` by default, `anthropic` with your key) behind a gateway that refuses to send while offline, times out after 60 s and writes a privacy-ledger row for every call. `src/native/*` wraps camera, speech, notifications, wake lock and a HealthKit bridge whose web implementation reports "unavailable" and whose Capacitor implementation is documented inline. `src/App.tsx` owns boot (db → seed → AI settings), routing, the onboarding guard and error boundaries. Diagrams: `docs/ARCHITECTURE.md`.

## Privacy model

- **No account, no server.** Everything lives in the browser's IndexedDB for this origin (or the app's sandbox under Capacitor). The app works fully offline; only meal-photo recognition and coach chat with a cloud provider need a connection, and they say so.
- **Explicit egress.** The AI gateway is the only path off the device. Every attempt — sent, failed, or handled locally by the mock — is listed in **Settings → Privacy ledger** with time, provider, data type, purpose, size and status.
- **Minimal payloads.** A meal-photo request sends the downscaled image plus meal type/hint. A coach request sends a profile summary, today's facts and the conversation. Progress photos never leave the device.
- **Your controls.** Keep or discard meal photos, voice-transcript retention in days, HealthKit read/write per data type, provider and key. Export the whole database as SQLite or JSON; delete all data in one tap.
- **Speech** uses the platform's Web Speech engine (on-device where iOS provides it); the transcript is stored only as long as your retention setting says.

## Security & privacy note (public repo, hosted deployment)

The full note is in [`SECURITY.md`](SECURITY.md). The short version:

1. **What is stored where: the browser only.** Every record (profile, workouts, meals, sleep, mood, journal, uploaded reports, settings, an API key if you add one) lives in this origin's IndexedDB (`coach-local`) on the device you use. UI preferences sit in `localStorage`, in-flight drafts in `sessionStorage`. There is no account, no server-side database and no analytics. Clearing site data, or Settings → Data & storage → Delete all data, removes it; export first if you want a copy.
2. **What leaves the device: AI calls, and they are all listed.** The AI gateway is the only code path that sends your data anywhere, and every call (meal photo, coach context, composer text, food query, training context, onboarding answers, a health report you chose to share) writes a row to **Settings → Privacy ledger** with time, provider, data type, purpose, size and status. Journal text is never sent. Two other requests carry no personal data: exercise photos are fetched from `raw.githubusercontent.com` (the request reveals only which exercise), and "demo" links open a YouTube search in a new tab.
3. **Protect the public deployment with Cloudflare Access.** The hosted URL is a personal tool, not a public service. Put it (and any AI endpoint it exposes under `/api/`) behind a [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) policy that allows only your own identity, so strangers cannot load the app or spend your AI quota. A production build also starts with an empty profile (no demo data unless `?demo=1`), so nothing about anyone is shown to a visitor.
4. **No personal data belongs in the repo.** The seed, fixtures and docs use a fictional persona ("Alex Tan"). Do not commit real names, birth dates, health details, database exports, Apple Health exports, meal or progress photos, API keys, tokens, LAN addresses or absolute local paths. Secrets belong in your host's secret store or an untracked `.env` / `*.local` file (both in `.gitignore`), never in a `VITE_*` variable.

## The seed scenario

A **fictional demo persona** ("Alex Tan") — not a real person's data. Seeded relative to *today* (`src/db/seed.ts`), mirroring PRD §21, in a dev build, with `?demo=1`, or from Settings → Reseed demo data:

- **Profile** Alex Tan · male · born 1989-02-11 · 179 cm · intermediate · "1–2 meals/day, skips breakfast" · condo gym (dumbbells, machines, bench, cables, lat pulldown, bike, treadmill, pool) · mobility priorities hips/hamstrings/shoulders/back · demanding coach · 3 / 4 / 5 training days. Goals: 74 kg, 81 cm waist. Condition flags: past left-knee soreness, occasional lower-back tightness.
- **Body** seven mornings of weight ending **84.0 kg** today, 7-day average **84.2 kg**; waist 84 cm.
- **Sleep** seven nights, last night **6h 10m** (bed 00:50 → 07:00), week average ≈ 7h 05m. Resting HR 56–58.
- **This morning** check-in soreness 2 / energy 6 / stress 4; symptom check left knee 2/10, no red flags → **AMBER** readiness: "6h 10m sleep, below 7-day average" + "Mild left knee soreness (2/10)".
- **Training** Upper Body Strength (42 min, 6 exercises) planned today; the same session completed 3 days ago with logged sets (bench 26 kg × 10/10/9 …) so progression has history; Lower Body completed 6 days ago; a bike conditioning day 2 days ago marked skipped; the rest of the week laid out by the planner around the 3-strength minimum.
- **Nutrition** target 2,050 kcal / 150 g protein / 190 g carbs / 65 g fat with the Mifflin-St Jeor rationale; only a 5 kcal kopi-o kosong logged today, so the coach asks for a high-protein lunch. Realistic meals on the prior six days including three saved meals — *Chicken rice, no skin, extra cucumber*, *Fish soup with rice*, *Greek yogurt, whey & berries* — and a plainly logged Snickers.
- **Coach** one accepted `reflow_week` decision from 2 days ago (bike dropped, lower session moved, evidence attached), a 3-message chat history, two local-only privacy-ledger rows, `ai.provider = 'mock'`.

Expected Today card: *"Do the upper-body session today."* with *"Keep conditioning low impact."* and *"Get a high-protein lunch — …"*. `reseed()` (Settings → Data) wipes and regenerates the scenario for the current date.

## Acceptance criteria → where to look

| Area (PRD §18) | Criterion | Screen / module |
|---|---|---|
| Onboarding | Profile, goals, conditions, privacy without an online account | `/onboarding` → `saveProfile`, `upsertGoal`, `addConditionFlag`, `setSetting` |
| Today | Workout, kcal/protein, sleep, weight trend, readiness, one coach priority | `/` — `computeReadiness`, `computeDailyPriority`, `buildCoachFacts` |
| Workout | Full strength session offline; every set survives restart | `/train/session/:id` — `addSet` → sql.js → IndexedDB; wake lock |
| Safety | Red-flag symptom blocks provocative recommendations | Symptom gate sheet → `evaluateSymptomGate`, `applyGateToSession`; readiness RED |
| Voice | Weight, meal, set, symptom commands parse into previewable actions | Mic quick action → `VoiceSheet` → `parseVoiceCommand` preview → Apply/Discard |
| Camera | Meal photo → editable foods/portions/macros, confirm before save | Camera quick action → `startMealCapture` → `/eat/review` |
| Nutrition | Clone a prior meal and correct it by voice | Eat → saved/recent → `cloneMeal`; review sheet → `parseMealCorrection` |
| Sleep | Apple Health sleep when permitted; manual fallback | `/sleep`, `/settings/health` — `HealthBridge`, `addSleepRecord` |
| Progress | 7-day weight trend, waist, strength, adherence | `/progress` — `rollingAverage`, `weeklyRate`, `projectDate`, `estimate1RM` |
| Coach | Material plan change as a discrete Accept/Reject proposal | `/coach` — `generateProposals` → `coach_decisions` → `applyDecision` |
| Privacy | Core app functional offline; only cloud AI needs network | `OfflineBanner`, AI gateway offline check, `/settings/privacy` ledger |
| Data | Export and delete all local data | `/settings/data` — `exportJson`, `exportSqlite`, `deleteAllData` |

## Known limitations

- **Web shell today.** HealthKit, Apple Watch and WorkoutKit need the Capacitor iOS shell; the web build shows the unavailable state and manual entry. The swap points are `src/native/health.ts` (bridge) and `src/db/database.ts` (storage).
- **Secrets are not in a Keychain yet.** An Anthropic or Gemini key and the bridge PIN are stored in plain text in the local `settings` table (they are left out of the JSON and SQLite exports). Under Capacitor they should move to iOS Keychain.
- **Demo seeding is opt-in outside dev.** The decision is one pure function, `shouldSeedDemo({ dev, search, skipDemo, hasProfile })` in `src/db/seed.ts`: never over an existing profile, never after *Delete all data* (which leaves a `seed.skipDemo` marker), otherwise only in a dev build or with `?demo=1`. *Reset local database* on the boot-error screen leaves no marker, so the next launch follows the same rule: demo in dev (or a `?demo=1` session), onboarding in production.
- **Speech recognition** depends on the browser; iOS Safari needs 14.5+ and may route audio to Apple's servers for some languages. When unavailable the mic sheet falls back to typing.
- **Food data** for Singapore dishes is an HPB-style estimate per typical stall portion and is labelled as such; generic items follow USDA values. No barcode scanning yet.
- **Meal photos** are downscaled JPEGs kept as data URLs in the database (subject to the retention setting); a filesystem store is the better home under Capacitor.
- Trend-based calorie adjustments need 14 days of weigh-ins; the seed ships 7, so the first adjustment proposal appears after a week of real use.
- No social features, streaks, medical diagnosis or video form analysis — by design.

## AI: run it on your Claude subscription (no API key)

The app talks to a small bridge inside the dev/preview server (`server/aiBridge.ts`), which calls Claude Code's
non-interactive mode on this Mac. Claude Code uses the login stored on the Mac, so the AI runs on your Claude subscription.

1. Sign in once: open Terminal, run `claude`, type `/login`, and sign in with your Claude account.
2. Start the app: `npm run dev` (or `npm run dev:https`, see below).
3. Open the app. Settings → AI shows "Connected · Claude through your Mac". Mode `Auto` picks the bridge first, then an
   API key if you added one, then the on-device demo.

What to know:
- It works while this Mac is on and serving the app, for devices on your own network. Away from home, add an API key in Settings → AI.
- The bridge gives the model no tools (only `Read` for an attached photo or PDF inside a throw-away temp folder), accepts
  same-origin requests from private-network addresses only, and can require a PIN (`COACH_BRIDGE_PIN=1234 npm run dev`).
- Every AI call is listed in Settings → Privacy ledger. Journal text is never sent. Report summaries are shared with the coach only if you switch that on.
- Env: `COACH_CLAUDE_MODEL` (default `sonnet`), `COACH_CLAUDE_BIN`, `COACH_BRIDGE_DISABLED=1`.

## Using it on your iPhone

- `npm run dev` then open `http://<your-mac-ip>:5173`. The camera works over plain HTTP. For the microphone use the dictation key on the iOS keyboard.
- `npm run dev:https` serves a self-signed HTTPS origin (`https://<your-mac-ip>:5173`, accept the certificate warning once). That gives the phone a
  secure context, which enables in-app speech recognition.
- Only one tab can own the local database at a time; a second tab offers "Use it here instead".

## What's in v3

Today (pillar dial, one coach sentence, one action), the "Ask or log anything" composer (text, dictation, meal photo, report upload),
AI workout planner with exercise photos, muscle maps, demo links and saved routines, photo-led food diary, Mind (mood, breathing, journal, support lines),
health report uploads with value-on-range bars, conversational onboarding with a "Starting point", Apple Health export import (`docs/APPLE_HEALTH.md`).
Design rules live in `docs/DESIGN.md` (section 10 is the current direction).

## Media & attribution

- **Exercise animations** come from [ExerciseDB](https://oss.exercisedb.dev)'s free V1 API (180×180 GIFs), which is free for non-commercial use with attribution: this credit and the "Animation: ExerciseDB" line on each exercise screen. They load on demand from `https://static.exercisedb.dev/media/<id>.gif`, are cached by the service worker (`exercise-animations`, cache-first, 90 days, up to 200 files) and are never copied into this repo. `EXERCISE_ANIMATION_IDS` in `src/data/exerciseMedia.ts` maps 107 of the 170 exercises; each GIF was checked by eye, and moves whose knee- or back-friendly range a full-range clip would contradict are left out on purpose. An exercise without an animation shows its photo, then the muscle map.
- **Exercise photos** come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (GitHub: yuhonas). The repository is released under **The Unlicense** (`LICENSE.md`) and describes itself as an "Open Public Domain Exercise Dataset": free to use, no attribution required. We credit it anyway.
- **Nothing is bundled.** Photos load on demand from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<ID>/0.jpg` and `/1.jpg` (start and end position), lazily, only when an exercise is on screen. The service worker caches them (`exercise-media`, cache-first, 90 days, up to 400 files — see `runtimeCaching` in `vite.config.ts`), so a workout you have opened once keeps its photos offline. The request tells GitHub only which exercise image was fetched; no personal data is sent.
- **Mapping.** `src/data/exerciseMedia.ts` maps our exercise ids to dataset folder ids (`EXERCISE_PHOTO_IDS`). Every entry was checked against the dataset index and both image URLs (HTTP 200) before it was added; 74 of the 84 library exercises are mapped. A few photos use different equipment from our variant (barbell hip thrust, kettlebell goblet squat) and may show a fuller range than our knee-friendly versions: the photo illustrates the movement, the written instructions set the range.
- **Fallback.** Exercises with no faithful photo (assisted pull-up, single-leg press, cable and side-lying hip abduction, bird dog, hollow hold, suitcase carry, the three swims), and any photo that fails to load (offline on first view, GitHub unreachable), show a tinted tile with the app's own `MuscleMap` illustration instead: an inline-SVG front/back figure with primary muscles in the pillar hue and secondary muscles at 40%. No layout shift, no broken-image icon.
- **Demo links** (`demoUrl(name)`) open a YouTube search for "<exercise> proper form" in a new tab; the app embeds no third-party video.
- **Illustrations and icons.** The muscle map and the empty-state line illustrations are original inline SVG drawn for this app. Icons are [lucide](https://lucide.dev) (ISC licence).

## Deploy

The app ships as one Cloudflare Worker (`wrangler.jsonc`, name `fitty`): the built PWA as static assets plus `worker/index.ts`, which answers `/api/ai/*` with Google Gemini (default) or Anthropic behind a mandatory PIN. Workers Builds form: build command empty (Wrangler runs `npm run build` itself), deploy command `npx wrangler deploy`, path `/`. Add `COACH_BRIDGE_PIN` (8+ characters) and `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` as Worker **secrets**, and put the site behind Cloudflare Access. Data never leaves each browser's own database, so devices do not sync. Full steps, the free-versus-paid Gemini data terms, custom domains and troubleshooting: [`docs/DEPLOY.md`](docs/DEPLOY.md). Local checks: `npm run cf:dry`, `npm run typecheck:worker`, `npx vitest run worker`.
