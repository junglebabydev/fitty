// Blueprint, Bryan Johnson's sample week (his "11 min of daily exercise" newsletter, 2026). Data only: the engine
// reads it. One week, Monday to Sunday, repeated. Changes from the newsletter, all for joints:
//   - Both HIIT days run on the bike (he lists running, cycling or bodyweight for sprints; cycling, rowing, an incline
//     walk or a stair climber for the 4×4). Swap the machine in the moment if you prefer.
//   - "Lunges" are reverse lunges; Monday's "kettlebell swings and/or farmer's walks" is swings (Wednesday has carries).
//   - Wednesday's strength ("compound moves for areas not sore from Monday") is a hinge, a row, a bridge and a carry.
//   - Tuesday gets 3 easy minutes before the sprints; the newsletter does not mention a warm-up for that day.
import type { Block, Program } from '../../domain/programs'

/**
 * Five easy minutes before strength days ("general warm-up: cycling, walking, etc."). Never an id the session's work
 * also uses: Focus Mode counts logged sets per exercise id, so a shared id would count the warm-up as work.
 */
const EASY_START: Block = {
  shape: 'steady', exerciseId: 'stationary_bike', minutes: 5, effort: 'easy, or a brisk walk, building to a light sweat', role: 'warmup', section: 'Warm-up',
}

/** "5 min dynamic warm-up: arm circles, leg swings, high knees, lateral lunges." */
const DYNAMIC: Block = {
  shape: 'circuit', rounds: 1, role: 'warmup', section: 'Warm-up',
  stations: [
    { exerciseId: 'arm_circles', seconds: 60 },
    { exerciseId: 'leg_swings', seconds: 30, perSide: true },
    { exerciseId: 'high_knees', seconds: 45 },
    { exerciseId: 'lateral_lunge', seconds: 45 },
  ],
  restBetweenStationsSec: 10,
  restBetweenRoundsSec: 0,
}

export const program: Program = {
  id: 'blueprint',
  status: 'ready',
  title: 'Blueprint',
  promise: "Bryan Johnson's week: strength, cardio, mobility, every day.",
  description:
    "Bryan Johnson's sample week. Strength twice, sprint intervals, a Norwegian 4×4, strength with yoga, a play day and active recovery. Sessions run 15 to 60 minutes. Hard cardio is on the bike, which is kind to the knees. Keep hard sessions at least 4 hours before bed.",
  weeks: 12,
  sessionsPerWeek: 7,
  minutes: [15, 60],
  equipment: ['dumbbell', 'kettlebell', 'bike'],
  needs: 'A pair of dumbbells, a kettlebell, a bench and a bike. Any cardio you enjoy for the zone 2 blocks.',
  timePerWeek: 'About 5 hours (7 days, 15 to 60 minutes).',
  why: [
    { text: 'About 11 minutes of activity a day was linked to a 23% lower risk of early death.', source: 2 },
    { text: 'In a small trial, three short sprint sessions a week matched five 40–60 minute rides for artery health.', source: 3 },
    { text: 'Four rounds of 4 minutes hard raised VO2max more than easier training of the same total work.', source: 4 },
  ],
  honestLine: { text: "This is Bryan Johnson's own routine, shared in his newsletter. It has not been tested as a programme.", sources: [1] },
  sources: [
    { n: 1, kind: 'programme', url: 'https://protocol.bryanjohnson.com/', citation: 'Johnson B. Blueprint protocol: exercise. His newsletter "11 min of daily exercise" gives the sample 7-day routine used here. 2026.' },
    { n: 2, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/36854652/', citation: 'Garcia L et al. Non-occupational physical activity and risk of cardiovascular disease, cancer and mortality outcomes: a dose-response meta-analysis of large prospective studies. British Journal of Sports Medicine. 2023.' },
    { n: 3, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/18434437/', citation: 'Rakobowchuk M et al. Sprint interval and traditional endurance training induce similar improvements in peripheral arterial stiffness and flow-mediated dilation in healthy humans. American Journal of Physiology. 2008. Controlled trial (20 people, 6 weeks; 4–6 × 30 s sprints 3 days a week vs 40–60 min cycling 5 days a week).' },
    { n: 4, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/17414804/', citation: 'Helgerud J et al. Aerobic high-intensity intervals improve VO2max more than moderate training. Medicine & Science in Sports & Exercise. 2007.' },
    { n: 5, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', citation: "Riebe D et al. Updating ACSM's Recommendations for Exercise Preparticipation Health Screening. Medicine & Science in Sports & Exercise. 2015." },
  ],

  // The shared pre-start questions (ACSM screening [5]), as in the other series.
  screen: [
    {
      id: 'cardiac_symptoms',
      text: 'In the last 3 months, have you had chest pain, fainting, palpitations or unusual breathlessness when active?',
      onYes: 'wait',
      yesCopy: 'Please see a clinician before you start. The sprints and the 4×4 push your heart hard.',
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
      yesCopy: 'Your profile decides the swaps. Knee or hip: wall sits instead of squats and lunges. Back: bridges instead of swings and hinges. Neck or shoulder: no overhead pressing.',
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
      key: 'w1d1', week: 1, name: 'Strength + zone 2', type: 'strength', minutes: 60,
      blocks: [
        EASY_START,
        DYNAMIC,
        { shape: 'sets', exerciseId: 'goblet_squat', sets: 3, reps: [10, 15], restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'push_up', sets: 3, reps: [8, 12], restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'one_arm_db_row', sets: 3, reps: [10, 12], perSide: true, restSec: 45, section: 'Strength' },
        { shape: 'sets', exerciseId: 'kb_swing', sets: 3, seconds: [30, 30], restSec: 45, section: 'Strength' },
        { shape: 'sets', exerciseId: 'plank', sets: 3, seconds: [20, 30], restSec: 30, section: 'Strength' },
        {
          shape: 'circuit', rounds: 2, section: 'Stability',
          stations: [
            { exerciseId: 'single_leg_balance', seconds: 30, perSide: true },
            { exerciseId: 'bird_dog', reps: [6, 8], perSide: true },
            { exerciseId: 'single_leg_rdl_bw', reps: [6, 8], perSide: true },
            { exerciseId: 'dead_bug', reps: [6, 8], perSide: true },
          ],
          restBetweenStationsSec: 15,
          restBetweenRoundsSec: 30,
        },
        { shape: 'steady', exerciseId: 'zone2_cardio', minutes: 25, effort: 'zone 2: you can talk, but you are working', section: 'Cardio' },
      ],
    },
    {
      key: 'w1d2', week: 1, name: 'Sprints + zone 2', type: 'conditioning', minutes: 15,
      blocks: [
        { shape: 'steady', exerciseId: 'stationary_bike', minutes: 3, effort: 'easy spin', role: 'warmup', section: 'Warm-up' },
        {
          shape: 'intervals', rounds: 8, section: 'Sprints',
          work: { exerciseId: 'bike_intervals', seconds: 20, effort: 'all-out' },
          rest: { exerciseId: 'stationary_bike', seconds: 20, effort: 'very easy (take 40 s if you are new)' },
        },
        { shape: 'steady', exerciseId: 'zone2_cardio', minutes: 6, effort: 'zone 2: 60–70% of max heart rate', section: 'Cardio' },
      ],
    },
    {
      key: 'w1d3', week: 1, name: 'Strength + yoga', type: 'strength', minutes: 60,
      blocks: [
        {
          shape: 'circuit', rounds: 2, role: 'warmup', section: 'Dynamic stretching',
          stations: [
            { exerciseId: 'arm_circles', seconds: 45 },
            { exerciseId: 'wall_slide', seconds: 45 },
            { exerciseId: 'thread_the_needle', seconds: 30, perSide: true },
            { exerciseId: 'hip_circles', seconds: 45 },
          ],
          restBetweenStationsSec: 10,
          restBetweenRoundsSec: 0,
        },
        { shape: 'sets', exerciseId: 'db_rdl', sets: 3, reps: [8, 12], restSec: 75, section: 'Strength' },
        { shape: 'sets', exerciseId: 'bent_over_db_row', sets: 3, reps: [10, 12], restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'glute_bridge', sets: 3, reps: [12, 15], restSec: 45, section: 'Strength' },
        { shape: 'sets', exerciseId: 'farmers_carry', sets: 3, seconds: [30, 40], restSec: 60, section: 'Strength' },
        {
          shape: 'circuit', rounds: 3, section: 'Yoga',
          stations: [
            { exerciseId: 'cat_cow', seconds: 60 },
            { exerciseId: 'tree_pose', seconds: 30, perSide: true },
            { exerciseId: 'butterfly_stretch', seconds: 60 },
            { exerciseId: 'cobra_pose', seconds: 30 },
          ],
          restBetweenStationsSec: 10,
          restBetweenRoundsSec: 20,
        },
        {
          shape: 'circuit', rounds: 1, role: 'cooldown', section: 'Cool-down',
          stations: [
            { exerciseId: 'hamstring_stretch', seconds: 45, perSide: true },
            { exerciseId: 'childs_pose', seconds: 60 },
          ],
          restBetweenStationsSec: 10,
          restBetweenRoundsSec: 0,
        },
      ],
    },
    {
      key: 'w1d4', week: 1, name: 'Norwegian 4×4', type: 'conditioning', minutes: 40,
      blocks: [
        { shape: 'steady', exerciseId: 'zone2_cardio', minutes: 10, effort: 'easy jog, cycle or row, building to a light sweat', role: 'warmup', section: 'Warm-up' },
        {
          shape: 'intervals', rounds: 4, section: '4 × 4',
          work: { exerciseId: 'bike_intervals', seconds: 240, effort: 'hard: 85–95% of max heart rate' },
          rest: { exerciseId: 'stationary_bike', seconds: 180, effort: 'easy: zone 2, let your heart rate settle' },
        },
        { shape: 'steady', exerciseId: 'stationary_bike', minutes: 5, effort: 'easy, then a few stretches', role: 'cooldown', section: 'Cool-down' },
      ],
    },
    {
      key: 'w1d5', week: 1, name: 'Strength + stability', type: 'strength', minutes: 50,
      blocks: [
        EASY_START,
        DYNAMIC,
        { shape: 'sets', exerciseId: 'reverse_lunge', sets: 3, reps: [10, 10], perSide: true, restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'db_shoulder_press', sets: 3, reps: [10, 10], restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'db_bench_press', sets: 3, reps: [10, 10], restSec: 60, section: 'Strength' },
        { shape: 'sets', exerciseId: 'side_plank', sets: 2, seconds: [20, 30], perSide: true, restSec: 30, section: 'Strength' },
        { shape: 'sets', exerciseId: 'db_step_up', sets: 3, reps: [10, 10], perSide: true, restSec: 60, section: 'Strength' },
        {
          shape: 'circuit', rounds: 2, section: 'Stability',
          stations: [
            { exerciseId: 'single_leg_toe_touch', reps: [6, 8], perSide: true },
            { exerciseId: 'plank_shoulder_tap', reps: [10, 16] },
            { exerciseId: 'dead_bug', reps: [6, 8], perSide: true },
          ],
          restBetweenStationsSec: 15,
          restBetweenRoundsSec: 30,
        },
      ],
    },
    {
      key: 'w1d6', week: 1, name: 'Play', type: 'conditioning', minutes: 60,
      blocks: [
        { shape: 'steady', exerciseId: 'play', minutes: 60, effort: 'hike, bike, swim or a game with friends', section: 'Play' },
      ],
    },
    {
      key: 'w1d7', week: 1, name: 'Active recovery', type: 'mobility', minutes: 40,
      blocks: [
        {
          shape: 'circuit', rounds: 3, section: 'Yoga and stretching',
          stations: [
            { exerciseId: 'cat_cow', seconds: 60 },
            { exerciseId: 'thread_the_needle', seconds: 30, perSide: true },
            { exerciseId: 'butterfly_stretch', seconds: 60 },
            { exerciseId: 'cobra_pose', seconds: 30 },
            { exerciseId: 'childs_pose', seconds: 60 },
            { exerciseId: 'hamstring_stretch', seconds: 30, perSide: true },
          ],
          restBetweenStationsSec: 10,
          restBetweenRoundsSec: 20,
        },
        { shape: 'steady', exerciseId: 'meditation', minutes: 15, effort: 'sit, breathe, notice', section: 'Meditation' },
      ],
    },
  ],
  repeats: Array.from({ length: 11 }, (_, i) => ({ week: i + 2, copyOf: 1 })),

  paths: {
    standard: { label: 'Standard' },
    'low-impact': {
      label: 'Knee and hip: wall sits instead of squats and lunges, no jumping',
      swaps: {
        goblet_squat: { id: 'wall_sit', sets: 3, seconds: [30, 45] },
        reverse_lunge: { id: 'wall_sit', sets: 3, seconds: [30, 45] },
        high_knees: 'march_in_place',
        lateral_lunge: 'hip_circles',
        childs_pose: null,
      },
    },
    back: {
      label: 'Back-friendly: bridges instead of swings and hinges',
      swaps: {
        goblet_squat: { id: 'wall_sit', sets: 3, seconds: [30, 45] },
        kb_swing: { id: 'glute_bridge', sets: 3, reps: [12, 15] },
        db_rdl: { id: 'single_leg_glute_bridge', sets: 3, reps: [10, 12], perSide: true },
        bent_over_db_row: { id: 'one_arm_db_row', perSide: true },
      },
    },
    'no-overhead': { label: 'No overhead', swaps: { db_shoulder_press: 'lateral_raise', wall_slide: null } },
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
    { sessionKey: 'w1d1', name: 'Blueprint strength', fact: '60 min, dumbbells and a kettlebell' },
    { sessionKey: 'w1d2', name: 'Blueprint sprints', fact: '15 min on the bike' },
    { sessionKey: 'w1d4', name: 'Norwegian 4×4', fact: '40 min on the bike' },
  ],
  cues: {
    start: 'A mix beats any single exercise. Consistency wins.',
    rest: 'Breathe. Go again when your breath settles.',
    lastRound: 'Last round. Keep it controlled.',
    finish: 'Done. Ten minutes a day already counts.',
    zone2_cardio: 'You can talk, but you are working.',
    stationary_bike: 'Easy spin. Save the effort for later.',
    bike_intervals: 'Hard means hard. Easy means easy.',
    goblet_squat: 'Weight at your chest, sit between your heels.',
    push_up: 'One straight line. Knees or a wall is fine.',
    one_arm_db_row: 'Pull the elbow back to your hip.',
    kb_swing: 'Snap the hips. The arms just steer.',
    plank: 'Squeeze the glutes, ribs down, breathe.',
    single_leg_balance: 'Eyes on one spot, hips level.',
    farmers_carry: 'Stand tall, shoulders down, walk slowly.',
    reverse_lunge: 'Step back and lower the back knee gently.',
    db_shoulder_press: 'Ribs down, press straight up.',
    db_step_up: 'Whole foot on the step, push through the heel.',
    meditation: 'Notice the breath. Come back when you wander.',
    play: 'Have fun. It all counts.',
  },
}
