# PRD — Single-user mode, Apple-Health light theme, and simplification (v1.0, 2026-09-24)

Status: **Ready to build.** Hand this to a fresh Claude Code session.
Companion PRD (build after this one): [PRD_FOCUS_MODE.md](PRD_FOCUS_MODE.md) — the follow-along workout player.
Inventory this builds on: [STATE_OF_APP.md](STATE_OF_APP.md).

> **Read this first.** Nothing here is implemented. Phases 1–3 were built once during research and
> then reverted, so every value, file path and pitfall below is verified against the real codebase
> (typecheck clean, 711/711 tests passing) rather than guessed — §6 records what that pass proved.
>
> The working tree holds unrelated edits from earlier work — `src/data/exercises.ts`,
> `src/data/foods.ts`, `src/engine/symptomGate.ts`, `src/features/ai/planner.ts` and their tests.
> **Leave those alone**; they are not part of this PRD.

---

## 1. Why

Three separate problems, one release:

1. **The app is dark-only in practice.** It defaults to Dark even though a full light theme and a
   System option already exist. Dark in daylight, in a gym, is the wrong default.
2. **There is one user.** The onboarding wizard, the demo persona "Alex Tan", the privacy ledger and
   five AI-provider choices are all scaffolding for a product with many users. They cost taps and
   screen space.
3. **Personal data cannot go in the repo.** `junglebabydev/fitty` is public. Hard-coding a date of
   birth, weight and injury history into committed source publishes them.

## 2. Scope

| In | Out |
|---|---|
| Light theme restyled to the Apple Health arrangement; default follows the phone | Any change to the dark palette |
| Owner profile loaded from a git-ignored file; onboarding wizard never appears | Deleting the onboarding wizard (it stays as the edit path) |
| Reports and the privacy ledger out of the navigation | Deleting those screens, routes or tables |
| AI settings trimmed to the hosted Worker (+ Demo) | `AIProviderId`, the gateway fallback chain, or anything in `src/ai/*` |
| Demo persona kept out of the owner's build | Removing `SEED_PROFILE`, `reseed()` or `?demo=1` |

**Non-goals:** the Mind journal and mood correlations stay. The Coach keeps both chat and the daily
priority. No work on the Focus Mode player here.

## 3. Phase 1 — Apple-Health light theme

Apple **Fitness** is dark-only and can't be switched, so it is the wrong reference. Apple **Health**
is the model: a light grey grouped background, white cards, near-black text, colour reserved for
data.

### 3.1 Tokens (`src/index.css`, the `:root` block only)

| Token | Was (warm paper) | Now (Apple Health) |
|---|---|---|
| `--c-bg` | `#f5f2ea` | `#f2f2f7` |
| `--c-fg` | `#14161a` | `#1c1c1e` |
| `--c-surface` | `#fffdf8` | `#ffffff` |
| `--c-surface-2` | `#ece8de` | `#eaeaef` |
| `--c-surface-3` | `#e2ddd1` | `#dfdfe5` |
| `--c-line` | `rgba(20,22,26,.10)` | `rgba(60,60,67,.13)` |
| `--c-line-strong` | `rgba(20,22,26,.18)` | `rgba(60,60,67,.24)` |
| `--c-muted` | `#565c66` | `#6c6c70` |
| `--c-faint` | `#7b818c` | `#8e8e93` |
| `--c-accent` / `--c-accent-fg` | `#14161a` / `#fffdf8` | `#1c1c1e` / `#ffffff` |
| `--c-accent-soft` | `rgba(20,22,26,.07)` | `rgba(28,28,30,.06)` |
| `--c-shadow` | `rgba(40,32,16,.10)` | `rgba(16,18,24,.10)` |
| `--grain-opacity` | `0.035` | `0.015` (film grain exists to stop large dark surfaces looking flat; on white it reads as dirt) |

Pillar, macro and status hues in light mode are unchanged. **Do not touch `:root[data-theme="dark"]`.**

### 3.2 Default and pre-boot (`src/lib/theme.ts`, `index.html`)

- `getThemePref()` falls back to `'system'`, not `'dark'`.
- `resolve()` tests `(prefers-color-scheme: dark)` and falls through to light, so a browser that
  reports neither gets light.
- `index.html` drops the static `data-theme="dark"` and runs a small inline script before the
  stylesheet: read `localStorage['ui.theme']`, resolve, set `documentElement.dataset.theme` and the
  `theme-color` meta (`#0a0b0d` dark / `#f2f2f7` light). Without it, light users see a dark flash.
- `applyTheme()` writes the same `theme-color` values. The PWA manifest's `theme_color` stays dark
  (it only affects the install splash).

### 3.3 Acceptance

- AC1.1 A phone set to Light opens the app light; set to Dark, dark; changing the phone setting
  while the app is open flips it live.
- AC1.2 Settings → Appearance still offers System / Light / Dark, and an explicit choice survives a
  reload.
- AC1.3 No dark flash on load in either mode.

## 4. Phase 2 — Owner profile, no onboarding

### 4.1 Privacy rule

The repo is public. The owner's real values live in **`src/config/owner.local.ts`**, which is
git-ignored. `*.local` in `.gitignore` does **not** match `owner.local.ts`; add the explicit path
**before** creating the file, and verify with `git check-ignore -v src/config/owner.local.ts`.

### 4.2 Files

| File | Committed? | Purpose |
|---|---|---|
| `src/config/owner.ts` | Yes | `OwnerSetup` type; loads `./owner.local.ts` via `import.meta.glob(..., { eager: true })` so a missing file is an empty match, not a build error. Exports `OWNER: OwnerSetup \| null` and `hasOwner()`. |
| `src/config/owner.example.ts` | Yes | Same shape, fictional values, for anyone cloning the repo |
| `src/config/owner.local.ts` | **No** | The real profile |
| `src/features/settings/ownerBootstrap.ts` | Yes | `ownerWizardState()` and `applyOwnerProfile()` |

### 4.3 Behaviour

- `applyOwnerProfile()` does nothing when there is no owner file or a profile already exists.
- Otherwise it builds `{ ...initialWizardState(), ...owner, accepted: true }` and calls
  **`commitOnboarding()`**. Everything — profile row, units, coach style, diet pattern, activity,
  weight metric, weight/waist goals, nutrition targets, condition flags, the first planned week —
  comes from that one validated path. Do not re-implement any of it.
- It then sets `seed.skipDemo = true`, so neither the demo persona nor the demo Mind top-up ever
  lands on a real profile, and writes the waist metric (the wizard's body-check step, which this
  path skips).
- Boot order in `src/App.tsx` is **`db.init()` → `applyOwnerProfile()` (then `db.persist()` if it
  wrote) → `seedIfEmpty()` → `applyAISettings()`**. Applying the profile *before* seeding is what
  keeps "Alex Tan" out: `shouldSeedDemo()` short-circuits on `hasProfile`. **Do not add an owner
  check inside `seed.ts`** — a real `owner.local.ts` on disk would then change what the seed tests
  see, and six of them fail.
- `?demo=1` and `reseed()` keep working on a clean database.
- The `/onboarding` route and its guard stay exactly as they are. The guard simply never fires,
  because the owner profile has `onboarded: true`. Settings rows still open the wizard to edit the
  profile, diet and wellbeing.

### 4.4 The owner's values

Field mapping: `Region` is a closed union, so "knees" becomes two flags. General stiffness is not a
region — it belongs in `mobilityPriorities`, not a condition flag. Equipment accepts values outside
`EQUIPMENT_OPTIONS` (the wizard calls them "extras"), so `bodyweight` is valid.

The owner's real values (name, birth date, body measurements, targets, conditions, diet) are **not in this
document**: the repo is public. They live only in `src/config/owner.local.ts` (git-ignored, §4.1). Fields to fill
there: name, dob, sex, height, weight, waist (and whether there is a waist target), weight target and horizon,
training days (min / target / stretch), experience, coach style, activity, preferences, equipment, mobility
priorities, condition flags (one per region; knees are two flags), diet pattern and notes.

### 4.5 Acceptance

- AC2.1 A fresh database (clear site data) boots straight to Today with the owner's profile — no
  onboarding, no "Alex Tan".
- AC2.2 Today shows the owner's weight, calorie and protein targets, and a planned week.
- AC2.3 Settings → profile opens the wizard prefilled with the owner's values and saves.
- AC2.4 `git status` never lists `src/config/owner.local.ts`.
- AC2.5 With no `owner.local.ts`, the app still builds and still boots into onboarding.
- AC2.6 All existing seed tests pass **unchanged**.

## 5. Phase 3 — Simplification (navigation only)

`src/config/features.ts` holds the switches; screens, routes and tables stay in place so any of
them is a one-line revert.

```ts
export const FEATURES = { reports: false, privacyLedger: false } as const
```

| Surface | File |
|---|---|
| Settings → "Reports" row | `src/screens/Settings.tsx` (Integrations & privacy group) |
| Settings → "Privacy ledger" rows (two: the group row and the one in the AI section) | `src/screens/Settings.tsx` |
| Settings → "Coach can use report summaries" toggle | `src/screens/Settings.tsx` (AI section) |
| Composer "+" → "Upload a report" | `src/features/composer/Composer.tsx` |

Acceptance: AC3.1 neither Reports nor the privacy ledger is reachable by tapping; AC3.2 both still
work when the flag is flipped back on; AC3.3 `/reports` and `/settings/privacy` still resolve if
typed, and no test changes.

## 6. What the throwaway pass proved

Phases 1–3 were implemented once and reverted. The files it touched are exactly the ones a build
session will touch again:

```
 .gitignore            explicit ignore for src/config/owner.local.ts
 index.html            pre-boot theme script; static data-theme removed
 src/index.css         :root light tokens → Apple Health; grain 0.035 → 0.015
 src/lib/theme.ts      default 'system'; prefers-color-scheme: dark; theme-color #f2f2f7
 src/App.tsx           applyOwnerProfile() between db.init() and seedIfEmpty()
 src/screens/Settings.tsx              FEATURES gates on 3 rows
 src/features/composer/Composer.tsx    FEATURES gate on "Upload a report"
 src/config/                           owner.ts, owner.example.ts, owner.local.ts (ignored), features.ts
 src/features/settings/ownerBootstrap.ts
```

Findings worth keeping:

1. **`src/db/seed.ts` needs no logic change.** The first attempt added a `hasOwner()` check to
   `seedIfEmpty()`. That broke six seed tests, because a real `owner.local.ts` sitting on disk then
   changed what the test environment saw. Ordering the boot instead (§4.3) fixes it with no edit to
   `seed.ts` and no test changes.
2. **The whole thing typechecks and passes 711/711 tests** with no edits to existing tests.
3. **Light mode is only a token change**, because components use tokens: a palette grep found four
   hard-coded colour classes in the entire `src` tree. That is *not* proof it looks right — see
   Phase 5.

Suggested commit split: (1) light theme, (2) owner profile + single-user boot, (3) feature switches,
(4) AI trim.

## 7. Phase 4 — Trim the AI settings to the hosted Worker (not started)

Today Settings offers five modes — Auto, My Worker / My Mac, Gemini, Anthropic, Demo — with key
fields, a bridge-model picker and two how-to sheets. On the hosted build only the Worker is used.

**Scope: the settings UI surface only.** Do not touch `AIProviderId`, `src/ai/gateway.ts`, the
`auto` fallback chain or anything else in `src/ai/*`; `config.test.ts` and `gateway.test.ts` must
stay green without edits.

1. In `aiModeOptions()` (`src/screens/Settings.tsx`), when `status.host === 'cloud'` return only
   **My Worker** and **Demo**.
2. Hide the Gemini and Anthropic key fields, the connection test and the Anthropic model row on the
   cloud host.
3. Keep the local-dev host (`npm run dev` on the Mac) exactly as it is — that is where the Claude
   Code bridge is used.
4. Stored settings keep their current keys, so nothing needs migrating.

Acceptance: AC4.1 the hosted app shows two AI choices and a PIN field, nothing else; AC4.2 the dev
build is unchanged; AC4.3 no test edits.

## 8. Phase 5 — Visual QA in light mode (not started)

A token swap is not proof. With `npm run dev` and the browser preview, check **light and dark** on:
Today, Train, an in-progress Workout (sticky `glass` header, `ExerciseCard`), Progress charts, Eat,
Coach, a bottom `Sheet`, and the tab bar.

Watch for: the `glass` utility (`color-mix(... var(--c-surface) 78%)` plus a blur tuned for
`#0a0b0d`) looking muddy on white; `atmo` / `atmo-calm` pillar washes being too strong on light;
`from-black/55` in `ExerciseVisual.tsx`; chart lines and the film grain. Fix by adjusting tokens or
adding a light-mode override — not by hard-coding colours in components.

Acceptance: AC5.1 screenshots of all eight surfaces in both modes; AC5.2 text contrast ≥ 4.5:1 for
body copy; AC5.3 no component gains a literal hex or a Tailwind palette colour.

## 9. Execution order

| Phase | Sequence | Gate |
|---|---|---|
| 1 Light theme | commit first | AC1.x |
| 2 Owner profile | second | AC2.x, seed tests unchanged |
| 3 Feature switches | third | AC3.x |
| 4 AI trim | **separate commit, last** | AC4.x |
| 5 Visual QA | after 1–3 land | AC5.x |

Run `npm run typecheck && npm test` at every gate. Keep diffs surgical, match the surrounding style,
and leave the unrelated working-tree files listed at the top of this document untouched.

## 10. Open questions

- **Q1** Weight target horizon: 6 months assumed (the rate follows from the values in `owner.local.ts`). Confirm or change.
- **Q2** `experience`: `beginner` assumed. It only feeds AI prompt text, so switching it to
  `intermediate` changes no engine behaviour.
- **Q3** Mind journal and mood correlations: keep (current assumption) or hide behind a flag too?
- **Q4** Should Settings keep a hidden way into Reports (e.g. a long-press), or is flipping the flag
  in source enough?
