# PRD — Training programmes: preset series, intros with sources, prompt to start, coach-guided sessions (v1.0, 2026-10-01)

Status: **Design agreed on the main choices (programme-first Train root, Summary as a 5th tab, 2026-10-01). Nothing is built.** Remaining owner questions are in §14. Then this goes to Claude Code one phase at a time (§11).
Mockup (clickable, light and dark): https://claude.ai/artifact/7FPraK4a1rd1v3v2k4FF3A
Research behind every series: [docs/programs/](programs/README.md), one document per series, each citation opened and checked by a second agent.
Builds on: [STATE_OF_APP.md](STATE_OF_APP.md) §2, [coverage/WORKOUT.md](coverage/WORKOUT.md), [research/TRAINING_EVIDENCE.md](research/TRAINING_EVIDENCE.md), [PRD_FOCUS_MODE.md](PRD_FOCUS_MODE.md), [research/FOLLOW_ALONG.md](research/FOLLOW_ALONG.md).
Where this conflicts with DESIGN.md §6 "Train" or PRD.md §7–8, this document wins for the Train tab.

> **Read this first.** Every file:line below was read on branch `training-programs` (cut from `coach-worker-split`). Five read-only agents mapped the code; their notes are the source of §5–§9. Check a reference before you edit near it: line numbers move.

---

## 1. Problem

1. **Owner's verdict:** "still not impressed by the UI … we need to rethink the training module." Earlier rounds already cut density (DESIGN.md §10) and options ("less is more"). The Train root still asks the user to *plan*: a hero, a "Plan with AI" button, a Routines carousel, a This-week list and two links (`src/screens/Train.tsx:85-163`). Nothing on it says *where you are going*.
2. **One programming model.** `src/engine/planner.ts` lays out a fixed upper / lower / full week by tier (`WEEK_LAYOUT`, L104-124). Running, HIIT, home, bodyweight and postpartum are not variants of it. There is no multi-week path, and no week 2 that differs from week 1.
3. **One session shape.** A session is `PlannedExercise[]` worked exercise by exercise (`src/features/workout/focus.ts:6-25`). Intervals squeeze into "sets × seconds + rest" (`planner.ts:69`). Circuits can't be expressed. Run/walk has no walk. Nothing auto-advances: the user taps Start for every interval (`FocusMode.tsx:84-98`).
4. **No guidance during a session.** The app never speaks. There is no `speechSynthesis` in `src/` (`PRD_FOCUS_MODE.md:240`), and `navigator.vibrate` does nothing on iOS.
5. **No reasons, no sources.** Nothing tells a user *why* a plan works or where the claim comes from.
6. **Prompts misfire today** (probed against the real parser):
   - "I just had a baby and want to get back to exercise" becomes a meal preview (`log_meal` 0.75, `router.ts:249,255`).
   - "begin postpartum training" opens today's gym session (`start_workout` 0.95, no confirmation, `voice.ts:517-518`).
   - "start a running program" becomes a meal preview at 0.5.
7. **Three safety gaps found while mapping** (they matter more once programmes exist):
   - A user with a standing knee flag gets impact moves at session start unless they report pain ≥ 3 that day. Session start gates on today's symptoms only (`Workout.tsx:59,134`; `gate.ts:95-98`); condition flags reach only the AI planner (`features/ai/planner.ts:66-71`).
   - Gate swaps ignore equipment: a home session becomes leg press, machine shoulder press and treadmill (`symptomGate.ts:253-263`).
   - Gate swaps ignore units: 10–12 burpee reps become 10–12 seconds on a bike (`planner.ts:273`).

## 2. Goal

**Pick a programme, or just say what you want. Read why it works, with sources. Answer a short safety check. From then on, the app hands you the next session each day, and the coach talks you through it.**

### Success criteria

- **S1** From an empty Train tab, a typed sentence reaches session 1 in **3 taps** plus the safety questions: send → *See the plan* → *Start programme* → *Begin*.
- **S2** Every claim on an intro page cites a numbered source in `docs/programs/<id>.md` that was opened and checked. No source, no claim.
- **S3** A run/walk or interval session runs start to finish with **no tap**. Phases advance on their own, with a spoken cue and a beep at each change while the screen is on.
- **S4** Every programme session is an ordinary `workout_sessions` row. Today, the coach, voice commands, finish and history keep working without special cases.
- **S5** No programme hands a sore knee, back or neck a move the gate would block that day. A knee or hip *history* flag allows running and jumping only while next-morning pain stays at 3/10 or less (§6.6). A user who says they don't want to run gets the walk or low-impact path everywhere.
- **S6** The Train root stays inside DESIGN.md §10.1: ≤ 5 blocks, ≤ 110 words, ≤ 1.6 screens.

### Non-goals (v1)

- AI-generated programmes. Programmes are code, like `SESSION_TEMPLATES` and `MOBILITY_ROUTINES`. The model only matches a prompt to a programme and explains it.
- A pregnancy (prenatal) programme, group features, heart-rate zones, GPS distance, buying exercise video.
- More than one active programme at a time.
- User-edited programmes. A user can still run one-off sessions from a prompt ("20 minutes upper body") through the existing planner.

## 3. The series

Six series. Each has a research document with a verdict, a graded claim table, the full programme as YAML, a safety screen, intro copy, coach cues and its sources. The five the owner named, plus **Bodyweight Anywhere** (no equipment, travel), since the library already covers it (coverage/WORKOUT.md: bodyweight ~85%). "Low impact" is a **path inside each series**, not a seventh series: the knee flag removes impact everywhere, so every series needs one.

| Series | Weeks | Per week | Min | Shapes | Knee/hip flag gets | Start-now workouts | Sources |
|---|---|---|---|---|---|---|---|
| [Gym Strength](programs/gym-strength.md) | 12 | 3 (4-day option from week 7) | 45–55 | sets, steady | `low-impact` leg swaps (leg press, bridges, hip thrust) | Full Body A, Full Body B | 26 |
| [Home Dumbbells](programs/home-dumbbells.md) | 10 | 3 | 30–40 | sets | `low-impact`: wall sit above parallel, step-ups, hinges | Dumbbell full body A | 18 |
| [HIIT](programs/hiit.md) | 8 | 3 (or 2) | 20–33 | intervals, circuit, steady | Standard track, knee-checked; low-impact when sore or by choice | Bike intervals 8 × 30/60, 4 × 4 on a machine, Low-impact circuit | 28 |
| [Postpartum Return](programs/postpartum.md) | 16 from birth | 2–3 | 10–33 | all four | Flag swaps; the running check stays open, knee-checked | None (stage gates, §9.2) | 38 |
| [Start Running](programs/start-running.md) | 9 | 3 | 26–40 | intervals, steady | Knee-checked running; walk-first if they'd rather not run | First run/walk | 20 |
| [Bodyweight Anywhere](programs/bodyweight.md) | 8 | 3 | 20–30 | sets, circuit | Squat knee path (sit-to-stand ladder) | Bodyweight circuit | 14 |

How the 144 sources were checked: [programs/README.md](programs/README.md#how-the-research-was-checked).
- Every one was opened by the drafter and again by an independent checker. None were fabricated, and 80 claims were reworded to match their source exactly.
- Postpartum had two extra safety reviews.
- One critic reviewed all six together.
- A final script matched all 112 PubMed links to PubMed's records.

**What the research changed in this PRD:**
1. Every series needs a hip path, not just knee. A knee or hip history flag no longer stops running (§6.6, decided 2026-10-02).
2. Pregnancy and postpartum routing must be shared rules (§4.4).
3. Warm-up, cool-down and rest blocks need a `role` (§5.1).
4. Postpartum needs a longer screen and stage gates (§9.2).

## 4. Experience

The mockup has one artboard per screen. Names below match the artboard titles.

### 4.1 Train root — "A · Programme first" (decided 2026-10-01)

Three blocks, about 45 words with the seed data:

1. **Programme card.**
   - Header: "Start Running · Week 3 of 9 ›", which opens the programme.
   - The programme's *shape*: one bar per week, this week outlined, past weeks solid, future weeks faded (§4.2).
   - Today's session in one line: "6 × RUN 90 S", plus two numbers (minutes, minutes running or sets).
   - **This week** as three small pills inside the card: done (tinted, with a tick), today (outlined), coming (plain).
   - One **Start** button.
2. **Ask bar.** The Composer, mounted on Train with context `'train'`. Placeholder: "Ask, or change anything". It handles "shorter today", "my knee's sore", "20 min upper body" and "I want to do HIIT instead" (§7).
3. **Start now.** A row of prebuilt workouts you can start straight away without joining anything (§4.9), plus *All workouts ›*.

**Removed from the root** (DESIGN §10.1: delete, don't shrink):

- The "Plan with AI" button: the ask bar does that.
- The Routines carousel: replaced by **Start now**, the same idea with clearer names and more types.
- The separate This-week list: folded into the card.
- The Mobility and Library links: both move to the All workouts page.
- The tier control on the week view, while a programme is active.

**Not chosen — "B · Coach first"** (kept on the canvas for the record): the coach says today's plan in one serif sentence, with Start, the ask bar and a slim programme row. The owner chose A on 2026-10-01. A reads at a glance and works the same with or without AI; B needs a good sentence every day.

### 4.2 No programme yet / the gallery — "No programme yet"

- One serif question, "What are you training for?", and the ask bar.
- The same **Start now** row (§4.9), for someone who wants to train today without committing to weeks.
- Then six programme tiles in two columns.
- **The cover is the programme's own shape, drawn from its data:**
  - Start Running: run minutes growing week by week.
  - HIIT: work/rest spikes.
  - Gym Strength: loads stepping up, with easier weeks dipping.
  - Bodyweight: a staircase of harder variations.
  - Postpartum: three stages separated by gates.

  No stock photos, no muscle maps. The cover *is* the information, and it's free to render (inline bars, theme tokens).

### 4.3 Programme intro — `/train/program/:id` (full page, not a sheet)

Anatomy, top to bottom:

1. Cover.
2. Title (≤ 4 words) and promise (≤ 12 words).
3. Three numbers: weeks · per week · minutes.
4. Description (≤ 60 words).
5. **Why it works:** exactly three bullets, each ≤ 20 words, each ending in a source chip `[2]`.
6. **The plan:** a week strip; tap a week to see its sessions.
7. **What you need.**
8. **Your path:** shown only when a flag or a screen answer changed it, e.g. "Walk-first path, because of your knee".
9. **Sources:** numbered, each with title, journal or organisation, year and an external-link icon.
10. A sticky primary button: **Start programme**.

All copy comes from section 5 of the series document and its Sources list. External links are allowed **here only**. Focus Mode keeps its no-external-navigation rule (`PRD_FOCUS_MODE.md` §2).

### 4.4 Before you start — the safety check (sheet)

- **Up to 7 yes/no questions** from the series document's §4, including the two shared ones below (Postpartum: up to 10, §9.2). Today's docs have 6, 6, 7, 7, 7 and 10.
  - Every question must be answered: this is a safety path, exempt from the "don't add inputs" rule.
  - A question about a standing flag is shown already answered from the profile.
  - Setup questions ("lifted for 3 months?", "longest recent run?") are asked after the screen, not in it.
- **The answers are stored per series and re-asked on the series' schedule:** after a long gap (HIIT: 21 days), every 4 weeks for Postpartum, and on "Something has changed". The same stored answers cover that series' start-now workouts (§4.9).
- **Two questions are shared by every series** (from the cross-series review, [programs/README.md](programs/README.md#rules-shared-by-every-series-from-the-critique)):
  - **"Are you pregnant?"** → `wait` (midwife or doctor). There is no pregnancy series.
  - **"Had a baby in the last 12 months?"** → `suggest:postpartum`, unless the user has finished Postpartum Return. Graduates are never sent back.
- Each "yes" maps to exactly one outcome:
  - `path:<id>`: switch to a named path, e.g. low impact or walk-first;
  - `wait`: "Get cleared first", with who to ask, and the programme does not start;
  - `suggest:<programId>`: e.g. "had a baby in the last year" → Postpartum Return;
  - `note`: a line on the intro, nothing else.
- Standing condition flags pre-answer their questions and say so ("From your profile: left knee").
- The answers are stored on the enrolment, on the device only, and never sent to AI.

### 4.5 Just ask — "1 · Just ask"

- The user types or dictates anywhere the Composer lives: Train, Today, Coach.
- A deterministic matcher runs first (§7). The result is a coach card:
  - one serif sentence on why this fits, mentioning the path if a flag applies;
  - the programme row (mini cover, weeks, per week, path);
  - **See the plan** (to the intro) and *Show me other programmes*.
- **Nothing enrols from the prompt.** Enrolment always happens on the intro, after the sources and the safety check. That keeps the Composer's rule that nothing is written without a tap (`router.ts:1-4`).

### 4.6 The coach guides the session

**Strength sets** ("Strength set, guided"):

- Today's Focus Mode, unchanged in layout: white stage, station number, dark panel, Prev · Done set · Next.
- Two additions:
  1. A **cue line** in the coach's serif under the exercise name, from the series' coach cues (fallback: the first sentence of the library instruction).
  2. A **speaker toggle** in the top bar, default on.
- The coach speaks the exercise and target when it starts ("Goblet squat. Ten reps, sixteen kilos."), the cue once, "Rest ninety seconds", and "Three, two, one" before the rest ends.

**Intervals and run/walk** ("Run/walk, guided", live on the canvas):

- A full-bleed phase screen. RUN floods the screen in the Train colour; WALK returns it to the page colour.
- One phase word, a huge countdown, the round ("Round 3 of 6"), and one coach line ("Easy pace. You should still be able to talk.").
- Footer: Next · Elapsed · Left.
- **No buttons.** Tap anywhere to pause, swipe down to leave. Phases advance on their own, each change spoken and beeped.
- Only work bouts are logged as sets (§5.3).

**Circuits:** the same player, stations in order, round counter, rest between stations and between rounds.

### 4.7 Session done — "Session done"

- Big tick, two numbers, and the programme's week progress.
- **One optional question: "How did it feel?"** (Easy · About right · Too hard), one tap, default unanswered.
- It feeds the week rule (§6.2): "Too hard" repeats the week. Pain is not asked here. The symptom gate before the next session asks it, as today.

### 4.8 Week to week

- Enrolling writes this week's sessions as ordinary rows (§6.1).
- The next week is written when the current one closes, or when Train or Today opens and the week has no rows.
- A missed session moves later in the week and is never silently dropped (§6.5).
- A week is repeated, not advanced, when the series' rule says so (§6.2). The coach says which happened, in one line.

### 4.9 Prebuilt workouts — "Start now" and "All workouts"

The owner asked for "prebuilt workouts that users can already start, like traditional gym workouts and HIIT". A programme is a commitment of weeks; a workout is today, one tap, nothing to join.

- **Where they come from.** Every workout is a session that already exists in a programme, so it carries the same research, cues and safety tags. No second set of content needs checking.
  - Each programme names 1–3 sessions as standalone workouts (`standalone` in §5.1). Eight exist today:
    - Gym: Full Body A, Full Body B.
    - Home: Dumbbell full body A.
    - HIIT: Bike intervals 8 × 30/60, 4 × 4 on a machine, Low-impact circuit.
    - Running: First run/walk.
    - Bodyweight: Bodyweight circuit.
  - **Postpartum Return has none on purpose**: a one-off session would skip its stage gates.
  - The 7 built-in routines (`SESSION_TEMPLATES` via `BUILTIN_ROUTINES`, `routines.ts:28-36`) and the mobility routines (`data/mobility.ts`) join them, so nothing that works today disappears.
  - Saved routines (`train.routines`) show under "Saved".
- **"Start now" row on Train:** three cards, chosen by a fixed rule with no settings. The rule: what fits the user's equipment (`library.ts` `ownsEquipment`), excluding anything the standing flags would block, ordered Gym · HIIT · Home · Bodyweight · Run · Mobility, and skipping types already done today.
- **All workouts page** ("All workouts" artboard): grouped by type, with one filter row (All · Gym · HIIT · Home · Bodyweight · Run · Mobility). Each row shows a mini shape, name, minutes and one fact ("low impact", "has jumps", "two dumbbells"). The exercise library link lives at the bottom.
- **Starting one: sources and the safety check first, like a programme** (the "Workout preview" artboard). The owner's rule is that science, sources and links come before someone starts, and a workout is no exception.
  - Tapping a card opens a **preview sheet** (the existing `RoutineDetailSheet`, renamed) with:
    - the workout's name, minutes and the parent series;
    - the series description;
    - the **3 "why it works" lines with their source chips**, plus *Full intro and sources ›*, which goes to the series intro (§4.3);
    - the exercise list.
  - **The parent series' safety check must have been answered**, and still be current, before any of its workouts start. If it hasn't, the primary button is *Answer N quick questions*, and it opens the same sheet as §4.4. The stored answers then cover every workout from that series until they are re-asked (§4.4).
  - A path from those answers applies here too. With a knee flag, HIIT's bike intervals stay on the bike, and the circuit becomes the low-impact circuit.
  - **Do today** creates a session for today with the `sessionFromRoutine` pattern (`routines.ts:68-86`) and opens it on the symptom gate.
  - The existing built-in routines and mobility routines have no series. They show their exercise list and the general symptom gate, as today.
  - Its `templateKey` is `work:<programId>:<sessionKey>`, not `prog:`, so it never moves a programme forward or back.
  - Interval and run/walk workouts use the guided player (§4.6) like any programme session.
- **Safety is the same as in programmes.** The gate runs at start, and standing flags apply (§6.3). Workouts with impact show "has jumps" in the row and swap to their low-impact variant for a flagged knee.

## 5. Data

### 5.1 Programme definitions — code, not database

New `src/data/programs.ts`, deterministic TypeScript like `SESSION_TEMPLATES` and `src/data/mobility.ts`. Seeding a programme table would break `seedBoot.test.ts:23-27,48` and `dataOps.test.ts:64-66`, which require every table but `exercises` and `settings` to be empty on a fresh install.

```ts
export type ProgramId = 'gym-strength' | 'home-dumbbells' | 'hiit' | 'postpartum' | 'start-running' | 'bodyweight'

export interface ProgramSource { n: number; citation: string; url: string; kind: 'guideline' | 'meta-analysis' | 'rct' | 'cohort' | 'consensus' | 'programme' }
export interface ScreenQuestion {
  id: string; text: string
  onYes: `path:${PathId}` | 'wait' | `suggest:${ProgramId}` | 'note'
  effects?: string[]          // rule ids from the series doc (e.g. Postpartum E2 'pelvic floor only', 'holds G1'); never new vocabulary
  waitCopy?: string; region?: Region
}
export type PathId = 'standard' | 'low-impact' | 'back' | 'no-overhead' | string   // knee and hip → low-impact; neck and shoulder → no-overhead

type Role = { role?: 'warmup' | 'cooldown' | 'rest' }   // not logged; exempt from the duplicate-id test
export type Block = Role & (
  | { shape: 'sets'; exerciseId: string; sets: number; reps?: [number, number]; seconds?: [number, number]; restSec: number; perSide?: boolean }
  | { shape: 'intervals'; rounds: number; work: { exerciseId: string; seconds: number; effort?: string }; rest: { exerciseId: string | null; seconds: number; effort?: string } }
  | { shape: 'circuit'; rounds: number; stations: { exerciseId: string; seconds?: number; reps?: [number, number] }[]; restBetweenStationsSec: number; restBetweenRoundsSec: number }
  | { shape: 'steady'; exerciseId: string; minutes: number; effort: string })

export interface ProgramSession { key: string; week: number; name: string; type: SessionType; minutes: number; blocks: Block[] }

export interface Program {
  id: ProgramId; title: string; promise: string; description: string
  weeks: number; sessionsPerWeek: number; minutes: number; equipment: string[]
  why: [WhyLine, WhyLine, WhyLine]          // { text ≤ 20 words, source: n } — one source each
  honestLine?: { text: string; source: number }   // e.g. Start Running: "about 1 in 5 or 6 beginners still gets injured"
  sources: ProgramSource[]
  screen: ScreenQuestion[]                   // ≤ 6; Postpartum ≤ 10
  stopSigns: string[]                        // series additions on top of one shared base list
  sessions: ProgramSession[]                 // the standard path, written out; `repeats: [{ week, copyOf }]` allowed
  pathSwaps: Record<PathId, { swaps: Record<string, string | null>; replaceSessions?: Record<string, string> }>
                                             // paths are swap maps, as five of the six docs wrote them (HIIT's second track
                                             // uses replaceSessions). A swap that would duplicate an id walks the library chain.
  redDaySwaps?: Record<string, Record<string, string | null>>   // Gym Strength: per-session swaps for a RED gate day
  advance: AdvanceRule                       // §6.2
  standalone: { sessionKey: string; name: string; fact: string }[]   // 1–3 sessions offered as prebuilt workouts, §4.9
  stages?: StageGate[]                       // postpartum only, §9.2
  cues: Record<string, string>               // by exercise id, plus 'start' | 'rest' | 'finish'
}
```

- The six definitions are transcribed from the YAML in each `docs/programs/<id>.md`.
  - The docs drifted slightly in schema: repeat mechanisms, `unilateral` vs `perSide`, path id spellings. Transcription normalises them to the types above. The list of drifts is in [programs/README.md](programs/README.md).
- A data test asserts, for every programme and every path:
  - every exercise id exists in the library;
  - every source number cited in `why` or `honestLine` exists;
  - no id appears twice in one session, ignoring blocks with a `role` (the logger groups sets by `exerciseId`, `helpers.ts:163-171`);
  - every `low-impact` path contains no `impact` or `deep_knee_flexion` tag;
  - every screen except Postpartum's has both shared questions (pregnant → `wait`; baby in 12 months → `suggest:postpartum`), and has at most 7 questions.
- Three docs (Gym, Bodyweight, Postpartum) ran this check themselves by script over every flag combination and found 0 duplicates and 0 blocked tags. The data test makes it permanent.

### 5.2 Enrolment — one setting, sessions linked by template key

- **Enrolment** lives in setting `train.program`, following `train.routines` (`routines.ts:7`). No migration.
  ```ts
  interface Enrollment { programId: ProgramId; path: string; startedOn: string; week: number; stage?: number
                         status: 'active' | 'paused' | 'done'; screen: Record<string, boolean>; feel: { week: number; value: 'easy' | 'right' | 'hard' }[] }
  ```
- **Sessions** carry `templateKey = 'prog:<programId>:<sessionKey>'`, e.g. `prog:start-running:w3d2`. No new column, so no change to `SESSION_COLS` / `ColumnMap` (`common.ts:6`, `workouts.ts:8-12`). Every reader that must treat programme rows differently tests `isProgramSession(s)`, i.e. `templateKey.startsWith('prog:')`.
- `tier` stays required (`types.ts:104`). Programme rows use `'minimum'`, and tier code skips them (§6.5).
- `type`:
  - Gym, Home and Bodyweight → `strength`.
  - Running and HIIT → `conditioning`. `cardioModality` (`finish.ts:50-54`) gains `prog:start-running` → `'run'`, so the cardio row says run.
  - Postpartum stage 0 → `mobility`; stages 1–2 → `strength`.

  No new `SessionType`, so `SESSION_TYPE_META` (`helpers.ts:34`) and HealthKit are untouched.
- Setting and rows are exported and wiped by the existing table-agnostic paths (`database.ts:203-208`, `dataOps.ts:22-32`).

### 5.3 Session shapes inside `exercises_json` — additive, no migration

`exercises_json` passes unknown keys through (`mappers.ts:197`); `substitutedFrom`/`reducedReason` set the precedent. `PlannedExercise` gains optional fields only:

| Field | Meaning | Absent means |
|---|---|---|
| `program?: true` | Prescription comes from a programme week; see §6.4 | Today's behaviour |
| `restExerciseId?: string` | What to do during the rest (e.g. `brisk_walk`), shown and spoken as the rest phase | Rest is rest |
| `circuit?: string` | Entries sharing a key run round-robin; `sets` = rounds | Exercise by exercise |
| `roundRestSec?: number` | Rest after the last station of a round | `restSec` |
| `cue?: string` | Coach line for this exercise | First sentence of the instruction |

The mapping from §5.1 blocks:

- `intervals` → one entry: work id, `sets = rounds`, `repMin = repMax = work seconds`, `restSec = rest seconds`, `restExerciseId`.
- `steady` → one timed set, rest 0.
- `circuit` → one entry per station with a shared `circuit` key.
- `sets` → as today.

**Only work bouts are logged.** A 6-round run/walk writes 6 timed sets, not 12, so finish, PRs and history stay meaningful.

### 5.4 Library additions, and the top-up bug

- **32 new ids**, plus fixes to 4 existing entries. The canonical list, after merging duplicates (`pram_walk` → `brisk_walk`, `chair_squat` → `sit_to_stand_chair`), is in [programs/README.md](programs/README.md#new-exercise-ids-canonical-after-merging-duplicates).
  - Four new patterns: `breathing`, `pelvic_floor`, `balance`, `plyometric`.
  - Each new id gets tags, substitutions and an instruction. `data.test.ts` already asserts that substitution chains resolve.
- **Fix `seedReference`.** It inserts the library only when the table is empty (`seed.ts:466`), so existing installs never get new exercises: 86 are already missing on databases created before commit `f979e0b`. Change it to insert missing ids on every boot. It must stay idempotent, because `seedBoot.test.ts:51-58` asserts a second boot adds no rows. **Without this, every programme breaks on the owner's phone.**

## 6. Rules (deterministic, `src/engine/programs.ts`, pure and unit-tested)

### 6.1 Materialise a week

`programWeekSessions(program, enrollment, weekStart, existing)` returns `Omit<WorkoutSession,'id'>[]`. A thin `features/workout/program.ts` writes them in one transaction via `createSession`, copying the `sessionFromRoutine` pattern (`routines.ts:68-86`).

- Default days: spread across the week from the start day with at least one day between sessions: 3 a week → +0, +2, +4; 2 a week → +0, +3.
- Days that already hold a session are skipped.
- On enrolment mid-week, sessions that no longer fit start next week. They are not crammed in.
- Enrolling while a tier week exists deletes this week's **untouched planned tier sessions** after confirmation ("Replace this week's gym plan?"). Completed and in-progress rows are never touched.
- `ensureWeekPlanned` at onboarding (`onboarding.ts:296-303,423`) must skip when a programme is active.

### 6.2 Advance, repeat or hold

At week close, `nextProgramWeek(enrollment, weekRows, painChecks)` returns `advance | repeat | hold` and a one-line reason. Inputs are each series' `advance` rule from its document §3, e.g. Start Running:

- advance when every run was completed and no next-morning pain over 3/10 was reported;
- otherwise repeat.

"Too hard" on any session means repeat. Each series document states its own rule; the engine implements the union of the conditions they use. A programme never advances on dates alone.

### 6.3 The gate, made programme-aware (opt-in, so pinned tests stay green)

`applyGateToSession` gains an optional fourth argument. `planner.test.ts:132-170` pins today's behaviour, including an exact no-op when the gate is OK, so the default stays identical.

1. **`avoidTags`.** Standing flags apply at session start, minus `impact` (§6.6).
   - Programme sessions pass `baselineAvoidTags(conditionFlags, { allowImpact: true })`, a new option on `symptomGate.ts:61-65`. A knee flag still removes deep squats on a pain-free day, but no longer removes running.
   - The user's no-impact choice adds `impact` back.
   - Today's gate and the next-morning monitor decide the rest.
   - The AI planner's `plannerLibrary` keeps today's behaviour, since it is not a monitored programme. Revisit if the owner wants one-off plans to match.
2. **`library`.** Equipment-aware swaps: programme sessions pass the library filtered to the programme's equipment plus bodyweight. A home session never becomes a leg press.
3. **`convertUnits`.** When the only safe swap changes reps to seconds or back, convert (default 3 s per rep, rounded to 5 s) instead of copying `repMin/repMax`. Same-unit substitutes are preferred first.

### 6.4 Progression: the programme decides

**The problem.** The set logger prefills from last session's actuals (`useSetLogger.ts:125-134`), and the progression engine adds +10 s to timed moves and +2 reps to bodyweight moves (`progression.ts:129-147`). For a programme that says "week 4 is 3 min runs", both would override the plan.

**The rule.** For entries with `program: true`:

- **Timed and bodyweight:** the planned value is the target. Prefill comes from the plan, and `evaluateProgression` returns `hold`.
- **Loaded:** load progression stays on, as today. Gym Strength and Home Dumbbells use double progression, which is what the engine already does; the programme sets the rep range for the week.
- **Bodyweight ladders:** advance by **changing the exercise id** at week close (`nextLadderStep`, new): every set at the top of the range with 1–2 reps in reserve moves to the next variation; pain or failed form drops back one.

Non-programme sessions are unchanged, and `progression.test.ts:8-92` stays as is.

### 6.5 Tiers, reflow, shorten and coach copy skip programme rows

| Code | Today | With an active programme |
|---|---|---|
| `applyTier` (`plan.ts:69-108`) | Deletes planned sessions above the tier, adds tier templates | Ignores `prog:` rows; the tier control is hidden while enrolled |
| `reflowWeek` (`planner.ts:176-219`) | Protects 3 strength sessions, drops others "until next week" | New `reflowProgramWeek`: shift later this week; if it can't fit, the programme week repeats. Never displaced by the 3-strength rule |
| `shortenedVersion` (`planner.ts:232-239`) | "Four compounds × 2 sets" | Not offered for programme sessions (`canShorten = false` in `nextAction`, `Today.tsx:108`). A programme may define its own short version later |
| `computeDailyPriority` (`coach.ts:142-290`) | Strength-minimum copy ("Only N of 3 minimum strength sessions") | Programme-aware branch: sessions this week from the programme; no strength-minimum lines |
| `sessionsTargetFor` (`facts.ts:188-192`) | Profile training days per tier | The programme's sessions per week |
| `estimateSessionMinutes` (`planner.ts:222-229`) | Uses `TIMED_IDS` only, so treadmill and jump-rope sets count as 45 s | Uses `exercise.timed` (as `aiPlan.planMinutes` does), plus the new shapes. Fixes an existing bug too |

### 6.6 History flags, knee-checked running, and the no-running choice (decided 2026-10-02)

The owner's rule: **allow running while next-morning pain stays at 3/10 or less, unless the user turns it off or says they don't want to.**

**Knee-checked running.** A standing knee or hip flag records a history. It keeps avoiding `deep_knee_flexion`, but no longer removes `impact`. Impact is controlled three ways:
1. **Today's gate.** The pre-workout check still runs. Knee or hip AMBER or RED today (pain 3/10 or more, swelling, a red flag) avoids `impact` for that session, so runs become walks or the bike, and jumps become the low-impact moves.
2. **The next-morning monitor.**
   - After every session with impact, a flagged user is asked a 0–10 score with where it hurts, on the first app open after 6 am.
   - If the flagged knee or hip scores **4/10 or more**, the next sessions use the walk or low-impact version until a next-morning score is back to **3/10 or less**. Then running resumes at the week the repeat rules set.
   - The series rules: Start Running R9, HIIT P13, Postpartum G3b.
   - The score is one tap on Today; it's the only new input. It is a safety path, so it is exempt from the "no new inputs" rule.
3. **The user's choice.** One app-wide setting, `train.noImpact` (boolean, off by default). There is no toggle on any screen. It is set three ways, and always shown so it can be undone:
   - "I'd rather not run" on a safety-check result;
   - the ask bar or the coach ("I don't want to run", "no jumping"), previewed and applied only on a tap;
   - the programme page's path card, "Walk-first (your choice) · Change".

   While it is on, every series uses its walk-first or low-impact path. "I want to try running" lifts it.

**Evidence, stated honestly.** In an RCT of 38 people with Achilles tendinopathy, continuing running and jumping under a pain-monitoring model did as well as stopping. That was a different tissue, and the trial allowed more pain than our 3/10 (Silbernagel 2007, `start-running.md` [21]). Recreational running was not linked to more knee or hip osteoarthritis than being sedentary (Alentorn-Geli 2017, [10]). Neither source tests runners with a past knee problem, so the 3/10 rule is a monitored trial and is labelled a coaching convention.

**Code:**
- `baselineAvoidTags(regions, { allowImpact })` gets a new option. The default is unchanged, so `symptomGate.test.ts:105-125` stays green.
- A pure `nextMorningGuard(scores, flags)` goes in `engine/programs.ts`.
- `train.noImpact` goes in settings.
- The ask-bar intents `avoid_impact` and `allow_impact` ride the existing navigate and preview pattern (§7).

## 7. Prompt to start

**Order in `decideRoute` (`router.ts:251-260`), first match wins:**

1. **Series matcher (new, deterministic).**
   - It keys on series words and intent phrases: "get into / back into / start" + running|jogging|5k|couch to 5k; postpartum|after (the|my) baby|after birth|c-section|postnatal; hiit|intervals|tabata; home + dumbbells|weights; gym|machines + programme; bodyweight|no equipment|hotel|travel.
   - It returns `{ via: 'program', to: '/train?program=<id>&ask=<text>' }`.
   - It runs **before** `localPlanRoute`, so "make me a HIIT programme" reaches HIIT, while "plan a 20 min mobility session" still reaches the planner (`router.test.ts:133-135` stays green).
2. `localPlanRoute`: one-off sessions, unchanged.
3. The rest, unchanged.

**The AI router gains `start_program`** in the `RouterIntent` union, the `ROUTER_SCHEMA` enum and `ROUTER_SYSTEM`. It carries `program: { id: enum of the six }`. Sending is app-side through `aiJson` (`gateway.ts:135`): **no coach Worker deploy**. `actionFromRouter` maps it to a `navigate` action, and an unknown id falls back to the coach.

**Also:**
- **"I don't want to run" / "no jumping" / "I want to try running again"** are matched deterministically (avoid_impact and allow_impact), before the series matcher. They show a preview ("Stop running and jumping in your plans? Runs become fast walks.") and set or clear `train.noImpact` only on Apply (§6.6).

- **VoiceSheet** re-parses dictation without `decideRoute` (`VoiceSheet.tsx` ~347-365). It calls the same matcher first.
- **`voice.ts:517`'s `start_workout` regex** must not match when a series word is present. "begin postpartum training" must stop opening today's gym session. `voice.test.ts:93-97` stays green.
- **Train reads `?program=`** the way it reads `?plan=1` (`Train.tsx:49-58`). It shows the coach card from §4.5. With AI on, the coach sentence comes from the generic JSON endpoint with the programme's intro and the user's flags. With AI off, it's a template ("Start Running fits. Because of your knee, it opens with brisk walking.").
- **Coach chat (optional, later):** when the matcher hits in `Coach.send`, the app adds a structured `start_program` decision, built app-side with the id from code, not from the model's free-text `PROPOSAL:` line (`Coach.tsx:531-545`). Accepting it opens the intro. **The coach Worker contract v1 is not touched:** no new response kind, no golden change (`coach/__tests__/turn.test.ts:21-26`). Adding series words to the training routing regex (`coach/agents.ts:63`) is a separate Worker deploy; merge it alone.

## 8. Guided session — how it works

1. **`src/features/workout/interval.ts` (pure).**
   - `scheduleFor(planned: PlannedExercise[])` returns phases `[{kind:'work'|'rest'|'station', sec, exerciseId, label, round}]`.
   - `positionAt(schedule, elapsedSec)` returns the current phase and time left.
   - It follows `breathing.ts` (`planSession` / `positionAt`) and is tested the same way.
2. **The player** is a Focus Mode state for timed, interval and circuit entries.
   - It anchors on a wall-clock start stored in `sessionStorage`, like the stopped flags (`helpers.ts:265-280`), so it survives the list toggle, a reload or the per-exercise remount (`Workout.tsx:380`).
   - It logs each work bout through `useSetLogger.log({ override: { durationSec } })` (`useSetLogger.ts:149`), so finish, stale wrap-up and history are unchanged.
   - Pause: tap. Leave: swipe down. Both exist in `Mobility.tsx:199-261` and `useBreathingSession.ts` to copy.
3. **`src/native/speak.ts` (new)** wraps `speechSynthesis`.
   - It is feature-detected and unlocked by the Start tap.
   - It queues at most one utterance and drops stale ones.
   - It is a separate module, so `speech.test.ts` stays as is.
   - Beeps: a Web Audio tone at 3-2-1, also unlocked by the tap.
   - Mute is one icon in the player, remembered in `localStorage`.
4. **What gets said.** At most one sentence per phase change.
   - From the series cues: start, each exercise, rest, last round, finish.
   - Never numbers the user didn't see, and never praise for pushing through pain.

### 8.1 The constraint that decides Start Running's design

On an installed iPhone PWA, **nothing runs while the screen is locked**: timers stop, the wake lock is dropped (`wakeLock.ts:31-33`) and speech stops. A runner with the phone in a pocket won't hear "walk now".

**Phase 0 spike (half a day, on the owner's phone):** does one long `<audio>` element keep playing with the screen locked in the installed PWA on the current iOS?

- **If yes:** at Start, render the whole session's cue track (pre-recorded words "run", "walk", "halfway", "3-2-1" plus silence, concatenated with Web Audio into one WAV blob) and play it as a single track. The on-screen player follows the same clock.
- **If no:** v1 keeps the screen awake. The intro and the first run say plainly: "Keep the screen on, or use the treadmill." The real fix is the Capacitor shell (STATE_OF_APP §6).

Either way, this is decided before Phase 4 starts.

## 9. Safety

### 9.1 Every series

- The safety check (§4.4) runs before enrolment. Its "wait" outcome blocks the start with the reason and who to see.
- The pre-workout symptom gate still runs before every session, programme or not (`gate.ts:89-109`). §6.3 adds standing flags, equipment and units to it.
- **Stop signs** from each series document's §4 show on the intro and behind the ⓘ in the player. When a stop sign's words show up in a prompt or chat message, the existing L1 screen (`chatSafety.ts:60-66`) answers first.
- Copy follows each document's "Claims we will not make" (§8) and the house rules: no cortisol, no toning, no spot reduction, no afterburn, no diagnosis.

### 9.2 Postpartum Return — extra rules

- **It is gated by stage, never by date alone** (the "Postpartum: stages unlocked by checks" artboard). Gates are boolean expressions over the enrolment, written out in the doc's YAML and evaluated by the engine:
  - **Stage 0, Reconnect** (weeks 1–6): breathing, pelvic floor, gentle core and hip work, easy walks. Open from birth.
  - **G1:** 6+ weeks; postnatal check done; not told to wait; no stop signs in 7 days; bleeding not up after activity; wound settled; a 20-minute walk symptom-free.
  - **Stage 1, Rebuild** (weeks 7–12): low-load strength twice a week and a walk building to 30 minutes.
  - **G2:** 12+ weeks; 8+ Stage 1 sessions; 14 days with no stop signs or pelvic floor symptoms (or a physio said go ahead); no ongoing non-period bleeding.
  - **Stage 2, Strengthen** (weeks 13–16).
  - **G3a / G3b:** a strength check, then a two-part *symptom check before running*, after Goom et al. 2019. With a knee or hip flag, both parts stay open under knee-checked running (§6.6). The user's no-running choice gives the low-impact finish instead.
- **The screen has 10 questions in three tiers:**
  - **Call emergency services now:** chest pain, fainting, breathlessness at rest, a swollen calf with breathlessness, sudden very heavy bleeding, stroke signs.
  - **Get advice today:** bleeding heavier, returning or with clots; a swollen calf; fever; wound changes; severe tummy pain; a headache with vision changes or swelling; a red, painful breast for more than a day; pain or burning when peeing.
  - **Notes and holds**, from the other questions.

  It is re-asked every 4 weeks, at each gate, and on **Something has changed**. Every question and outcome is in [postpartum.md](programs/postpartum.md) §4.
- **"Thoughts of harming yourself or your baby? Get help now"** is always visible on the intro, the screen and the stages page, and opens the existing Support sheet.
- **Mood:** low mood shows "talk to your doctor, midwife or postnatal clinic this week", and the programme continues. It never changes training by itself.
- **Emergency number as one constant.** `chatSafety.ts` and `SupportSheet.tsx` both hard-code 995 today. Postpartum copy uses `{emergency}`, so create one shared constant as part of this work.
- **L1 additions:** postpartum emergency phrases join `chatSafety.ts` PATTERNS under the existing `medical_emergency` kind, so the `SafetyKind` union doesn't change: stroke signs, vision changes with swelling, heavy bleeding or clots, seeing or hearing things others don't. Harm thoughts stay with `self_harm`. Rows are added to `chatSafety.test.ts`.
- **The coach reply check** (`coach/replyCheck.ts:14-20`) withholds replies containing "tear" or "condition". Postpartum explanations can trip it, so Phase 5 must test real postpartum questions against it.
- **Recommendation:** before Postpartum Return ships, a pelvic-health physiotherapist reads `docs/programs/postpartum.md`. The research is checked against sources; it is not clinically reviewed.

## 10. What's removed or moved

| Today | After |
|---|---|
| Train root: Plan with AI button | Ask bar (same planner behind it) |
| Train root: Routines carousel | "Start now" row + All workouts page (§4.9) |
| Train root: This week list | Pills inside the programme card |
| Train root: Mobility and Library links | All workouts page |
| `/progress` behind Today's chart icon | Summary tab ([PRD_SUMMARY_TAB.md](PRD_SUMMARY_TAB.md)) |
| Week view tier control (Minimum / Target / Stretch) | Hidden while a programme is active; kept for users without one (Q2) |
| `?plan=1` deep link | Unchanged (pinned by `router.test.ts:86-134`) |

## 11. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P0 Spike** | iOS locked-screen audio (§8.1); `speechSynthesis` voices in the installed PWA | Written result in this doc |
| **P1 Data + engine** | `programs.ts` for 6 series; `engine/programs.ts` (materialise, advance, ladder, reflow); gate opt-ins (§6.3); progression bypass (§6.4); tier, shorten and coach exemptions (§6.5); timed-estimate fix; library additions; `seedReference` top-up | `npm run typecheck && npm test`; existing pinned tests unchanged |
| **P2 Train UI** | Root A, gallery, `/train/program/:id` intro, safety-check sheet, Composer on Train, week view without tiers when enrolled | Light + dark screenshots at 375 px; density ≤ 110 words |
| **P3 Prompt to start** | Series matcher in `decideRoute` + VoiceSheet; `start_program` AI intent; `voice.ts` regex fix; Train `?program=` card | Probe phrases in §1.6 route correctly; `router.test.ts` updated deliberately |
| **P4 Guided session** | `interval.ts`, player state in Focus Mode, circuits, `speak.ts` + beeps, cue line, "How did it feel?" | A full run/walk session with no taps in the browser; Focus Mode strength path unchanged |
| **P5 Coach awareness** | Optional `CoachFacts.program` (mind pattern, goldens unchanged); programme-aware priority copy; postpartum L1 rows; Worker regex (separate deploy, merged alone) | Goldens byte-identical; reply check tested on postpartum questions |
| **P6 Visual QA** | Both themes, every new surface, against DESIGN §8 | Screenshots |

Merge PRs one at a time (Workers Builds deploys out of order; see the deploy notes).

## 12. Acceptance criteria

- **AC1** With no programme, Train shows the question, the ask bar, the Start now row and six covers. Each cover is drawn from its programme's data.
- **AC1b** A Start now workout shows its why lines and sources before it can start. If its series' safety check isn't answered and current, the check comes first. After that, it opens on the symptom gate in one tap from its preview. Finishing it changes no programme week.
- **AC2** "I just had a baby and want to get back to exercise" opens the Postpartum Return card. "begin postpartum training" does not open today's session. "I want to get into running" opens Start Running. "plan a 20 min mobility session" still opens the planner.
- **AC3** An intro shows exactly 3 "why" lines, each with a source number that resolves to a listed source with a working link.
- **AC4** A "yes" to a `wait` question blocks enrolment and names who to see. A knee flag pre-selects knee-checked running and says how it works. "I'd rather not run" on the result switches to walk-first and sets `train.noImpact`.
- **AC5** Enrolling writes this week's sessions as `prog:` rows. Today's tile, the voice command "start today's workout" and the coach's "today" fact all show the programme session.
- **AC6** On a pain-free day with no next-morning score above 3, a knee-flag user runs. After a next-morning knee score of 4/10, the next session is the walk version, and running returns after a score of 3/10 or less. With `train.noImpact` on, no series schedules running or jumping.
- **AC7** A home or bodyweight programme session is never swapped to a machine. A reps↔seconds swap converts units.
- **AC8** A run/walk session plays start to finish without a tap. 6 rounds write 6 timed sets. The finish screen shows minutes and minutes running.
- **AC9** "Too hard" on any session repeats the week. A full pain-free week advances. Neither happens before the week closes.
- **AC10** `applyTier`, `reflowWeek` and the 8 PM shorten never delete, displace or shrink a programme session.
- **AC11** A fresh install and Delete-all still leave every table but `exercises` and `settings` empty. A second boot adds no rows. An old database gains the new exercise ids on boot.
- **AC12** `npm run typecheck && npm test` passes. The coach goldens are unchanged.

## 13. Risks

1. **iOS locked screen** (§8.1). It decides whether Start Running works outdoors in v1.
2. **Two sources of truth for a target.** Prefill and auto-progression versus the programme week (§6.4). The bypass is per entry, so a missed flag silently reverts to the old behaviour. The data test asserts every programme entry carries `program: true`.
3. **Tier code touching programme rows** (`applyTier`, `reflowWeek`). One tap on the tier control would delete planned programme sessions today. Hide the control and skip `prog:` rows in both.
4. **Old installs lack exercises.** The `seedReference` fix must land in P1, before any programme references a new id.
5. **Postpartum liability.** Checked research is not clinical sign-off (§9.2).
6. **The Focus panel redesign in flight** (`PRD_PHONE_AND_FOCUS_PANEL.md` §3) edits the same dark panel. Build P4 after it, or fold the two.
7. **Density creep.** The gallery and intro are new surfaces. The Train root itself loses two blocks.

## 14. Open questions (owner)

- ~~Q1 Train root A or B~~ **Decided 2026-10-01: A, programme first.**
- ~~Q0 History flag versus running~~ **Decided 2026-10-02:** allow running while next-morning pain stays at 3/10 or less, unless the user turns it off or says they don't want to run (§6.6).
- **Q2** Retire the tier planner UI for everyone once programmes ship, or keep it for users with no programme? Assumed: keep it, hidden while enrolled.
- **Q3** Spoken cues on by default? Assumed: on, one mute icon.
- **Q4** Have a pelvic-health physiotherapist review Postpartum Return before release? Recommended.
- **Q5** Session days: the default spread (start day, +2, +4) with no question asked? Assumed: yes. Moving a session stays one tap on the week view.
- **Q6** Postpartum routing words. Emergency copy follows the app (995, mindline 1771, SOS 1767), but most sources are UK. The doc now names roles ("your doctor, midwife or postnatal clinic"). Name local services instead (e.g. polyclinic, your O&G)? Assumed: keep the roles.
- **Q7** The "had a baby in the last 12 months" cut-off that routes users to Postpartum Return is a coaching convention. Is 12 months right for your users? Assumed: yes.
