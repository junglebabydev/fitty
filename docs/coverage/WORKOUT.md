# Coverage — Training

**Verdict (after the barbell/kettlebell and calisthenics/conditioning passes): 170 exercises. Condo gym ~90%, commercial gym ~90%, bodyweight-only ~85%, travel/band ~80%. Class-style HIIT now has the *movements* (~75%) but not the session shape — `planner.ts` still only knows sets × reps.**

## What ships today

**170 exercises** in `src/data/exercises.ts`, each with `pattern`, `equipment`, `primaryMuscles`, `safetyTags`, ordered `substitutions`, written instructions and at least one voice alias. Built in three passes: 84 for a condo gym, 27 barbell/kettlebell for commercial gyms, and 59 covering calisthenics, single-leg, carries, anti-rotation, bands, intervals and the remaining machines. Every substitution chain leads to something *at least as safe*, asserted in `src/data/__tests__/data.test.ts`.

**By equipment**

| Equipment | Count |
|---|---|
| Bodyweight | 44 |
| Dumbbell | 32 |
| Machine | 29 |
| Barbell | 20 |
| Cable | 15 |
| Kettlebell | 10 |
| Band | 10 |
| Treadmill | 3 |
| Pool | 3 |
| Bike | 3 |
| Elliptical | 1 |

30 entries are `timed: true` (holds, carries, intervals, cardio), which is what lets the planner fill a short session with work that is not sets × reps.

**By pattern** (mapped onto the 8 + the two the taxonomy misses)

| Pattern | Count | Enough? |
|---|---|---|
| Squat | 10 | Yes |
| Hinge | 14 | Yes |
| Lunge / single-leg | 13 | Yes — was the thinnest axis at 3 |
| Vertical push | 13 | Yes |
| Horizontal push | 14 | Yes |
| Vertical pull | 8 | Yes — full pull-up, chin-up, negatives, band-assisted |
| Horizontal pull | 11 | Yes |
| Cardio / conditioning | 15 + 3 swim | Yes — rower, ski erg, assault bike, ropes, sled, rope, burpee |
| Carry | 6 | Yes — the taxonomy's missing 9th pattern |
| Core (anti-ext 5, anti-rot 6, flexion 6, lateral 2) | 19 | Yes |
| Isolation (arms, delts, calves, hips) | 26 | Yes |

**Media:** 77 of the 170 have a photo from free-exercise-db (public domain); the rest fall back to the MuscleMap tile, which is the documented, graceful miss — no broken images. Adding photos for the newer entries means verifying each id against the dataset first (see the header comment in `src/data/exerciseMedia.ts`).

Supporting mechanics that already work and should not be rebuilt: safety tags → `src/engine/symptomGate.ts` (knee / back / neck × amber / red), safest-first substitution chains (every id asserted to exist in `__tests__/data.test.ts`), `TIMED_IDS` / `COMPOUND_IDS`, progressive overload in `src/engine/progression.ts`, tiered week layout in `src/engine/planner.ts`.

## Delta to 80–90% of the intended user base

Three named, countable additions. Sizes are exercise-entry counts, not effort estimates.

1. ~~Barbell set~~ — **done.** 19 entries: back and front squat, walking lunge, deadlift, trap-bar deadlift, RDL, good morning, hip thrust, bench, incline bench, floor press, overhead press, push press, landmine press, close-grip bench, bent-over row, Pendlay row, landmine row, curl. Plus 8 kettlebell: swing, goblet squat, clean, press, snatch, Turkish get-up, halo, front-rack carry. All tagged, aliased for voice, and chained to safer machine/dumbbell substitutions.
2. ~~Calisthenics set~~ — **done.** Pull-up, chin-up, negatives, band-assisted, dips (bench, parallel, assisted machine), pike/decline/diamond/archer push-ups, wall handstand, bodyweight and split squats, Bulgarian, pistol-to-box, shrimp, Nordic negative, single-leg RDL, wall sit, hanging knee and leg raises, ab wheel, Copenhagen plank, tuck L-sit. Pull-up and chin-up progressions (negatives, band-assisted, full), dip progressions, pike push-up → handstand push-up, archer and diamond push-ups, Nordic curl progression, pistol-squat progression, hollow/arch holds, L-sit, ring or bar rows, glute-ham raise, shrimp squat. Equipment class `bodyweight` already exists; this is content, not schema.
3. **Conditioning movements — done; the session shape is still open.** Added burpee, thruster, wall ball, box step-over, jump rope, mountain climber, battle rope, sled push, rower, ski erg, assault bike. **Still missing: BFT/Hyrox/CrossFit sessions are rounds-and-intervals, and `PLAN_SCHEMA` / `planMinutes` only express sets × reps.** Until that changes, a thruster gets programmed as 3 × 10, which is not wrong but is not a class session either. Burpee, thruster, kettlebell swing, wall ball, box step-over, ski-erg, rower, assault bike, battle rope, sled push, sled drag, jump rope, mountain climber, devil's press. This one is **not just data**: BFT/Hyrox/CrossFit-style sessions are rounds-and-intervals, and `planner.ts` only knows sets × reps. New `SessionTemplate` shape required.

The kettlebell entries above already cover most of what a class-style session needs for loading; what is missing is the *session shape*, not the movements.

## The equipment question item 4 raises

**Fixed since this document was first written:** `plannerLibrary()` in `src/features/ai/planner.ts` filtered the model's allowed list through a hard-coded `PROFILE_AVOID = ['deep_knee_flexion', 'impact']` — the reference persona's constraints, applied to every user. It now derives the avoid-list from the user's own `condition_flags` via `baselineAvoidTags()`. A user with no flags gets all 170 exercises; the demo persona (knee + lower-back flags) gets 131. That invariant is now tested in `src/engine/__tests__/symptomGate.test.ts`.

**Open question this raises:** a baseline flag means "has a history of", but it currently maps to the gate's AMBER tag set, which means "is symptomatic today". That is why one old knee flag permanently removes 39 exercises. A narrower baseline set is defensible; this is a product call, not a bug.

The planner still reads no equipment constraint at all — it hands out `SESSION_TEMPLATES` by tier. Three programming modes × an equipment answer means the planner needs, minimally:

- a `mode` on the plan (`split` / `hiit` / `calisthenics`),
- an equipment set on the profile (the onboarding already collects a gym description as free text — it is not structured),
- template selection filtered by both.

That filter is straightforward. What isn't: HIIT/class sessions are a different session *shape*, and calisthenics progression is by **movement regression/progression**, not by load — `progression.ts` adds weight, which is meaningless for a push-up. Both are real work, not config.

## What the open-source systems do that we do not

Bounded look at how other open systems represent a session, to inform the class-style gap rather than to copy anything.

1. **[wger](https://github.com/wger-project/wger) types the day, we do not.** Its day types are `custom, emom, amrap, hiit, tabata, edt, rft`. Ours is implicitly always `custom` — `PLAN_SCHEMA` has `focus` but no session *shape*. That enum is the shortest path to BFT/Hyrox/CrossFit sessions.
2. **wger's Slot / SlotEntry gives supersets for free.** Several entries in one slot are interleaved and displayed as a superset. Our plan is a flat `exercises[]`, so a circuit cannot be expressed at all — it can only be listed as consecutive exercises.
3. **wger encodes progression declaratively**, as config records applied at an iteration with replace/adjust and absolute/percent steps, plus a `requirements` field that gates advancement on hitting the previous iteration. Our `src/engine/progression.ts` decides per session at runtime. Theirs is inspectable ahead of time; ours adapts. Not obviously worse — but ours cannot show the user next month's plan.
4. **`need_logs_to_advance`**: wger stalls progression until a session is actually logged. We have no equivalent, so a skipped week still advances the target load.
5. **[RepJot](https://github.com/Pettibyte/RepJot) scores AMRAP as `rounds_and_reps` and EMOM as cycles + intervals.** The lesson is that a class session's *result* is a different shape from sets × reps — so adding burpees and thrusters to the library is not enough; `exercise_sets` has nowhere to record "7 rounds + 12 reps".

**Conclusion for us:** the session-shape gap is three changes, not one — a `shape` field on the plan, a grouping concept for circuits, and a result shape for rounds/time. None of them are blocked on the exercise library, which is now sufficient.

## Where the line sits: library vs. model

This matters more than it looks, because the $9 tier runs a cheaper open-weights model and **anything the shipped library covers is a thing the model cannot get wrong.**

| Deterministic, always (no AI) | AI-generated |
|---|---|
| Exercise entries, instructions, safety tags | Plain-language "why this session today" |
| Substitution chains | Ranking substitutes against a free-text complaint |
| Symptom gate and red-flag blocking | Interpreting how the user describes a symptom |
| Set/rep/load progression | Explaining a stall and proposing a deload |
| Week layout, reflow, tier selection | Rewriting the week from a conversational request |
| Session length estimation, shortening | — |

**Rule for both tiers: the model may never be the only thing standing between a user and an unsafe recommendation.** That is already true (`symptomGate.ts` runs after any AI plan) and must stay true when a weaker model is in the seat.
