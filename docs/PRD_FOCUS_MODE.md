# PRD — Focus Mode: follow-along workout player (v1.0, 2026-09-23)

Status: **Ready to build.** Hand this to Claude Code one phase at a time (§11).
Background research: [research/FOLLOW_ALONG.md](research/FOLLOW_ALONG.md), [research/EXERCISE_MEDIA_SOURCES.md](research/EXERCISE_MEDIA_SOURCES.md).
Extends [PRD.md](PRD.md) §7.2 (Workout journey) and §8 (Workout screen). Where the two conflict, this document wins for the in-progress workout only.

---

## 1. Problem

Once a session starts, the Workout screen (`src/screens/Workout.tsx`) is a long scrolling list of
`ExerciseCard`s. Each card has set tables, a RIR picker, voice, text mode, Substitute, Pain / Issue
and a **YouTube "Demo" link** that leaves the app. That's fine for reviewing a plan, but mid-set it
means scrolling, hunting for the active card and reading small text. The YouTube link sends the user
out of the app, which is friction and a distraction.

Gym follow-along systems (BFT's station screens, Podium) show the opposite: **one movement, one big
picture, the rep target and the clock. Nothing else.** You glance, copy the move and go.

## 2. Goal

When a session starts, the user sees **one movement at a time, full screen, portrait**:

1. The **movement**: an animation, or start and end position images that alternate.
2. **What to do**: reps (or seconds) for this set, the load, and which set of how many.
3. **Time**: time **remaining** (in the current rest or timed set, plus the estimated session time
   left) and time **elapsed** in the session.
4. **One primary action**: *Done set* (or *Start* for timed moves).

Getting out is a **swipe down**. Nothing on the workout path opens YouTube or another app.

### Success criteria

- A whole strength session can be run from Focus Mode without opening the list view once.
- Logging a set takes **one tap** when the user hit the target (prefilled), and ≤ 3 taps to adjust.
- Every set logged in Focus Mode is identical in the database to one logged from `ExerciseCard`,
  so progression, PRs, finish summary and HealthKit export work unchanged.
- No external navigation (YouTube or browser) is reachable from `/train/session/:id` in any state.

### Non-goals (v1)

- Group or leaderboard screens (the BFT heart-rate % board). The app is single-user.
- Live heart rate. Revisit when Apple Watch streaming exists.
- Superset / circuit grouping (Podium's 1A / 1B). The data model has no grouping yet; see §10.
- Buying media. v1 ships on the photos we already have (§6).
- Changing the planner, progression engine, symptom gate or finish flow.

## 3. Users and context

A single user in a condo gym with knee, back and neck constraints (PRD §2). The phone sits on a
bench or floor about 1–2 m away, often sweaty-handed, mid-rest. That means:

- Text must be readable at 2 m. Primary numerals ≥ 72 px, exercise name ≥ 28 px.
- Tap targets ≥ 56 px. The primary button spans the full width.
- It works **offline** and in **iOS Low Power Mode**.
- The screen stays awake. `src/native/wakeLock.ts` already does this for the Workout screen.

## 4. User flow

```
Train / Today ──► Workout (planned preview) ──► Start ──► Symptom gate ──► [Gate result sheet]
                                                                              │
                                                                              ▼
                                                                    ┌──── FOCUS MODE ────┐
                                                                    │ exercise 1, set 1  │
                                                                    │  Done set ─► REST  │
                                                                    │  REST ends ─► set 2│
                                                                    │  … last set ─► next│
                                                                    │  exercise          │
                                                                    │  last exercise ─►  │
                                                                    │  Finish sheet      │
                                                                    └─────────┬──────────┘
                                                        swipe down │          ▲ "Focus" button
                                                                   ▼          │
                                                            List view (today's Workout screen)
```

1. **Entry.** After the gate (and the gate result sheet, when one is shown), the in-progress session
   opens **in Focus Mode by default**. The primary button on the gate result sheet says "Start"
   instead of "Start logging".
2. **Starting position.** Focus Mode opens on the first exercise with fewer logged sets than
   planned that isn't stopped. On re-entry (app reload, returning from the list) it resumes at the
   same point, derived from logged sets and never stored separately (§8.3).
3. **Set loop:** show set → *Done set* → rest countdown → next set → … → next exercise.
4. **Exit to the list:** swipe down, or the small "list" icon top-left. The list view gets a
   prominent **Focus** button in its sticky header to go back in.
5. **Finish:** after the last set of the last exercise, the existing `FinishSheet` opens. The user
   can also finish early from the overflow menu.
6. **Preference:** Settings → Training → "Open workouts in Focus Mode" (default **on**). Off keeps
   today's behaviour, with Focus reachable from the header button.

## 5. Screen specification

### 5.1 Layout (portrait, installed PWA, full viewport)

```
┌─────────────────────────────────────┐ ← safe-area top
│ ≡   ━━━━━━━●━━━━━━━━━━━   ⋯        │ A. top bar: list icon · session progress · overflow
│ 12:40 elapsed        ~18 min left   │ B. clocks
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │     MOVEMENT STAGE              │ │ C. media, ~45–50% of height,
│ │     (loop / start↔end frames)   │ │    white background, object-contain
│ │                        [muscle] │ │    muscle-map chip bottom-right
│ └─────────────────────────────────┘ │
│  EXERCISE 3 OF 6                    │ D. eyebrow
│  Goblet Squat                       │ E. name, 28–32 px
│  Sit back, knees track over toes    │ F. one cue line (first sentence of instructions)
│                                     │
│   SET 2 / 3        10 reps · 16 kg  │ G. set counter │ target (72px+ numerals)
│   ● ● ○                             │    set dots (filled = logged)
│                                     │
│ ┌─────────────────────────────────┐ │
│ │           Done set ✓            │ │ H. primary action, full width, ≥ 64 px
│ └─────────────────────────────────┘ │
│  Next ▸ Seated Cable Row  3 × 10    │ I. up-next strip (thumbnail + target)
└─────────────────────────────────────┘ ← safe-area bottom
```

| Zone | Content | Source in code |
|---|---|---|
| A | List icon (exit), a progress bar of sets logged / planned (same maths as the Workout header: `sets.length / plannedTotal`), overflow `⋯` | `Workout.tsx` header |
| B | **Elapsed** `fmtElapsed(now − session.startedAt)`. **Remaining** ≈ `estimateSessionMinutes(remainingPlan)` where `remainingPlan` holds only the sets not yet logged (§8.2) | `Workout.tsx`, `engine/planner.ts` |
| C | `MovementStage` (§6) | new |
| D–F | Position, `exercise.name`, first sentence of `exercise.instructions` | `data/exercises.ts` |
| G | Set `n / planned.sets`, target reps (`repMin`, or `repMin–repMax` when they differ) or seconds for timed moves, load (`fmtLoad`) when loadable. Values come from the **same progression target** `ExerciseCard` prefills | `ExerciseCard.tsx` prefill logic |
| H | *Done set* (reps) or *Start 40 s* (timed) | new |
| I | Next exercise name + thumbnail + `sets × reps`. Hidden on the last exercise | `ExerciseVisual size="thumb"` |

Visual rules follow `docs/DESIGN.md` and `research/PATTERNS.md` §8: one huge tabular numeral per
zone, a single accent, status colours only for status, hairlines not shadows. The media frame stays
**white in dark mode** (as on BFT screens) so the photos read correctly.

### 5.2 States

| State | What changes |
|---|---|
| **Ready** (set not started) | As in §5.1. |
| **Timed set running** | G becomes a big countdown ring (`0:23`) with "of 40 s". H becomes *Done early*. At 0 the set logs automatically with `durationSec = planned`, then REST starts. |
| **Rest** | The stage dims to 40% and a **full-width rest countdown** takes over G: huge `1:12`, the label "REST", and chips **−15 s / +15 s / Skip**. The up-next strip grows to show the **next set or exercise** ("UP NEXT: Set 3 · 10 reps · 16 kg", or the next exercise's image when the exercise changes). At 0: a short cue (§7.3), then back to Ready for the next set. Uses the existing `useRestTimer`. |
| **Adjust** (tap on the target numbers in G) | A bottom sheet with large steppers for reps (±1), load (±the equipment step, reusing whatever step `ExerciseCard` uses) and RIR chips 0–4 (default 2, prefilled from the last set). *Log set* saves and closes. The same values carry into the next set's prefill. |
| **Paused** (tap on the stage) | A translucent "Paused · tap to resume" overlay. The rest and timed countdowns freeze (store remaining seconds, recompute `endAt` on resume). The elapsed clock keeps running, because it's wall-clock since start. |
| **Exercise stopped** (Pain / Issue → stop) | Skip straight to the next exercise and show a toast: "Stopped {name} — moving on". |
| **Session complete** | The last set logs → `FinishSheet` opens over Focus Mode. |
| **Gate blocked everything** | Show the existing empty state ("Nothing safe to run today"). Focus Mode does not open. |

### 5.3 Gestures and controls

| Input | Action |
|---|---|
| Swipe **down** on the stage (> 25% of viewport height, or a fast flick) | Exit to the list view. Spring back if under the threshold. |
| Swipe **left / right** on the stage | Next / previous exercise (browse only: moves the cursor, logs nothing). |
| Tap the stage | Pause / resume. |
| Tap the target numbers | Adjust sheet. |
| Top-left list icon | Exit to the list (the non-gesture alternative, for accessibility). |
| Overflow `⋯` | Sheet: **Pain / Issue**, **Substitute**, **Undo last set**, **Shortened version**, **Finish session**, **Skip session**. All reuse the existing sheets and handlers in `Workout.tsx`. |

Rules: gestures start ≥ 24 px from any screen edge (so they don't clash with iOS back and home
gestures). The stage uses `touch-action: none`. The page must not scroll. Substitute and Pain /
Issue stay **one tap away** via the overflow menu, which keeps PRD §20's "every exercise card
includes Substitute and Pain / Issue" satisfied.

## 6. Movement media

### 6.1 Decision

| Phase | Source | Why |
|---|---|---|
| **v1 (this PRD)** | **free-exercise-db start / end photos**, already mapped in `src/data/exerciseMedia.ts` (74 of 170 ids) | Free and public domain, already cached by the service worker. Matches "static images of the start and end position". |
| **v2** | **ExerciseDB paid** (one-time licence, self-hosted GIFs at 720p or better) | Offline storage is allowed, it's a one-time cost, and the plain-background animations are the BFT look. |
| Rejected | MuscleWiki API | Its terms forbid storing videos for offline playback. It's a subscription and would need an API key shipped in the client. Great content, wrong model for a gym-offline PWA. |
| Rejected | YouTube | Leaves the app. It's being removed from the workout path (§6.4). |

Before buying ExerciseDB, confirm in writing that its GIFs are licensed for in-app display, and
check the media's provenance (the art appears to match Gym Visual's; see
EXERCISE_MEDIA_SOURCES.md). This is a product-owner task, not a Claude Code task.

### 6.2 `MovementStage` component (new, `src/components/MovementStage.tsx`)

It renders the best available media for an exercise id, trying each in turn:

1. **`loop`**: an animated WebP/GIF URL from the media map (none in v1; the field exists so v2 is
   data-only). `<img>`, not `<video>`, because iOS Low Power Mode blocks video autoplay and gives no
   way to detect it.
2. **Frames**: the two photos, alternated at a **rep tempo** (default 1.2 s per frame, hard cut
   or a 250 ms crossfade). Label them "START" and "END" in the corner, so the static fallback still
   teaches the range.
3. **MuscleMap tile**: the existing `ExerciseVisual` fallback, for ids with no photo.

- `prefers-reduced-motion` → show frame 0 only plus a small "Start ↔ End" toggle button.
- It pauses (holds the current frame) while the session is Paused, and during REST it shows the
  **next** movement's frames.
- On image error it falls to the next rung. It must never show a broken image.

### 6.3 Media map change (`src/data/exerciseMedia.ts`)

Add an optional `loop?: string` to `ExerciseMedia` and an empty `EXERCISE_LOOP_URLS:
Record<string, string>` map. Same rule as photos: **no id is added without checking it** (range,
and match to our knee/back/neck-safe variant). v1 ships the map empty.

### 6.4 Remove YouTube from the workout path

- Remove `DemoLink` from `ExerciseCard` (the photo overlay) and from `PlannedPreview` in `Workout.tsx`.
- In `ExerciseDetail`, keep a link only if the product owner wants it (open question Q1). The
  default in this PRD is **remove it everywhere**, and delete `demoUrl`/`DemoLink` if nothing uses
  them.
- Update any tests that assert on `demoUrl`.

### 6.5 Offline preload

When Focus Mode opens, `fetch()` every image URL for the session's exercises (and any `loop`) in the
background so the service worker's `CacheFirst` rule (`vite.config.ts`, cache `exercise-media`)
stores them. Silent failure; the fallbacks cover it.

## 7. Timing

### 7.1 Clocks

- **Elapsed**: wall-clock since `session.startedAt`, as today. Ticks with `useNow(1000)`.
- **Session remaining**: `estimateSessionMinutes(remainingPlan)` minus its 5-minute warm-up constant
  once any set is logged. Display it as "~18 min left". Under 1 min it shows "Last set".
- **Rest remaining**: `useRestTimer`, started with `planned.restSec` after each logged set (same
  as the list view).
- **Timed-set remaining**: a new countdown for timed exercises, also wall-clock based (see §8.1).

All countdowns are computed from timestamps (`endAt − Date.now()`), never from counting ticks, so
they stay correct across screen lock and backgrounding.

### 7.2 Timed exercises

A move is timed when `exercise.timed || TIMED_IDS.has(exercise.id)` (the same test `ExerciseCard`
uses). The target is seconds (`repMin` is seconds for timed moves). *Start* runs the countdown, and
at 0 it auto-logs `durationSec = target`. *Done early* logs the actual elapsed seconds.

### 7.3 Cues

- 3-2-1 beeps before a rest or timed set ends, plus a longer tone at 0. Web Audio, unlocked by the
  Start tap on the gate sheet.
- Optional spoken "Next: Goblet squat, 10 reps" via `speechSynthesis` (not used in the codebase yet;
  feature-detect it). Setting: "Voice cues" (default **off**).
- `navigator.vibrate` where supported (not on iOS; already handled as a no-op).

## 8. Technical design

### 8.1 Extract set logging from `ExerciseCard` (prerequisite refactor)

`ExerciseCard.tsx` owns the prefill, pain-hold, PR-detection and `addSet` logic (lines ~80–233).
Focus Mode must log **identical** rows. Move that logic, unchanged, into a hook:

```ts
// src/features/workout/useSetLogger.ts
useSetLogger({ session, planned, exercise, sets, painNext, stopped }) → {
  timed: boolean, loadable: boolean,
  draft: { reps, loadKg, durationSec, rir },   // prefilled target for the next set
  setDraft(patch): void,
  effective: ProgressionResult,                 // target incl. pain hold
  canLog: boolean,
  log(): (ExerciseSet & { restSec: number; pr: LivePR | null }) | null,
}
```

`ExerciseCard` then calls the hook; its behaviour and UI don't change. Voice logging stays in
`ExerciseCard` only for v1. This is the one refactor in scope; don't touch anything else in the card.

### 8.2 Focus cursor (pure, testable)

```ts
// src/features/workout/focus.ts
export interface FocusCursor { index: number; setNumber: number }   // exercise index, 1-based set
export function firstOpenCursor(session, setsByExercise, stopped): FocusCursor | null
export function nextCursor(session, setsByExercise, stopped, from): FocusCursor | null   // null = session done
export function remainingPlan(session, setsByExercise): PlannedExercise[]               // unlogged sets only
```

The cursor is derived from the logged sets. The only stored UI state is the *browse* offset from
swipes, which resets after a set is logged.

### 8.3 Where Focus Mode lives

- A component `src/features/workout/FocusMode.tsx`, rendered **inside `WorkoutScreen`** as a
  `fixed inset-0 z-40` layer when `?view=focus` is in the URL (the default when in progress and the
  preference is on). Staying inside `WorkoutScreen` reuses its gate, substitute, pain, finish,
  wake lock, rest timer and PR celebration state. **Don't duplicate those handlers.**
- Swipe down → `setParams({})` (list). The Focus button → `setParams({ view: 'focus' })`. The
  browser back button works because it's a URL param.
- The route `/train/session/:id` already hides the tab bar (`HIDE_TABS_PATTERNS` in `App.tsx`).

### 8.4 Files

| File | Change |
|---|---|
| `src/features/workout/useSetLogger.ts` | **New**: extracted logic (§8.1) |
| `src/features/workout/ExerciseCard.tsx` | Use `useSetLogger`; remove `DemoLink` |
| `src/features/workout/focus.ts` | **New**: cursor + remaining-plan helpers |
| `src/features/workout/FocusMode.tsx` | **New**: the screen (§5) |
| `src/components/MovementStage.tsx` | **New**: media fallback chain (§6.2) |
| `src/data/exerciseMedia.ts` | `loop?` field + empty `EXERCISE_LOOP_URLS`; drop `demoUrl` if unused |
| `src/screens/Workout.tsx` | Render `FocusMode` for `?view=focus`; default into it after the gate; Focus button in the header; remove `DemoLink` from `PlannedPreview`; relabel the gate-result CTA |
| `src/features/workout/PlanVisuals.tsx` | Remove `DemoLink` (and its export in `index.ts`) if nothing else uses it |
| Settings (training section) | "Open workouts in Focus Mode" and "Voice cues" toggles, stored like existing preferences |
| `docs/PRD.md` §8 Workout row | One line pointing to this document |

## 9. Acceptance criteria

| # | Criterion | How to verify |
|---|---|---|
| AC1 | After the gate, an in-progress session opens in Focus Mode showing exercise 1, set 1, the media, target reps/load, elapsed and remaining time | Browser preview + screenshot |
| AC2 | *Done set* writes an `exercise_sets` row identical (all fields except id/loggedAt) to one logged from `ExerciseCard` with the same inputs | Unit test on `useSetLogger`, or a repository-level test |
| AC3 | After a set, the rest countdown runs from `planned.restSec`. ±15 s and Skip work, and at 0 it returns to Ready for the next set | Unit test on `useRestTimer` (exists) + manual |
| AC4 | After the last planned set of an exercise, Focus Mode advances to the next non-stopped exercise. After the last one, `FinishSheet` opens | Unit tests on `nextCursor` |
| AC5 | Timed moves count down and auto-log `durationSec` at 0 | Unit test with a fake clock |
| AC6 | Swipe down returns to the list with no data lost. The Focus button resumes at the same set | Manual in the browser preview with touch emulation |
| AC7 | Pain / Issue, Substitute, Undo last set and Finish are reachable in ≤ 2 taps from Focus Mode and behave exactly as in the list | Manual |
| AC8 | Media fallback: ids with photos alternate start/end; ids without show the MuscleMap tile; a broken URL never shows a broken image | Unit test for rung selection + manual with a bad URL |
| AC9 | No element under `/train/session/:id` links to youtube.com or opens a new tab | `grep -r "youtube" src` returns nothing on the workout path; test updated |
| AC10 | Reloading mid-rest or mid-session resumes Focus Mode at the correct exercise and set | Manual reload in preview |
| AC11 | Works offline after one online session (media cached) | DevTools offline + reload |
| AC12 | `npm run typecheck` and `npm test` pass; existing tests are unchanged except where §6.4 removes `demoUrl` | CI / local |

## 10. Later (not in this PRD)

1. **ExerciseDB loops**: buy, self-host (Cloudflare, behind Access, never in git), convert to
   animated WebP, and fill `EXERCISE_LOOP_URLS` id by id with a safety review.
2. **Mobility in Focus Mode**: give `MobilityMovement` an optional `exerciseId`/media key so routines
   can use the same player. `Mobility.tsx` already has its own timed step-through, so merge it
   onto `FocusMode` later.
3. **Supersets / circuits (Podium 1A / 1B)**: add an optional `group?: string` to
   `PlannedExercise`, and let the cursor alternate A → B → rest.
4. **Voice logging inside Focus Mode**: lift `useVoiceSet` wiring into the overflow menu.
5. **Landscape layout**: stage left, numbers right.

## 11. Execution plan for Claude Code

Each phase is one PR-sized change: run `npm run typecheck && npm test` before moving on. Follow the
repo's working rules: surgical diffs, match the surrounding style, and leave unrelated uncommitted
files alone.

| Phase | Scope | Done when |
|---|---|---|
| **P1: Extract logger** | §8.1 `useSetLogger`; `ExerciseCard` uses it; no UI change | All existing tests pass; a new test proves the logged row is unchanged (AC2) |
| **P2: Cursor helpers** | §8.2 `focus.ts` + unit tests (stopped exercises, substitutions mid-session, extra sets beyond plan, empty session) | AC4 tests green |
| **P3: MovementStage** | §6.2–6.3 + remove YouTube (§6.4) | AC8, AC9 |
| **P4: Focus Mode screen** | §5 layout and states, §7 clocks/timed sets, §8.3 integration, entry after the gate, Focus header button, overflow sheet, preload §6.5 | AC1, AC3, AC5–AC7, AC10, AC11 verified in the browser preview with screenshots |
| **P5: Settings + cues** | Focus default toggle, beeps, optional voice cues | Toggles persist; cues fire at 3-2-1 |

Starter prompt for each phase:

> Read `docs/PRD_FOCUS_MODE.md`. Implement **Phase P<n>** only, as scoped in §11 and the sections it
> references. State your assumptions first. Keep the diff surgical and don't change behaviour outside
> the phase. Finish with `npm run typecheck && npm test` and, for UI phases, browser-preview
> screenshots proving the acceptance criteria listed for the phase.

## 12. Open questions

- **Q1.** Remove YouTube links **everywhere** (including Exercise Detail), or only from the workout
  path? PRD default: everywhere.
- **Q2.** Should *Done set* default RIR to 2 silently (one tap), or always ask for RIR (two taps)?
  PRD default: silent 2, editable in Adjust.
- **Q3.** Auto-advance from REST to the next set, or wait for a tap? PRD default: auto-advance with
  the 3-2-1 cue (BFT behaviour).
- **Q4.** ExerciseDB tier and budget for v2 (resolution ≥ 720p recommended for full-width display).
