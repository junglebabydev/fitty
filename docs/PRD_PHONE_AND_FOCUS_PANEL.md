# PRD — On the phone, and a Focus panel you can read from the floor (v0.1, 2026-09-29)

Status: **Draft, not for building yet.** Three workstreams, each with its own phases (§6).
Extends [PRD_FOCUS_MODE.md](PRD_FOCUS_MODE.md). Where the two conflict, this document wins, and it
explicitly reverses one of that PRD's non-goals (live heart rate, §3.4).
Background research: [research/IOS_INSTALL.md](research/IOS_INSTALL.md).

| # | Workstream | Ask (owner, 2026-09-29) |
|---|---|---|
| A | Phone install | "Make it into an app I can test on my phone and use without publishing on the iOS App Store." |
| B | Focus panel | "The section below the animation is hard to read. Make it the three things: heart rate (connected to Apple Watch), elapsed time, time remaining, sets, reps." |
| C | Design review | "Look at the design again and review it." |

---

## 1. Workstream A — Run it on the iPhone without the App Store

### 1.1 Recommendation

**Go in three steps. Don't jump straight to a native app.**

1. **Today, $0: install the PWA on the Home Screen** from the deployed URL. Home Screen web apps are
   exempt from Safari's 7-day storage wipe and run offline, and Screen Wake Lock works in them
   (iOS 18.4+). Two small additions make it safe to rely on:
   - call `navigator.storage.persist()` at boot, and
   - add an **Import / restore** screen next to the existing export in `/settings/data`.
2. **Next, $0: a Capacitor iOS shell** built from the same `dist/`, installed from Xcode with a free
   Apple ID ("Personal Team"). Apple's capability table lists HealthKit as available on the free
   tier (checked 2026-09-29). The cost: the install **expires every 7 days** and has to be re-run
   from the Mac. The app's data survives the re-install.
3. **When live heart rate is wanted, US$99/yr: the Apple Developer Program**, a small watchOS
   companion app, and **internal TestFlight** (no App Review for internal testers, builds last 90
   days, one-tap install). This is the only practical path to Workstream B's Heart tile.

A free team can technically run the Watch app too. But re-signing two apps every week, with the
Watch in Developer Mode, is a chore nobody keeps up during a training block. Hence the paid step.

### 1.2 Constraints found in the code

| # | Constraint | Consequence |
|---|---|---|
| A1 | The Capacitor app runs from `capacitor://localhost`, a different origin from the PWA | The PWA's IndexedDB database is **not** visible to it. Moving over is export → import. |
| A2 | `/settings/data` can export JSON/SQLite but has **no import** | Import must exist before step 2. It's also the backup story for step 1. |
| A3 | `src/ai/bridge.ts` calls the relative `/api/ai`, with the PIN in `x-coach-pin` | In the shell this resolves to nothing. It needs a configurable absolute Worker URL, and CORS on the app Worker and the coach Worker allowing `capacitor://localhost`. |
| A4 | `src/native/*` are web stubs (`health.ts` reports "unavailable") | The shell swaps in plugin-backed versions behind the same interfaces. The web build is unchanged. |
| A5 | There's no official Capacitor HealthKit plugin | Pick a community plugin, or write a small custom Swift plugin. Decide in phase 3. |

### 1.3 Acceptance

- AA1 Step 1: the Home Screen app opens standalone, works in airplane mode, keeps the screen awake in
  Focus Mode, and still has its data a week later.
- AA2 Import restores an export exactly: export → wipe → import → export gives content-equal output
  (the same rows in every table; timestamps in the export header may differ).
- AA3 Step 2: the shell installs from Xcode on the owner's iPhone, restores the PWA export, and
  reaches the AI Worker with the PIN.
- AA4 No path in this workstream submits anything to App Store review.

---

## 2. What Focus Mode looks like today (measured)

Measured in the dev build at 390 × 844, Lower Body Strength, set 1 and during rest
(`src/features/workout/FocusMode.tsx`).

```
┌──────────────────────────────┐
│ ≡                        ⋯   │
│ [1]                          │
│      PHOTO (white stage)     │  ~55 % of the height
│                    [muscles] │
│ EXERCISE 1 OF 6              │
│ LEG PRESS (MODERATE RANGE)   │
├──────── dark panel ──────────┤
│ 10                   SET     │  hero 72 px · "SET 1 / 3" 36 px
│ reps                 1 / 3   │
│ 0:09     6%      ~35 min     │  20 px numerals, 12 px labels
│ ELAPSED  DONE    LEFT        │
│ ▬▬ ▬▬ ▬▬ ▬▬ ▬▬ ▬▬            │  6 px segment bar
│ Next: Hip Thrust             │  14 px at 70 %
│ ( ‹ )  [ ✓ Done set ]  ( › ) │
└──────────────────────────────┘
```

| Element | Size today | Readable at 1.5–2 m? |
|---|---|---|
| Hero number (reps / rest clock) | 72 px | Yes |
| Set `1 / 3` | 36 px (denominator 20 px at 60 %) | Borderline |
| Elapsed · % done · Left | **20 px** numerals, **12 px** labels at 60 % | **No** |
| "Next: Hip Thrust" | 14 px at 70 % | No |
| Segment bar | 6 px tall, one per exercise | Colour only |

Contrast is not the problem: 60 % bone on ink works out at about 7:1. **Size and count are the
problem.** The panel holds seven separate readouts (reps, set, elapsed, % done, left, segments,
next). Only one of them is big enough for the distance the phone actually sits at (PRD_FOCUS_MODE
§3: "≥ 72 px, readable at 2 m").

---

## 3. Workstream B — The three-tile panel

### 3.1 Assumption to confirm

The ask names "three things" but lists six values. This PRD reads them as **three tiles**:

| Tile | Shows | Why these belong together |
|---|---|---|
| **Heart** | Live bpm from the Apple Watch, plus a small "Watch" connection state | One sensor, one number |
| **Time** | Elapsed and remaining, as one clock pair | Both answer "how long?" |
| **Work** | Set *n / N*, plus reps (and load when loaded) | Both answer "what do I do now?" |

**Alternative (B′), not chosen:** a hero line of reps, then four equal small tiles (HR · elapsed ·
remaining · set). It's closer to the literal list, but it brings back four small numbers, which
is what the owner said is hard to read.

**Load stays.** It isn't in the ask, but "10 reps" without "16 kg" tells a loaded set only half
of what to do.

### 3.2 Layout

```
├──────── dark panel ─────────────────────┤
│ ┌──────── WORK (hero) ────────────────┐ │
│ │ 10–12  reps · 16 kg       SET 2 / 3 │ │  "10–12" ≥ 72 px; "reps · 16 kg" 20 px; set ≥ 44 px
│ └─────────────────────────────────────┘ │
│ ┌──────────── TIME ───────────────────┐ │
│ │ 12:40              ~18 min          │ │  both numerals ≥ 44 px, full width
│ │ elapsed            left             │ │  labels ≥ 14 px
│ └─────────────────────────────────────┘ │
│ ┌──────────── HEART (native only) ────┐ │
│ │ ♥ 132 bpm                 ● Watch   │ │  numeral ≥ 44 px
│ └─────────────────────────────────────┘ │
│ ━━━━━━━━━━━━●━━━━━━━━━━━━━━━  (4 px)    │  one session bar, no per-exercise segments
│ [        ✓  Done set          ]         │  full width, ≥ 64 px
└─────────────────────────────────────────┘
```

- **Work** is the hero. Only the reps value (or the countdown) is 72 px or larger. Load and unit sit
  beside it at 20 px.
- **Time** gets a full-width row, because two 44 px clock values don't fit in a half-width tile at
  375 px. **Heart** is its own row, shown only in the native build. On the web the panel is one row
  shorter, and the stage gets the space.
- No tile ever means two different things. A rest or timed-set countdown **replaces the Work
  hero** (it's "what to do now"). It never replaces the session "left" clock (§3.3).

### 3.3 States

| State | Work (hero) | Time tile | Heart tile | Primary button |
|---|---|---|---|---|
| Ready, reps set | `10–12 reps · 16 kg` + `SET 2 / 3` | elapsed · ~session left | bpm or "not connected" | Done set |
| Ready, timed set | `40 s` + `SET 1 / 2` | same | same | Start 40 s |
| Timed set running | countdown `0:23` "of 40 s" | same | same | Done early |
| Resting | rest countdown `1:45` "rest", `−15 / +15` chips, "Next: set 3 / 3" **or** "Next: Hip Thrust" | same | same, and the number is expected to fall | Skip rest |
| All sets done | (FocusDone screen, unchanged) | — | — | Finish session |

**Heart tile, by connection state:**

| Condition | Tile shows |
|---|---|
| Web / PWA (no native bridge) | **Hidden.** The row is removed, not left empty. No "connect" nag on a platform that can't connect. |
| Native, Watch app not running a workout | `—` plus "Start on Watch" (tapping it opens the Watch workout, §3.4) |
| Native, streaming | bpm, updated at least every 5 s, and a solid dot |
| Native, last sample > 15 s old | last bpm greyed out, with "Watch lost". The workout carries on. |

### 3.4 Heart rate: what it needs (reverses a PRD_FOCUS_MODE non-goal)

PRD_FOCUS_MODE §2 lists "Live heart rate" as a v1 non-goal "until Apple Watch streaming exists".
This PRD makes it a goal, but only once Workstream A reaches its native phase. **A PWA cannot read
the Watch.** Safari has no HealthKit, no WatchConnectivity and no Web Bluetooth, and the Watch
doesn't broadcast standard BLE heart rate anyway. See the research doc.

Required pieces (phase 4 in §6, which builds on the Capacitor shell from phase 3):
1. A small **watchOS app** that runs an `HKWorkoutSession` with `HKLiveWorkoutBuilder` (strength
   training activity type), started from the phone.
2. **Workout mirroring** (iOS 17+), or WatchConnectivity messages, to stream HR samples to the
   iPhone app.
3. A Capacitor plugin in `src/native/` exposing `watchHeartRate.subscribe(cb)` and `isAvailable()`.
   The web build keeps the stub (returns unavailable), matching the pattern in `src/native/health.ts`.
4. On finish, the Watch workout is saved to Apple Health. The app's own session row stores
   `avgHr` and `maxHr`. (The schema change is decided in that phase; nothing ships now.)

Heart rate is **display only** in this PRD. No zones, no coaching on it, and no gating on it.
Using HR for rest length or effort is a later decision.

### 3.5 What leaves the panel

| Removed | Where it goes |
|---|---|
| `% done` | Gone. The session bar carries progress. |
| Per-exercise segment bar | Replaced by one 4 px session bar. Per-exercise detail lives in the list view. |
| "Next: …" line while working | Shown only while **resting**, inside the Work hero (§3.3) |
| Prev / Next chevrons beside the primary button | Moved to the top bar (see C4) |

### 3.6 Acceptance

- AB1 At 375 × 812 and at 390 × 844: the Work hero value is ≥ 72 px; the set counter and the Time and
  Heart numerals are ≥ 44 px; the load and unit text is ≥ 20 px; every label is ≥ 14 px; nothing
  wraps or clips. Checked with computed styles, not by eye.
- AB2 The panel shows at most **three** tiles plus the session bar and one button, in every
  state of §3.3.
- AB3 On the web build, no Heart tile and no "connect" prompt appear.
- AB4 The reps target shows the range (`10–12`) when `repMin ≠ repMax`, and load whenever the
  exercise is loadable and a load is known.
- AB5 Logged rows are unchanged. `useSetLogger` stays the only write path (existing tests pass).
- AB6 Light and dark themes are both checked. The panel stays dark in both, as today.

---

## 4. Workstream C — Design review of Focus Mode

Reviewed against PRD_FOCUS_MODE §5.1 and `docs/DESIGN.md`, in the running app. Severity: **H**
means it causes wrong actions or unreadable data, **M** hurts clarity, **L** is polish.

| # | Finding | Sev | Evidence | Proposed fix |
|---|---|---|---|---|
| C1 | Secondary readouts are too small for the phone's distance (20 px numerals, 12 px labels) | H | §2 table | Workstream B |
| C2 | During rest, the eyebrow says **"Up next"** above the *current* exercise's name, while the panel says "Next: Hip Thrust". The two contradict each other. | M | Rest screenshot | During rest, the stage keeps "Exercise 1 of 6". Only the Work hero says what's next (set 2 / 3, or the next exercise when the last set is done). |
| C3 | The target shows `10` where the plan says `10–12`, and no load on a first session | M | Set-1 screenshot vs plan list | Show the range. When load is unknown, show "choose load" and tap to adjust. |
| C4 | The **Next ›** chevron sits 12 px from *Done set*. With sweaty hands, a near-miss skips the exercise without logging. | H | Code: `FocusMode.tsx` Prev · primary · Next row | Move Prev/Next to the top bar as small buttons. The primary spans the full width. |
| C5 | The gate toast ("Gate clear — run the plan as written") covers the top bar and the station badge for several seconds | M | First screenshot | Show that toast on the list/preview screen, or push the stage down instead of overlaying it |
| C6 | The stage dims to 50 % during rest, which washes out the photo and the badge | L | Rest screenshot | Keep the photo at 100 %. Signal rest with the panel (it already changes to the clock). |
| C7 | Tapping the big number opens "Adjust this set", but nothing suggests it's tappable | M | Code: `aria-label … Adjust` only | Add a small pencil/"Adjust" affordance under the number |
| C8 | Swipe-down to exit (PRD_FOCUS_MODE §4.4) isn't implemented. The exit is the list icon only. | L | No gesture handler in `FocusMode.tsx` | Either build it or remove it from the spec. The list icon is enough. |
| C9 | Spec items not built: one cue line under the name, set dots, and an up-next thumbnail strip | L | PRD_FOCUS_MODE §5.1 D–I | Cue line: yes (one sentence, 16 px). Dots and thumbnail: **drop**, since Workstream B covers them. |
| C10 | The stage is a still photo for most moves. 77 of 170 exercises have a photo, and the rest fall back to a muscle map. | M | STATE_OF_APP §2 | Out of scope here. Tracked in `research/EXERCISE_MEDIA_SOURCES.md`. |
| C11 | Station badge (`1`) plus "Exercise 1 of 6" plus the segment bar say the same thing three times | L | Screenshot | Keep the badge and the eyebrow. The segment bar goes (Workstream B). |

What works and should be kept: the white stage with the dark panel split (it reads like BFT and
separates "look" from "do"); one hero number; the pillar-orange primary button; `−15 / +15` rest
chips; the overflow sheet for Pain, Substitute, Options and Finish; and resuming from logged sets
rather than stored state.

---

## 5. Out of scope

- Buying exercise media or animations (C10).
- Heart-rate zones, HR-driven rest, and HR in the coach.
- App Store or public TestFlight distribution.
- Android.

## 6. Phases (for later — do not build yet)

| Phase | Workstream | Deliverable | Depends on |
|---|---|---|---|
| 1 | A | Home Screen PWA hardening: `storage.persist()`, **Import / restore** in `/settings/data` | — |
| 2 | B + C | Three-tile panel (web: Work + Time only); fixes C2–C7, C9 cue line, C11 | — |
| 3 | A | Capacitor iOS shell (bundled `dist/`, free team): absolute Worker URL + CORS, HealthKit read plugin | Phase 1 |
| 4 | B | Heart tile live: watchOS app, mirroring, `watchHeartRate` plugin | Phase 3, paid Apple Developer Program |

Phases 1 and 2 are independent and can run in either order.

## 7. Open questions

1. **Tile grouping (§3.1).** Is Heart · Time · Work the intended "three things"?
2. **Paid program.** Are you willing to pay US$99/yr for the Apple Developer Program when the Watch phase comes? Without it, live heart rate means re-installing two apps every 7 days.
3. **Privacy (not a product question).** `PRD_SINGLE_USER_AND_THEME.md` §4.4 lists the owner's real profile, and the repo is public. It was left out of the 2026-09-29 push until it is redacted.
