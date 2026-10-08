// BFT week: Body Fit Training's six classes as one repeating week, Monday to Saturday, as BFT's Global program ran
// them in week 3 of its October 2026 block (Strength, Summit, Pump, HIIT, Balanced, Power), plus Blueprint's Sunday
// recovery. Data only: the engine reads it. Recreated from BFT's public posts and members' notes, not from BFT:
//   - Station lists are the six class graphics the owner shared (2026-10-07).
//   - "321" / "123" on the Strength and Pump tiles are tempo (seconds down-pause-up, or up-hold-down for pulls); the
//     tempo week is in [2] and the on-screen tempo bubble in [4]. They are in `cues`, so they show on the move.
//   - HIIT runs 35 s on, 70 s off ([2]; BFT adds 5 s of work a week). Summit, Balanced and Power timings are our reading
//     of the formats in [3]: BFT does not publish them. Solo: no partner windows, so rest replaces "you go, I go".
//   - BFT has no Sunday class; Sunday is Blueprint's active recovery.
import type { Block, Program } from '../../domain/programs'
import { program as blueprint } from './blueprint'

/** Four easy minutes before every class. Never an id a class's work uses (Focus Mode counts sets per id). */
const WARM_UP: Block = {
  shape: 'circuit', rounds: 1, role: 'warmup', section: 'Warm-up',
  stations: [
    { exerciseId: 'march_in_place', seconds: 60 },
    { exerciseId: 'arm_circles', seconds: 30 },
    { exerciseId: 'hip_circles', seconds: 30 },
    { exerciseId: 'leg_swings', seconds: 20, perSide: true },
  ],
  restBetweenStationsSec: 5,
  restBetweenRoundsSec: 0,
}

/** A BFT zone: stations in turn, `rounds` laps. */
function zone(section: string, rounds: number, stations: Extract<Block, { shape: 'circuit' }>['stations'], restBetweenStationsSec: number, restBetweenRoundsSec: number): Block {
  return { shape: 'circuit', rounds, section, stations, restBetweenStationsSec, restBetweenRoundsSec }
}

const sunday = blueprint.sessions.find((s) => s.key === 'w1d7')!

export const program: Program = {
  id: 'bft',
  status: 'ready',
  title: 'BFT',
  promise: "BFT's six classes, one a day, with Sunday to recover.",
  description:
    'Strength on Monday, Summit on Tuesday, Pump on Wednesday, HIIT on Thursday, Balanced on Friday and Power on Saturday, the way BFT studios ran them this October. Sunday is easy stretching. Sessions run 40 to 48 minutes. Knee, back or neck issues swap the moves that load them.',
  weeks: 12,
  sessionsPerWeek: 7,
  minutes: [40, 48],
  equipment: ['barbell', 'dumbbell', 'kettlebell', 'band', 'cable', 'machine', 'bike', 'treadmill'],
  needs: 'A BFT-style gym: barbell and plates, dumbbells, kettlebells, a bench, bands, a Swiss ball, a slam ball, a ski erg, a rower, an air bike and a spin bike. Missing one? Swap that move in the moment.',
  timePerWeek: 'About 5 hours (6 classes of 40 to 48 minutes, and Sunday).',
  why: [
    { text: 'The WHO advises muscle-strengthening work for all major muscles on 2 or more days a week', source: 6 },
    { text: 'Hard intervals raise aerobic fitness more than no exercise, and slightly more than steady cardio', source: 5 },
    { text: 'Each day is the class BFT studios ran that day in October 2026', source: 2 },
  ],
  honestLine: {
    text: "Recreated from BFT's public posts and members' notes; BFT is not involved. HIIT and the tempo lifts follow BFT's week; Summit, Balanced and Power timings are our best reading.",
    sources: [1, 2, 3],
  },
  sources: [
    { n: 1, kind: 'programme', url: 'https://www.bodyfittraining.au/classes', citation: 'Body Fit Training. Classes: Strength, Pump, Power, Balanced, HIIT and Summit, 50 minutes each. Official class list. 2026.' },
    { n: 2, kind: 'programme', url: 'https://www.reddit.com/r/BodyFitTrainingAus/comments/1wxb9ll/', citation: 'Member post, r/BodyFitTrainingAus. Global program week 3 (5–10 Oct 2026): Strength (lower), Summit, Pump (upper), HIIT, Balanced, Power; tempo reps in Strength and Pump; HIIT 35 s work. 2026.' },
    { n: 3, kind: 'programme', url: 'https://www.reddit.com/r/BodyFitTrainingAus/comments/1scrukc/', citation: 'Member post, r/BodyFitTrainingAus. How the class formats run at three studios: zones, stations, work and change windows, sets. 2026.' },
    { n: 4, kind: 'programme', url: 'https://www.reddit.com/r/BodyFitTrainingAus/comments/1uos529/', citation: 'Member post, r/BodyFitTrainingAus. The tempo bubble BFT shows on a station screen. 2026.' },
    { n: 5, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/38760916/', citation: 'Poon ET et al. High-intensity interval training and cardiorespiratory fitness in adults: An umbrella review of systematic reviews and meta-analyses. Scandinavian Journal of Medicine & Science in Sports. 2024.' },
    { n: 6, kind: 'guideline', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/', citation: 'Bull FC, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine. 2020.' },
    { n: 7, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', citation: "Riebe D et al. Updating ACSM's Recommendations for Exercise Preparticipation Health Screening. Medicine & Science in Sports & Exercise. 2015." },
  ],

  // The shared pre-start questions (ACSM screening [7]), as in the other series.
  screen: [
    {
      id: 'cardiac_symptoms',
      text: 'In the last 3 months, have you had chest pain, fainting, palpitations or unusual breathlessness when active?',
      onYes: 'wait',
      yesCopy: 'Please see a clinician before you start. HIIT and Summit push your heart hard.',
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
      yesCopy: 'Please talk to your midwife or clinician before starting.',
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
      id: 'joint_pain',
      text: 'Do you have pain in a knee, a hip, your back, your neck or a shoulder that changes how you move?',
      onYes: 'note',
      yesCopy: 'Your profile decides the swaps. Knee or hip: no jumping or deep squats. Back: no heavy squats, deadlifts or slams. Neck or shoulder: no overhead work.',
      fromFlags: ['knee_left', 'knee_right', 'hip', 'back_lower', 'back_mid', 'back_upper', 'neck', 'shoulder'],
    },
  ],

  stopSigns: [
    {
      sign: 'Chest pain or pressure, fainting or near-fainting, a racing or irregular heartbeat, or breathlessness out of proportion to the effort',
      action: 'Stop now and sit or lie down. Do not resume today. If chest pain lasts more than a few minutes, call emergency services.',
    },
    {
      sign: 'Sharp or joint pain, as opposed to the burn of a hard set',
      action: 'Stop that exercise and log a pain flag. The gate swaps or removes it for the rest of the session.',
    },
    {
      sign: 'Numbness, tingling or pain spreading down an arm or leg; a knee locking or giving way',
      action: 'Stop the session. The app suggests an assessment before the next one.',
    },
  ],

  sessions: [
    {
      key: 'w1d1', week: 1, name: 'Strength · lower body', type: 'strength', minutes: 40,
      blocks: [
        WARM_UP,
        { shape: 'sets', exerciseId: 'bb_back_squat', sets: 4, reps: [6, 8], restSec: 90, section: 'Strength · tempo' },
        { shape: 'sets', exerciseId: 'bb_sumo_deadlift', sets: 4, reps: [6, 8], restSec: 90, section: 'Strength · tempo' },
        { shape: 'sets', exerciseId: 'lateral_lunge', sets: 3, reps: [6, 8], perSide: true, restSec: 60, section: 'Strength · tempo' },
        { shape: 'sets', exerciseId: 'kb_rdl', sets: 3, reps: [8, 10], restSec: 60, section: 'Strength · tempo' },
      ],
    },
    {
      key: 'w1d2', week: 1, name: 'Summit', type: 'conditioning', minutes: 48,
      blocks: [
        WARM_UP,
        zone('Summit', 2, [
          { exerciseId: 'ski_erg', seconds: 120 },
          { exerciseId: 'assault_bike', seconds: 120 },
          { exerciseId: 'slam_hop_over', seconds: 120 },
          { exerciseId: 'jump_rope', seconds: 120 },
          { exerciseId: 'track_run', seconds: 120 },
          { exerciseId: 'rowing_machine', seconds: 120 },
          { exerciseId: 'battle_rope', seconds: 120 },
          { exerciseId: 'bike_climb', seconds: 120 },
        ], 40, 120),
      ],
    },
    {
      key: 'w1d3', week: 1, name: 'Pump · upper body', type: 'strength', minutes: 45,
      blocks: [
        WARM_UP,
        zone('Zone 1', 3, [{ exerciseId: 'db_fly', reps: [10, 12] }, { exerciseId: 'db_overhead_triceps', reps: [10, 12] }], 30, 45),
        zone('Zone 2 · tempo', 4, [{ exerciseId: 'bb_bench_press', reps: [8, 8] }, { exerciseId: 'bb_row', reps: [8, 8] }], 45, 60),
        zone('Zone 3', 3, [{ exerciseId: 'arnold_press', reps: [10, 12] }, { exerciseId: 'one_arm_db_row', reps: [10, 12], perSide: true }], 30, 45),
      ],
    },
    {
      key: 'w1d4', week: 1, name: 'HIIT', type: 'conditioning', minutes: 46,
      blocks: [
        WARM_UP,
        zone('HIIT', 2, [
          { exerciseId: 'ski_erg', seconds: 35 },
          { exerciseId: 'assault_bike', seconds: 35 },
          { exerciseId: 'wall_ball', seconds: 35 },
          { exerciseId: 'treadmill_push', seconds: 35 },
          { exerciseId: 'burpee', seconds: 35 },
          { exerciseId: 'ball_slam', seconds: 35 },
          { exerciseId: 'thruster', seconds: 35 },
          { exerciseId: 'rowing_machine', seconds: 35 },
          { exerciseId: 'bike_climb', seconds: 35 },
          { exerciseId: 'battle_rope', seconds: 35 },
          { exerciseId: 'double_under', seconds: 35 },
          { exerciseId: 'track_run', seconds: 35 },
        ], 70, 90),
      ],
    },
    {
      key: 'w1d5', week: 1, name: 'Balanced', type: 'strength', minutes: 45,
      blocks: [
        WARM_UP,
        zone('Zone 1', 3, [
          { exerciseId: 'swiss_ball_leg_curl', seconds: 40 },
          { exerciseId: 'ball_back_extension', seconds: 40 },
          { exerciseId: 'sl_bridge_bench', seconds: 20, perSide: true },
          { exerciseId: 'plank_shoulder_tap', seconds: 40 },
        ], 20, 30),
        zone('Zone 2', 3, [
          { exerciseId: 'db_pullover_bridge', seconds: 40 },
          { exerciseId: 'db_fly', seconds: 40 },
          { exerciseId: 'arabesque', seconds: 20, perSide: true },
          { exerciseId: 'pallof_press_overhead', seconds: 40 },
        ], 20, 30),
        zone('Zone 3', 3, [
          { exerciseId: 'scapular_roll', seconds: 40 },
          { exerciseId: 'kb_halo', seconds: 40 },
          { exerciseId: 'kb_bottoms_up_press', seconds: 20, perSide: true },
          { exerciseId: 'straight_arm_pulldown', seconds: 40 },
        ], 20, 30),
      ],
    },
    {
      key: 'w1d6', week: 1, name: 'Power', type: 'strength', minutes: 40,
      blocks: [
        WARM_UP,
        zone('Zone 1', 4, [{ exerciseId: 'db_standing_press', reps: [6, 6] }, { exerciseId: 'landmine_lunge_press', reps: [6, 6], perSide: true }], 20, 60),
        zone('Zone 2', 4, [{ exerciseId: 'kb_suitcase_squat', reps: [6, 8] }, { exerciseId: 'bb_hang_pull', reps: [6, 6] }], 20, 60),
        zone('Zone 3', 4, [{ exerciseId: 'kneeling_hip_thrust', reps: [10, 12] }, { exerciseId: 'kb_swing', reps: [12, 15] }], 20, 60),
      ],
    },
    { ...sunday, key: 'w1d7', name: 'Recovery' },
  ],
  repeats: Array.from({ length: 11 }, (_, i) => ({ week: i + 2, copyOf: 1 })),

  // Each path stands alone and in any order with the others: a swap target is never a move another path removes.
  paths: {
    standard: { label: 'Standard' },
    'low-impact': {
      label: 'Knee and hip: no jumping, no deep squats',
      swaps: {
        bb_back_squat: { id: 'leg_press', sets: 4, reps: [8, 10] },
        lateral_lunge: { id: 'band_monster_walk', sets: 3, reps: [10, 12], perSide: true },
        kb_suitcase_squat: 'glute_bridge',
        thruster: 'arnold_press',
        wall_ball: 'db_standing_press',
        burpee: 'mountain_climber',
        double_under: 'shadow_boxing',
        jump_rope: 'step_jack',
        track_run: 'stationary_bike',
        treadmill_push: 'incline_walk',
        slam_hop_over: 'ball_slam',
        childs_pose: null,
      },
    },
    back: {
      label: 'Back: no heavy squats, deadlifts or slams',
      swaps: {
        bb_back_squat: { id: 'leg_press', sets: 4, reps: [8, 10] },
        bb_sumo_deadlift: { id: 'hip_thrust', sets: 4, reps: [8, 10] },
        thruster: 'arnold_press',
        ball_slam: 'sled_push',
        slam_hop_over: 'sled_push',
      },
    },
    'no-overhead': {
      label: 'Neck or shoulder: no overhead work',
      swaps: {
        ski_erg: 'elliptical',
        ball_slam: 'sled_push',
        slam_hop_over: 'sled_push',
        wall_ball: 'lateral_raise',
        db_standing_press: 'lateral_raise',
        thruster: 'db_front_raise',
        arnold_press: 'db_front_raise',
        db_overhead_triceps: 'band_pushdown',
        db_pullover_bridge: 'glute_bridge',
        pallof_press_overhead: 'pallof_press',
        scapular_roll: 'band_pull_apart',
        kb_halo: 'prone_y_t_raise',
        kb_bottoms_up_press: 'face_pull',
        landmine_lunge_press: 'half_kneeling_pallof',
      },
    },
  },
  flagPaths: { knee: 'low-impact', hip: 'low-impact', back: 'back', neck: 'no-overhead', shoulder: 'no-overhead' },
  advance: {
    minCompleted: 4,
    maxPainToAdvance: 3,
    dropBackPainAtLeast: 6,
    repeatIfFeltHard: false,
    longGapDays: 14,
  },
  standalone: [
    { sessionKey: 'w1d4', name: 'HIIT', fact: '46 min, 12 stations, 35 s on' },
    { sessionKey: 'w1d2', name: 'Summit', fact: '48 min, 8 stations, 2 min each' },
  ],
  cues: {
    start: 'One station at a time. Own every rep.',
    rest: 'Breathe. Get to the next station.',
    lastRound: 'Last round. Empty the tank.',
    finish: 'Class done. Same time tomorrow.',
    bb_back_squat: 'Tempo 3-2-1: 3 s down, pause, 1 s up.',
    bb_sumo_deadlift: 'Tempo 1-2-3: 1 s up, hold, 3 s down.',
    lateral_lunge: 'Tempo 3-2-1: sit into the hip, pause, push.',
    kb_rdl: 'Tempo 3-2-1: hips back slowly, pause, snap up.',
    bb_bench_press: 'Tempo 3-2-1: 3 s down, pause, 1 s press.',
    bb_row: 'Tempo 1-2-3: pull fast, squeeze, 3 s down.',
    ski_erg: 'Hinge and drive the handles past your hips.',
    assault_bike: 'Push and pull. Arms and legs together.',
    rowing_machine: 'Legs, body, arms. Then arms, body, legs.',
    battle_rope: 'Fast waves from the shoulders, knees soft.',
    bike_climb: 'Heavy gear, stand up, push down.',
    wall_ball: 'Squat, drive, throw to the target.',
    thruster: 'One move: squat drives the press.',
    burpee: 'Chest down, jump up. Find a rhythm.',
    kb_swing: 'Snap the hips. The arms just steer.',
    db_standing_press: 'Dip, drive, punch it up fast.',
    bb_hang_pull: 'Hips first, then elbows high.',
    kb_suitcase_squat: 'Down with control, up fast.',
    arabesque: 'Long line from the plate to your heel.',
    kb_bottoms_up_press: 'Squeeze the handle. Keep the bell upright.',
  },
}
