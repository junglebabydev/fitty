# Training programmes — research index (Oct 2026)

Six preset series for the Train tab. Each document holds:
- a verdict and a graded claim table;
- the full programme as YAML;
- a pre-start safety screen, stop signs and paths for knee, hip, back and neck flags;
- the in-app intro copy, coach cues and library gaps;
- the claims we will not make, and numbered sources.

How the app uses them: [PRD_TRAINING_PROGRAMS.md](../PRD_TRAINING_PROGRAMS.md). Programmes are deterministic data. The AI only matches a prompt to one and explains it.

| Series | Weeks | Per week | Minutes | Needs | Session shapes | Paths | Start-now workouts | Sources |
|---|---|---|---|---|---|---|---|---|
| [Gym Strength](gym-strength.md) | 12 | 3 (4-day option from week 7) | 45–55 | Gym: leg press, cables, dumbbells, bench | sets, steady | low-impact, back, no-overhead, plus RED-day swaps | Full Body A (54 min), Full Body B (53) | 26 |
| [Home Dumbbells](home-dumbbells.md) | 10 | 3 | 30–40 | One pair of adjustable dumbbells | sets | low-impact, back, no-overhead | Dumbbell full body A (35) | 18 |
| [HIIT](hiit.md) | 8 | 3 (2-a-week option) | 20–33 | A bike, rower, air bike, elliptical or ski erg; floor space | intervals, circuit, steady | standard (knee-checked with a flag) and low-impact tracks; no-overhead | Bike intervals 8 × 30/60 (20), 4 × 4 on a machine (33), Low-impact circuit (23) | 28 |
| [Postpartum Return](postpartum.md) | 16 from birth, staged | 2–3 | 10–33 | Mat, chair, wall; band from week 7; light dumbbells from week 13 | sets, steady, intervals, circuit | Flag swaps; stages unlocked by gates G1, G2, G3a, G3b | None, on purpose: one-off sessions would skip the stage gates | 38 |
| [Start Running](start-running.md) | 9 | 3 | 26–40 | Shoes; a route or a treadmill | intervals, steady | knee-checked running (knee or hip flag), walk-first (by choice), bike-first (pain on walking) | First run/walk (30) | 20 |
| [Bodyweight Anywhere](bodyweight.md) | 8 | 3 | 20–30 | Floor, chair, heavy table or a door and towel | sets, circuit | squat knee path; progression by ladder | Bodyweight circuit (20) | 14 |

## How the research was checked

1. **Draft.** One research agent per series opened every source it cited and graded each claim: guideline, meta-analysis, RCT, cohort, consensus, or coaching convention. Conventions are labelled as conventions.
2. **Citation check.** A second, independent agent per series re-opened every cited work: 138 at that point. None were fabricated, and none had to be removed. For 80 of them, the claim was reworded to say exactly what the source says. The later fixes added 6 more sources (144 now), each opened by the agent that added it. Every link in the six Sources lists is covered by step 5. Examples of rewording:
   - Kassiano 2024 tested leg exercises in 70 young women, not "exercise variety" in general.
   - A frequency claim that a 2019 update had overturned was demoted.
   - A "minimum effective dose" figure that neither source gave was taken out.
3. **Postpartum safety review.** Two more skeptics checked every timeline and red flag against the primary sources (NICE NG194, Goom et al. 2019, CSEP GAQ-PP, NHS pages). They found 14 issues, 3 of them high: no running before about 3 months in any route, missing bleeding red flags, and the mood question timing. All were fixed after re-opening the sources.
4. **Cross-series critique.** One reviewer read all six documents together and found 41 issues (15 high). Fix agents applied them:
   - missing hip paths;
   - pregnancy and postpartum routing loops between series;
   - duplicate exercise ids in sessions;
   - intro bullets over the word limit;
   - missing start-now picks.
5. **Final scripted check (2026-10-01).**
   - All 112 PubMed links (95 unique papers) match PubMed's own record for title, first author and year.
   - 26 of the 29 other links return 200.
   - The other 3 block scripts but were confirmed another way: two DOIs through Crossref, and the CDC page by fetch.

One source is a retracted paper on purpose. HIIT cites the retraction of Viana et al. 2019 (BJSM, retracted 15 Dec 2020) as the reason the app won't claim "HIIT burns 28.5% more fat".

## Rules shared by every series (from the critique)

- **Pregnant now** is its own question in every screen. The answer is `wait` ("please talk to your midwife or doctor about exercise in pregnancy"). No series is a pregnancy series.
- **Had a baby in the last 12 months, and Postpartum Return not finished** gives `suggest:postpartum`. Graduates of Postpartum (stage 2 done, or the running symptom check passed) are not sent back.
- **Knee-checked running (owner decision, 2026-10-02).** A knee or hip flag is a history, not today's symptom. It still avoids `deep_knee_flexion`, but no longer removes running or jumping. Those continue while next-morning pain in that knee or hip stays at 3/10 or less. A score of 4 or more moves the next sessions to the walk or low-impact version until it is back to 3. A sore knee or hip on the day's gate still swaps impact out for that session. A user who says they don't want to run or jump (`train.noImpact`) gets the walk-first or low-impact path in every series until they change it. Rules: Start Running R9, HIIT P13, Postpartum G3b and its knee and hip flags. Evidence: indirect, from a pain-monitoring RCT (`start-running.md` [21]); the 3/10 ceiling is a convention.
- **Hip flags take the same path as knee flags** for deep squats (`low-impact`), because the gate gives hip the same AMBER set (`impact`, `deep_knee_flexion`). Hip RED adds `axial_load`, not `knee_load`. Path ids to use when transcribing:
  - `low-impact` (knee, hip);
  - `back`;
  - `no-overhead` (neck, shoulder).

  Gym uses `back-friendly` and HIIT uses `low_impact` today; normalise these.
- **Warm-up, cool-down and rest blocks** carry `role: warmup | cooldown | rest`. They are not logged and are exempt from the "no id twice in a session" test.
- **"Too hard"** on the finish screen repeats the week in every series. Each series keeps its own gap thresholds for a long break (they differ, and all are conventions), so the engine reads them from the programme.

## Transcription notes: schema drift to normalise in `programs.ts`

The six docs were written in parallel, so their YAML differs in small ways. Normalise these to the PRD §5.1 types when transcribing:

| Drift | Where | Normalise to |
|---|---|---|
| Repeated weeks | Gym: `sameAs` plus a `schedule` block. Home: `weekRepeats`. Bodyweight: `repeats: copyOf`. HIIT, Running and Postpartum: every session written out | `repeats: [{ week, copyOf }]` |
| One side at a time | Bodyweight: a top-level `unilateral` list. The others: `perSide: true` on the block | `perSide: true` |
| Path ids | Gym: `back-friendly`. HIIT: track `low_impact` | `back`, `low-impact` |
| `shape` | On the session in every doc | On each block (PRD `Block`) |
| Warm-up and rest roles | Running, HIIT, Home and Bodyweight use `role`. Gym's warm-up bike block has none, and Gym uses `role: main / accessory` for something else | `role: warmup / cooldown / rest`; rename Gym's to `tier: main / accessory` |
| Setup question in the screen | Start Running Q6 ("run 10 minutes in the last 30 days?") | Ask it after the screen. Start Running then has 7 questions |
| Screen length | Home 6, HIIT 6, Gym 7, Bodyweight 7, Start Running 7 after the move, Postpartum 10 | PRD §4.4: up to 7, including the two shared questions; Postpartum up to 10 |

## New exercise ids (canonical, after merging duplicates)

**Walking and running:** `brisk_walk` (also replaces `pram_walk`), `easy_run` `[impact, knee_load]`.

**Postpartum floor work:**
- `breathing_360` (new pattern `breathing`);
- `pelvic_floor_hold`, `pelvic_floor_quick` (new pattern `pelvic_floor`);
- `pelvic_tilt`, `heel_slide`, `knee_fallout`, `clamshell`, `wall_push_up`.

**Legs and balance:**
- `sit_to_stand_chair` (also replaces `chair_squat`);
- `single_leg_sit_to_stand` `[knee_load]`, `single_leg_calf_raise`;
- `single_leg_balance` (new pattern `balance`), `single_leg_squat_partial` `[knee_load]`, `step_up_bw` `[knee_load]`.

**Impact check:** `jog_on_spot`, `forward_bound`, `single_leg_hop` (all `[impact, knee_load]`), and `running_man`.

**HIIT:**
- `march_in_place`, `step_jack`, `shadow_boxing` (no tags);
- `jumping_jack` `[impact, knee_load, overhead]`;
- `high_knees` `[impact, knee_load]`.

**Bodyweight upper:** `table_inverted_row`, `towel_door_row`, `prone_y_t_raise` (pattern `rear_delt`, not a row).

**Loaded or unloaded hinge:** `db_single_leg_rdl` `[spinal_load]`, `db_single_leg_hip_thrust` `[spinal_load]`, `single_leg_hip_thrust`, `dowel_hip_hinge`.

**Fixes to existing entries:**
- `ski_erg` gains `overhead`.
- `bulgarian_split_squat` allows bodyweight or dumbbell.
- `wall_sit` states "thighs above parallel".
- `db_shoulder_press`'s substitution chain should reach `incline_db_press` before a raise.

All of these need `seedReference` to top up existing installs (PRD §5.4).

## Known limits

- **Postpartum's running readiness rests on expert opinion.** Goom, Donnelly & Brockwell 2019 is level 4 and written for clinicians. The patient self-check (POGP 2024) is not validated. The doc labels both. **A pelvic-health physiotherapist should read [postpartum.md](postpartum.md) before it ships.**
- **Locale is mixed.** Emergency copy follows the app (995, mindline 1771, SOS 1767). Most sources are UK (NHS, NICE), so some routing roles are UK-shaped: health visitor, GP referral to a physio. The doc now names roles ("your doctor, midwife or postnatal clinic"). The local wording is the owner's call.
- **Most design numbers are coaching conventions.** That covers rep ranges, rest times, ladder order and week counts, and each doc labels them. The evidence supports the shape of each programme, not every number.
- **Source dates.** [31] in Postpartum (an NHS page) is past its own review date. Thomas 2017 (Bodyweight) was checked from its abstract only.
