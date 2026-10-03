// Bodyweight Anywhere, transcribed from docs/programs/bodyweight.md (Oct 2026).
// Slot blocks carry the starting rung (rung 1); at run time the user's current rung in `ladders` replaces it.
import type { Block, Program } from '../../domain/programs'

/** Two minutes of easy marching before every session. Not logged; exempt from the duplicate-id test. */
const warmup: Block = { shape: 'sets', exerciseId: 'march_in_place', sets: 1, seconds: [120, 120], restSec: 30, role: 'warmup' }

export const program: Program = {
  id: 'bodyweight',
  status: 'ready',
  title: 'Bodyweight Anywhere',
  promise: 'Get stronger in any room, with nothing to carry.',
  description:
    'Three short sessions a week using only your body, a chair and a table or door. Each movement has a ladder of harder versions. When your reps get easy, you move up a rung, so the work stays hard enough to count. Two strength days and one circuit day, for 8 weeks.',
  weeks: 8,
  sessionsPerWeek: 3,
  minutes: [20, 30],
  equipment: ['bodyweight'],
  needs: 'a floor, a sturdy chair, and a heavy table or a solid door with a towel.',
  timePerWeek: 'about 60–85 minutes (3 sessions of 20–30 minutes).',
  why: [
    { text: 'In a small trial, push-ups matched to a light bench press built similar strength and muscle in 8 weeks', source: 2 },
    { text: 'With light loads, sets to failure built muscle; sets stopped far short did not, in one trial', source: 7 },
    { text: 'WHO recommends strength work for all major muscle groups on two or more days a week', source: 10 },
  ],
  honestLine: { text: 'Heavy weights still win for maximal strength. This series builds a strong base.', sources: [6, 8] },
  sources: [
    { n: 1, citation: 'Calatayud J et al. Bench press and push-up at comparable levels of muscle activity results in similar strength gains. J Strength Cond Res. 2015.', url: 'https://pubmed.ncbi.nlm.nih.gov/24983847/', kind: 'rct' },
    { n: 2, citation: 'Kikuchi N, Nakazato K. Low-load bench press and push-up induce similar muscle hypertrophy and strength gain. J Exerc Sci Fit. 2017.', url: 'https://pubmed.ncbi.nlm.nih.gov/29541130/', kind: 'rct' },
    { n: 3, citation: 'Kotarsky CJ et al. Effect of progressive calisthenic push-up training on muscle strength and thickness. J Strength Cond Res. 2018.', url: 'https://pubmed.ncbi.nlm.nih.gov/29466268/', kind: 'rct' },
    { n: 4, citation: 'Ebben WP et al. Kinetic analysis of several variations of push-ups. J Strength Cond Res. 2011.', url: 'https://pubmed.ncbi.nlm.nih.gov/21873902/', kind: 'cohort' },
    { n: 5, citation: 'Thomas E et al. The effects of a calisthenics training intervention on posture, strength and body composition. Isokinetics and Exercise Science. 2017.', url: 'https://doi.org/10.3233/IES-170001', kind: 'cohort' },
    { n: 6, citation: 'Schoenfeld BJ et al. Strength and hypertrophy adaptations between low- vs. high-load resistance training: a systematic review and meta-analysis. J Strength Cond Res. 2017.', url: 'https://pubmed.ncbi.nlm.nih.gov/28834797/', kind: 'meta-analysis' },
    { n: 7, citation: 'Lasevicius T et al. Muscle failure promotes greater muscle hypertrophy in low-load but not in high-load resistance training. J Strength Cond Res. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/31895290/', kind: 'rct' },
    { n: 8, citation: 'Currier BS et al. American College of Sports Medicine Position Stand. Resistance training prescription for muscle function, hypertrophy, and physical performance in healthy adults: an overview of reviews. Med Sci Sports Exerc. 2026.', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/', kind: 'guideline' },
    { n: 9, citation: 'Robinson ZP et al. Exploring the dose-response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy: a series of meta-regressions. Sports Med. 2024.', url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/', kind: 'meta-analysis' },
    { n: 10, citation: 'Bull FC et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/', kind: 'guideline' },
    { n: 11, citation: 'Kassiano W et al. Does varying resistance exercises promote superior muscle hypertrophy and strength gains? A systematic review. J Strength Cond Res. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/35438660/', kind: 'review' },
    { n: 12, citation: 'Rodríguez MÁ et al. Effect of exercise snacks on fitness and cardiometabolic health in physically inactive individuals: systematic review and meta-analysis. Br J Sports Med. 2026.', url: 'https://pubmed.ncbi.nlm.nih.gov/41057224/', kind: 'meta-analysis' },
    { n: 13, citation: 'Lee J et al. Effects of participation in an eight-week, online video body-weight resistance training on cognitive function and physical fitness in older adults: a randomized control trial. Geriatr Nurs. 2024.', url: 'https://pubmed.ncbi.nlm.nih.gov/38788559/', kind: 'rct' },
    { n: 14, citation: "Riebe D et al. Updating ACSM's recommendations for exercise preparticipation health screening. Med Sci Sports Exerc. 2015.", url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', kind: 'consensus' },
  ],
  screen: [
    {
      id: 'heart',
      text: 'Has a doctor said you have a heart condition, or do you get chest pain, fainting or unusual breathlessness when you exert yourself?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from your doctor first.',
    },
    {
      id: 'pregnant',
      text: 'Are you pregnant?',
      onYes: 'wait',
      yesCopy: 'Please talk to your midwife or doctor about exercise in pregnancy.',
      shared: 'pregnant',
    },
    {
      id: 'recent_birth',
      text: 'Have you had a baby in the last 12 months?',
      onYes: 'suggest:postpartum',
      yesCopy: 'Use the Postpartum series first, unless you have already finished it.',
      shared: 'recent_birth',
    },
    {
      id: 'surgery',
      text: 'Have you had surgery, or an injury that needed treatment, in the last 3 months?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from your surgeon or physio, then confirm.',
    },
    {
      id: 'knee_hip',
      text: 'Do your knees or hips hurt on stairs or when squatting, or do you have a knee or hip condition flag?',
      onYes: 'path:low-impact',
      yesCopy: 'Your squat slot uses the knee and hip path: sit-to-stand on a chair, then low step-ups.',
      fromFlags: ['knee_left', 'knee_right', 'hip'],
    },
    {
      id: 'hands',
      text: 'Do your shoulders or wrists hurt when you take weight on your hands?',
      onYes: 'path:push-capped',
      yesCopy: 'Push-ups stop at the floor push-up, and the circuit swaps mountain climbers for dead bugs.',
      fromFlags: ['shoulder'],
    },
    {
      id: 'radiating_back_pain',
      text: 'Do you have back pain that travels down a leg, or new numbness or weakness in a leg?',
      onYes: 'wait',
      yesCopy: "This needs a clinician's check before training.",
    },
  ],
  stopSigns: [
    {
      sign: 'Chest pain or pressure, fainting or near-fainting, a racing or irregular heartbeat, breathlessness out of proportion to the effort',
      action: '"Stop now and sit down. If it does not settle within a few minutes, call emergency services." Ends the session and locks the series until the user confirms they have seen a doctor.',
    },
    {
      sign: 'Sharp or pinching joint pain (not the burn of effort)',
      action: '"Stop this exercise." Logs a pain tap: P4 drops a rung and the symptom check opens.',
    },
    {
      sign: 'Pain that is worse the next day and still worse at the next session',
      action: 'Runs the symptom check before the session. The symptom gate decides the substitutions.',
    },
    {
      sign: 'Severe muscle pain with swelling, or very dark urine, in the days after a session',
      action: '"Please get medical advice today." Pauses the series. Coaching convention, no source here: watch hardest in the first week, after many high-rep sets to near failure.',
    },
    {
      sign: 'Dizziness in a plank or bridge',
      action: '"Breathe out on effort and don\'t hold your breath." If it repeats, the app treats it as a stop sign in row 1.',
    },
  ],
  sessions: [
    // ---------- Week 1 (placement week); week 2 repeats it ----------
    {
      key: 'w1d1', week: 1, name: 'Sets A', type: 'strength', minutes: 22,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 2, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 2, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 2, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'hinge', exerciseId: 'glute_bridge', sets: 2, reps: [10, 20], restSec: 45 },
        { shape: 'sets', slot: 'coreA', exerciseId: 'dead_bug', sets: 2, reps: [6, 10], restSec: 45, perSide: true },
      ],
    },
    {
      key: 'w1d2', week: 1, name: 'Circuit', type: 'strength', minutes: 20,
      blocks: [
        warmup,
        {
          shape: 'circuit', rounds: 3,
          stations: [
            { slot: 'push', exerciseId: 'incline_push_up', seconds: 30 },
            { slot: 'squat', exerciseId: 'bodyweight_squat', seconds: 30 },
            { slot: 'pull', exerciseId: 'towel_door_row', seconds: 30 },
            { slot: 'hinge', exerciseId: 'glute_bridge', seconds: 30 },
            { slot: 'conditioning', exerciseId: 'mountain_climber', seconds: 30 },
          ],
          restBetweenStationsSec: 30, restBetweenRoundsSec: 60,
        },
      ],
    },
    {
      key: 'w1d3', week: 1, name: 'Sets B', type: 'strength', minutes: 22,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 2, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 2, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 2, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'hingeStanding', exerciseId: 'single_leg_rdl_bw', sets: 2, reps: [8, 12], restSec: 45, perSide: true },
        { shape: 'sets', slot: 'coreB', exerciseId: 'side_plank', sets: 2, seconds: [20, 40], restSec: 30, perSide: true },
      ],
    },

    // ---------- Week 3 (volume step); week 4 repeats it ----------
    {
      key: 'w3d1', week: 3, name: 'Sets A', type: 'strength', minutes: 30,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 3, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 3, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 3, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'hinge', exerciseId: 'glute_bridge', sets: 3, reps: [10, 20], restSec: 45 },
        { shape: 'sets', slot: 'coreA', exerciseId: 'dead_bug', sets: 2, reps: [6, 10], restSec: 45, perSide: true },
      ],
    },
    {
      key: 'w3d2', week: 3, name: 'Circuit', type: 'strength', minutes: 20,
      blocks: [
        warmup,
        {
          shape: 'circuit', rounds: 3,
          stations: [
            { slot: 'push', exerciseId: 'incline_push_up', seconds: 40 },
            { slot: 'squat', exerciseId: 'bodyweight_squat', seconds: 40 },
            { slot: 'pull', exerciseId: 'towel_door_row', seconds: 40 },
            { slot: 'hinge', exerciseId: 'glute_bridge', seconds: 40 },
            { slot: 'conditioning', exerciseId: 'mountain_climber', seconds: 40 },
          ],
          restBetweenStationsSec: 20, restBetweenRoundsSec: 60,
        },
      ],
    },
    {
      key: 'w3d3', week: 3, name: 'Sets B', type: 'strength', minutes: 30,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 3, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 3, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 3, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'hingeStanding', exerciseId: 'single_leg_rdl_bw', sets: 3, reps: [8, 12], restSec: 45, perSide: true },
        { shape: 'sets', slot: 'coreB', exerciseId: 'side_plank', sets: 2, seconds: [20, 40], restSec: 30, perSide: true },
      ],
    },

    // ---------- Week 5 (circuit volume step); weeks 6-8 repeat it ----------
    // The doc's week 5 copies w3d1 and w3d3 and adds its own w5d2; written out here so week 5 is one block of three.
    {
      key: 'w5d1', week: 5, name: 'Sets A', type: 'strength', minutes: 30,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 3, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 3, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 3, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'hinge', exerciseId: 'glute_bridge', sets: 3, reps: [10, 20], restSec: 45 },
        { shape: 'sets', slot: 'coreA', exerciseId: 'dead_bug', sets: 2, reps: [6, 10], restSec: 45, perSide: true },
      ],
    },
    {
      key: 'w5d2', week: 5, name: 'Circuit', type: 'strength', minutes: 25,
      blocks: [
        warmup,
        {
          shape: 'circuit', rounds: 4,
          stations: [
            { slot: 'push', exerciseId: 'incline_push_up', seconds: 40 },
            { slot: 'squat', exerciseId: 'bodyweight_squat', seconds: 40 },
            { slot: 'pull', exerciseId: 'towel_door_row', seconds: 40 },
            { slot: 'hinge', exerciseId: 'glute_bridge', seconds: 40 },
            { slot: 'conditioning', exerciseId: 'mountain_climber', seconds: 40 },
          ],
          restBetweenStationsSec: 20, restBetweenRoundsSec: 60,
        },
      ],
    },
    {
      key: 'w5d3', week: 5, name: 'Sets B', type: 'strength', minutes: 30,
      blocks: [
        warmup,
        { shape: 'sets', slot: 'pull', exerciseId: 'towel_door_row', sets: 3, reps: [8, 15], restSec: 60 },
        { shape: 'sets', slot: 'squat', exerciseId: 'bodyweight_squat', sets: 3, reps: [10, 20], restSec: 60 },
        { shape: 'sets', slot: 'push', exerciseId: 'incline_push_up', sets: 3, reps: [6, 12], restSec: 60 },
        { shape: 'sets', slot: 'hingeStanding', exerciseId: 'single_leg_rdl_bw', sets: 3, reps: [8, 12], restSec: 45, perSide: true },
        { shape: 'sets', slot: 'coreB', exerciseId: 'side_plank', sets: 2, seconds: [20, 40], restSec: 30, perSide: true },
      ],
    },
  ],
  repeats: [
    { week: 2, copyOf: 1 },
    { week: 4, copyOf: 3 },
    { week: 6, copyOf: 5 },
    { week: 7, copyOf: 5 },
    { week: 8, copyOf: 5 },
  ],
  paths: {
    standard: { label: 'Full ladder' },
    // Knee and hip path: the squat slot runs the squatKneePath ladder from rung 1 (P4), at that rung's range.
    // Swaps apply after the rung is resolved, so every squat rung is listed.
    'low-impact': {
      label: 'Knee and hip path',
      swaps: {
        bodyweight_squat: { id: 'sit_to_stand_chair', reps: [10, 15], perSide: false },
        bw_split_squat: { id: 'sit_to_stand_chair', reps: [10, 15], perSide: false },
        bulgarian_split_squat: { id: 'sit_to_stand_chair', reps: [10, 15], perSide: false },
      },
    },
    // Screen Q5 (shoulder or wrist pain under the hands): push ladder capped at push_up (push_up's range), no mountain
    // climbers. nextRungs never climbs past push_up on this path.
    'push-capped': {
      label: 'Push ladder capped',
      swaps: {
        decline_push_up: { id: 'push_up', reps: [6, 12], perSide: false },
        archer_push_up: { id: 'push_up', reps: [6, 12], perSide: false },
        mountain_climber: 'dead_bug',
      },
    },
  },
  flagPaths: { knee: 'low-impact', hip: 'low-impact', shoulder: 'push-capped' },
  advance: {
    minCompleted: 2,
    maxPainToAdvance: 3,
    dropBackPainAtLeast: 6, // owner-facing convention 2026-10-03: same as Start Running R3 (the doc has no week-level drop-back)
    repeatIfFeltHard: true,
    longGapDays: 14,
  },
  // rungSpecs: each rung's range and per-side flag from the doc's `ladders` YAML and `unilateral` list (sets blocks
  // only; circuit stations keep their seconds, P7).
  ladders: [
    { slot: 'push', rungs: ['incline_push_up', 'push_up', 'decline_push_up', 'archer_push_up'], rungSpecs: {
      incline_push_up: { reps: [6, 12], perSide: false }, push_up: { reps: [6, 12], perSide: false },
      decline_push_up: { reps: [6, 12], perSide: false }, archer_push_up: { reps: [4, 8], perSide: true },
    }, advanceWhen: 'Every working set at the top of the range, last set 1-2 or 3+ reps left, no form break or pain tap (P1); or the first set 8+ over the top (P2).' },
    { slot: 'squat', rungs: ['bodyweight_squat', 'bw_split_squat', 'bulgarian_split_squat'], rungSpecs: {
      bodyweight_squat: { reps: [10, 20], perSide: false }, bw_split_squat: { reps: [8, 12], perSide: true },
      bulgarian_split_squat: { reps: [6, 10], perSide: true },
    }, advanceWhen: 'Every working set at the top of the range, last set 1-2 or 3+ reps left, no form break or pain tap (P1); or the first set 8+ over the top (P2).' },
    { slot: 'squatKneePath', rungs: ['sit_to_stand_chair', 'step_up_bw'], rungSpecs: {
      sit_to_stand_chair: { reps: [10, 15], perSide: false }, step_up_bw: { reps: [8, 12], perSide: true },
    }, advanceWhen: 'Every working set at the top of the range, last set 1-2 or 3+ reps left, no form break or pain tap (P1); or the first set 8+ over the top (P2).' },
    { slot: 'squatKneeRed', rungs: ['side_lying_hip_abduction'], rungSpecs: { side_lying_hip_abduction: { reps: [12, 20], perSide: true } }, advanceWhen: 'Knee RED day only; single rung, never advances.' },
    { slot: 'pull', rungs: ['towel_door_row', 'table_inverted_row', 'inverted_row'], rungSpecs: {
      towel_door_row: { reps: [8, 15], perSide: false }, table_inverted_row: { reps: [6, 12], perSide: false },
      inverted_row: { reps: [6, 12], perSide: false },
    }, advanceWhen: 'Every working set at the top of the range, last set 1-2 or 3+ reps left, no form break or pain tap (P1); or the first set 8+ over the top (P2). inverted_row only if the user has a bar.' },
    { slot: 'pullFallback', rungs: ['prone_y_t_raise'], rungSpecs: { prone_y_t_raise: { reps: [8, 12], perSide: false } }, advanceWhen: 'No table and no door only; single rung, not equivalent to a row.' },
    { slot: 'hinge', rungs: ['glute_bridge', 'single_leg_glute_bridge', 'single_leg_hip_thrust'], rungSpecs: {
      glute_bridge: { reps: [10, 20], perSide: false }, single_leg_glute_bridge: { reps: [8, 12], perSide: true },
      single_leg_hip_thrust: { reps: [8, 12], perSide: true },
    }, advanceWhen: 'Every working set at the top of the range, last set 1-2 or 3+ reps left, no form break or pain tap (P1); or the first set 8+ over the top (P2).' },
    { slot: 'hingeStanding', rungs: ['single_leg_rdl_bw'], rungSpecs: { single_leg_rdl_bw: { reps: [8, 12], perSide: true } }, advanceWhen: 'Single rung; progress by reps then 3-s lowering.' },
    { slot: 'coreA', rungs: ['dead_bug', 'plank'], rungSpecs: {
      dead_bug: { reps: [6, 10], perSide: true }, plank: { seconds: [20, 45], perSide: false },
    }, advanceWhen: 'Every working set at the top of the range (reps, or seconds for plank, P9), no form break or pain tap (P1).' },
    { slot: 'coreB', rungs: ['side_plank', 'side_plank_reach'], rungSpecs: {
      side_plank: { seconds: [20, 40], perSide: true }, side_plank_reach: { reps: [6, 10], perSide: true },
    }, advanceWhen: 'Every working set at the top of the range (seconds for side_plank, P9), no form break or pain tap (P1).' },
    { slot: 'conditioning', rungs: ['mountain_climber'], rungSpecs: { mountain_climber: { seconds: [30, 40], perSide: false } }, advanceWhen: 'Circuit only; single rung.' },
  ],
  standalone: [{ sessionKey: 'w3d2', name: 'Bodyweight circuit', fact: '20 min, no equipment' }],
  cues: {
    start: 'Two minutes of easy marching, then we start.',
    march_in_place: 'Easy pace. Knees up, arms swinging.',
    incline_push_up: 'Body in one line, heels to head.',
    push_up: 'Body in one line, heels to head.',
    decline_push_up: 'Body in one line, heels to head.',
    archer_push_up: 'Lower towards one hand, other arm long.',
    bodyweight_squat: 'Sit back, heels down, knees over toes.',
    sit_to_stand_chair: 'Touch the chair lightly, then stand tall.',
    bw_split_squat: 'Front shin stays nearly upright.',
    bulgarian_split_squat: 'Back knee down slow, push through the front heel.',
    step_up_bw: 'Whole foot on the step, drive up.',
    towel_door_row: 'Check your grip, then lean back.',
    table_inverted_row: 'Check your grip, then lean back.',
    glute_bridge: 'Drive through the heel, squeeze at the top.',
    single_leg_glute_bridge: 'Drive through the heel, squeeze at the top.',
    single_leg_hip_thrust: 'Drive through the heel, squeeze at the top.',
    single_leg_rdl_bw: 'Soft knee, hinge at the hip.',
    dead_bug: 'Lower back stays heavy on the floor.',
    plank: 'Straight line, breathe, quality seconds only.',
    side_plank: 'Straight line, breathe, quality seconds only.',
    mountain_climber: 'Shoulders over hands, hips stay low.',
    rest: 'Rest now. Shake out your arms.',
    finish: 'Done. Three sessions a week is the whole trick.',
  },
  rulesText: {
    _transcriptionNotes: [
      'Week 5: the doc copies w3d1 and w3d3 and adds its own w5d2; w5d1 and w5d3 are written out as copies of w3d1 and w3d3 so weeks 6-8 can repeat week 5 whole.',
      'Ladder rungs carry their own reps or seconds and per-side flag in the doc: transcribed into each ladder\'s rungSpecs (sets blocks use them; circuit stations keep their station seconds). rulesText.ladderRanges and rulesText.unilateral keep the doc text. perSide is set on blocks only where the starting rung is unilateral (dead_bug, single_leg_rdl_bw, side_plank); no starting circuit station is unilateral.',
      'low-impact path: all three deep-flexion squat rungs swap to sit_to_stand_chair at its squatKneePath range (rung 1, per P4). The engine resolves the rung first and then applies the swap. A swap map cannot say "this slot climbs squatKneePath", so the knee path stays on rung 1 (step_up_bw is not reached yet).',
      'push-capped path is series-specific (screen Q5). A standing shoulder flag pre-answers Q5 yes and selects it: the conservative reading, since the doc does not name shoulder flags. The push cap (no rung above push_up) and "start push at rung 1 in placement week" are ladder rules, kept in rulesText.Q5.',
      'Q4 and Q5 can both be yes. The enrolment holds one path, and the engine also applies each standing flag\'s path in turn (effectivePaths), so a knee flag plus a shoulder flag gets both the squat knee path and the push cap.',
      'No back or no-overhead path: the doc says no exercise here carries back or neck tags, so the gate removes nothing. flagPaths leaves back and neck out; flagAvoid is omitted (no extra tags; per the 2026-10-02 owner decision, knee and hip do not add impact).',
      'advance: minCompleted 2 (P10) and longGapDays 14 (P11) are from the doc. The doc has no week-level pain threshold (pain drops a rung, P4), so maxPainToAdvance 3 is borrowed from the shared 3/10 knee-checked convention and dropBackPainAtLeast 7 is a conservative placeholder. P11 also drops every slot one rung, which AdvanceRule cannot express.',
      'honestLine sources [6][8]: the verdict sentence "Heavy loads still build more maximal strength than light loads [6][8], and the app says so".',
      'Q2b: the doc has no exact yes copy; yesCopy is taken from the section 1 "Not for" line. Q3: yesCopy reworded from "Asks the user to get clearance from their surgeon or physio, then confirm".',
      'equipment is bodyweight only. bulgarian_split_squat is still tagged dumbbell in the library; the doc asks for a library fix to allow bodyweight (not done here).',
      'cues: one line per id, chosen from the doc; every cue line is kept in rulesText.cues. No lastRound cue in the doc.',
      'Session type is strength for all three days, circuit included (per the brief: strength for sets programmes).',
      'train.noImpact: this series has no impact moves, so the no-impact choice should change nothing here; it must not route to low-impact, which in this series is the knee and hip squat path.',
    ].join(' | '),
    'P1-advance':
      'when: in a sets session, every working set of a slot reached the top of its range, the last set\'s effortTap is "1-2 left" or "3+ left", no formBrokeTap and no pain tap in that slot. then: next session uses the next rung in that slot\'s ladder, at the bottom of the range',
    'P2-rep-ceiling':
      'when: the first working set of a slot exceeds the top of the range by 8 or more (e.g. 20+ on [6, 12]; 23+ on [8, 15]; 28+ on [10, 20]; for seconds ranges, top + 20 s), with no formBrokeTap. then: advance as in P1, even if effortTap was not logged',
    'P3-hold':
      'when: a slot did not meet P1 or P2, and P4/P5 do not apply. then: same rung next session; target is +1 rep on each set that was below the top of the range',
    'P4-pain-drop':
      "when: a pain tap in a slot, or a symptom check AMBER for the region mapped to that slot in slotRegion. then: squat slot, knee: switches to squatKneePath rung 1 on AMBER, or squatKneeRed on RED, for as long as the symptom gate reports it (permanently for a knee flag). Squat slot, hip (flag, AMBER or RED): switches to squatKneePath rung 1, never squatKneeRed; hip RED adds only axial_load, which nothing in this series carries. Any other slot: next session drops one rung. On rung 1 the symptom gate's substitution takes over, but only a bodyweight id not already in the session; if none fits, the slot holds rung 1 at the bottom of the range and the pain tap stays open",
    'P5-form-or-fail-drop':
      'when: formBrokeTap in the same slot in 2 consecutive sessions, OR any working set below the bottom of the range in 2 consecutive sessions. then: drop one rung (floor at rung 1). A single form break means hold, not drop.',
    'P6-placement':
      'when: week 1 only, a working set exceeds the top of the range by 5 or more with no formBrokeTap. then: the next set in the same session uses the next rung; at most one rung per set',
    'P7-circuit-rung':
      "when: a circuit session. then: each station uses the user's current rung for that slot minus one (floor at rung 1); circuit results never trigger P1 or P2",
    'P8-top-of-ladder':
      'when: P1 or P2 fires on the last rung of a ladder. then: keep the rung, add a 3-second lowering phase cue, reset to the bottom of the range; if P1 fires again, show "You have outgrown this ladder" and offer Home Dumbbells or Traditional Gym',
    'P9-holds':
      'when: a timed rung (plank, side_plank) has every set at the top of its seconds range with no formBrokeTap. then: advance to the next rung as in P1',
    'P10-week-advance':
      'when: the calendar week ends. then: advance to the next programme week only if at least 2 of its 3 sessions were logged; otherwise repeat the week',
    'P11-gap':
      'when: no session logged for 14 or more days. then: resume at the start of the last completed week, every slot one rung down (floor at rung 1)',
    progressionInputs:
      'reps or seconds per working set (logged); effortTap per set, one of: 0 left, 1-2 left, 3+ left (reps in reserve); formBrokeTap per set (true/false); pain: existing symptom check (knee / back / neck, amber / red) plus a per-set "pain" tap',
    conventions: 'P1 to P11 are coaching conventions built on [6][7][8][9]; none is tested as a rule set',
    ladderRanges:
      'push: incline_push_up reps [6, 12]; push_up reps [6, 12]; decline_push_up reps [6, 12]; archer_push_up reps [4, 8]. squat: bodyweight_squat reps [10, 20]; bw_split_squat reps [8, 12]; bulgarian_split_squat reps [6, 10]. squatKneePath: sit_to_stand_chair reps [10, 15]; step_up_bw reps [8, 12]. squatKneeRed: side_lying_hip_abduction reps [12, 20]. pull: towel_door_row reps [8, 15]; table_inverted_row reps [6, 12]; inverted_row reps [6, 12] (only if the user has a bar). pullFallback: prone_y_t_raise reps [8, 12]. hinge: glute_bridge reps [10, 20]; single_leg_glute_bridge reps [8, 12]; single_leg_hip_thrust reps [8, 12]. hingeStanding: single_leg_rdl_bw reps [8, 12]. coreA: dead_bug reps [6, 10]; plank seconds [20, 45]. coreB: side_plank seconds [20, 40]; side_plank_reach reps [6, 10]. conditioning: mountain_climber seconds [30, 40] (circuit only)',
    unilateral:
      'archer_push_up, bw_split_squat, bulgarian_split_squat, step_up_bw, single_leg_glute_bridge, single_leg_hip_thrust, single_leg_rdl_bw, side_plank, side_plank_reach, dead_bug, side_lying_hip_abduction: reps and seconds are per side',
    slotRegion:
      'which symptom-gate regions a slot answers to (used by P4): squat [knee, hip]; squatKneePath [knee, hip]; hinge [back]; hingeStanding [back]; coreA [back]; coreB [back]; push []; pull []; conditioning []. Shoulder or wrist pain is handled by the pre-start screen and the per-set pain tap. No slot maps to neck: no exercise in this series carries overhead or neck_load',
    blockRanges:
      'In every slot block, exerciseId and its reps or seconds are those of the starting rung. At run time both come from the user\'s current rung in `ladders`. Sets and restSec stay as written.',
    blockRoles:
      'A block with role: warmup is not logged for progression and is exempt from the duplicate-id test. The warm-up id (march_in_place) is also one that no slot, ladder or drop uses.',
    circuitSides: 'Circuit squat station: on a single-leg rung, switch sides at half time.',
    coreAPlank: 'coreA block on the plank rung: seconds [20, 45].',
    standaloneRung:
      'A user who is not enrolled runs rung 1 in every slot (rung 1 minus one, floored, per P7). A standing knee or hip flag still sends the squat station to squatKneePath.',
    weekTemplate:
      'Load does not rise by changing the template. It rises when a slot moves up a rung, which can happen in any week. Week 8: app compares rungs and reps with week 1.',
    Q1: 'Heart screen yes: does not start the series. Shows "Please get clearance from your doctor first" and keeps the series locked until the user confirms clearance [14].',
    Q2b: "Baby in the last 12 months: offers the Postpartum series instead (suggest:postpartum), unless the user's Postpartum enrolment has status done; then the answer is a note and the series starts. The 12-month cut-off is a coaching convention.",
    Q3: 'Surgery or treated injury in the last 3 months: does not start. Asks the user to get clearance from their surgeon or physio, then confirm.',
    Q4: 'Knee or hip yes: starts the series on the knee and hip path: squat slot uses sit_to_stand_chair → step_up_bw.',
    Q5: 'Shoulder or wrist pain under the hands: caps the push ladder at push_up, so no decline_push_up or archer_push_up. Swaps mountain_climber for dead_bug in the circuit. Starts the push slot at rung 1 even in placement week.',
    Q6: 'Back pain down a leg, or new numbness or weakness in a leg: does not start. Shows "This needs a clinician\'s check before training".',
    stopSignHeart: 'Chest pain stop sign: ends the session and locks the series until the user confirms they have seen a doctor.',
    stopSignDizzy: 'Dizziness in a plank or bridge: if it repeats, the app treats it as the chest-pain stop sign (row 1).',
    flagKnee:
      'Knee (AMBER avoids impact and deep_knee_flexion): the series has no impact moves. bodyweight_squat, bw_split_squat and bulgarian_split_squat are removed; every other slot is unchanged. The squat slot runs the knee path: sit_to_stand_chair (seat at or above knee height) → step_up_bw (step no higher than 20 cm).',
    flagKneeRed:
      'Knee RED day: RED adds knee_load, so the knee path is removed for that day. The squat slot becomes side_lying_hip_abduction (2–3 × [12, 20] per side) and the hinge slot holds at glute_bridge.',
    flagHip:
      'Hip: the same three deep-flexion squat moves are removed, so the squat slot runs the same path as for knees. Hip RED adds only axial_load, which nothing here carries, so the path stays on a hip RED day. The squatKneeRed swap is for knee RED only. Hinge and core slots are unchanged; a pain tap there still drops a rung (P4).',
    flagBack:
      'Back: no exercise in this series carries spinal_flexion, axial_load or spinal_load, so the gate removes nothing. If plank or single_leg_rdl_bw provokes back pain, P4 drops the core slot to dead_bug, and the standing hinge to glute_bridge for that session.',
    flagNeck:
      'Neck: no exercise carries overhead or neck_load. prone_y_t_raise is done with the forehead resting on a folded towel, so the neck carries no load.',
    honestLineKnee: 'Your knee path builds the legs more slowly than the full ladder.',
    honestLineHip: 'Your hip path builds the legs more slowly than the full ladder.',
    pullBar: 'inverted_row is offered only when the user says they have a bar.',
    pullFallback:
      'With no table and no door, prone_y_t_raise stands in for the pull slot. It is not equivalent to a row: no pulling load on the arms, only the upper back. The app says so on screen.',
    regressions:
      'incline_push_up: easier = higher surface (counter instead of chair), lower the hands in steps before leaving the incline (convention, not a logged rung). push_up: capped here if the screen reports shoulder or wrist pain. decline_push_up: feet on a chair seat, no higher. archer_push_up / bulgarian_split_squat: top of ladder, 3-s lowering (P8). bodyweight_squat: easier = sit_to_stand_chair. bw_split_squat: hold a wall for balance if needed. bulgarian_split_squat: rear foot on a chair or sofa. sit_to_stand_chair: easier = squatKneeRed (knee RED only). towel_door_row: easier = prone_y_t_raise (fallback); walk the feet closer to the door to make it harder. table_inverted_row: bend the knees to make it easier; straighten the legs to make it harder. glute_bridge: none easier. single_leg_rdl_bw: easier = glute_bridge; harder = 3-s lowering, then reps to 12; touch a wall for balance. dead_bug: none easier. side_plank: easier = plank.',
    excluded:
      'Not in this series, on purpose: pike_push_up and wall_handstand_hold (tag overhead), and every pull-up variant (needs a bar, overhead). No vertical push or vertical pull.',
    outgrown:
      'Already doing 15+ archer push-ups and Bulgarian split squats per side: this series is outgrown; use Home Dumbbells or Traditional Gym.',
    expectCopy: 'Most people move up at least one rung on each ladder in 8 weeks.',
    cues:
      'Start: "Clear a space the size of a mat." "Two minutes of easy marching, then we start." "Leave one or two reps in the tank." | incline_push_up / push_up / decline_push_up: "Body in one line, heels to head." "Chest to the edge, elbows angled back." "Squeeze your glutes so your hips stay up." | archer_push_up: "Lower towards one hand, other arm long." "Keep your hips square to the floor." | bodyweight_squat / sit_to_stand_chair: "Sit back, heels down, knees over toes." "Touch the chair lightly, then stand tall." | bw_split_squat / bulgarian_split_squat: "Front shin stays nearly upright." "Back knee down slow, push through the front heel." "Hold the wall if you need balance." | step_up_bw: "Whole foot on the step, drive up." "Step down slowly, no dropping." | towel_door_row / table_inverted_row: "Check your grip, then lean back." "Pull your chest to your hands." "Lower for a slow count of two." | glute_bridge / single_leg_glute_bridge / single_leg_hip_thrust: "Drive through the heel, squeeze at the top." "Ribs down, hips level." | single_leg_rdl_bw: "Soft knee, hinge at the hip." "Stop when the back of the thigh stretches." | dead_bug / plank / side_plank: "Lower back stays heavy on the floor." "Breathe out as the arm and leg reach." "Straight line, breathe, quality seconds only." | march_in_place: "Easy pace. Knees up, arms swinging." | mountain_climber: "Shoulders over hands, hips stay low." | Rests: "Rest now. Shake out your arms." "Next up in ten seconds." "How many were left in the tank?" | Rung change: "Every set hit the top. Next time, harder version." "Same version today. That is how strength builds." "We dropped a rung so the form stays clean." | Finish: "Done. Three sessions a week is the whole trick." "Nice work. Log how it felt while it\'s fresh."',
  },
}
