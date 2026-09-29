# Research — Follow-along workout mode (BFT-style), Sept 2026

**Question.** Can the app run a timed workout where each station shows the movement as a looping clip,
inside the app, full-screen portrait, with nothing else on screen, and a swipe to leave?

**Answer.** Yes. Nothing in the platform blocks it. The two real decisions are **where the motion
media comes from** (licensing) and **video vs. animated image** (iOS Low Power Mode). Everything
else reuses code we already have.

---

## 1. What BFT is actually doing (from the reference photo)

- **Station screen (portrait):** a grid of numbered stations (1 / 1A, 2 / 2A, 3 / 3A). Each tile is
  a looping clip of one person doing the movement on a plain white background, with a short
  caption (SKI ERG, LOW GRIP JOG, BIONIC BIKE, BURPEE).
- **Work time on every tile:** a heart icon and "35 SECS". The colour of the icon marks the pair
  (red = primary station, blue = the "A" partner move).
- **Progress bar across the top:** the round clock (01:57) sits on the bar, and a round counter
  (1/4) at the end.
- **No controls.** Nobody touches the screen: you look up, see the move, copy it. The timer runs
  the session.
- The second screen (heart-rate % per member) is a group feature. We skip it; a solo equivalent is
  a single live HR number if Apple Health streaming ever lands.

What makes it work: **the clip is the instruction**. A plain background, one person, a short loop,
big text readable from 2 m away, and time left always visible.

## 2. What we already have

| Piece | Where | Reusable? |
|---|---|---|
| Two photos (start / end position) for 74 of 170 exercises, public domain | `src/data/exerciseMedia.ts` (free-exercise-db) | Yes: already cross-fades on the `hero` size every 1.6 s |
| Service-worker cache for exercise media | `vite.config.ts` `runtimeCaching` (`exercise-media`) | Yes: extend the pattern to clips |
| Screen wake lock with re-acquire | `src/native/wakeLock.ts` | Yes, as is |
| Timestamp-based rest timer | `src/features/workout/useRestTimer.ts` | Pattern yes; needs a work/rest/round version |
| Timed movements | `Exercise.timed` (30 exercises), `MobilityMovement.durationSec` | Yes: already the data a follow-along timer needs |
| Guided sessions with a wake lock | `Workout.tsx`, `Mobility.tsx`, `MindBreathe.tsx` | Mobility is the easiest place to start |
| Installed as a standalone PWA | `vite.config.ts` manifest `display: 'standalone'` | Yes: no browser chrome, so "full screen" is just a full-viewport route |

## 3. Platform constraints (iPhone is the one that matters)

1. **We don't need the Fullscreen API.** On iPhone, `element.requestFullscreen()` has historically
   worked only on `<video>` (native player UI, which we don't want). It was added behind a flag in
   Safari 17.2 and is still not dependable. The installed PWA already runs with no browser chrome,
   so a `position: fixed; inset: 0; height: 100dvh` route with safe-area padding *is* full screen.
   In a Safari tab (not installed) the address bar stays; that's acceptable.
2. **Orientation can't be locked on iOS** (`screen.orientation.lock` is unsupported). Design
   portrait-first and let landscape fall back to a side-by-side layout rather than fighting it.
3. **Low Power Mode blocks video autoplay, muted or not**, and pages can't detect Low Power Mode.
   `video.play()` rejects. So any `<video>` path needs a fallback: an animated image (animated
   WebP/GIF keeps playing) or the two-frame flipbook we already have. This is the main argument for
   **animated WebP** over MP4 as the default format.
4. **Autoplay rules otherwise:** `<video muted playsinline autoplay loop>` plays inline in Safari.
   Without `playsinline` iOS jumps to the native full-screen player, which is exactly the redirect
   the brief wants to avoid.
5. **Timers drift in background tabs.** Compute remaining time from `Date.now()` against a stored
   start timestamp (as `useRestTimer` already does), never by counting `setInterval` ticks.
6. **Audio/voice cues** (3-2-1 beeps, "Next: Burpee") need one user tap first to unlock Web Audio or
   speech synthesis. The "Start" tap covers it. No vibration API on iOS Safari (already noted in
   PATTERNS.md §8).
7. **Gestures:** keep swipes away from the screen edges (iOS system back and home gestures). Vertical
   swipe-down to exit, `touch-action: none` on the stage, dismiss past about 25% of the height or on a
   fast flick, spring back otherwise.
8. **Offline at the gym:** pre-cache every clip in the session when the user taps Start (just a
   `fetch()` per URL, which the service worker's CacheFirst rule stores).

## 4. Media sources

| Option | Motion? | Cost / licence | Coverage of our library | Verdict |
|---|---|---|---|---|
| **A. free-exercise-db flipbook** (what we ship) | 2 frames, start ↔ end | Free, Unlicense (public domain) | **74 of 170** exercise ids; the rest fall back to MuscleMap. Mobility movements have no media ids at all | **Ship first** for the ids it covers. Flip at the rep tempo (e.g. 1.5 s per frame) and it reads as a rep. It's not a smooth clip. |
| **B. ExerciseDB v1 (free tier)** | Smooth GIF, 180p | **Non-commercial only**, attribution required | ~1,500 exercises | OK for a personal build only. 180p looks soft on a full-screen phone. |
| **C. ExerciseDB paid** | GIF 360p (Starter) / 720–1080p (Pro) | One-time purchase, perpetual; can self-host; can't redistribute the raw files | ~1,500 (v1) to 11,000+ | **Best quality per unit of effort** if the app may ever be commercial. Plain background, BFT look. Check the EULA before buying. |
| **D. wger** | Mostly photos, a few videos | CC-BY-SA per item (attribution + share-alike) | Patchy | Not worth it; photos we already have. |
| **E. Record our own** | Real video | Time; model release | Exactly our knee/back/neck-safe variants | Best fit for the safety-modified moves (our ranges differ from stock clips), but slowest. |
| **F. Pose-driven SVG/Lottie figure** | Smooth, tiny files | Own work | Anything we animate | Consistent look and themeable, but each move has to be animated by hand. A later phase at best. |

Full source comparison (Gym Visual, Exercise Animatic, MuscleWiki, Hevy, the GitHub dataset): [EXERCISE_MEDIA_SOURCES.md](EXERCISE_MEDIA_SOURCES.md).

**Safety note that argues for A/E over stock GIFs.** Our instructions deliberately limit range
(knee-friendly squats, no end-range neck work). A stock clip showing a full-depth version
contradicts the on-screen cue. `exerciseMedia.ts` already flags this for three photos. Any new
source needs the same per-id review ("never add an id without checking it").

## 5. Proposed UX: "Follow-along" screen

```
┌──────────────────────────────┐  status bar (safe-area)
│ ━━━━━━━━━━●━━━━━━━  2/4      │  session progress · round
│                              │
│   ┌──────────────────────┐   │
│   │                      │   │
│   │   looping movement   │   │  ~60% of height, white bg,
│   │   (WebP / flipbook)  │   │  object-contain
│   │                      │   │
│   └──────────────────────┘   │
│   GOBLET SQUAT               │  32–40px condensed caps
│   Sit back, knees track toes │  one cue line, not the paragraph
│                              │
│          0:23                │  huge tabular numeral, ring
│        WORK · 35s            │  WORK (accent) / REST (muted)
│                              │
│  Next ▸ Seated cable row     │  small thumbnail of the next move
└──────────────────────────────┘
```

- **Session shape:** a list of intervals `{ exerciseId, workSec, restSec }` × rounds. It maps onto
  the existing `Exercise.timed`, `MobilityMovement.durationSec`, and conditioning sessions. Rep-based
  strength sets can use "work until done → tap" instead of a countdown (the screen's one tap target).
- **Rest phase:** the stage shows the *next* move with "UP NEXT" and a countdown, so you can set up.
- **Gestures (no buttons on screen):**
  swipe down → exit to the normal workout/mobility screen, with progress kept ·
  tap → pause/resume (big translucent "Paused" overlay) ·
  swipe left/right → skip / previous interval (optional, might conflict with fumbling hands;
  test it).
- **Cues:** 3-2-1 beep at the end of each interval plus an optional spoken "Next: Goblet squat",
  reusing the speech code path.
- **Accessibility:** `prefers-reduced-motion` → still frame + pose label (ExerciseVisual already
  checks this). Time left announced through an `aria-live` region every 10 s.
- **Visual language:** follow PATTERNS.md §8 (one huge tabular numeral, one accent, status colours
  only for status). Keep a white clip frame even in dark mode so the clip reads like BFT's.

## 6. Build shape (for a later plan; no code yet)

1. `useIntervalTimer`: timestamp-based phases (work/rest/round), pause, skip. Unit-testable with a
   fake clock, like `useRestTimer`.
2. `FollowAlong` route/overlay: fixed full viewport, wake lock, swipe-to-dismiss, audio unlock on
   Start.
3. `MovementLoop` component: tries `<video muted playsinline loop>`, then falls back to animated
   image, then to the two-frame flipbook, then to MuscleMap (the fallback ExerciseVisual already
   uses).
4. Media map: extend `exerciseMedia.ts` with an optional `loop` URL per id (verified, like the
   photos) and add the host to `runtimeCaching`.
5. Entry points: conditioning / circuit sessions built from `timed` exercises first (they have ids and some media). Mobility routines are already all timed, but their movements are free-text names with no exercise id or media, so they need a media map first.

**Rough effort:** 1 to 3 is a few days with option A media. Buying option C adds a mapping and
review pass over our 170 exercise ids.

## 7. Risks

- **Licensing:** ExerciseDB free tier is non-commercial; the paid tiers forbid redistributing files.
  Don't hotlink their CDN. Self-host after purchase.
- **Clip vs. our safety cues:** see §4. Every id needs a manual check.
- **Low Power Mode:** handled by the fallback chain, but it means MP4 can't be the only format.
- **Swipe conflicts:** the iOS edge gestures and the page's own scroll. The stage must not scroll.
- **Storage:** 720p GIFs run 1–3 MB each; animated WebP about ⅓ of that. Cap the cache (already
  `maxEntries: 400`).

## Sources

- [ExerciseDB FAQ: licence, resolutions](https://exercisedb.io/faq) · [ExerciseDB v1 free docs](https://oss.exercisedb.dev/docs) · [exercisedb-api repo](https://github.com/exercisedb/exercisedb-api)
- [wger docs: AGPL + CC-BY-SA data](https://wger.readthedocs.io/)
- [free-exercise-db (Unlicense)](https://github.com/yuhonas/free-exercise-db)
- [Autoplay fails in Low Power Mode (wojtek.im)](https://wojtek.im/journal/safari-autoplay-not-working-in-low-power-mode) · [Apple forums: Low Power Mode playback](https://developer.apple.com/forums/thread/813352)
- [Apple forums: Fullscreen API on non-video elements (iOS)](https://developer.apple.com/forums/thread/133248) · [WebKit bug 212934](https://www2.webkit.org/show_bug.cgi?id=212934)
