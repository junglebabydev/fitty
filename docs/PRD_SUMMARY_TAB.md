# PRD — Summary tab: calories, Apple Watch, food and body data in one place (v1.0, 2026-10-01)

Status: **5th tab agreed (2026-10-01). Nothing is built.** Companion to [PRD_TRAINING_PROGRAMS.md](PRD_TRAINING_PROGRAMS.md); both share one mockup.
Mockup, row "All your data in one place": https://claude.ai/artifact/7FPraK4a1rd1v3v2k4FF3A
Builds on: [APPLE_HEALTH.md](APPLE_HEALTH.md) (what Apple allows, and the import that already exists), [STATE_OF_APP.md](STATE_OF_APP.md) §6.

---

## 1. Problem

The owner asked: "how do I track the calories, metrics, Apple Watch data, food data? We need a place for that to be accessible." Today the answer is scattered, and part of it is invisible:

| Data | Where it is today | Visible? |
|---|---|---|
| Food, calories eaten, protein | Eat tab | Yes, today only, plus a week strip |
| Weight, waist, best lift, sessions, sleep average, photos | `/progress`, reached only from a small chart icon on Today (`Today.tsx:178`) | Behind an icon |
| Sleep | `/sleep` | The Today tile is switched off (`FEATURES.sleepTile = false`) |
| **Steps, active energy, HRV** | `health_metrics`, written by the Apple Health import (`healthExport.ts`) | **Never shown anywhere** |
| Resting heart rate | `health_metrics` | Used by readiness and the coach only (`coach/facts.ts:38`) |
| Apple Watch workouts | `cardio_sessions` with `source 'healthkit'` | Only as session counts |
| Calories burned | Not computed. `mifflinStJeor` exists (`engine/nutrition.ts:35`) but only sets the intake target | No |

**Apple Watch, plainly:** a web app can't read HealthKit; only native iPhone apps can (APPLE_HEALTH.md §1). Today Watch data arrives only through the Health app's export file, imported in Settings → Health (`HealthSettings.tsx:195`). Live sync needs the iPhone shell (§6).

## 2. Goal

**One tab answers "how am I doing?" across food, activity, body, sleep and heart. Today keeps answering "what do I do now?"**

### Success criteria

- **S1** Every number the app stores about the user is reachable in ≤ 2 taps from the tab bar.
- **S2** Steps, active energy and resting HR from an Apple Health import appear the moment the import finishes.
- **S3** "Calories burned" is always labelled as an estimate, says how it's made, and cites why it's uncertain.
- **S4** The tab root stays inside DESIGN.md §10.1: ≤ 5 blocks, ≤ 110 words, ≤ 1.6 screens. A tile with no data is hidden, not shown empty.

### Non-goals

- Live Apple Watch sync in the web app (impossible, §6).
- User-customisable tiles. The set is fixed, which follows the "less is more" rule.
- Medical interpretation of heart data.
- Charts of every HealthKit type.

## 3. Navigation

- **Tabs: Today · Train · Eat · Summary · Coach** (5, the DESIGN §8 maximum). Decided by the owner on 2026-10-01.
- `/progress` becomes `/summary`. The old route redirects, so links in Coach's weekly review keep working.
- Today's header loses the chart icon: Summary is one tap away in the tab bar.
- Mind is off (`FEATURES.mind = false`). If it's switched back on, the bar would hold 6 tabs. In that case Mind's mood card moves into Summary rather than adding a sixth tab (Q1).

## 4. The Summary tab ("Summary tab" artboard)

Top to bottom:

1. **Date and title.** Then an **Apple Health chip**: "Apple Health · imported 2 days ago", or "Connect Apple Health" when nothing has been imported. It opens §5.3.
2. **Energy card.**
   - Eaten today against the target, and burned today as "≈2,290 kcal (1,760 resting + 530 active)".
   - Two thin bars. Tap for the detail (§5.1).
   - Without imported active energy, the card shows eaten against target only. It never shows a half-estimated burn.
3. **Tile grid** (2 columns). Each tile has one number, one line and a 7-day sparkline. A tile is hidden when its data is absent.

   | Tile | Number | Source | Colour (DESIGN §2) |
   |---|---|---|---|
   | Protein | today / target g | `food_items` via the Eat totals | protein blue |
   | Steps | today | `health_metrics` `steps` | train ember |
   | Active energy | today kcal | `health_metrics` `active_energy` | train ember |
   | Weight | 7-day average, change | `body_metrics` (as Progress does today) | neutral |
   | Sleep | last night, 7-day average | `sleep_records` | rest blue |
   | Resting HR | latest, "steady / up / down" against 28 days | `health_metrics` `resting_hr` | neutral (status colours never decorate) |

4. **Workouts this week.** Sessions and minutes, programme and Watch workouts together, with a 7-day strip. Tap goes to Train.
5. **Show all health data.** A grouped list: waist, HRV, best lift (e1RM), adherence, photos (device only), cardio history. Everything currently on `/progress` lands here, so nothing is lost.

## 5. Detail screens

### 5.1 Metric detail — `/summary/:metric` ("Energy" artboard)

One generic screen for every metric:

- Range tabs: **Week · Month · 6 months**.
- **One interpreted sentence above the chart** (DESIGN §4), e.g. "About 360 kcal a day below what you burn. Today is still open."
- The chart:
  - Energy: eaten as bars, burned as tick lines.
  - Weight: existing `LineChart` with raw dots and a bold average.
  - Steps and active energy: `BarChart`.
- **"About these numbers":** how the number is made, with numbered sources and links.
- **"Data from":** each source with its freshness (Food log · Apple Watch via Apple Health · Your profile).

### 5.2 How "burned" is made, and what we say about it

- **Burned = resting energy (Mifflin-St Jeor, from profile height, weight, age and sex: `mifflinStJeor`, `engine/nutrition.ts:35`) + active energy (Apple Watch, imported).**
- Shown with "≈", averaged per week in the detail, and never turned into a daily deficit verdict.
- The Eat rule stays: nutrition never turns red.

Copy for the detail screen; both sources were opened and checked on 2026-10-01:

> Eaten comes from your food log. Burned is resting energy, estimated from your height, weight and age with the Mifflin-St Jeor equation [1], plus active energy from Apple Watch. Wrist devices misjudge energy burned by 20% or more [2], so read the weekly trend, not a single day.

1. Frankenfield D, Roth-Yousey L, Compher C. *Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review.* J Am Diet Assoc. 2005;105(5):775-89. https://pubmed.ncbi.nlm.nih.gov/15883556/ (systematic review). Mifflin-St Jeor "was the most reliable, predicting RMR within 10% of measured in more nonobese and obese individuals than any other equation". The review also notes that older adults and US ethnic minorities were underrepresented.
2. Shcherbina A, et al. *Accuracy in Wrist-Worn, Sensor-Based Measurements of Heart Rate and Energy Expenditure in a Diverse Cohort.* J Pers Med. 2017;7(2):3. https://pubmed.ncbi.nlm.nih.gov/28538708/ (validation study, 60 adults, 7 devices). "No device achieved an error in EE below 20 percent." The Apple Watch had the lowest overall error for both heart rate and energy expenditure.

### 5.3 Apple Health ("Apple Health and Watch" artboard)

- **Status:** last import date, days covered, the data types. Primary button: **Import a new export**, which calls the existing `importAppleHealthExport`.
- **How to export:** three steps, from APPLE_HEALTH.md §4(a).
- **"Live from Apple Watch":** a plain card marked *Coming*. It explains that Apple lets only native iPhone apps read Health, and that live sync arrives with the iPhone build.
- No reminders or nags. The chip on Summary shows the age of the last import, and that's the reminder.

## 6. Apple Watch data — the three routes

| Route | What the user does | Freshness | Status |
|---|---|---|---|
| **Health export file** (APPLE_HEALTH.md §4a) | Health app → Export All Health Data → Import | As fresh as the last export | **Built** (`healthExport.ts`, measured at 3–4 s for a 480 MB XML on the Mac; not yet run on an iPhone). This PRD only surfaces it |
| **iPhone app build** (Capacitor + `@capgo/capacitor-health`, APPLE_HEALTH.md §6 "Next") | Open the app | Reads the last 7 days on each open | Not built. Needs full Xcode 26+ on the Mac (only the Command Line Tools are installed), an Apple ID (free works but expires every 7 days) and about a day of work. `importHealthData()` already works through the bridge interface, so the Summary tab needs no change when it lands |
| Shortcuts or third-party export apps (APPLE_HEALTH.md §4b) | A daily automation writes a file; the user picks it | Daily at best | Stopgap only, not recommended |

**Recommendation:** ship the Summary tab on the export route now (it's useful the day it lands), and decide separately when to install Xcode for the iPhone build (Q3).

## 7. Data and code

- **No new tables.**
  - `health_metrics` already holds `steps`, `active_energy`, `resting_hr` and `hrv` (`types.ts:217`), read by `getHealthMetrics(type, days)` (`repositories/health.ts:13`).
  - `cardio_sessions` holds Watch workouts.
- **New:** a pure `src/engine/summary.ts` that builds the tiles and the energy model from those reads, with unit tests:
  - `burnedEstimate(profile, activeKcal)` → `{ resting, active, total }`;
  - `dailySeries(metric, range)`;
  - `restingHrTrend(rows)`.
- **Steps and active energy de-duplication:** the importer already prefers Watch over iPhone samples (APPLE_HEALTH.md mapping table). The live route must use the plugin's aggregated daily sums (same doc, §2).
- **Routes:** `/summary`, `/summary/:metric`, `/progress` → redirect. Add Summary to `TabBar.tsx` TABS. DESIGN §5 and the stale `CONTRACTS.md:54` tab list get updated.
- **Coach:** no change. Coach facts already read resting HR. Steps and active energy can become optional facts later, using the `mind` pattern so the goldens stay byte-identical.

## 8. Phases

| Phase | Scope | Gate |
|---|---|---|
| **S1** | Summary tab with data that exists today: Energy (eaten vs target), Protein, Weight, Sleep, Workouts, Show all (everything from `/progress`); Apple Health chip and screen; `/progress` redirect; tab bar | Light and dark at 375 px; ≤ 110 words; no tile shown empty |
| **S2** | Steps, Active energy and Resting HR tiles; burned estimate with the §5.2 copy; metric detail for each | `engine/summary.ts` tests; detail sources link out |
| **S3** | iPhone build (separate work, APPLE_HEALTH.md) | Real Watch data on the owner's phone |

## 9. Acceptance criteria

- **AC1** With no Apple Health import, Summary shows Energy (eaten only), Protein, Weight and Workouts, plus a "Connect Apple Health" chip. There are no empty tiles.
- **AC2** After importing an export, Steps, Active energy, Resting HR and the burned estimate appear without reloading.
- **AC3** Every burned number carries "≈". The energy detail shows the §5.2 copy with both sources linked.
- **AC4** Everything `/progress` shows today is reachable from Summary → Show all, and `/progress` redirects to `/summary`.
- **AC5** `npm run typecheck && npm test` passes; no coach golden changes.

## 10. Open questions (owner)

- ~~Q1 5th tab or fold into Today~~ **Decided 2026-10-01: a 5th tab, Summary.**
- **Q2** "Burned": resting energy from our equation (matches the intake target, recommended), or import Apple's own resting energy too? Apple's is also an estimate, and mixing the two makes the numbers disagree.
- **Q3** Install Xcode and build the iPhone app for live Watch data now, or after programmes ship?
