// Home Dumbbells, transcribed from docs/programs/home-dumbbells.md (Oct 2026). Data only: the engine reads it.
// Weeks 2, 4-6 and 8-10 repeat weeks 1, 3 and 7 (`weekRepeats` in the doc → `repeats`).
import type { Block, Program } from '../../domain/programs'

/** The 4-minute warm-up that opens every session (§3). */
const WARMUP: Block = { shape: 'steady', exerciseId: 'march_in_place', minutes: 4, effort: 'easy, building to 4 of 10', role: 'warmup' }

export const program: Program = {
  id: 'home-dumbbells',
  status: 'ready',
  title: 'Home Dumbbells',
  promise: 'Get stronger at home with one pair of dumbbells.',
  description:
    'Ten weeks, three full-body sessions a week, 30 to 40 minutes each. You need one pair of adjustable dumbbells; a chair or bench and a band help but are optional. When your dumbbells stop being heavy enough, the plan adds reps, then harder one-leg or slower versions, so you keep progressing.',
  weeks: 10,
  sessionsPerWeek: 3,
  minutes: [30, 40],
  equipment: ['dumbbell'],
  needs: 'One pair of adjustable dumbbells. Optional: a bench or sturdy chair, a resistance band. Floor space about 2 × 2 m.',
  timePerWeek: 'About 1 hour 30 to 2 hours (3 sessions of 30–40 minutes).',
  why: [
    { text: 'Light and heavy weights built similar muscle when sets were taken to failure.', source: 3 },
    { text: 'In one 8-week trial, light sets stopped well short of failure grew little muscle.', source: 5 },
    { text: "In ACSM's 2026 overview, equipment type, such as machines versus free weights, did not consistently change results.", source: 1 },
  ],
  sources: [
    { n: 1, citation: 'Currier BS et al. American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Medicine & Science in Sports & Exercise. 2026.', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/', kind: 'guideline' },
    { n: 2, citation: 'Bull FC et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine. 2020.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/', kind: 'guideline' },
    { n: 3, citation: 'Schoenfeld BJ et al. Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis. Journal of Strength and Conditioning Research. 2017.', url: 'https://pubmed.ncbi.nlm.nih.gov/28834797/', kind: 'meta-analysis' },
    { n: 4, citation: 'Lopez P et al. Resistance Training Load Effects on Muscle Hypertrophy and Strength Gain: Systematic Review and Network Meta-analysis. Medicine & Science in Sports & Exercise. 2021.', url: 'https://pubmed.ncbi.nlm.nih.gov/33433148/', kind: 'meta-analysis' },
    { n: 5, citation: 'Lasevicius T et al. Muscle Failure Promotes Greater Muscle Hypertrophy in Low-Load but Not in High-Load Resistance Training. Journal of Strength and Conditioning Research. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/31895290/', kind: 'rct' },
    { n: 6, citation: 'Refalo MC et al. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Medicine. 2023.', url: 'https://pubmed.ncbi.nlm.nih.gov/36334240/', kind: 'meta-analysis' },
    { n: 7, citation: 'Robinson ZP et al. Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. Sports Medicine. 2024.', url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/', kind: 'meta-analysis' },
    { n: 8, citation: 'Halperin I et al. Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. Sports Medicine. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/34542869/', kind: 'meta-analysis' },
    { n: 9, citation: 'Schoenfeld BJ et al. Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis. Journal of Sports Sciences. 2017.', url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/', kind: 'meta-analysis' },
    { n: 10, citation: 'Pelland JC et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. Sports Medicine. 2026.', url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/', kind: 'meta-analysis' },
    { n: 11, citation: 'Schoenfeld BJ et al. How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency. Journal of Sports Sciences. 2019.', url: 'https://pubmed.ncbi.nlm.nih.gov/30558493/', kind: 'meta-analysis' },
    { n: 12, citation: 'Lopes JSS et al. Effects of training with elastic resistance versus conventional resistance on muscular strength: A systematic review and meta-analysis. SAGE Open Medicine. 2019.', url: 'https://pubmed.ncbi.nlm.nih.gov/30815258/', kind: 'meta-analysis' },
    { n: 13, citation: 'Calatayud J et al. Bench press and push-up at comparable levels of muscle activity results in similar strength gains. Journal of Strength and Conditioning Research. 2015.', url: 'https://pubmed.ncbi.nlm.nih.gov/24983847/', kind: 'rct' },
    { n: 14, citation: 'Schoenfeld BJ et al. Effect of repetition duration during resistance training on muscle hypertrophy: a systematic review and meta-analysis. Sports Medicine. 2015.', url: 'https://pubmed.ncbi.nlm.nih.gov/25601394/', kind: 'meta-analysis' },
    { n: 15, citation: 'Kassiano W et al. Comparison of Muscle Growth and Dynamic Strength Adaptations Induced by Unilateral and Bilateral Resistance Training: A Systematic Review and Meta-analysis. Sports Medicine. 2025.', url: 'https://pubmed.ncbi.nlm.nih.gov/39794667/', kind: 'meta-analysis' },
    { n: 16, citation: 'Mañas A et al. Unsupervised home-based resistance training for community-dwelling older adults: A systematic review and meta-analysis of randomized controlled trials. Ageing Research Reviews. 2021.', url: 'https://pubmed.ncbi.nlm.nih.gov/34022464/', kind: 'meta-analysis' },
    { n: 17, citation: 'Binmahfoz A et al. The effects of a home-based resistance training programme on body composition and muscle function during weight loss in people living with overweight or obesity: a randomised controlled pilot trial. Nutrition & Metabolism. 2025.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12323239/', kind: 'rct' },
    { n: 18, citation: "Riebe D et al. Updating ACSM's Recommendations for Exercise Preparticipation Health Screening. Medicine & Science in Sports & Exercise. 2015.", url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', kind: 'consensus' },
  ],

  // §4 pre-start screen: six questions. Training history is a setup question (rule P0), not here.
  screen: [
    {
      id: 'cardiac_symptoms',
      text: 'In the last 3 months, have you had chest pain, fainting, palpitations or unusual breathlessness when active?',
      onYes: 'wait',
      yesCopy: 'Please see a clinician before you start this series.',
    },
    {
      id: 'known_disease_inactive',
      text: 'Do you have a diagnosed heart, metabolic or kidney condition, and are you currently inactive?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from your doctor first. Start unlocks once you confirm you have it.',
    },
    {
      id: 'pregnant',
      text: 'Are you pregnant?',
      onYes: 'wait',
      yesCopy: 'Please talk to your midwife or clinician before starting this series.',
      shared: 'pregnant',
    },
    {
      id: 'recent_birth',
      text: 'Have you had a baby in the last 12 months?',
      onYes: 'suggest:postpartum',
      yesCopy: 'The Postpartum series fits better right now. It has its own clearance step.',
      shared: 'recent_birth',
    },
    {
      id: 'recent_injury_or_nerve',
      text: 'In the last 3 months, have you had surgery, a fracture or a joint injury? Or do you now have numbness, tingling, weakness or pain spreading down an arm or leg, or a knee that locks or gives way?',
      onYes: 'wait',
      yesCopy: 'Please get cleared or assessed by your GP, surgeon or physio first. Start unlocks once you confirm.',
    },
    {
      // The doc picks the path by the region tapped (knee or hip → low-impact, back → back, neck or shoulder →
      // no-overhead) and sets that standing flag; `flagPaths` carries the mapping. See _transcriptionNotes.
      id: 'joint_pain',
      text: 'Do you have pain in a knee, a hip, your back, your neck or a shoulder that changes how you move?',
      onYes: 'note',
      yesCopy: 'Tap where it hurts. Knee or hip: the low-impact path. Back: the back path. Neck or shoulder: no overhead pressing.',
      fromFlags: ['knee_left', 'knee_right', 'hip', 'back_lower', 'back_mid', 'back_upper', 'neck', 'shoulder'],
    },
  ],

  stopSigns: [
    {
      sign: 'Chest pain or pressure, fainting or near-fainting, a racing or irregular heartbeat, or breathlessness out of proportion to the effort',
      action: 'Stop now and sit or lie down. Do not resume today. If chest pain lasts more than a few minutes, call emergency services. The app ends the session and locks the series until the user confirms they have seen a clinician.',
    },
    {
      sign: 'Sharp or joint pain, as opposed to the burn of a hard set',
      action: 'Stop that exercise and log a pain flag. The gate swaps or removes it for the rest of the session. Progression holds (engine).',
    },
    {
      sign: 'Numbness, tingling or pain spreading down an arm or leg; a knee locking or giving way',
      action: 'Stop the session. Gate RED applies to that region. The app suggests an assessment before the next session.',
    },
    {
      sign: 'Severe muscle pain and swelling with dark, cola-coloured urine in the days after a session',
      action: 'Seek same-day medical care. The app pauses the series. (Safety practice, not from the sources above.)',
    },
    {
      sign: 'Dizziness when standing up from the floor',
      action: 'Stand up slowly and sit before the next set. If it keeps happening, stop and check with a clinician.',
    },
  ],

  sessions: [
    // ---- Weeks 1-2: Learn (2 sets, 3 reps in reserve) ----
    {
      key: 'w1d1', week: 1, name: 'A - Squat and press', type: 'strength', minutes: 30,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'goblet_squat', sets: 2, reps: [8, 12], restSec: 90, slot: 'squat' },
        { shape: 'sets', exerciseId: 'db_floor_press', sets: 2, reps: [8, 12], restSec: 90, slot: 'horizontal_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 2, reps: [8, 12], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'db_rdl', sets: 2, reps: [8, 12], restSec: 90, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'lateral_raise', sets: 2, reps: [10, 15], restSec: 45 },
        { shape: 'sets', exerciseId: 'dead_bug', sets: 2, reps: [6, 8], perSide: true, restSec: 45 },
      ],
    },
    {
      key: 'w1d2', week: 1, name: 'B - Hinge and split squat', type: 'strength', minutes: 30,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_rdl', sets: 2, reps: [8, 12], restSec: 90, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'db_split_squat', sets: 2, reps: [8, 12], perSide: true, restSec: 75, slot: 'split_squat' },
        { shape: 'sets', exerciseId: 'push_up', sets: 2, reps: [5, 10], restSec: 75, slot: 'push_up' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 2, reps: [8, 12], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [20, 30], perSide: true, restSec: 30, slot: 'side_plank' },
      ],
    },
    {
      key: 'w1d3', week: 1, name: 'C - Step-up, thrust and overhead press', type: 'strength', minutes: 30,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_step_up', sets: 2, reps: [8, 12], perSide: true, restSec: 75 },
        { shape: 'sets', exerciseId: 'hip_thrust', sets: 2, reps: [10, 15], restSec: 75, slot: 'hip_thrust' },
        { shape: 'sets', exerciseId: 'db_shoulder_press', sets: 2, reps: [8, 12], restSec: 75, slot: 'overhead_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 2, reps: [8, 12], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'suitcase_carry', sets: 2, seconds: [30, 40], perSide: true, restSec: 45 },
      ],
    },

    // ---- Weeks 3-6: Build (3 sets, 2 in reserve) ----
    {
      key: 'w3d1', week: 3, name: 'A - Squat and press', type: 'strength', minutes: 35,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'goblet_squat', sets: 3, reps: [8, 15], restSec: 90, slot: 'squat' },
        { shape: 'sets', exerciseId: 'db_floor_press', sets: 3, reps: [8, 15], restSec: 90, slot: 'horizontal_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'db_rdl', sets: 2, reps: [10, 15], restSec: 90, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'lateral_raise', sets: 2, reps: [12, 20], restSec: 45 },
        { shape: 'sets', exerciseId: 'dead_bug', sets: 2, reps: [6, 10], perSide: true, restSec: 45 },
      ],
    },
    {
      key: 'w3d2', week: 3, name: 'B - Hinge and split squat', type: 'strength', minutes: 35,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_rdl', sets: 3, reps: [8, 15], restSec: 90, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'db_split_squat', sets: 3, reps: [8, 15], perSide: true, restSec: 75, slot: 'split_squat' },
        { shape: 'sets', exerciseId: 'push_up', sets: 3, reps: [6, 15], restSec: 75, slot: 'push_up' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [20, 40], perSide: true, restSec: 30, slot: 'side_plank' },
      ],
    },
    {
      key: 'w3d3', week: 3, name: 'C - Step-up, thrust and overhead press', type: 'strength', minutes: 35,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_step_up', sets: 3, reps: [8, 15], perSide: true, restSec: 75 },
        { shape: 'sets', exerciseId: 'hip_thrust', sets: 3, reps: [10, 20], restSec: 75, slot: 'hip_thrust' },
        { shape: 'sets', exerciseId: 'db_shoulder_press', sets: 3, reps: [8, 15], restSec: 75, slot: 'overhead_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'suitcase_carry', sets: 2, seconds: [30, 45], perSide: true, restSec: 45 },
      ],
    },

    // ---- Weeks 7-10: Push (first two exercises 4 sets, 1 in reserve) ----
    {
      key: 'w7d1', week: 7, name: 'A - Squat and press', type: 'strength', minutes: 40,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'goblet_squat', sets: 4, reps: [8, 15], restSec: 90, slot: 'squat' },
        { shape: 'sets', exerciseId: 'db_floor_press', sets: 4, reps: [8, 15], restSec: 90, slot: 'horizontal_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'db_rdl', sets: 2, reps: [10, 15], restSec: 75, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'lateral_raise', sets: 2, reps: [12, 20], restSec: 45 },
        { shape: 'sets', exerciseId: 'dead_bug', sets: 2, reps: [8, 10], perSide: true, restSec: 30 },
      ],
    },
    {
      key: 'w7d2', week: 7, name: 'B - Hinge and split squat', type: 'strength', minutes: 40,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_rdl', sets: 4, reps: [8, 15], restSec: 90, slot: 'hinge' },
        { shape: 'sets', exerciseId: 'db_split_squat', sets: 4, reps: [8, 15], perSide: true, restSec: 75, slot: 'split_squat' },
        { shape: 'sets', exerciseId: 'push_up', sets: 3, reps: [8, 20], restSec: 75, slot: 'push_up' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [30, 45], perSide: true, restSec: 30, slot: 'side_plank' },
      ],
    },
    {
      key: 'w7d3', week: 7, name: 'C - Step-up, thrust and overhead press', type: 'strength', minutes: 40,
      blocks: [
        WARMUP,
        { shape: 'sets', exerciseId: 'db_step_up', sets: 4, reps: [8, 15], perSide: true, restSec: 75 },
        { shape: 'sets', exerciseId: 'hip_thrust', sets: 4, reps: [10, 20], restSec: 75, slot: 'hip_thrust' },
        { shape: 'sets', exerciseId: 'db_shoulder_press', sets: 3, reps: [8, 15], restSec: 75, slot: 'overhead_press' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 15], perSide: true, restSec: 60 },
        { shape: 'sets', exerciseId: 'suitcase_carry', sets: 2, seconds: [30, 45], perSide: true, restSec: 45 },
      ],
    },
  ],
  repeats: [
    { week: 2, copyOf: 1 },
    { week: 4, copyOf: 3 },
    { week: 5, copyOf: 3 },
    { week: 6, copyOf: 3 },
    { week: 8, copyOf: 7 },
    { week: 9, copyOf: 7 },
    { week: 10, copyOf: 7 },
  ],

  // §4 condition flags. Every swap is home-only: the library's own chains point at gym machines.
  paths: {
    standard: { label: 'Standard' },
    'low-impact': {
      label: 'Low impact (knee or hip)',
      swaps: { goblet_squat: 'wall_sit', db_split_squat: 'db_step_up' },
    },
    back: {
      label: 'Back-friendly',
      swaps: { goblet_squat: 'db_step_up', suitcase_carry: 'side_plank' },
    },
    'no-overhead': {
      label: 'No overhead (neck or shoulder)',
      swaps: { db_shoulder_press: 'lateral_raise' },
    },
  },
  flagPaths: { knee: 'low-impact', hip: 'low-impact', back: 'back', neck: 'no-overhead', shoulder: 'no-overhead' },
  // No flagAvoid: the doc's AMBER sets (knee/hip deep_knee_flexion; back axial_load + spinal_flexion; neck/shoulder
  // overhead) equal the gate's own, and the 2026-10-02 owner decision keeps impact allowed for knee/hip flags.

  advance: {
    minCompleted: 2, // P7: at least 2 of 3 sessions logged
    maxPainToAdvance: 3, // not in the doc: house 3/10 ceiling (see _transcriptionNotes)
    dropBackPainAtLeast: 6, // owner-facing convention 2026-10-03: same as Start Running R3 (the doc has no week-level drop-back)
    repeatIfFeltHard: true,
    longGapDays: 8, // P8: 8-13 days repeats the last completed week (14+ is in rulesText.P8)
  },

  // §3 Regressions and progressions, ids only, start → harder. Rep and tempo steps between rungs are in rulesText.
  ladders: [
    { slot: 'squat', rungs: ['goblet_squat', 'bulgarian_split_squat', 'deficit_reverse_lunge'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps at heaviestDumbbellKg (P4).' },
    { slot: 'split_squat', rungs: ['db_split_squat', 'bulgarian_split_squat'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps at heaviestDumbbellKg (P4).' },
    { slot: 'hinge', rungs: ['db_rdl', 'db_single_leg_rdl'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps at heaviestDumbbellKg (P4).' },
    { slot: 'hip_thrust', rungs: ['hip_thrust', 'db_single_leg_hip_thrust'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps at heaviestDumbbellKg (P4).' },
    { slot: 'horizontal_press', rungs: ['db_floor_press', 'decline_push_up'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps, then tempo 3-1-1 (pause on the floor) tops out (P4, P5).' },
    { slot: 'push_up', rungs: ['push_up', 'decline_push_up', 'archer_push_up'], advanceWhen: 'Every working set reaches the top of the rep range (reps +2 per step, engine).' },
    { slot: 'overhead_press', rungs: ['db_shoulder_press', 'arnold_press'], advanceWhen: 'Capped stage (P3): every set reaches 30 reps at heaviestDumbbellKg (P4).' },
    { slot: 'side_plank', rungs: ['side_plank', 'side_plank_reach'], advanceWhen: 'Every working set reaches the top of the range.' },
  ],

  standalone: [{ sessionKey: 'w3d1', name: 'Dumbbell full body A', fact: 'one pair of dumbbells' }],

  cues: {
    start: 'Three sessions this week. Today is about clean reps.',
    march_in_place: 'Easy pace now. Save the effort for later.',
    goblet_squat: 'Dumbbell at your chest, sit back to the chair.',
    db_floor_press: 'Elbows touch the floor, pause, then press.',
    one_arm_db_row: 'Pull the dumbbell to your hip.',
    db_rdl: 'Hips back, dumbbells slide down your thighs.',
    db_split_squat: 'Back knee down, front heel stays heavy.',
    db_step_up: 'Whole foot on the step, push through the heel.',
    hip_thrust: 'Chin tucked, ribs down, squeeze at the top.',
    db_shoulder_press: 'Ribs down, press up, stop short of lockout.',
    push_up: 'One straight line from head to heels.',
    lateral_raise: 'Lead with your elbows, shoulders away from ears.',
    dead_bug: 'Lower back stays heavy on the floor.',
    side_plank: 'Hips high, breathe slowly.',
    suitcase_carry: "Walk tall, don't lean towards the dumbbell.",
    wall_sit: 'Back on the wall, thighs above parallel. Breathe.',
    rest: 'Rest now. Shake your arms and breathe.',
    finish: "Done. That counts towards this week's three.",
  },

  rulesText: {
    P0: "Setup. Before week 1, record heaviestDumbbellKg (per hand) and dumbbellStepKg (the smallest jump the set allows). Also ask once: 'Have you lifted weights at least twice a week for the past 3 months?' (sets liftedThreeMonths; not a safety question, see P9). The start load per exercise is the one the user picks for the bottom of the range with the target reps in reserve.",
    P1: 'Double progression (existing engine). If every working set reaches the top of the rep range and logged rir >= 1, the next load is current + dumbbellStepKg. Otherwise hold.',
    P2: 'Load cap check. If current + dumbbellStepKg > heaviestDumbbellKg, do not add load; apply P3 instead.',
    P3: 'Capped stage. Keep load at heaviestDumbbellKg, change the rep range to [15, 30], target rir 1 on all but the last set, and take the last set to technical failure (logged rir 0 is allowed here and does not block progress). Advance within the stage by reps only.',
    P4: "Variant ladder. When every set in the capped stage reaches 30 reps, move the exercise to the next rung of its ladder (section 3, Regressions and progressions) at heaviestDumbbellKg and reset the range to the session's normal range.",
    P5: 'Ladder exhausted. On the last rung, add tempo 3-1-1 (3 s lower, 1 s pause, about 1 s up) at the normal range. When that tops out, add 1 set, up to 4 sets per exercise and 12 direct sets per muscle per week. Then hold.',
    P6: 'Missed minimum. If any set falls below the bottom of the range for 2 sessions running, step back: one dumbbell step down, or one rung down the ladder if already on a variant. A pain flag holds the exercise and routes through the symptom gate (existing engine).',
    P7: 'Week advance. A week counts as done when at least 2 of its 3 sessions are logged. With 0 or 1 logged, repeat the week. The plan never advances without logs.',
    P8: 'Time away. If 8-13 days pass since the last session, repeat the last completed week. If 14 days or more pass, drop back 2 weeks (not below week 1) and one dumbbell step on every loaded exercise.',
    P9: 'Experienced start. If P0 recorded liftedThreeMonths = true, start at week 3.',
    P10: 'After week 10. Offer: repeat weeks 7-10 with current loads, or move to the Traditional Gym series.',
    conventions: 'Rules P3 to P5, P7, P8 and P9 are coaching conventions. For P3 to P5, the evidence supports their direction [3][5][7][14][15], not their exact numbers. P7, P8 and P9 have no source here.',
    schedule: 'Sessions: 3 a week, full body, at least one rest day between sessions.',
    rir: 'Target reps in reserve on loaded and rep blocks (not on dead_bug, side_plank or suitcase_carry): weeks 1-2 rir 3; weeks 3-6 rir 2; weeks 7-10 rir 1. At any week, an exercise whose load is capped runs 15-30 reps instead (P3).',
    equipmentSwaps:
      "No bench. one_arm_db_row: one hand on a chair seat or sofa arm, in a split stance. hip_thrust: upper back on the sofa edge; with no sofa, use glute_bridge with the dumbbell on the hips (the engine treats glute_bridge as bodyweight, so it progresses by reps). db_shoulder_press: seated on a sturdy chair with the back against the backrest. db_floor_press stays on the floor; with a bench, db_bench_press gives more range and uses the same rep rules. Band (optional): band_row can replace the row in session C, and band_pull_apart can be used in the warm-up.",
    regressions:
      'Regress one step to the left. Squat (A): sit_to_stand_chair (seat at or above knee height). Split squat (B): bw_split_squat, then db_step_up. Step-up (C): step_up_bw (no load). Hinge (A, B): glute_bridge, single_leg_rdl_bw. Hip thrust (C): glute_bridge. Horizontal press (A): lighter dumbbell, or incline_push_up. Push-up (B): incline_push_up. Row (A, B, C): band_row. Overhead press (C): lateral_raise. Lateral raise (A): lighter dumbbell. Core: dead_bug with bent legs.',
    ladderSteps:
      'Ladder when capped (P3 → P4 → P5). Squat (A): 15-30 reps → bulgarian_split_squat (rear foot on chair) → deficit_reverse_lunge → tempo 3-1-1. Split squat (B): 15-30 reps → bulgarian_split_squat → tempo 3-1-1. Step-up (C): 15-30 reps → tempo (3 s lower). Hinge (A, B): 15-30 reps → db_single_leg_rdl → tempo 3-1-1. Hip thrust (C): 15-30 reps → db_single_leg_hip_thrust → tempo with 2 s top hold. Horizontal press (A): 15-30 reps → tempo 3-1-1 (pause on the floor) → decline_push_up. Push-up (B): reps (+2 per step, engine) → decline_push_up → archer_push_up. Row (A, B, C): 15-30 reps → tempo with 2 s hold at the top. Overhead press (C): 15-30 reps → arnold_press → tempo 3-1-1. Lateral raise (A): 15-30 reps → tempo (3 s lower). Core: dead_bug, side_plank → side_plank_reach.',
    pathLowImpact:
      'Knee or hip flag (path low-impact). Session A: goblet_squat → wall_sit, 3 × 30-60 s, thighs above parallel (about 45-60 degrees of knee bend; coaching convention). Session B: db_split_squat → db_step_up on a low step. Session C keeps db_step_up. Hinge, press, row and core are unchanged. Quad work moves to one wall sit and two step-ups: the set count is the same, but the knee bends less and the wall sit is a hold, so expect smaller quad gains. The app says so. The capped-load ladder for step-ups is tempo only; bulgarian_split_squat and deficit_reverse_lunge are tagged deep_knee_flexion, so they are not on this path.',
    redKnee: 'A RED knee day also removes knee_load, which takes out wall_sit and db_step_up. It becomes a hips-and-upper-body day: db_rdl, hip_thrust or glute_bridge, press, row and core.',
    redHip: 'A RED hip day adds axial_load instead, not knee_load. goblet_squat is already gone, so it takes out suitcase_carry: Session C swaps it for side_plank, as on the back path. Wall sit and step-ups stay.',
    pathBack:
      'Back flag (path back). AMBER removes axial_load and spinal_flexion. Session A: goblet_squat → db_step_up. Session C: suitcase_carry → side_plank. db_rdl and hip_thrust (tagged spinal_load) stay on the plan at AMBER, and so do their ladder rungs. The app says so plainly rather than implying the hinge is gone.',
    redBack: 'A RED back day removes spinal_load: db_rdl → glute_bridge and hip_thrust → glute_bridge.',
    pathKneeAndBack:
      'Knee (or hip) and back flags together. Session A: goblet_squat → wall_sit, thighs above parallel. Session B: db_split_squat → db_step_up. Session C: db_step_up stays; suitcase_carry → side_plank. db_rdl and hip_thrust stay. The leg ladder is tempo only.',
    pathNoOverhead:
      'Neck or shoulder flag (path no-overhead). Session C: db_shoulder_press → lateral_raise, 3 × 12-20. arnold_press is also excluded from the ladder. Nothing else in the series is tagged overhead. A RED neck day also removes neck_load, which nothing else in the series carries.',
    screenRecentBirthExemption:
      'If this device has a finished Postpartum enrolment (Stage 2 completed, or runCheckPassed set), a yes to the baby-in-12-months question has no effect and the series starts. The 12-month cut-off is a coaching convention.',
    screenUnlock: 'Questions 2 and 5: Start unlocks only after the user confirms clearance or assessment. Question 1: shows nothing to train.',
    age65: 'Aged 65 or over: the app shows a note to add balance work, because WHO advises varied activity that emphasises balance and strength on 3 or more days a week at this age [2] and this series alone does not meet that advice.',
    oneRepMaxGoal: 'Anyone chasing a 1-rep-max goal, such as a powerlifting total: light loads build less maximal strength [3][4]. The Traditional Gym series fits that goal.',
    cuesExtra:
      "Session start: Clear a patch of floor and set your dumbbells. goblet_squat: Heels down, chest tall, stand up strong. one_arm_db_row: Back flat, look at the floor. db_rdl: Feel the stretch, then drive your hips forward. Capped stage: Light weight today, so go close to failure. Capped stage, last set: Last set: stop when your form starts to slip. Tempo variant: Three seconds down, one second pause, then up. After a set: How many more could you have done? Log it. Top of range hit: Every set at the top. Heavier next time. Pain logged: Sharp pain is a stop sign. We'll swap it. Finish: Next time, aim for one more rep.",
    _transcriptionNotes: [
      '1. Screen Q6 picks the path by the region tapped; ScreenQuestion has one onYes, and splitting Q6 into three would make 8 questions (limit 7). Kept as one question with onYes "note" and fromFlags for every region; the path must come from the standing flag it sets, via flagPaths. Contract gap.',
      '2. advance.maxPainToAdvance and dropBackPainAtLeast: the doc has no week-level pain rule (P6: a pain flag holds that exercise). Chose the house 3/10 ceiling (pain 4+ repeats the week) and no pain drop-back (11 = unreachable).',
      '3. Knee or hip together with back: Enrollment.path holds one path. The doc result (Session A wall_sit) needs low-impact swaps applied before back swaps; applying back first would give db_step_up. See pathKneeAndBack.',
      '4. Path swaps carry ids only: wall_sit 3 × 30-60 s (low-impact) and lateral_raise 3 × 12-20 (no-overhead) prescriptions are in pathLowImpact and pathNoOverhead, not in the data.',
      '5. rir (per block in the doc) has no field; kept in rulesText.rir. tempo likewise (ladderSteps, P5).',
      '6. Ladders list ids only, starting at the session exercise; regressions are in rulesText.regressions. Slots without a second id (step-up, row, lateral raise: tempo only) have no ladder. The doc gives no advance condition for the push-up and core ladders; used "every working set at the top of the range". side_plank is timed and side_plank_reach is reps.',
      '7. equipment is ["dumbbell"] only: band and bench are optional in the doc, so the gate must not swap to band_row or bench moves for someone who may not own them.',
      '8. A knee or hip flag no longer removes impact (owner decision 2026-10-02); the doc text predates it. No exercise in this series is tagged impact, so nothing changes.',
      '9. No honestLine: the intro copy (§5) has none. screenMaxAgeDays not stated: default.',
      '10. Cues: one line per key; second lines for start, goblet_squat, one_arm_db_row, db_rdl and finish, and the capped/tempo/after-set/top-of-range/pain moments, are in cuesExtra. "Capped stage, last set" was not mapped to lastRound because it applies only in the capped stage.',
    ].join(' '),
  },
}
