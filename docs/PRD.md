# Personal Fitness Coach — PRD V0.1


Personal Fitness Coach
Product Requirements Document • V0.1 • Fable 5 Handoff
Local-first iPhone app for training, nutrition, sleep, mobility, recovery and proactive AI coaching
1. Executive Summary
Build a personal, proactive fitness coach for iPhone that unifies strength training, HIIT/cardio, nutrition, sleep, body-composition progress, mobility and recovery. The application should minimize manual entry using voice and camera input, store canonical personal data locally, integrate with Apple Health/Apple Watch, and use AI for interpretation and coaching while deterministic rules own calculations and safety gates.
Primary outcome (reference persona, §2): help the user reduce body weight from 84 kg toward roughly 70–75 kg while preserving or increasing strength and progressing toward visible abdominal definition over an aggressive but sustainable 3–6 month horizon.
V0.1 should optimize for an excellent single-user experience rather than multi-user SaaS infrastructure.
2. Reference Persona (fictional)
The persona below is a fictional design reference ("Alex Tan") used for seed data, examples and defaults. No real person's health data belongs in this document or the repository.
Dimension
Requirement
Profile
Male, mid-30s; approximately 5'10"–5'11"; current weight 84 kg; waist approximately 32–34 inches.
Primary goal
Visible abs; target weight approximately 70–75 kg; improve or preserve strength.
Secondary goals
Better conditioning, mobility, sleep quality, recovery and long-term fitness.
Training availability
3–5 sessions/week; beginner/intermediate; familiar with common gym exercises.
Preferences
Weights, HIIT, some running, swimming.
Equipment
Condo gym: dumbbells, machines, bench, cables, lat pulldown, pool; no rower. Exact inventory to be calibrated later using gym photos.
Mobility priorities
Hips, hamstrings, shoulders, back and general mobility.
Known physical constraints
Past left-knee soreness; occasional lower-back tightness.
Nutrition pattern
Usually skips breakfast; 1–2 meals/day.
Devices
iPhone, Apple Watch, Mac.
Privacy
Canonical data and progress photos stored locally. Selected meal photos/audio may be sent to AI services for recognition.
Coach style
Demanding, proactive and direct, but conservative around pain, injury and recovery.
3. Product Principles
Local first. The iPhone database is the canonical personal record. Cloud AI is an optional processor, not the system of record.
One coach, multiple domains. Training, nutrition, sleep, mobility and recovery should feel like one intelligence.
AI interprets and proposes; deterministic systems calculate and enforce safety. Calorie math, progression logic, readiness thresholds and red-flag rules must be auditable.
Fast logging wins. Photo, voice, barcode/search and one-tap reuse must be faster than manual forms.
Adapt to 3–5 days. Missing a planned day should reflow the week rather than break the program.
Demanding on adherence, conservative on symptoms. The coach can challenge skipped workouts but never pressure the user to train through joint, spine or neck pain.
Trends over snapshots. Weight, sleep, calories and recovery should use rolling trends rather than overreacting to one day.
4. Goals and Non-Goals
Product Goals
Make routine logging of food, weight and sleep take under 60 seconds/day outside the workout itself.
Generate a safe progressive 3–5 day weekly training plan that adapts to adherence, equipment, sleep and symptoms.
Create an adaptive calorie/protein plan and course-correct using actual weight and waist trends.
Use Apple Watch/Health data to minimize manual recovery tracking.
Provide one proactive daily coach priority and a weekly review.
Make all external AI data sharing explicit and limited.
Non-Goals for V0.1
Medical diagnosis, physiotherapy replacement, rehabilitation prescription or video-based form diagnosis.
Social feed, public profiles, trainer marketplace, challenges or leaderboards.
Complex recipe marketplace, grocery delivery or supplement marketplace.
Android support.
Dedicated Apple Watch app; use HealthKit and WorkoutKit first.
Commercial billing, teams, multi-tenant administration or public SaaS.
5. Information Architecture
Primary area
Purpose
Core content
Today
Command center
Readiness, coach priority, workout, calories/protein, sleep and weight trend.
Train
Programming and logging
Weekly plan, guided workout, exercise history, cardio/swim and mobility.
Eat
Nutrition
Meal diary, camera/voice logging, food search, recent/saved meals and macro targets.
Progress
Body + performance
Weight, waist, photos, strength, adherence and trajectory.
Coach
Conversation + decisions
Daily briefing, Q&A, plan-change proposals and decision history.
Settings
Profile/privacy/integrations
Goals, condition flags, HealthKit, AI providers, export/delete.
6. North-Star Daily Experience
The Today screen should answer five questions immediately: What should I train? How much should I eat? How did I sleep? Is recovery good enough for the planned intensity? What is the single most important action to take next?
Card
Example state
Readiness
AMBER — 6h 10m sleep + mild knee soreness
Coach
Do the upper-body session today. Keep conditioning low impact. Get a high-protein lunch.
Workout
Upper Body Strength • 42 min • 6 exercises
Nutrition
0 / 2,050 kcal • 0 / 150 g protein
Sleep
6h 10m • below 7-day average
Body
84.0 kg • 7-day average 84.2 kg • target ~74 kg
7. Core User Journeys
7.1 Morning / First Open
Read Apple Health sleep/activity data and latest body-mass data if permitted.
Ask for weight only when no current value exists; support voice entry.
Run transparent Green / Amber / Red readiness logic.
Display today's workout and nutrition targets.
Coach gives exactly one prioritized action with the evidence behind it.
7.2 Workout
Tap Start Workout from Today or Train.
Run symptom gate: knees, back and neck. Capture quick pain score plus red-flag symptoms.
Load today's exercises with last-session performance and current targets.
Log reps/load/RIR/RPE or time. Voice logging is available on every exercise.
Every exercise includes Substitute and Pain/Issue actions.
Finish session; collect session RPE and symptom changes.
Persist locally and optionally write a summarized workout to HealthKit.
Progression engine evaluates deterministic progression; coach may propose program changes separately.
7.3 Meal Photo
Tap camera and capture meal.
Send the selected image to the configured multimodal AI with minimal context.
AI returns detected foods, portions, calories/macros, confidence and uncertainty.
Show an editable review sheet before saving.
Allow voice correction, e.g. "half the rice, no skin".
Save structured meal locally. Retain the meal photo locally only according to user preference.
7.4 Universal Voice Command
Provide one microphone entry point across the app. Prefer on-device/native transcription where practical. Map the transcript to a strict command schema before any data mutation.
Example
Intent
Weight today 83.4 kilos
log_body_metric
Three eggs, two toast and a latte
log_meal
Bench 70 kilos for eight, RIR two
log_set
Start today's workout
start_workout
My left knee hurts today
log_symptom + safety gate
Swap squats for something easier on my knee
request_substitution
Same lunch as Tuesday
clone_meal
How am I doing this week?
coach_query
8. Screen-by-Screen Requirements
Screen
Requirements
Onboarding
Profile, goal, cadence, experience, diet pattern, equipment, mobility priorities, condition history, privacy preferences, Apple Health permissions and app disclaimer.
Today
Readiness at top, coach directive, workout, nutrition, sleep and body cards. Persistent camera + microphone quick actions.
Workout
Exercise name/demo, targets, previous performance, set rows, rest timer, RIR, notes, Substitute and Pain/Issue actions. Keep awake while active.
Weekly Plan
Minimum / Target / Stretch schedule. Reschedule/reflow sessions. Show strength, conditioning, swim and mobility blocks.
Exercise Detail
Instructions, history, estimated strength trend, muscles/equipment, substitutions and safety tags.
Eat Today
Calories + protein prominent; carbs/fat secondary. Meal timeline and add via camera, voice, search or recent.
Meal Review
Photo, detected foods, quantity controls, macro totals, confidence/uncertainty, voice correction and Confirm.
Food Search
Singapore/local food data, USDA/generic foods, saved/recent foods and quantity controls.
Sleep
Last-night duration/timing, 7/30-day trends, consistency, source and coach interpretation.
Progress
7-day weight average, waist, photos, target trajectory, strength and adherence across training/nutrition/sleep.
Mobility
Short routines contextual to workout/recovery, body-region filters and completion history.
Coach
Chat plus daily/weekly review cards. Plan changes show rationale, evidence, impact and Accept/Reject.
Settings
HealthKit, AI services, privacy ledger, local backup/export/delete, media retention, units and reminders.
9. Training Engine
9.1 Programming Model
Use a rolling weekly plan rather than a rigid weekday split. V0.1 should expose Minimum / Target / Stretch capacity:
Tier
Default
Minimum
3 core strength sessions/week
Target
4 sessions/week: strength plus conditioning/swim
Stretch
5 sessions/week: extra conditioning, accessory work or mobility depending on recovery
The program should reflow when sessions are missed. It should not force five sessions just because five were scheduled.
9.2 Progression
Support linear progression and double progression first.
Track load, reps, RIR/RPE, duration and symptom flags per set/session.
Do not advance load after failed targets or pain-triggered substitutions.
Detect stalls deterministically; coach may propose deload, volume change or exercise swap.
Do not force barbell lifts when machines/dumbbells offer a safer stable movement for the user's condition profile.
9.3 Injury-Aware Safety Rules
Signal
Required behavior
Pain 0–2/10, stable, no red flags
Proceed while monitoring; allow reduced load/ROM.
Pain 3–5/10 or meaningful increase from baseline
AMBER: offer lower-impact substitution, lower load/volume and avoid provocative ROM.
Pain >5/10 or concerning symptoms
RED: stop affected recommendation and advise appropriate clinical assessment. Do not diagnose.
Knee locking/giving way
RED for knee-loading work; do not encourage HIIT/running through it.
New numbness/weakness or radiating neurologic symptoms
RED; do not prescribe provocative spine/neck loading.
Poor sleep alone
Do not automatically cancel training; combine with trend, soreness, symptoms and subjective readiness.
Missed session
Reflow remaining week and protect the 3-session minimum.
HIIT should default to lower-impact modalities available in the condo gym, such as stationary bike, tolerated incline walking and swimming. Running is optional, not required for fat loss.
10. Nutrition Engine
Support the user's 1–2 meal/day pattern without requiring breakfast.
Display calories and protein most prominently. Carbs and fat are secondary.
Estimate starting calorie/protein targets, then adjust from 14–21 day weight/waist/adherence trends rather than repeatedly changing formula estimates.
Allow coffee, supplements, snacks and confectionery to be logged without moralizing language.
Flag persistent under-eating, low protein or excessively rapid loss instead of rewarding ever-lower intake.
Save frequently corrected foods/meals so future logging becomes personalized and faster.
10.1 Food Data
Use Singapore-relevant nutrition data where available, with USDA FoodData Central as a generic/branded fallback. Cache normalized foods locally after use.
10.2 AI Meal Recognition Output
Required structured fields: food_name, estimated_quantity_g, serving_description, kcal, protein_g, carbs_g, fat_g, confidence_0_1, uncertainty_reason and source_hint. Display these as estimates, not false precision.
11. Sleep and Recovery
Sleep is a first-class pillar and a direct input to training decisions. Prefer HealthKit data from Apple Watch, with manual entry as fallback.
Track sleep duration, bedtime, wake time, consistency and 7/30-day trends.
Optionally include subjective energy, soreness and stress in the morning check-in.
Use resting-heart-rate trend and recent training load when reliable data exists.
Do not let a single bad night automatically cancel training.
Coach should surface patterns such as repeated short sleep before poor training performance when enough personal data exists.
11.1 Readiness Model
State
Meaning
Coach behavior
GREEN
Normal readiness
Run plan; normal progression.
AMBER
Recovery or symptom concern
Preserve the habit but modify volume, intensity, modality or exercise choice.
RED
Safety concern / severe symptoms
Do not prescribe provocative training; suggest recovery and appropriate escalation.
12. Apple Health / Apple Watch
Request HealthKit permissions granularly and explain why each data type is used.
Read sleep analysis, workouts, active energy, steps, heart-rate/resting-HR where available, body mass and relevant activity summaries.
Write completed app workouts and body mass only when explicitly enabled.
Use WorkoutKit later to schedule compatible structured cardio/swim workouts to Apple Watch.
Keep detailed strength data (exercise, set, reps, load, RIR) in the local app database even if a summary is written to HealthKit.
13. AI Coach
The coach interprets history, identifies patterns, communicates priorities and proposes discrete changes. It must not directly own progression math, calorie arithmetic, red-flag detection or silent database mutation.
Demanding: plainly call out missed workouts, repeated unlogged meals and avoidable non-adherence.
Specific: recommend an actionable next step, not generic motivation.
Evidence-linked: show which logged facts drove the recommendation.
Adaptive: distinguish intentional flexibility from actual non-adherence.
Safety-bounded: never pressure the user to ignore pain or concerning symptoms.
Reversible: material plan changes require Accept/Reject and are stored in decision history.
Situation
Desired coach behavior
8 PM, workout not done
Offer a shortened 25–35 minute version before suggesting a skip.
Protein materially behind
Recommend a high-protein next meal using recent foods/preferences.
Weight flat 2–3 weeks with strong adherence
Propose a modest calorie/activity adjustment and show evidence.
Five hours sleep, otherwise well
Consider reduced volume/intensity, not automatic rest.
Knee pain worsens during squat
Stop squat progression, suggest non-provocative substitute and record symptom.
Three missed days
Rebuild the remaining week around the 3-session minimum instead of guilt messaging.
14. Local-First Data Model
Entity
Purpose / key fields
UserProfile
DOB, sex, height, units, preferences
Goal
type, target, priority, dates, status
ConditionFlag
body region, condition label, baseline notes
SymptomCheck
timestamp, region, pain score, red-flag fields, notes
Exercise
name, equipment, muscles, demo, substitution/safety tags
WorkoutPlan
training block/week, minimum/target/stretch cadence
WorkoutSession
planned/completed, readiness, duration, session RPE
ExerciseSet
exercise, set, reps, load, RIR/RPE, time
CardioSession
modality, time, distance, HR metrics
MobilitySession
routine, movement list, completion
BodyMetric
weight, waist and optional measurements
ProgressPhoto
local file URI, angle, timestamp
Meal
timestamp, meal type, optional local photo URI
FoodItem
food, quantity, nutrient values, source, confidence
NutritionTarget
date/range, kcal and macro targets
SleepRecord
start/end, duration, source, stages if available
HealthMetric
type, timestamp, value, source
DailyCheckIn
energy, soreness, stress, notes
CoachDecision
evidence, recommendation, proposed action, accept/reject, result
VoiceCommand
optional transcript, parsed intent, status; configurable retention
15. Privacy and Security
No user account or remote app database required for V0.1.
Canonical records are stored in encrypted/local SQLite on iPhone.
Progress photos stay local unless explicitly selected for AI analysis.
Meal-photo requests send only the selected image and necessary meal context.
Prefer on-device/native speech transcription. If cloud transcription is used, show provider and data flow clearly.
Add a Privacy Ledger listing recent external AI calls: time, data type, provider and purpose.
Support complete local export and deletion.
Use iOS Keychain/Secure Enclave-compatible storage for secrets and encryption keys.
16. OpenGym: Reuse vs Rebuild
Capability
Decision
Notes
Exercise dataset/demos
Reuse/adapt
Strong existing exercise library and demos; verify attribution/license obligations.
Guided workout UX
Reuse/adapt
Previous performance, rest timer, PRs, timed exercises and supersets are valuable.
Progression functions
Reuse/adapt
Keep deterministic progression where compatible.
Strength history / 1RM concepts
Reuse/adapt
Useful for stable strength movements.
Weekly rigid plan
Modify
Replace with Minimum / Target / Stretch rolling week.
Body-weight tracking
Reuse concept
Migrate persistence and extend to waist/photos.
AI Coach pattern
Reuse principle
Keep propose/approve/revert philosophy; extend to nutrition/sleep/recovery.
JSON persistence
Replace
Use SQLite for relational/time-series personal health data.
Self-host Node/nginx backend
Do not require
Personal iPhone app should work without a home server.
Passkeys / multi-profile
Defer
Not needed for single-user V0.1.
PWA-only iOS model
Upgrade
Need robust HealthKit, camera, mic, notifications and local storage integration.
Licensing: OpenGym is AGPLv3. Reuse is practical for a personal/local project. If this later becomes a hosted proprietary product, conduct a formal licensing review before relying on modified AGPL-covered code.
17. Recommended Technical Architecture
Layer
Recommendation
Client
iPhone-first native-capable shell; React/Capacitor acceptable if HealthKit/native bridges are robust.
Canonical storage
Local SQLite + repository/service layer + migrations from day one.
Native integrations
HealthKit, camera, microphone/speech, local notifications, Keychain.
AI gateway
Provider abstraction for multimodal meal recognition and coach LLM.
Rules engine
Pure deterministic functions for readiness, progression, symptom gates and nutrition trend adjustments.
Media
Local filesystem for progress and optional meal photos with configurable retention.
Mac/web
Secondary review experience after the core iPhone flow is stable.
18. Acceptance Criteria
Area
Acceptance criterion
Onboarding
Complete profile/goals/condition/privacy setup without creating an online account.
Today
Show workout, kcal/protein, sleep, weight trend, readiness and one coach priority.
Workout
Complete a full strength workout offline and retain every set after app restart.
Safety
Red-flag symptom input blocks provocative training recommendations.
Voice
Weight, meal, set and symptom commands parse into previewable structured actions.
Camera
Meal photo yields editable foods/portions/macros and requires confirmation before save.
Nutrition
Clone a prior meal and correct it using voice.
Sleep
Apple Health sleep populates when permitted; manual fallback exists.
Progress
7-day weight trend, waist, strength and adherence are visible.
Coach
Material plan change is presented as a discrete proposal with Accept/Reject.
Privacy
Core app remains functional offline; only explicitly cloud-backed AI features require network.
Data
User can export and delete all local app data.
19. Build Phases
Phase
Scope
0 — Foundation
Inspect/fork OpenGym, define license boundary, SQLite schema, iPhone shell, onboarding, settings/privacy.
1 — Training + Body
Today, weight/waist, rolling planner, guided logger, progression reuse, symptom gates, notifications.
2 — Nutrition AI
Meal diary, food search, local/Singapore food data, USDA fallback, photo recognition, voice correction, saved meals.
3 — Sleep + HealthKit
Sleep/workouts/activity/body mass import, readiness rules and recovery dashboard.
4 — Coach
Daily brief, coach chat, evidence retrieval, plan/nutrition proposals, weekly review and audit trail.
5 — Polish
Progress photo comparisons, WorkoutKit scheduling, mobility refinement, Mac/web companion and gym-photo equipment calibration.
20. Fable 5 Build Instructions
Generate a functional product prototype, not a marketing mockup. Prioritize states, navigation, local persistence, forms, data relationships and interaction logic.
Use realistic seeded data matching the fictional reference persona in this PRD.
Implement all primary screens plus empty, loading, error, offline and permission-denied states.
Bottom navigation: Today, Train, Eat, Progress, Coach.
Persistent camera and microphone quick actions on Today and Eat.
Calories and protein are editable targets; protein is visually more prominent than carbs/fat.
Readiness must display Green/Amber/Red plus textual reasons.
Every workout exercise card includes Log Set, Substitute and Pain/Issue.
Coach recommendations that alter a plan must show 'Why', supporting evidence and Accept/Reject.
AI-derived food portions/macros must always remain editable estimates.
Do not include social features, streak-shaming, medical diagnosis or video form diagnosis.
21. Seed Scenario
Seed the prototype with: current weight 84.0 kg; long-term target 74 kg; 6h 10m sleep last night; Amber readiness due to short sleep plus mild knee soreness; an upper-body strength session planned; only coffee consumed so far; and a protein target that causes the coach to recommend a high-protein lunch. Include one prior workout, three saved meals, seven days of weight, seven nights of sleep and one recent coach decision.
22. Open Questions for Later Calibration
These are calibration inputs each user supplies during onboarding or in Settings; none are recorded in this document.
Exact height.
Any clinician/physiotherapist restrictions for knees, spine and neck.
Baseline symptom pattern by region and what movements currently aggravate symptoms.
Gym photos and exact machine inventory.
Typical lunch/dinner foods, alcohol frequency and supplement list.
Whether progress photos should be visual-only or optionally sent for AI analysis.
Preferred cloud AI providers and acceptable fallback when native speech recognition is unavailable.
23. Reference Architecture Sources
Source
Use
OpenGym — https://github.com/alexpcosta/opengym
Workout engine patterns, exercise library, progression, offline/mobile direction and AGPLv3 licensing.
Apple HealthKit — https://developer.apple.com/documentation/healthkit
Health and fitness data integration on iPhone/Apple Watch.
Apple WorkoutKit — https://developer.apple.com/documentation/workoutkit
Structured workout creation and Apple Watch scheduling.
USDA FoodData Central — https://fdc.nal.usda.gov/api-guide/
Generic and branded food nutrition data.
Singapore Health Promotion Board — https://www.hpb.gov.sg/
Singapore-relevant nutrition resources / Food Insights data.
24. Safety Note
This application is a fitness and behavior-support product, not a medical device or clinician replacement. Because the reference persona includes knee and lower-back considerations, the product must avoid diagnosing conditions or prescribing rehabilitation. Concerning symptoms should route to conservative stop/modify behavior and appropriate professional assessment.
