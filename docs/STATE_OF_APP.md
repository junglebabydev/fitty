# State of the app — feature inventory (Sept 2026)

What exists today, where it lives, and how complete it is. Written as the input to the v2 planning discussion; it is a description of the build, not a roadmap.

**Shape:** ~48k lines of TypeScript, 55 test files (707 tests), 22 screens / 23 routes, 27 SQLite tables, no accounts, no server-side database. Vite 6 · React 18 · Tailwind v4 · sql.js in IndexedDB · an optional Cloudflare Worker that proxies AI.

Status key — **Built**: complete and used. **Partial**: works but a named piece is missing. **Web-limited**: correct on device, degraded in a browser. **Stub**: interface exists, implementation is a no-op or "unavailable".

## 1. Pillars as shipped

| Pillar | Routes | Status |
|---|---|---|
| Today (command centre) | `/`, `/checkin` | Built |
| Train | `/train`, `/train/session/:id`, `/train/exercise/:id`, `/train/mobility` | Built |
| Eat | `/eat`, `/eat/review`, `/eat/search` | Built |
| Progress | `/progress` | Built |
| Mind | `/mind`, `/mind/breathe`, `/mind/journal` | Built |
| Coach | `/coach` | Built |
| Reports (health documents) | `/reports`, `/reports/:id` | Built |
| Sleep | `/sleep` | Web-limited — manual entry; HealthKit needs the iOS shell |
| Settings | `/settings` + `/data`, `/health`, `/privacy` | Built |
| Onboarding | `/onboarding` | Built |

## 2. Training

| Feature | Where | Status |
|---|---|---|
| Weekly plan, Minimum / Target / Stretch tiers | `src/engine/planner.ts` (`buildWeek`, `WEEK_LAYOUT`) | Built |
| Session templates (upper / lower / conditioning) | `SESSION_TEMPLATES`, `sessionFromTemplate` | Built — **one programming model only** |
| Reflow a missed week (Skip vs. Move) | `reflowWeek`, `priority` | Built |
| Guided logger: prefilled rows, PREVIOUS column, rest timer | `src/features/workout/*`, `useRestTimer` | Built |
| Progressive overload | `src/engine/progression.ts` | Built |
| Pain-aware substitution | `SubstituteSheet`, `src/engine/symptomGate.ts` | Built |
| Symptom gate + red-flag block | `evaluateSymptomGate`, `applyGateToSession` | Built |
| Shorten a session under time pressure | `shortenedVersion`, `estimateSessionMinutes` | Built |
| Exercise library + media | `src/data/exercises.ts` (1,486 lines, 170 exercises), `exerciseMedia.ts` | Built — 77 of 170 have a free-exercise-db photo; the rest fall back to the MuscleMap tile |
| Mobility routines | `src/data/mobility.ts`, `/train/mobility` | Built |
| Cardio / conditioning sessions | `src/features/workout/finish.ts` (`addCardio`), Health import | Built — written when a conditioning session finishes; no standalone cardio logger |
| Wake lock during a session | `src/native/wakeLock.ts` | Built (web API) |

**The gap that matters for v2:** `planner.ts` assumes a single programming model — fixed upper/lower/conditioning templates laid out by tier. Gym split, HIIT/class-style and calisthenics are not variants of it; they are three planners.

## 3. Nutrition

| Feature | Where | Status |
|---|---|---|
| Meal timeline, protein-forward | `src/screens/Eat.tsx` | Built |
| Photo → editable estimate → confirm | `src/features/meal/captureMeal.ts`, `/eat/review` | Built — needs an AI provider |
| Voice correction ("half the rice") | `src/features/meal/refine.ts`, `parseMealCorrection` | Built |
| Text-only description → estimate | `src/features/composer/*` | Built |
| Food search (SG + 5 cuisine packs + generic) | `src/data/foods.ts` (612 lines, 406 foods) | Built — estimates, labelled as such |
| Saved / recent meals, clone | `cloneMeal` | Built |
| Calorie & protein targets, trend adjustment | `src/engine/nutrition.ts` (Mifflin-St Jeor), `src/engine/trends.ts` | Built |
| Barcode scanning | — | Not built |

Nutrition is the most finished module and is already close to the "just log it, get a range" behaviour described for v2.

## 4. Mind / wellness

| Feature | Where | Status |
|---|---|---|
| Mood check-in (valence slider, chips) | `MoodCheckInSheet`, `MoodOrb` | Built |
| Breathing sessions (box, 4-7-8, sigh, coherent) | `src/engine/mind.ts`, `useBreathingSession` | Built |
| Journal, device-only, excluded from AI | `/mind/journal`, `journal_entries` | Built |
| Crisis support sheet, offline, ≤2 taps | `SupportSheet` | Built |
| Correlation cards gated by sample size | `src/engine/mind.ts` | Built |
| Guided meditation (audio / narrated) | — | Not built |
| Routines & habits (wake time, schedule) | — | **Not built** — no table, no engine |

## 5. Coach and AI

| Feature | Where | Status |
|---|---|---|
| Chat with facts context | `src/features/coach/{chat,facts}.ts` | Built |
| Daily priority, weekly review | `src/engine/coach.ts`, `computeDailyPriority` | Built |
| Accept/Reject proposals + decision history | `generateProposals` → `coach_decisions` → `applyDecision` | Built |
| AI-generated plan, restricted to library ids then deterministically validated | `src/features/ai/planner.ts`, `src/engine/aiPlan.ts` | Built — the allowed list is now derived from the user's own condition flags, not hard-coded |
| Onboarding intake via AI | `src/features/ai/intake.ts` | Built |
| Provider: mock (default) | `src/ai/mock.ts` | Built |
| Provider: Anthropic direct | `src/ai/anthropic.ts` | Built — BYO key in local settings |
| Provider: Gemini direct | `src/ai/gemini.ts` | Built — BYO key |
| Provider: local Claude Code bridge | `src/ai/bridge.ts`, `server/` | Built — dev machine only |
| Provider: hosted Worker (Anthropic / Gemini / OpenRouter) | `worker/` | Built — PIN-gated, key held server-side |
| Gateway: offline refusal, 60 s timeout, ledger row per call | `src/ai/gateway.ts` | Built |
| Structured-output schemas | `src/ai/types.ts`, `MEAL_RECOGNITION_SCHEMA` | Built |
| **Model evaluation harness** | — | **Not built** |

The provider abstraction is the asset here: adding models is a file in `src/ai/` or a branch in `worker/`. There is no way to compare their output quality.

## 6. Data, privacy, platform

| Feature | Where | Status |
|---|---|---|
| SQLite in IndexedDB, ordered migrations | `src/db/schema.ts`, `database.ts` | Built |
| 19 repositories, synchronous writes | `src/db/repositories/*` | Built |
| Privacy ledger — every egress logged | `/settings/privacy`, `ledger.ts` | Built |
| Export JSON / SQLite, delete all | `/settings/data` | Built — keys redacted from exports |
| Apple Health import (file) | `src/native/healthExport.ts` | Built |
| HealthKit live read/write | `src/native/health.ts` | **Stub** — reports "unavailable" on web |
| Camera | `src/native/camera.ts` | Web-limited — file picker, not native capture |
| Speech | `src/native/speech.ts` | Web-limited — Web Speech API, browser-dependent |
| Notifications | `src/native/notifications.ts` | Web-limited |
| Secrets storage | `settings` table, plain text | **Weak** — should be iOS Keychain |
| Capacitor iOS shell | — | Not built — the app is a PWA today |
| Progress photos | `photos.ts`, `Progress.tsx` (`CompareSheet`, angles, viewer) | Built — device-only, never sent to AI |
| Accounts, billing, sync, analytics | — | Not built, and currently ruled out by the architecture |

## 7. Honest summary

- **Finished:** nutrition logging, the workout logger, the safety/gating layer, the privacy and export story, the Mind pillar, the provider abstraction.
- **Thin:** standalone cardio logging, anything requiring a native shell.
- **Absent and needed for the v2 conversation:** multiple programming models in the planner, a routines/habits concept, guided audio, and a model-eval harness.
- **Structurally load-bearing:** "no account, no server, no analytics" is stated four times in the README and enforced by the architecture. Any paid, hosted tier contradicts it and is therefore a product decision, not an implementation detail.
