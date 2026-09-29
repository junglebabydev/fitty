# Coverage — Wellness (Mind) and the movement side of it

**Verdict: the *mental* side is ~80% covered and genuinely good. The *physical* side of wellness — yoga, stretching, mobility — is ~60% covered and lives correctly under Train, not Mind. Two things are absent entirely: guided audio, and routines/habits.**

Per the user's own placement: yoga / stretching / mobility stay under **exercises**; Mind carries mental well-being. This document follows that split.

## What ships today — Mind

`src/engine/mind.ts` (331 lines, pure, no db/React imports), `src/features/mind/*`, three routes.

| Feature | Content | Status |
|---|---|---|
| Mood check-in | 7-stop valence scale (−3…+3) with words, band labels, context chips auto-suggested from app facts (`suggestContexts`) | Built |
| Breathing | **4 techniques** — box 4-4-4-4, 4-7-8 (capped), physiological sigh, coherent 5.5 — phase-table driven, with `suggestTechnique` picking one from stress / valence / hour / last night's sleep | Built |
| Journal | **14 prompts** across gratitude / win / reflection / reframe, rotating by date (`promptForDate`); device-only, excluded from every AI payload | Built |
| Insights | Correlation cards gated at ≥5 days each side, ≥0.25 effect, 90-day window, "other factors can influence this" caveat | Built |
| Support | Hard-coded offline crisis sheet, ≤2 taps, SG numbers, non-clinical language throughout | Built |
| Guided meditation (audio) | — | **Not built** |
| Routines / habits | — | **Not built — no table, no engine, no UI** |

The design constraints here are deliberate and worth keeping: nothing diagnoses, nothing scores a questionnaire, no streaks, no confetti on a low mood, and the journal never leaves the device.

## What ships today — movement wellness (under Train)

`src/data/mobility.ts` — **11 routines**, each with named movements, durations/reps, a cue per movement and a safety note.

| Axis | Coverage |
|---|---|
| Regions | hips 7, back 6, shoulders 6, general 5, hamstrings 3, neck 3 |
| Contexts | anytime 6, recovery 6, post 4, pre_lower 3, pre_upper 3 |
| Routines | Hip Opener, Hamstring Release, Shoulder Prep, Upper Back Unlock, Neck Reset, Lower-Body Warm-Up, Upper-Body Warm-Up, Post-Session Cool-Down, Lower-Back Relief, Desk Break, Pool Recovery |

Every movement is non-provocative for the regions the symptom gate watches: no loaded deep knee flexion, no end-range neck loading, no loaded spinal flexion, no ballistic stretching.

**What's missing is yoga as a form.** The 11 routines are physio-flavoured mobility — correct, safe, and not what someone means by "a 10-minute yoga flow." There is no flow structure (sequence with breath pacing), no named practice, and nothing longer than a warm-up.

## Delta to 80–90%

1. **Yoga / stretch flows — ~8 routines.** Morning flow, wind-down flow, post-run lower body, desk-recovery upper body, hip-focused, gentle back, 5-minute reset, 15-minute full body. These need one schema addition the mobility shape lacks: **breath pacing per movement** (inhale/exhale cue, or a hold measured in breaths rather than seconds). Small change to `MobilityMovement`.
2. **Guided audio — the only genuinely new capability.** Two routes, and they price very differently:
   - **A — TTS at runtime.** Script stays as data, voiced on device (iOS `AVSpeechSynthesizer` under Capacitor) or by a provider. No asset pipeline, no download size, robotic.
   - **B — pre-recorded audio.** Warm, on-brand, works offline; but it is recording work, a CDN or a bundle-size problem, and it does not scale to AI-generated sessions.
   Recommendation: **A**, because it keeps meditation as *data* — which means the coach can generate a session and it can still be spoken. B is a polish decision for the paid tier later.
3. **Routines / habits — the new module (item 8).** Smallest honest version:
   - a `routines` table (name, target time, days, active) and `routine_logs` (date, routine id, done),
   - the coach proposes a routine through the **existing** `coach_decisions` Accept/Reject machinery — no new approval UI,
   - a Today tile showing today's routine items,
   - notifications via `src/native/notifications.ts` (web-limited until the Capacitor shell exists).

   Deliberately excluded: streaks. The Mind pillar rejects them on purpose (`docs/research/PATTERNS.md`, "weekly averages rather than streaks") and a habits module is exactly where they would sneak back in.
4. **Open health chat (item 6's fourth module) already exists** — `/reports` with upload, marker extraction, range bars, a consent sheet before anything is sent, and report context available to the coach. This is not new work.

## Where the line sits: library vs. model

| Deterministic, always (no AI) | AI-generated |
|---|---|
| Breathing phase tables and cycle caps | Picking a technique from a conversational description |
| Journal prompt rotation | A prompt tailored to what the user just wrote |
| Insight gating (n ≥ 5, effect ≥ 0.25, caveat) | Wording the observation |
| The crisis Support sheet — hard-coded, offline | **Never** |
| Mobility / yoga routine content | Generating a novel flow on request |
| Routine scheduling, logging, adherence | Proposing a routine and explaining why |

**Non-negotiable across both tiers:** the Support sheet, the non-clinical language rule, and the journal's exclusion from AI payloads are deterministic and must not become model-dependent. A cheaper model on the $9 tier raises the risk of clinical-sounding output — the guard belongs in the prompt *and* in what the model is allowed to influence, which is why the insight gate is code, not instruction.
