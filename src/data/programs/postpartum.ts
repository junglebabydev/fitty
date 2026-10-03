// Postpartum Return, transcribed from docs/programs/postpartum.md (Oct 2026). Status preview: the stage gates (G1, G2,
// G3a, G3b), entry rules (E1-E4) and rules R1-R16 are kept verbatim in rulesText until the engine implements them, and a
// pelvic-health physio has not yet reviewed the doc. Every session is written out in the doc, so no `repeats`.
// Doc-only fields (note, test, gate, onPass, onFail, stopRule, substitute, circuitNote, replaces, when) are in rulesText.
import type { Block, Program, ProgramSession, Range } from '../../domain/programs'

function reps(exerciseId: string, sets: number, r: Range, restSec: number, perSide?: true): Block {
  return perSide ? { shape: 'sets', exerciseId, sets, reps: r, restSec, perSide } : { shape: 'sets', exerciseId, sets, reps: r, restSec }
}

function secs(exerciseId: string, sets: number, s: Range, restSec: number, perSide?: true): Block {
  return perSide ? { shape: 'sets', exerciseId, sets, seconds: s, restSec, perSide } : { shape: 'sets', exerciseId, sets, seconds: s, restSec }
}

function walk(minutes: number, effort: string, role?: 'warmup' | 'cooldown'): Block {
  return role ? { shape: 'steady', exerciseId: 'brisk_walk', minutes, effort, role } : { shape: 'steady', exerciseId: 'brisk_walk', minutes, effort }
}

/** Walk intervals (w13d2-w15d2): a null rest means keep walking easily. */
function walkIntervals(rounds: number, workSec: number, restSec: number): Block {
  return {
    shape: 'intervals',
    rounds,
    work: { exerciseId: 'brisk_walk', seconds: workSec, effort: 'fast or uphill: short sentences, never just a few words' },
    rest: { exerciseId: null, seconds: restSec, effort: 'keep walking, easy: let your breathing settle' },
  }
}

/** Stage 2 day 3: 3 rounds of 7 stations. Per-side stations switch sides halfway (rulesText 'session.circuit'). */
function circuit(stationSec: number, restBetweenStationsSec: number): Block {
  const ids = ['db_rdl', 'incline_push_up', 'reverse_lunge', 'one_arm_db_row', 'suitcase_carry', 'dead_bug', 'single_leg_calf_raise']
  return { shape: 'circuit', rounds: 3, stations: ids.map((exerciseId) => ({ exerciseId, seconds: stationSec })), restBetweenStationsSec, restBetweenRoundsSec: 60 }
}

// ---- shared openers -----------------------------------------------------------------------------------------

/** Weeks 1-2: 5 × 5 s holds and 5 quick squeezes. */
const OPEN_W1: Block[] = [secs('breathing_360', 1, [90, 90], 30), secs('pelvic_floor_hold', 5, [5, 5], 5), reps('pelvic_floor_quick', 1, [5, 5], 30)]
/** Weeks 3-4: 8 × 8 s. */
const OPEN_W3: Block[] = [secs('breathing_360', 1, [60, 60], 30), secs('pelvic_floor_hold', 8, [8, 8], 8), reps('pelvic_floor_quick', 1, [8, 8], 30)]
/** Weeks 5-6: 10 × 10 s. */
const OPEN_W5: Block[] = [secs('breathing_360', 1, [60, 60], 30), secs('pelvic_floor_hold', 10, [10, 10], 10), reps('pelvic_floor_quick', 1, [10, 10], 30)]
/** Stages 1-2: 5 × 10 s, "one of today's three pelvic floor rounds". */
const OPEN_S1: Block[] = [secs('breathing_360', 1, [60, 60], 0), secs('pelvic_floor_hold', 5, [10, 10], 10), reps('pelvic_floor_quick', 1, [10, 10], 30)]

/** Intervals cool-down: the doc's "standing; the cool-down" breathing block. */
const BREATHE_COOLDOWN: Block = { shape: 'sets', exerciseId: 'breathing_360', sets: 1, seconds: [60, 60], restSec: 0, role: 'cooldown' }
const WALK_WARMUP = walk(5, 'easy, building to brisk', 'warmup')

// ---- Stage 0, Reconnect (weeks 1-6) -------------------------------------------------------------------------

const BREATHE_RECONNECT: Block[] = [
  ...OPEN_W1,
  reps('pelvic_tilt', 1, [8, 8], 30),
  reps('heel_slide', 1, [6, 6], 30, true),
  reps('knee_fallout', 1, [6, 6], 30, true),
  reps('side_lying_hip_abduction', 1, [8, 8], 30, true),
]
const EASY_WALK_W1 = 'easy: you can talk in full sentences; stop at 5 minutes if you are tired'
const EASY_WALK = 'easy: you can talk in full sentences'

const CORE_W3_D1: Block[] = [
  ...OPEN_W3,
  reps('heel_slide', 2, [8, 8], 30, true),
  reps('glute_bridge', 2, [8, 8], 45),
  reps('clamshell', 1, [10, 10], 30, true),
  reps('sit_to_stand_chair', 1, [8, 8], 45),
]
const CORE_W3_D3: Block[] = [
  ...OPEN_W3,
  reps('pelvic_tilt', 1, [10, 10], 30),
  reps('knee_fallout', 2, [8, 8], 30, true),
  reps('side_lying_hip_abduction', 2, [10, 10], 30, true),
  reps('glute_bridge', 2, [8, 8], 45),
]
const CORE_W5_D1: Block[] = [
  ...OPEN_W5,
  reps('heel_slide', 1, [10, 10], 30, true),
  reps('glute_bridge', 2, [10, 10], 45),
  reps('clamshell', 1, [12, 12], 30, true),
  reps('sit_to_stand_chair', 2, [8, 8], 45),
]
const CORE_W5_D3: Block[] = [
  ...OPEN_W5,
  reps('knee_fallout', 1, [8, 8], 30, true),
  reps('side_lying_hip_abduction', 2, [12, 12], 30, true),
  reps('glute_bridge', 2, [10, 10], 45),
  reps('sit_to_stand_chair', 2, [8, 8], 45),
]

// ---- Stage 1, Rebuild (weeks 7-12) --------------------------------------------------------------------------

const BRISK_WALK = 'brisk: you can talk but not sing; start and finish with 3 easy minutes'

const STRENGTH_A_W7: Block[] = [
  ...OPEN_S1,
  reps('sit_to_stand_chair', 2, [8, 12], 45),
  reps('wall_push_up', 2, [8, 12], 45),
  reps('glute_bridge', 2, [10, 15], 45),
  reps('band_row', 2, [10, 15], 45),
  reps('heel_slide', 2, [10, 10], 30, true),
]
const STRENGTH_A_W9: Block[] = [
  ...OPEN_S1,
  reps('sit_to_stand_chair', 3, [8, 12], 45),
  reps('wall_push_up', 2, [8, 12], 45),
  reps('glute_bridge', 3, [10, 15], 45),
  reps('band_row', 2, [10, 15], 45),
  reps('heel_slide', 2, [10, 10], 30, true),
]
const STRENGTH_A_W10: Block[] = [
  ...OPEN_S1,
  reps('sit_to_stand_chair', 3, [8, 12], 45),
  reps('incline_push_up', 2, [8, 12], 45),
  reps('glute_bridge', 3, [10, 15], 45),
  reps('band_row', 2, [10, 15], 45),
  reps('dead_bug', 2, [6, 8], 30, true),
]
const STRENGTH_B_W7: Block[] = [
  ...OPEN_S1,
  reps('glute_bridge', 2, [10, 15], 45),
  reps('clamshell', 2, [12, 15], 30, true),
  reps('side_lying_hip_abduction', 2, [10, 15], 30, true),
  reps('bird_dog', 2, [6, 8], 30, true),
  reps('band_pull_apart', 2, [12, 15], 45),
]
const STRENGTH_B_W9: Block[] = [
  ...OPEN_S1,
  reps('band_good_morning', 3, [10, 15], 45),
  reps('clamshell', 2, [12, 15], 30, true),
  reps('side_lying_hip_abduction', 2, [10, 15], 30, true),
  reps('bird_dog', 2, [6, 8], 30, true),
  reps('band_pull_apart', 2, [12, 15], 45),
]
const STRENGTH_B_W11: Block[] = [
  ...OPEN_S1,
  reps('band_good_morning', 3, [10, 15], 45),
  secs('suitcase_carry', 2, [30, 30], 30, true),
  reps('side_lying_hip_abduction', 2, [10, 15], 30, true),
  reps('bird_dog', 2, [6, 8], 30, true),
  reps('band_pull_apart', 2, [12, 15], 45),
]
/** Back flag, Stage 1 (doc flags.back.swaps.suitcase_carry.S1): the carry becomes dead_bug 2 × 6-8 a side. */
const STRENGTH_B_W11_BACK: Block[] = STRENGTH_B_W11.map((b) =>
  b.shape === 'sets' && b.exerciseId === 'suitcase_carry' ? reps('dead_bug', 2, [6, 8], 30, true) : b,
)

// ---- Stage 2, Strengthen (weeks 13-16) ----------------------------------------------------------------------

function strengthA13(sidePlank: Range): Block[] {
  return [
    ...OPEN_S1,
    reps('glute_bridge', 1, [10, 10], 30),
    reps('goblet_squat', 3, [8, 12], 60),
    reps('db_floor_press', 3, [8, 12], 60),
    reps('db_step_up', 2, [8, 10], 60, true),
    reps('single_leg_glute_bridge', 2, [8, 12], 45, true),
    secs('side_plank', 2, sidePlank, 30, true),
  ]
}

const STRENGTH_CHECK: Block[] = [
  ...OPEN_S1,
  reps('single_leg_calf_raise', 1, [20, 20], 60, true),
  reps('single_leg_glute_bridge', 1, [20, 20], 60, true),
  reps('single_leg_sit_to_stand', 1, [20, 20], 60, true),
  reps('side_lying_hip_abduction', 1, [20, 20], 60, true),
  reps('goblet_squat', 2, [8, 12], 60),
  reps('db_floor_press', 2, [8, 12], 60),
]

/** 'w3d2' → week 3. Stage 0 sessions are mobility, stages 1-2 strength (PRD §5.2). */
function session(key: string, stage: number, name: string, minutes: number, blocks: Block[], altOnly?: true): ProgramSession {
  const week = Number(/^w(\d+)d/.exec(key)![1])
  const s: ProgramSession = { key, week, stage, name, type: stage === 0 ? 'mobility' : 'strength', minutes, blocks }
  return altOnly ? { ...s, altOnly } : s
}

const sessions: ProgramSession[] = [
  // Stage 0, Reconnect
  session('w1d1', 0, 'Week 1: breathe and reconnect', 10, BREATHE_RECONNECT),
  session('w1d2', 0, 'Week 1: easy walk', 10, [walk(10, EASY_WALK_W1)]),
  session('w1d3', 0, 'Week 1: breathe and reconnect', 10, BREATHE_RECONNECT),
  session('w2d1', 0, 'Week 2: breathe and reconnect', 10, BREATHE_RECONNECT),
  session('w2d2', 0, 'Week 2: easy walk', 10, [walk(10, EASY_WALK_W1)]),
  session('w2d3', 0, 'Week 2: breathe and reconnect', 10, BREATHE_RECONNECT),
  session('w3d1', 0, 'Week 3: core and hips', 15, CORE_W3_D1),
  session('w3d2', 0, 'Week 3: easy walk', 15, [walk(15, EASY_WALK)]),
  session('w3d3', 0, 'Week 3: core and hips', 16, CORE_W3_D3),
  session('w4d1', 0, 'Week 4: core and hips', 15, CORE_W3_D1),
  session('w4d2', 0, 'Week 4: easy walk', 15, [walk(15, EASY_WALK)]),
  session('w4d3', 0, 'Week 4: core and hips', 16, CORE_W3_D3),
  session('w5d1', 0, 'Week 5: core and hips', 16, CORE_W5_D1),
  session('w5d2', 0, 'Week 5: easy walk', 20, [walk(20, EASY_WALK)]),
  session('w5d3', 0, 'Week 5: core and hips', 18, CORE_W5_D3),
  session('w6d1', 0, 'Week 6: core and hips', 16, CORE_W5_D1),
  session('w6d2', 0, 'Week 6: easy walk', 25, [walk(25, EASY_WALK)]),
  session('w6d3', 0, 'Week 6: core and hips', 18, CORE_W5_D3),
  // Gate G1. Stage 1, Rebuild
  session('w7d1', 1, 'Week 7: strength A', 21, STRENGTH_A_W7),
  session('w7d2', 1, 'Week 7: brisk walk', 20, [walk(20, BRISK_WALK)]),
  session('w7d3', 1, 'Week 7: strength B', 23, STRENGTH_B_W7),
  session('w8d1', 1, 'Week 8: strength A', 21, STRENGTH_A_W7),
  session('w8d2', 1, 'Week 8: brisk walk', 25, [walk(25, BRISK_WALK)]),
  session('w8d3', 1, 'Week 8: strength B', 23, STRENGTH_B_W7),
  session('w9d1', 1, 'Week 9: strength A', 25, STRENGTH_A_W9),
  session('w9d2', 1, 'Week 9: brisk walk', 25, [walk(25, BRISK_WALK)]),
  session('w9d3', 1, 'Week 9: strength B', 25, STRENGTH_B_W9),
  session('w10d1', 1, 'Week 10: strength A', 24, STRENGTH_A_W10),
  session('w10d2', 1, 'Week 10: brisk walk', 30, [walk(30, BRISK_WALK)]),
  session('w10d3', 1, 'Week 10: strength B', 25, STRENGTH_B_W9),
  session('w11d1', 1, 'Week 11: strength A', 24, STRENGTH_A_W10),
  session('w11d2', 1, 'Week 11: brisk walk', 30, [walk(30, BRISK_WALK)]),
  session('w11d3', 1, 'Week 11: strength B', 24, STRENGTH_B_W11),
  session('w12d1', 1, 'Week 12: strength A', 24, STRENGTH_A_W10),
  session('w12d2', 1, 'Week 12: brisk walk', 30, [walk(30, BRISK_WALK)]),
  session('w12d3', 1, 'Week 12: strength B', 24, STRENGTH_B_W11),
  // Back path only (replaceSessions): the Stage 1 carry becomes dead_bug.
  session('w11d3-back', 1, 'Week 11: strength B', 24, STRENGTH_B_W11_BACK, true),
  session('w12d3-back', 1, 'Week 12: strength B', 24, STRENGTH_B_W11_BACK, true),
  // Gate G2. Stage 2, Strengthen
  session('w13d1', 2, 'Week 13: strength A', 29, strengthA13([20, 30])),
  session('w13d2', 2, 'Week 13: walk intervals', 27, [WALK_WARMUP, walkIntervals(6, 90, 120), BREATHE_COOLDOWN]),
  session('w13d3', 2, 'Week 13: strength circuit', 27, [...OPEN_S1, circuit(40, 20)]),
  session('w14d1', 2, 'Week 14: strength A', 29, strengthA13([20, 30])),
  session('w14d2', 2, 'Week 14: walk intervals', 27, [WALK_WARMUP, walkIntervals(7, 90, 90), BREATHE_COOLDOWN]),
  session('w14d3', 2, 'Week 14: strength circuit', 27, [...OPEN_S1, circuit(40, 20)]),
  session('w15d1', 2, 'Week 15: strength A', 30, strengthA13([30, 40])),
  session('w15d2', 2, 'Week 15: walk intervals', 31, [WALK_WARMUP, walkIntervals(7, 120, 90), BREATHE_COOLDOWN]),
  session('w15d3', 2, 'Week 15: strength circuit', 27, [...OPEN_S1, circuit(45, 15)]),
  session('w16d1', 2, 'Week 16: strength check', 27, STRENGTH_CHECK),
  // Gate G3a; part 1 of the symptom check before running (no impact).
  session('w16d2', 2, 'Week 16: symptom check before running, part 1 (no impact)', 33, [
    walk(30, 'brisk: you can talk but not sing'),
    secs('single_leg_balance', 1, [10, 10], 30, true),
    reps('single_leg_squat_partial', 1, [10, 10], 30, true),
  ]),
  // Gate G3b; part 2 (impact).
  session('w16d3', 2, 'Week 16: symptom check before running, part 2 (impact)', 17, [
    WALK_WARMUP,
    secs('jog_on_spot', 1, [60, 60], 60),
    reps('forward_bound', 1, [10, 10], 60),
    reps('single_leg_hop', 1, [10, 10], 60, true),
    reps('running_man', 1, [10, 10], 30, true),
    walk(3, 'easy', 'cooldown'),
  ]),
  // Replaces w16d3 on the low-impact path, or when its `when` holds (rulesText 'session.w16d3-low-impact').
  session(
    'w16d3-low-impact',
    2,
    'Week 16: low-impact finish',
    27,
    [
      { shape: 'steady', exerciseId: 'stationary_bike', minutes: 5, effort: 'easy spin, building up', role: 'warmup' },
      {
        shape: 'intervals',
        rounds: 6,
        work: { exerciseId: 'bike_intervals', seconds: 120, effort: 'moderately hard: short sentences, never just a few words' },
        rest: { exerciseId: null, seconds: 90, effort: 'keep pedalling, easy' },
      },
      BREATHE_COOLDOWN,
    ],
    true,
  ),
]

const KNEE_SWAPS = { goblet_squat: 'sit_to_stand_chair', reverse_lunge: 'step_up_bw' }

export const program: Program = {
  id: 'postpartum',
  status: 'preview',
  title: 'Postpartum Return',
  promise: 'Pelvic floor first, then strength. Running waits for a symptom check.',
  description:
    'A 16-week return to exercise after any birth. Breathing, pelvic floor squeezes and walks first; gentle strength after your 6–8 week check; harder work from 12 weeks. Running and jumping wait for a symptom check. Offered to everyone, pelvic floor training may not prevent leaking, so we tell you when to see a physio, doctor or midwife.',
  weeks: 16,
  sessionsPerWeek: 3,
  minutes: [10, 33],
  equipment: ['bodyweight', 'band', 'dumbbell', 'bike'],
  needs:
    'A mat, a sturdy chair and a wall. A light resistance band from week 7. Light dumbbells and a low step from week 13. If you are feeding: a well-fitted, supportive sports bra.',
  timePerWeek: '30–60 minutes at first, building to about 85, plus three 4-minute pelvic floor rounds a day.',
  why: [
    { text: 'In trials, pelvic floor training after birth lowered the odds of leaking urine.', source: 11 },
    { text: 'In trials, exercise after birth eased low mood, compared with no exercise.', source: 12 },
    { text: "Being active after birth did not change breast milk supply or quality, or babies' growth, in studies.", source: 14 },
  ],
  sources: [
    { n: 1, kind: 'guideline', url: 'https://csepguidelines.ca/guidelines/postpartum/', citation: 'Davenport MH, Ruchat SM, et al. 2025 Canadian Guideline for Physical Activity, Sedentary Behaviour and Sleep Throughout the First Year Postpartum (recommendations, contraindications, preamble). Canadian Society for Exercise Physiology; published in Br J Sports Med, doi:10.1136/bjsports-2025-109785. 2025.' },
    { n: 2, kind: 'guideline', url: 'https://csep.ca/wp-content/uploads/2025/03/CSEP-PATH_GAQ_PP_Guidelines.pdf', citation: 'Canadian Society for Exercise Physiology. Get Active Questionnaire for Postpartum (GAQ-PP). CSEP. 2025.' },
    { n: 3, kind: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/33239350/', citation: 'Bull FC, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020.' },
    { n: 4, kind: 'guideline', url: 'https://www.gov.uk/government/publications/physical-activity-guidelines-uk-chief-medical-officers-report/uk-chief-medical-officers-physical-activity-guidelines', citation: "UK Chief Medical Officers. UK Chief Medical Officers' physical activity guidelines (page updated 10 July 2026). GOV.UK. 2026." },
    { n: 5, kind: 'guideline', url: 'https://assets.publishing.service.gov.uk/media/6a4f5647559c26eacf438f84/cmo-physical-activity-guidelines-women-childbirth-birth-to-12-months-july-2026.pdf', citation: 'UK Chief Medical Officers. Physical activity for women after childbirth (birth to 12 months), infographic, July 2026 version. GOV.UK. 2026.' },
    { n: 6, kind: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/32217980/', citation: 'American College of Obstetricians and Gynecologists. Physical Activity and Exercise During Pregnancy and the Postpartum Period: ACOG Committee Opinion No. 804. Obstet Gynecol. 2020.' },
    { n: 7, kind: 'guideline', url: 'https://www.nice.org.uk/guidance/ng194/chapter/Recommendations', citation: 'National Institute for Health and Care Excellence. Postnatal care (NG194), recommendations 1.1.13, 1.2.1–1.2.7 (1.2.2 wellbeing at every contact; 1.2.4 symptoms needing advice without delay), 1.2.13. NICE. 2021, last updated 9 June 2026.' },
    { n: 8, kind: 'guideline', url: 'https://www.nice.org.uk/guidance/ng210/chapter/Recommendations', citation: 'National Institute for Health and Care Excellence. Pelvic floor dysfunction: prevention and non-surgical management (NG210), recommendations 1.3.9–1.3.16, 1.6.12, 1.6.14. NICE. 2021.' },
    { n: 9, kind: 'guideline', url: 'https://www.nice.org.uk/guidance/ng192/chapter/Recommendations', citation: 'National Institute for Health and Care Excellence. Caesarean birth (NG192), recommendations 1.7.5, 1.7.7–1.7.8. NICE. 2021, last updated 10 June 2025.' },
    { n: 10, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/32378735/', citation: 'Woodley SJ, et al. Pelvic floor muscle training for preventing and treating urinary and faecal incontinence in antenatal and postnatal women. Cochrane Database Syst Rev. 2020.' },
    { n: 11, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/39694630/', citation: 'Beamish NF, et al. Impact of postpartum exercise on pelvic floor disorders and diastasis recti abdominis: a systematic review and meta-analysis. Br J Sports Med. 2025.' },
    { n: 12, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/39500542/', citation: 'Deprato A, et al. Impact of postpartum physical activity on maternal depression and anxiety: a systematic review and meta-analysis. Br J Sports Med. 2025.' },
    { n: 13, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/28855163/', citation: 'Pritchett RV, et al. Does aerobic exercise reduce postpartum depressive symptoms? A systematic review and meta-analysis. Br J Gen Pract. 2017.' },
    { n: 14, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/39375006/', citation: 'Jones PAT, et al. Impact of postpartum physical activity on cardiometabolic health, breastfeeding, injury and infant growth and development: a systematic review and meta-analysis. Br J Sports Med. 2025.' },
    { n: 15, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/40011015/', citation: 'Jones PAT, et al. Impact of postpartum physical activity on maternal sleep: a systematic review and meta-analysis. Br J Sports Med. 2025.' },
    { n: 16, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/39922568/', citation: 'Ruchat SM, et al. Impact of exercise on musculoskeletal pain and disability in the postpartum period: a systematic review and meta-analysis. Br J Sports Med. 2025.' },
    { n: 17, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/8289849/', citation: 'Dewey KG, et al. A randomized study of the effects of aerobic exercise by lactating women on breast-milk volume and composition. N Engl J Med. 1994.' },
    { n: 18, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/22711727/', citation: 'Daley AJ, et al. Maternal exercise and growth in breastfed infants: a meta-analysis of randomized controlled trials. Pediatrics. 2012.' },
    { n: 19, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/9233201/', citation: 'Carey GB, et al. Breast milk composition after exercise of different intensities. J Hum Lact. 1997. (Experimental study, 9 women, not randomised.)' },
    { n: 20, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/11927700/', citation: 'Wright KS, et al. Infant acceptance of breast milk after maternal exercise. Pediatrics. 2002. (Experimental study, 24 women.)' },
    { n: 21, kind: 'review', url: 'https://pubmed.ncbi.nlm.nih.gov/24268942/', citation: 'Benjamin DR, et al. Effects of exercise on diastasis of the rectus abdominis muscle in the antenatal and postnatal periods: a systematic review. Physiotherapy. 2014.' },
    { n: 22, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/29351646/', citation: 'Gluppe SL, et al. Effect of a postpartum training program on the prevalence of diastasis recti abdominis in postpartum primiparous women: a randomized controlled trial. Phys Ther. 2018. (Secondary analysis.)' },
    { n: 23, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/34391661/', citation: 'Gluppe S, et al. What is the evidence for abdominal and pelvic floor muscle training to treat diastasis recti abdominis postpartum? A systematic review with meta-analysis. Braz J Phys Ther. 2021.' },
    { n: 24, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/36934466/', citation: 'Benjamin DR, et al. Conservative interventions may have little effect on reducing diastasis of the rectus abdominis in postnatal women: a systematic review and meta-analysis. Physiotherapy. 2023.' },
    { n: 25, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/41995773/', citation: 'Lyons G, et al. What is the evidence for abdominal and pelvic floor muscle training to treat diastasis recti abdominis postpartum? An updated systematic review and meta-analysis with trial sequential analysis. Hernia. 2026.' },
    { n: 26, kind: 'consensus', url: 'https://www.absolute.physio/wp-content/uploads/2019/09/returning-to-running-postnatal-guidelines.pdf', citation: 'Goom T, Donnelly G, Brockwell E. Returning to running postnatal: guidelines for medical, health and fitness professionals managing this population. March 2019. (The authors grade their timing and test recommendations as level 4, expert opinion.)' },
    { n: 27, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/38148108/', citation: 'Christopher SM, et al. Clinical and exercise professional opinion of return-to-running readiness after childbirth: an international Delphi study and consensus statement. Br J Sports Med. 2024.' },
    { n: 28, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/38191239/', citation: 'Deering RE, et al. Clinical and exercise professional opinion on designing a postpartum return-to-running training programme: an international Delphi study and consensus statement. Br J Sports Med. 2024.' },
    { n: 29, kind: 'guideline', url: 'https://www.nhs.uk/baby/support-and-services/your-post-pregnancy-body/', citation: 'NHS. Your post-pregnancy body (page last reviewed 20 July 2026). NHS website. 2026.' },
    { n: 30, kind: 'guideline', url: 'https://www.nhs.uk/baby/support-and-services/keeping-fit-and-healthy-with-a-baby/', citation: 'NHS. Keeping fit and healthy with a baby (page last reviewed 20 April 2026). NHS website. 2026.' },
    { n: 31, kind: 'guideline', url: 'https://www.nhs.uk/tests-and-treatments/caesarean-section/recovery/', citation: 'NHS. Caesarean section: recovery (page last reviewed 4 January 2023; its review was due January 2026). NHS website. 2023.' },
    { n: 32, kind: 'guideline', url: 'https://www.nhs.uk/mental-health/conditions/postnatal-depression/', citation: 'NHS. Postnatal depression (page last reviewed 18 March 2026). NHS website. 2026.' },
    { n: 33, kind: 'programme', url: 'https://thepogp.co.uk/_userfiles/pages/files/resources/241419pogpfffuture_1.pdf', citation: 'Pelvic, Obstetric and Gynaecological Physiotherapy (POGP). Fit for the Future: essential advice and exercises following childbirth. POGP. 2024 (for review 2027).' },
    { n: 34, kind: 'programme', url: 'https://www.mkuh.nhs.uk/patient-information-leaflet/advice-and-exercises-following-caesarean-section', citation: 'Milton Keynes University Hospital NHS Foundation Trust. Advice and exercises following Caesarean Section. MKUH patient leaflet. Undated, read Oct 2026.' },
    { n: 35, kind: 'review', url: 'https://pubmed.ncbi.nlm.nih.gov/38158180/', citation: 'Evenson KR, et al. A review of public health guidelines for postpartum physical activity and sedentary behavior from around the world. J Sport Health Sci. 2024.' },
    { n: 36, kind: 'guideline', url: 'https://www.nhs.uk/conditions/stroke/symptoms/', citation: 'NHS. Stroke: symptoms (page last reviewed 12 September 2024). NHS website. 2024.' },
    { n: 37, kind: 'guideline', url: 'https://www.nhs.uk/conditions/pre-eclampsia/', citation: 'NHS. Pre-eclampsia (page last reviewed 23 March 2026). NHS website. 2026.' },
    { n: 38, kind: 'guideline', url: 'https://www.nhs.uk/mental-health/conditions/post-partum-psychosis/', citation: 'NHS. Postpartum psychosis (page last reviewed 18 October 2023). NHS website. 2023.' },
  ],
  // Doc §4: 10 questions, ids kept stable (Q6 retired). Each question's full outcome and `effects[]` are in rulesText 'screen.<id>'.
  screen: [
    {
      id: 'Q1a',
      text: 'Right now, do you have any of these: chest pain or tightness; fainting; breathlessness at rest; a painful swollen calf with breathlessness or chest pain; sudden very heavy bleeding; a face that droops, an arm that is weak, or slurred speech?',
      onYes: 'wait',
      yesCopy: 'Call {emergency} now.',
    },
    {
      id: 'Q1b',
      text: 'Right now, do you have any of these: bleeding that is heavier, increasing or has come back, or passing clots; a painful swollen calf; a fever; a wound that is red, hot or leaking; severe tummy pain; a bad headache that will not go; blurred vision or flashing lights, pain under the ribs, sudden swelling of the face, hands or feet, or being sick; a breast that is red, swollen and painful for more than a day despite self-care; pain or burning when you pee?',
      onYes: 'wait',
      yesCopy: 'Please get medical advice today from your doctor, midwife or postnatal clinic.',
    },
    {
      id: 'Q2',
      text: 'Has a doctor, midwife or physio told you to wait before exercising? Or is a heart, blood pressure or kidney problem still being treated?',
      onYes: 'wait',
      yesCopy: "Ask them about walking and gentle strength. Tap 'They said go ahead' when they do.",
    },
    {
      id: 'Q2b',
      text: "Since the birth, have you had any of these: fainting; a blood clot in a leg or lung; blood pressure that is high or not stable; heart trouble; a drooping face, slurred speech or sudden weakness; tiredness that rest doesn't fix; an eating disorder or not eating enough; a broken bone or big injury; kidney disease; or any other health condition, including one from before pregnancy, that could affect exercise?",
      onYes: 'note',
      yesCopy: 'Please talk to your doctor before harder exercise. Gentle walks, breathing and pelvic floor work can carry on.',
    },
    {
      id: 'Q3',
      text: 'Did you have a caesarean, a forceps or vacuum birth, a tear that reached the muscle around your back passage (anal sphincter), or a baby born facing upwards ("back to back")?',
      onYes: 'note',
      yesCopy:
        'Caesarean: start pelvic floor work once the catheter is out, roll to your side to get up, and lift nothing heavier than your baby for 6 weeks. Forceps, vacuum, an anal sphincter tear or a face-up baby: ask your doctor or midwife about a supervised pelvic floor programme with a physio.',
    },
    {
      id: 'Q4',
      text: 'Do you leak urine, wind or poo, or need to rush to the toilet? Do you feel heaviness, dragging or a bulge in your vagina? Do you have pain in your pelvis, lower back or during sex?',
      onYes: 'note',
      yesCopy: 'These are common after birth, and treatable. A pelvic health physio is the right person: ask your doctor, midwife or postnatal clinic how to see one.',
    },
    {
      id: 'Q5',
      text: 'In the past 2 weeks, have you felt low or hopeless, anxious or worried all the time, lost interest in things, or felt you cannot cope, on most days?',
      onYes: 'note',
      yesCopy: 'Please talk to your doctor, midwife or postnatal clinic this week. Exercise can help alongside care, not instead of it.',
    },
    {
      id: 'Q5b',
      text: 'In the last few days, have you seen or heard things others don\'t, felt very confused, or felt unusually high or had racing thoughts?',
      onYes: 'wait',
      yesCopy: 'Please see a doctor today. If anyone may be in danger, call {emergency}.',
    },
    {
      id: 'Q7',
      text: 'Are you pregnant now?',
      onYes: 'wait',
      yesCopy: 'This series is for after the birth. Please talk to your midwife or doctor about exercise in pregnancy.',
    },
    {
      id: 'Q8',
      text: 'Any bleeding from the vagina that is not a period?',
      onYes: 'wait',
      yesCopy: 'Contact your doctor, midwife or postnatal clinic today.',
    },
  ],
  stopSigns: [
    {
      sign: 'Chest pain or tightness; fainting; sudden breathlessness; a painful swollen calf with breathlessness or chest pain; sudden very heavy bleeding; a drooping face, a weak arm or slurred speech',
      action: 'Tier 1, stop now: "Stop exercising now and sit or lie down. Call {emergency}." Pause the programme (R6).',
    },
    {
      sign: 'Bleeding that increases, turns red again or comes back, or passing clots (first time, R7); a scar or tear that is red, hot, swollen or leaking; scar or tear pain that is rising, not settling or worse after a session in the first 6 weeks (R14); fever, shivering or a bad-smelling discharge; a painful or swollen calf on its own; a bad headache that will not go; blurred vision or flashing lights, pain under the ribs, sudden swelling of the face, hands or feet, or being sick; pain or burning when you pee; new leaking in the first 12 weeks after a caesarean (R15); non-period bleeding from 8 weeks (Q8); dizziness during exercise',
      action: 'Tier 2, stop the session, get advice today: "Stop for today and contact your doctor, midwife or postnatal clinic today." Pause (R6) until the user records that a clinician said carry on.',
    },
    {
      sign: 'Leaking; heaviness, dragging or a bulge; pelvic, pubic bone or back pain above 3/10, or still there the next day; a ridge or dome along the middle',
      action: 'Tier 3, stop that exercise: switch to the easier version now and for 2 sessions (R4, R13). Twice in a row: hold the stage and show the pelvic health physio prompt (R5). Any of these in the last 14 days also blocks G3b.',
    },
  ],
  sessions,
  paths: {
    standard: { label: 'Standard' },
    // Knee or hip flag (owner decision 2026-10-02): impact stays open under knee-checked running; deep squats and lunges swap.
    // w16d3 → w16d3-low-impact only when that session's `when` holds (rulesText 'path.knee-checked').
    'knee-checked': { label: 'Knee-checked', swaps: KNEE_SWAPS },
    // The user's no-running choice (train.noImpact): the low-impact finish, then strength series plus bike, elliptical, walking or swimming.
    'low-impact': { label: 'Low impact (no running)', swaps: KNEE_SWAPS, replaceSessions: { w16d3: 'w16d3-low-impact' } },
    // Back flag: Stage 1 carry → dead_bug (own reps, via alt sessions); Stage 2 circuit carry → side_plank (station seconds).
    back: {
      label: 'Back',
      swaps: { goblet_squat: 'sit_to_stand_chair', suitcase_carry: 'side_plank' },
      replaceSessions: { w11d3: 'w11d3-back', w12d3: 'w12d3-back' },
    },
    // Neck: nothing in this series is overhead; no change.
    'no-overhead': { label: 'No overhead' },
  },
  flagPaths: { knee: 'knee-checked', hip: 'knee-checked', back: 'back', neck: 'no-overhead', shoulder: 'no-overhead' },
  // No flagAvoid: the doc's avoid sets (knee/hip deep_knee_flexion; back spinal_flexion + axial_load; neck overhead) equal
  // the gate's AMBER sets minus impact, and the 2026-10-02 owner decision keeps impact open for knee and hip flags.
  advance: {
    minCompleted: 2, // R1: at least 2 of 3 sessions, no stop sign, scarPainWorseLast14d false
    maxPainToAdvance: 3, // §4: aches up to 3/10 gone by the next morning are expected; tier 3 is pain above 3/10
    dropBackPainAtLeast: 11, // the doc never drops back a week for pain (R4 regresses the exercise, R6 pauses); 11 is unreachable
    repeatIfFeltHard: true,
    longGapDays: 14, // R9: 14-27 days restart the current week; 28+ go back 2 weeks within the stage (rulesText.R9)
  },
  // PRD §4.9 and programs/README: none on purpose, a one-off session would skip the stage gates. Doc §3 picks in rulesText.
  standalone: [],
  cues: {
    start: "Feed or express first if you need to. I'll wait.",
    rest: "Rest. Sip some water, especially if you're feeding.",
    finish: 'Done. That counts, whatever today looked like.',
    support: 'Thoughts of harming yourself or your baby? Get help now.',
    breathing_360: 'Breathe in wide, into your ribs and back.',
    pelvic_floor_hold: 'Squeeze as if stopping wind and wee. Lift.',
    pelvic_floor_quick: 'Quick squeeze, full let-go. Like a flicker.',
    pelvic_tilt: 'Gently flatten your back, then let it go.',
    heel_slide: 'Breathe out and slide one heel away slowly.',
    knee_fallout: 'Let one knee fall out. Pelvis stays still.',
    glute_bridge: 'Breathe out, squeeze your bottom, lift. Ribs stay soft.',
    clamshell: 'Heels together. Open the top knee, hips stacked.',
    side_lying_hip_abduction: 'Lift the top leg, toes pointing slightly down.',
    sit_to_stand_chair: 'Feet back, lean forward, stand tall. Sit down slowly.',
    wall_push_up: 'Body in one line. Elbows angle back, not out.',
    incline_push_up: 'Chest to the edge, then push the surface away.',
    band_row: 'Pull your elbows back. Squeeze between your shoulder blades.',
    band_pull_apart: 'Arms long. Pull the band towards your chest.',
    bird_dog: 'Reach long both ways. Hips stay level.',
    dead_bug: 'Back stays heavy. See a ridge? Swap to heel slides.',
    band_good_morning: 'Hips back, flat back, then squeeze to stand.',
    suitcase_carry: "Walk tall, don't lean. Like carrying the car seat.",
    brisk_walk: "Walk tall, at today's pace.",
    goblet_squat: 'Sit back to the box. Breathe out to stand.',
    db_floor_press: 'Press up. Lower slowly until your elbows touch.',
    db_step_up: 'Whole foot on the step. Drive through the heel.',
    single_leg_glute_bridge: 'Lift on one leg. Keep your hips level.',
    side_plank: 'Knees bent, hips up, keep breathing. Watch your middle.',
    db_rdl: 'Hips back, weights close to your legs, flat back.',
    one_arm_db_row: 'Row to your hip. Keep your body still.',
    reverse_lunge: 'Step back softly. Front knee over the ankle.',
    single_leg_calf_raise: 'Rise tall on your toes. Lower slowly. Hold the wall.',
    jog_on_spot: 'Light, quick feet. Tell me if anything feels heavy.',
    single_leg_hop: 'Small hops, soft landings. Stop if anything leaks.',
  },
  stages: [
    {
      stage: 0,
      name: 'Reconnect',
      weeks: [1, 6],
      summary: 'Breathing, pelvic floor, gentle core and hip work, easy walks. Starts from birth, as comfortable.',
    },
    {
      stage: 1,
      name: 'Rebuild',
      weeks: [7, 12],
      summary: 'Low-load strength twice a week, 20–25 minutes, and a brisk walk building to 30 minutes.',
      gateLabel:
        'At least 6 weeks since the birth and your postnatal check done. No one has told you to wait, or they have since said go ahead. No stop signs in 7 days, bleeding not up after activity, your scar or tear settled after a 20-minute walk, and a 20-minute walk without symptoms.',
    },
    {
      stage: 2,
      name: 'Strengthen',
      weeks: [13, 16],
      summary:
        'Progressive strength with dumbbells, walk intervals, a low-impact circuit. Week 16 holds the strength check and the two-part symptom check before running.',
      gateLabel:
        'At least 12 weeks since the birth and 8 Stage 1 sessions done. No stop signs and no pelvic floor symptoms in 14 days (or a physio has seen you and said go ahead). No ongoing bleeding that is not a period, unless a clinician said go ahead. No scar pain made worse by exercise in 14 days, and a 30-minute walk without symptoms.',
    },
  ],
  screenMaxAgeDays: 28,
  rulesText: {
    // ---- inputs (doc YAML `inputs`): facts the user reports or the app logs; none is medical clearance
    'input.weeksSinceBirth': 'whole weeks since the birth date the user entered',
    'input.birthType': 'vaginal | assisted | caesarean (assisted = forceps or vacuum)',
    'input.tearRepairedInTheatre': "true | false (user answer: a tear that reached the anal sphincter, the muscle around the back passage; NICE NG210's risk factor is anal sphincter injury)",
    'input.postnatalCheckDone': 'true | false (user answer: has had the 6-8 week check)',
    'input.toldToHoldOff': 'true | false (user answer: a clinician said to wait)',
    'input.clinicianSaidGoAhead': 'true | false (user statement after speaking to a doctor or midwife; recorded with a date, not verified; it lifts a hold or pause only if dated after the answer or sign that set it)',
    'input.physioSaidGoAhead': 'true | false (user statement after seeing a pelvic health physio; recorded with a date, not verified)',
    'input.screen': 'answers to the 10 screen questions Q1a, Q1b, Q2, Q2b, Q3, Q4, Q5, Q5b, Q7, Q8 (section 4; the old Q6 on feeding is retired). Q4 records which parts were yes: leaking, urgency, heaviness or bulge, pain',
    'input.screenSchedule': "asked at the start; re-asked every 4 weeks from the start, at G1, at G2, before w16d2, and whenever the user taps 'Something has changed' (Q3 is not re-asked; Q8 only when weeksSinceBirth >= 8)",
    'input.checkIn': 'after every session, 6 taps: leaking; heaviness or dragging; pain over 3/10 and where (pelvis, pubic bone, back, scar or tear, other); bleeding heavier or redder, clots, or bleeding that had stopped and come back; a ridge or dome along the middle (core days only); anything else new (opens the tier 1 and tier 2 list)',
    'input.stopSignsLast7d': 'count of tier 1 or tier 2 stop signs logged in the last 7 days',
    'input.stopSignsLast14d': 'same, last 14 days',
    'input.pfSymptomsLast14d': 'true if leaking, heaviness or dragging was logged in any check-in or daily log in the last 14 days, or screen Q4 was yes and has not been marked settled',
    'input.q4EverYes': 'true if screen Q4 has ever been answered yes',
    'input.bleedingUpAfterActivityLast7d': 'true if a check-in in the last 7 days logged bleeding heavier or redder, clots, or bleeding that had stopped and come back',
    'input.bleedingUpAfterActivityLast14d': 'same, last 14 days',
    'input.pelvicOrBackPainOver3Last14d': 'true if a check-in in the last 14 days logged pelvic, pubic bone or back pain over 3/10, or still there the next day (scar and tear pain are handled by the wound rule, section 4)',
    'input.ridgeOrDomeLast14d': 'true if a check-in in the last 14 days logged a ridge or dome along the middle',
    'input.ongoingBleedingAfter8w': 'true if screen Q8 was answered yes (non-period bleeding at 8 or more weeks after the birth)',
    'input.scarPainWorseLast14d': "true if R14's after-6-weeks branch fired in the last 14 days (scar pain worse with exercise), unless clinicianSaidGoAhead or physioSaidGoAhead is dated after it",
    'input.physioCheckHad': 'yes | no | not sure (asked once before w16d2; recorded, never a gate)',
    'input.roughNightCount14d': "count of sessions in the last 14 days started with 'rough night'",
    'input.woundSettled': 'true | false (user answer: the scar or tear is no more painful after a 20-minute walk)',
    'input.walk20SymptomFree': 'true if a walk of 20+ minutes was logged in the last 14 days with a clean check-in (or the user says so at entry)',
    'input.walk30SymptomFree': 'true if a walk of 30+ minutes was logged in the last 14 days with a clean check-in',
    'input.stage1Sessions': 'count of completed Stage 1 sessions',
    'input.stage2Sessions': 'count of completed Stage 2 sessions',
    'input.runCheckFails': 'count of failed symptom checks before running',
    'input.conditionFlags': 'knee | hip | back | neck from the profile; the app applies baselineAvoidTags()',

    // ---- stages, gates and entry rules (doc YAML, verbatim)
    stagesNote: 'Programme weeks are NOT weeks since birth. Gates read weeksSinceBirth; entry rule E1 maps one to the other. Every input is a fact the user reports or the app logs. None of them is, or is shown as, medical clearance. The app never shows a gate as medical clearance.',
    'S0.entry': 'screen.Q1a == no AND screen.Q1b == no AND screen.Q7 == no AND (screen.Q2 == no OR clinicianSaidGoAhead) AND (screen.Q5b == no OR clinicianSaidGoAhead)',
    'S0.startWeek': 'weeksSinceBirth 0-1 -> week 1; 2-3 -> week 3; 4 or more -> week 5',
    'S1.gate': 'G1',
    'S2.gate': 'G2',
    G1: 'weeksSinceBirth >= 6 AND postnatalCheckDone AND ((NOT toldToHoldOff AND screen.Q2b == no) OR clinicianSaidGoAhead) AND stopSignsLast7d == 0 AND NOT bleedingUpAfterActivityLast7d AND woundSettled AND walk20SymptomFree',
    G2: 'weeksSinceBirth >= 12 AND stage1Sessions >= 8 AND stopSignsLast14d == 0 AND (NOT pfSymptomsLast14d OR physioSaidGoAhead) AND (NOT ongoingBleedingAfter8w OR clinicianSaidGoAhead) AND NOT scarPainWorseLast14d AND walk30SymptomFree',
    G3a: 'programme week 16 AND stage2Sessions >= 6 AND stopSignsLast14d == 0 AND (NOT ongoingBleedingAfter8w OR clinicianSaidGoAhead) AND NOT scarPainWorseLast14d',
    G3b: 'runCheckPart1 == pass AND weeksSinceBirth >= 12 AND NOT pfSymptomsLast14d AND (NOT q4EverYes OR physioSaidGoAhead) AND NOT bleedingUpAfterActivityLast14d AND NOT pelvicOrBackPainOver3Last14d AND NOT ridgeOrDomeLast14d AND NOT noRunningChoice AND NOT kneeOrHipNextMorningOver3Last14d AND (runCheckFails < 2 OR physioSaidGoAhead)',
    'G1.prompt': "Shown once when G1 is first checked: 'At your 6–8 week check, ask about your running plans and a pelvic health physio assessment' [26][33].",
    'G1.text': 'Gate G1 (doc §3): at least 6 weeks since birth; postnatal check done; not told to wait, and no yes to Q2b (or the user says the clinician has since said go ahead); no stop signs in 7 days; bleeding not up after activity; scar or tear settled after a 20-minute walk; a 20-minute walk without symptoms. The screen is re-asked here.',
    'G2.text': 'Gate G2 (doc §3): at least 12 weeks since birth; at least 8 Stage 1 sessions; no stop signs in 14 days; no pelvic floor symptoms in 14 days (or the user says a physio has seen them and said go ahead); no ongoing non-period bleeding at 8+ weeks (Q8) unless a clinician has said go ahead; no scar pain made worse by exercise in 14 days (R14); a 30-minute walk without symptoms. The screen is re-asked here.',
    'G3a.label': 'Gate into w16d2, part 1 of the symptom check before running: programme week 16, at least 6 Stage 2 sessions, no stop signs in 14 days, no ongoing bleeding that is not a period (unless a clinician said go ahead), and no scar pain made worse by exercise.',
    'G3b.label': "Gate into w16d3, part 2 (impact): part 1 passed and at least 12 weeks since the birth. In the last 14 days: no leaking, heaviness or dragging, no bleeding up after activity, no pelvic, pubic bone or back pain over 3/10, no ridge or dome along the middle, and no flagged knee or hip over 3/10 the next morning. A physio's go-ahead if you ever answered yes to the pelvic floor question, or after 2 failed checks. Not offered if you have chosen not to run.",
    'stage.whyG1': "Why the brief's 6–8 week gate. The Canadian guideline would allow moderate-to-vigorous work earlier, once healed [1]. The app cannot see healing, so it waits for the check. Stage 0 still walks every week, so the activity that supports mood starts early.",
    E1: 'Start at the first week of the highest stage whose entry passes (S0 uses startWeek). Never enter S2 with stage1Sessions < 8, so a late starter always does at least 8 Stage 1 sessions.',
    E2: 'If screen.Q2 == yes and NOT clinicianSaidGoAhead: breathing-and-pelvic-floor mode only (dailyPractice plus breathing_360); no sessions are offered.',
    E3: 'If screen.Q2b == yes and NOT clinicianSaidGoAhead: Stage 0 stays open; G1 fails until clinicianSaidGoAhead.',
    E4: 'If screen.Q7 == yes (pregnant now): end the series and suggest the midwife or doctor.',

    // ---- daily practice (doc YAML dailyPractice)
    'pf-daily':
      'Pelvic floor squeezes, 3 times a day. Blocks: pelvic_floor_hold 10 sets × 10-10 s, rest 10 s; pelvic_floor_quick 1 set × 10-10 reps, rest 0. targetsByWeek: weeks 1-2 holds 5, holdSec 5, quick 5; weeks 3-4 holds 8, holdSec 8, quick 8; weeks 5-16 holds 10, holdSec 10, quick 10. Positions: "lying on your side or back", "sitting", "standing", "walking or lifting". Note: "A session\'s pelvic floor block counts as one of the day\'s three. Caesarean: start once the catheter is out and you are passing urine normally."',

    // ---- flags and handoff (doc YAML)
    'flag.order': 'Flag swaps apply first, then R13 on top, then R4. So a back-flag side_plank still becomes bird_dog when a ridge is logged.',
    'flag.knee': 'Owner decision 2026-10-02: a standing flag is history, not today\'s symptom. It keeps avoiding deep_knee_flexion, but no longer removes impact. Impact is monitored instead (knee-checked running, start-running.md §4, R9). avoidTags [deep_knee_flexion]; swaps { goblet_squat: sit_to_stand_chair, reverse_lunge: step_up_bw }; replaceSession { w16d3: w16d3-low-impact } only when w16d3-low-impact\'s `when` holds; runCheckPassed: "set as normal; never set while the user\'s no-running choice is on".',
    'flag.hip': 'Same as knee (owner decision 2026-10-02). avoidTags [deep_knee_flexion]; swaps { goblet_squat: sit_to_stand_chair, reverse_lunge: step_up_bw }; replaceSession { w16d3: w16d3-low-impact } only when w16d3-low-impact\'s `when` holds; runCheckPassed: "set as normal; never set while the user\'s no-running choice is on".',
    'flag.back': 'avoidTags [spinal_flexion, axial_load]; swaps { goblet_squat: sit_to_stand_chair, suitcase_carry: { S1: { exerciseId: dead_bug, sets: 2, reps: [6, 8], restSec: 30, perSide: true, note: "stop and switch to heel_slide if a ridge or dome shows along your middle" }, S2: side_plank } }. S1 target: w11d3 and w12d3 already hold bird_dog, so the carry becomes dead_bug with its own reps. S2 circuit stations keep the station seconds.',
    'flag.neck': 'avoidTags [overhead]; swaps {}.',
    'handoff.onRunCheckPassed': "Set runCheckPassed = true and say 'You passed the symptom check'. Never say 'run ready' or 'ready to run'. Offer start-running from its week 1, with pf-daily and the check-in kept on, and its R4 cap unchanged.",
    'handoff.onLowImpactFinish': 'Series complete. Offer home-dumbbells or gym-strength plus bike, elliptical, brisk walking or swimming. No running prompt.',
    'path.knee-checked': "Knee or hip flag. Removes deep_knee_flexion (owner decision 2026-10-02: the flag no longer removes impact). goblet_squat → sit_to_stand_chair; reverse_lunge → step_up_bw. Both parts of the symptom check stay open, under knee-checked running: a knee score of 4/10 or more the next morning, or a knee AMBER or RED gate that day, swaps w16d3 for w16d3-low-impact and holds G3b for 14 days. Every other move stays. Knee-checked path: Stages 0–2 as written, then the symptom check before running, then Start Running under knee-checked running (start-running.md §4). A user who says they don't want to run gets the low-impact path: the low-impact finish, then strength series plus bike, elliptical, brisk walking or swimming. Hip: if the flag reflects pelvic pain after birth: exercise reduced lumbopelvic pain in trials [16], and a pelvic health physio can advise on impact.",
    'path.back': 'Back path: everything else unchanged. The running checks stay open. Flag swaps apply before R13, so a ridge or dome turns these into heel_slide and bird_dog. db_rdl stays (it carries only spinal_load, removed at RED).',
    'path.neck': 'Nothing in this series is overhead; no change. Feeding tip: sit well back, supported, with pillows on your lap and shoulders relaxed [33].',
    'birthType.caesarean': 'The Q3 rules. A swim can replace a walk only after bleeding has stopped for 7 days and after the postnatal check [30][33].',
    'birthType.assisted': 'Forceps, vacuum, an anal sphincter tear or a face-up baby: the supervised-programme prompt (Q3) [8]. Bike work waits until sitting on a saddle is comfortable [26].',

    // ---- progression rules (doc YAML `progression`, verbatim as "rule. When: … Then: …")
    R1: 'Week advance. When: the programme week ends. Then: If at least 2 of its 3 sessions were completed, no stop sign was logged and scarPainWorseLast14d is false, go to the next week. Otherwise repeat the week. At the last week of a stage, repeat that week until the next gate passes.',
    R2: "Stage jump. When: any week in S0 or S1 ends. Then: If the next stage's gate passes (G1 or G2), the next week is that stage's first week (week 7 or week 13), even if weeks remain in the current stage. The screen is re-asked before each gate. When G1 is first checked, show once: 'At your 6-8 week check, ask about your running plans and a pelvic health physio assessment.'",
    R3: "Reps, then variant or load. When: every set of a reps block reached the top of its range last time, with a clean check-in for that exercise and 'could do 3 more' (Stage 1) or 'could do 2 more' (Stage 2). Then: Next time use the next step in the progressions table at the bottom of the range, or the next dumbbell pair up, or a firmer band. One change per exercise per week. Otherwise repeat.",
    R4: "Symptom on an exercise. When: a check-in links leaking, heaviness or dragging, muscle or joint pain over 3/10, or a ridge or dome to an exercise (scar or tear pain goes to R14; caesarean leaking in the first 12 weeks also triggers R15). Then: Use that exercise's regression for the next 2 sessions, then retry. If the same exercise is flagged in 2 sessions in a row, keep the regression and show the pelvic health physio prompt.",
    R5: 'Stage hold. When: symptoms are logged in 2 sessions in a row, or pfSymptomsLast14d is true. Then: No stage jump (R2 and G2 fail). Keep training inside the current stage and show the physio prompt. physioSaidGoAhead lifts the hold for G2 only. G3b needs both: no pelvic floor symptoms in the last 14 days (a physio go-ahead cannot override this), and physioSaidGoAhead if screen Q4 was ever yes.',
    R6: "Stop sign. When: a tier 1 or tier 2 stop sign is logged (section 4). Then: Pause the programme and keep the user's place. pf-daily and breathing_360 stay open during any pause. Resume only when the user records clinicianSaidGoAhead dated after the stop sign.",
    R7: "Bleeding. When: a check-in or the Stop button logs bleeding heavier or redder, clots, or bleeding that had stopped and come back, the first time. Then: Tier 2 stop sign. Show 'Stop for today and contact your doctor, midwife or postnatal clinic today.' Pause under R6 (pf-daily and breathing_360 stay open) until clinicianSaidGoAhead dated after the sign. No 'second time' threshold: NICE asks for advice without delay when bleeding increases.",
    R8: "Rough night. When: the user taps 'rough night' before a session. Then: Run the short version: the session's breathing and pelvic floor blocks plus its first exercise block, 10 minutes or less. It counts for R1 and never feeds R3.",
    R9: "Missed time. When: no session is logged for 14 days or more. Then: 14-27 days: restart the current week. 28 days or more: go back 2 weeks, not below the stage's first week, and re-check that stage's gate.",
    R10: "Symptom check before running. When: w16d2 (part 1) or w16d3 (part 2) is completed. Then: Before w16d2, re-ask the screen and ask once 'Guidance recommends a pelvic health physio check before running. Have you had one?' (records physioCheckHad; not a gate). Part 1 pass (every item clean) opens part 2 if G3b passes; G3b also fails on bleeding up after activity, pelvic, pubic bone or back pain over 3/10, or a ridge or dome in the last 14 days. Part 2 pass sets runCheckPassed (see handoff); the copy is 'You passed the symptom check', never 'run ready'. Any fail: stop at that item, no running or jumping, show the physio prompt, set the next week to 13 and repeat weeks 13-16. A bleeding fail is a tier 2 stop sign (R7) and goes to a doctor or midwife, not only the physio. After 2 fails, part 2 stays locked until physioSaidGoAhead.",
    R11: "Daily pelvic floor. When: the user logs a pf-daily round. Then: Below target: the logged numbers become the user's target. Target met 3 days running with no 'squeeze faded' tap: add 1 hold and 1 second, up to 10 x 10 s and 10 quick. At 10 x 10 s, move to the next position in the list.",
    R12: 'Effort ceilings. When: always. Then: Stage 0: easy, full sentences. Stage 1: walks brisk, can talk but not sing; strength sets end with 3 reps to spare. Stage 2: work intervals upper-moderate, short sentences but never just a few words; strength sets end with 2 to spare. Nothing in this series is vigorous or all-out: UK guidance builds to vigorous over at least 3 months after the postnatal check.',
    R13: "Midline ridge. When: a check-in logs a ridge or dome along the middle. Then: For 2 weeks swap dead_bug to heel_slide, side_plank to bird_dog and incline_push_up to wall_push_up. If weeksSinceBirth >= 8 and it is still logged, show 'Please see your doctor about the gap along your middle'. R13 applies after condition-flag swaps.",
    R14: "Wound pain. When: a check-in logs pain where 'scar or tear', or the wound is red, hot, swollen or leaking. Then: Red, hot, swollen or leaking, at any time: tier 2. weeksSinceBirth < 6 and the pain is rising, not settling, or worse after the session: tier 2 ('Contact your doctor, midwife or postnatal clinic today'), pause under R6. weeksSinceBirth >= 6 and the scar pain is worse with exercise: sets scarPainWorseLast14d, so R1 repeats the week and G2 and G3a fail; show 'Ask your doctor, midwife or postnatal clinic about a pelvic health physio'. The hold lifts after 14 days with no scar pain logged, or on clinicianSaidGoAhead or physioSaidGoAhead dated after it. The 3/10 rule never applies to wound pain.",
    R15: "Caesarean and new leaking. When: birthType == caesarean AND weeksSinceBirth < 12 AND leaking is logged (the leaking part of screen Q4, or the leaking tap in a check-in), the first time. Then: Show the tier 2 copy first: 'Contact your doctor, midwife or postnatal clinic today.' Pause under R6. Show the pelvic health physio prompt after that. The 12-week window is our cut-off, not a source's.",
    R16: "Tiredness. When: roughNightCount14d is at least half of the sessions started in the last 14 days. Then: Show once: 'Tiredness that rest does not fix is worth mentioning to your doctor.' No change to the programme.",

    // ---- session-level fields the contract has no place for (doc YAML, verbatim)
    'session.stage1Pf': 'Stages 1 and 2: the pelvic_floor_hold block (5 × 10 s) carries note "one of today\'s three pelvic floor rounds".',
    'session.notes': 'bird_dog (Stage 1 B): "pause 2 seconds at full reach". dead_bug (w10d1, w11d1, w12d1): "stop and switch to heel_slide if a ridge or dome shows along your middle". suitcase_carry (w11d3, w12d3): "a loaded bag or a 3-5 kg weight; walk tall". goblet_squat (w13d1, w14d1, w15d1): "sit back to a box or chair; no deeper". side_plank (w13d1, w14d1, w15d1): "knees bent; swap to bird_dog if a ridge or dome shows". breathing_360 in w13d2, w14d2, w15d2: "standing; the cool-down"; in w16d3-low-impact: "the cool-down".',
    'session.walkIntervals': 'w13d2, w14d2, w15d2 substitute: "bike_intervals on a stationary bike, same rounds and times". An interval rest of null means keep walking or pedalling easily.',
    'session.circuit': 'w13d3, w14d3, w15d3 circuitNote: "per-side stations: switch sides halfway through the station".',
    'session.w16d1': 'Strength check tests (records where to focus, never a gate): single_leg_calf_raise "count reps to fatigue; aim 20 a side; records where to focus, never a gate"; single_leg_glute_bridge, single_leg_sit_to_stand and side_lying_hip_abduction "count reps to fatigue; aim 20 a side; never a gate".',
    'session.w16d2': 'gate: G3a; onFail: R10-fail. Tests: brisk_walk "pass = no leaking, heaviness, dragging, pain or bleeding during or after"; single_leg_balance "pass = 10 seconds a side, no symptoms"; single_leg_squat_partial "pass = 10 a side, no symptoms".',
    'session.w16d3': 'gate: G3b; onPass: R10-pass; onFail: R10-fail. stopRule: "stop at the first leak, heaviness, dragging, pain, or bleeding; that item and the check are a fail. Bleeding is also a tier 2 stop sign (R7): contact your doctor, midwife or postnatal clinic today". Tests: jog_on_spot "pass = 1 minute, no symptoms"; forward_bound "pass = 10, no symptoms"; single_leg_hop "pass = 10 a leg, no symptoms"; running_man "pass = 10 a side, no symptoms".',
    'session.w16d3-low-impact': 'replaces: w16d3. when: "noRunningChoice OR kneeOrHipGateAmberOrRedToday OR kneeOrHipNextMorningOver3Last14d". substitute: "elliptical, or brisk_walk intervals, same rounds and times".',
    'session.minutes': 'Session minutes were checked against the block times (about 4 s a rep, 3 s for presses and rows, 2 s for quick squeezes, plus rests and 15 s between blocks).',
    'session.roleRule': 'No exercise id appears twice in one session, with one exception: a brisk_walk warm-up or cool-down block marked role: warmup or role: cooldown may repeat the session\'s walk id (w13d2, w14d2, w15d2, w16d3).',

    // ---- regressions and progressions (doc §3 table): easier | harder
    'prog.pelvic_floor_hold': 'Easier: fewer or shorter holds; lie on your side. Harder: sitting → standing → during walks and lifts; squeeze before a cough or lift [33].',
    'prog.breathing_360': 'Easier: side-lying with pillows. Harder: sitting, then standing.',
    'prog.pelvic_tilt': 'Easier: smaller range. Harder: heel_slide.',
    'prog.heel_slide': 'Easier: pelvic_tilt. Harder: dead_bug (from week 10).',
    'prog.knee_fallout': 'Easier: smaller range. Harder: bird_dog.',
    'prog.glute_bridge': 'Easier: pelvic_tilt; a smaller lift (caesarean: stop where the scar pulls). Harder: 3-second hold at the top → single_leg_glute_bridge (Stage 2) → hip_thrust (after the series).',
    'prog.sit_to_stand_chair': 'Easier: higher seat; push off with your hands. Harder: 3-second lowering → goblet_squat to a box (Stage 2) → single_leg_sit_to_stand.',
    'prog.wall_push_up': 'Easier: feet closer to the wall. Harder: incline_push_up (week 10) → a lower surface → push_up (after the series).',
    'prog.band_row': 'Easier: lighter band. Harder: step back for more tension → one_arm_db_row (Stage 2).',
    'prog.clamshell': 'Easier: smaller range. Harder: side_lying_hip_abduction → band above the knees.',
    'prog.side_lying_hip_abduction': 'Easier: clamshell. Harder: side_plank with knees bent (Stage 2).',
    'prog.bird_dog': 'Easier: arm only, or leg only. Harder: longer pause at full reach.',
    'prog.dead_bug': 'Easier: heel_slide (also when a ridge or dome shows, R13). Harder: longer reach, slower.',
    'prog.band_good_morning': 'Easier: glute_bridge. Harder: db_rdl (Stage 2).',
    'prog.db_rdl': 'Easier: band_good_morning. Harder: heavier pair, gradually. [26] suggests starting no heavier than a baby in a car seat (about 15 kg in total).',
    'prog.suitcase_carry': 'Easier: lighter bag, shorter walk. Harder: heavier → farmers_carry (after the series).',
    'prog.side_plank': 'Easier: bird_dog (also when a ridge or dome shows). Harder: straight legs (after the series).',
    'prog.goblet_squat': 'Easier: sit_to_stand_chair. Harder: heavier dumbbell, same box height.',
    'prog.db_step_up': 'Easier: step_up_bw (no load, lower step, hold a rail). Harder: higher step, knee no higher than the hip.',
    'prog.reverse_lunge': 'Easier: step_up_bw. Harder: hold dumbbells.',
    'prog.single_leg_calf_raise': 'Easier: both feet, holding a wall. Harder: slower lowering.',
    'prog.brisk_walk': 'Easier: shorter, flat route, easy effort. Harder: brisk effort → hills → walk intervals → start-running once runCheckPassed.',

    // ---- screen (doc §4): schedule, full outcomes and effects[] per question
    'screen.schedule': 'Asked at the start, then re-asked every 4 weeks from the start, at G1, at G2, before w16d2, and whenever the user taps "Something has changed". Q3 is not re-asked; Q8 is asked only from 8 weeks after the birth. The wording is ours; the topics follow the CSEP GAQ-PP [2] and the NICE list of serious symptoms [7]. For the full questionnaire, link out to [2]; do not copy it. Questions describe symptoms; no answer or copy names a condition.',
    'screen.Q1a': 'Do not start. Show: "Call {emergency} now." Ask again on the next open. Same routing as medical_emergency in chatSafety.ts. Mirrors tier 1 [7][36]. effects: none.',
    'screen.Q1b': 'Do not start. Show: "Please get medical advice today from your doctor, midwife or postnatal clinic." Ask again on the next open. Mirrors tier 2 [7][31][37]. effects: none.',
    'screen.Q2': 'Breathing and pelvic floor only (E2): pf-daily and breathing_360, no sessions. Show: "Ask them about walking and gentle strength. Tap \'They said go ahead\' when they do." That records clinicianSaidGoAhead with a date, as the user\'s statement. effects: E2 (pf-daily and breathing_360 stay open).',
    'screen.Q2b': 'Stage 0 stays open; G1 waits (E3) until clinicianSaidGoAhead. Show: "Please talk to your doctor before harder exercise. Gentle walks, breathing and pelvic floor work can carry on." The Canadian list covers moderate-to-vigorous work and allows usual daily activity [1][2]. effects: E3 (holds G1).',
    'screen.Q3': 'Caesarean: pelvic floor starts once the catheter is out; "roll to your side" cue; nothing heavier than your baby for 6 weeks; G1 also needs woundSettled; R15 applies to new leaking. Forceps, vacuum, an anal sphincter tear or a face-up baby: show "Ask your doctor or midwife about a supervised pelvic floor programme with a physio" [8]. Stage 0 goes ahead in all cases. effects: sets birthType and tearRepairedInTheatre; caesarean adds woundSettled to G1 and turns on R15.',
    'screen.Q4': 'The user taps which parts apply (leaking, urgency, heaviness or bulge, pain). Caesarean in the last 12 weeks, with leaking: first show "Contact your doctor, midwife or postnatal clinic today" (R15) [9][31]. Then, for everyone: "These are common after birth, and treatable. A pelvic health physio is the right person: ask your doctor, midwife or postnatal clinic how to see one" [29][33]. Sets pfSymptomsLast14d and q4EverYes. That holds G2 until settled or physioSaidGoAhead. G3b needs both 14 clean days and physioSaidGoAhead (R5) [26]. The programme continues. effects: sets pfSymptomsLast14d and q4EverYes (R5, G2, G3b); caesarean under 12 weeks with leaking: R15.',
    'screen.Q5': 'Show: "Please talk to your doctor, midwife or postnatal clinic this week. Exercise can help alongside care, not instead of it" [12][32]. The programme continues. Less than 2 weeks after the birth, shown with the question whatever the answer: "Feeling low or tearful in the first days is common. If it is getting worse or you are struggling to cope, talk to your midwife or doctor now" [32]. effects: none.',
    'screen.Q5b': 'Show: "Please see a doctor today. If anyone may be in danger, call {emergency}." Pause (R6) until clinicianSaidGoAhead [38]. effects: R6 (pause).',
    'screen.Q7': 'End the series (E4). Show: "This series is for after the birth. Please talk to your midwife or doctor about exercise in pregnancy." effects: E4 (ends the series).',
    'screen.Q8': '(From 8 weeks after the birth.) Tier 2: "Contact your doctor, midwife or postnatal clinic today." Pause (R6); G2 and G3a fail until clinicianSaidGoAhead [1][2][7][26]. effects: R6 (pause; pf-daily and breathing_360 stay open); sets ongoingBleedingAfter8w (G2, G3a).',
    'screen.feeding': 'Feeding (the old Q6). Not a safety question, so it left the screen. It does not become a setup question either: the cue already reads "if you need to", so it needs no input. Everyone sees the session-start cue "Feed or express first if you need to", the intro\'s What you need line "If you are feeding: a well-fitted, supportive sports bra", and the rest cue "Sip some water, especially if you\'re feeding" [14][17][26][30].',
    'screen.support': 'Always visible, on the screen and the intro, whatever the answers: a "Thoughts of harming yourself or your baby? Get help now" link that opens SupportSheet (995, mindline 1771, SOS 1767 today) [32].',
    emergency: 'Emergency copy is written as {emergency}. It should render from one constant shared with chatSafety.ts and SupportSheet (today "995 or go to A&E"). Copy names roles, not one country\'s services: "your doctor, midwife or postnatal clinic" for advice, "a pelvic health physio" for pelvic floor care.',
    chatSafety: "Phrases for the postpartum chatSafety rows, all under the existing medical_emergency kind: face drooping, arm weakness, slurred speech; blurred vision or flashing lights after the birth, pain under the ribs, sudden swelling of the face, hands or feet; heavy bleeding or clots; seeing or hearing things others don't, feeling very confused. Thoughts of harming yourself or your baby stay with the existing self_harm rows.",

    // ---- stop-sign notes (doc §4)
    'stopSigns.checkIn': 'The 6-tap check-in after every session feeds the tiers. "Anything else new" opens the full tier 1 and tier 2 list, starting with the signs no other tap covers: a wound that is red, hot or leaking; fever; calf pain or swelling; headache or vision changes; breathlessness; a drooping face, weak arm or slurred speech; pain or burning when you pee. A "Stop" button during a session offers the same list.',
    'stopSigns.scarAfter6w': 'Scar pain after 6 weeks that is worse with exercise is not a stop sign: progression holds and the app shows "Ask your doctor, midwife or postnatal clinic about a pelvic health physio" (R14) [2][34].',
    'stopSigns.aches': 'Aches up to 3/10 in muscles and joints that are gone by the next morning are expected, and do not count as stop signs. That threshold is expert opinion, borrowed from tendon rehab, and covers muscle and joint pain only, never wound pain [26].',
    'stopSigns.tier3': 'Leaking and heaviness are tier 3, not a programme stop: these symptoms stop the exercise that caused them, block impact and stage jumps (R4, R5, G2, G3b), and send the user to a pelvic health physio, while breathing, pelvic floor and low-load work continue. One exception: new leaking in the first 12 weeks after a caesarean goes to a doctor or midwife first (R15).',

    // ---- intro and standalone
    length: '16 weeks from birth. Less if you start later. Longer if a stage needs repeating.',
    'standalone.doc': 'Doc §3 lists w5d1 as "Pelvic floor and core" (16 min, floor only) and w9d3 as "Gentle strength" (25 min, a band), both still running the pre-start screen. PRD §4.9 and programs/README override this: none on purpose, a one-off session would skip the stage gates.',

    _cues:
      'Session start: "Feed or express first if you need to. I\'ll wait." | "Short and gentle today. Every minute here counts." | "Roll onto your side to get up from the floor." | "Rough night? Tap it, and we\'ll do ten minutes." ' +
      'breathing_360: "Breathe in wide, into your ribs and back." | "Breathe out slowly. Feel everything gently lift." ' +
      'pelvic_floor_hold: "Squeeze as if stopping wind and wee. Lift." | "Keep breathing. Bottom and shoulders stay soft." | "Now let go fully. Feel it soften." ' +
      'brisk_walk: "Walk tall, at today\'s pace." | "Pushing a pram? Set the handles so your elbows bend at right angles." (The pace comes from each block\'s effort text, so this cue never asks for more.) ' +
      'Symptom check before running: "Stop at the first leak, heaviness, pain or bleeding." | "Stopping early is information, not failure." ' +
      'Rests: "Rest. Sip some water, especially if you\'re feeding." | "Shake it out. The next one starts in ten." | "Any leaking, heaviness or pain? Tell me. We\'ll adjust." ' +
      'Finish: "Done. That counts, whatever today looked like." | "That\'s one of today\'s three squeeze rounds done." | "Quick check: any leaking, heaviness, pain, more bleeding or clots?" | "See you next time. Rest when the baby rests." ' +
      'Always shown: "Thoughts of harming yourself or your baby? Get help now." It opens Support.',

    _transcriptionNotes: [
      '1. All 48 standard sessions are written out (doc writes every session); identical weeks share block constants. type: stage 0 mobility, stages 1-2 strength (PRD §5.2), including the stage 1-2 walks and walk intervals.',
      '2. shape moved from session to blocks: minutes → steady, rounds + work → intervals, rounds + stations → circuit, the rest sets (w16d2 is a sets session whose 30-minute walk is steady).',
      '3. Roles: the doc marks only the brisk_walk warm-ups and the w16d3 cool-down. The doc calls the breathing_360 block in w13d2, w14d2, w15d2 and w16d3-low-impact "the cool-down", so it gets role cooldown (not logged); the stationary_bike opener of w16d3-low-impact ("easy spin, building up") gets role warmup. Interval rests stay null as in the doc.',
      '4. Paths. A knee or hip flag keeps impact (owner decision 2026-10-02), so the flag path is the doc\'s "Knee-checked path" (series-specific id knee-checked, like start-running), with the goblet_squat and reverse_lunge swaps and no session replacement; the conditional w16d3 → w16d3-low-impact swap is in path.knee-checked and session.w16d3-low-impact. low-impact is the no-running choice (train.noImpact): w16d3 → w16d3-low-impact plus the knee swaps, so the path holds no impact or deep_knee_flexion tag as the PRD data test requires. Conservative choice: an unflagged user who chooses not to run also gets the two knee swaps, which the doc applies only with a flag.',
      '5. back path: the doc\'s stage-dependent suitcase_carry swap (S1 dead_bug 2 × 6-8 a side, S2 side_plank) cannot be a single swap map, and suitcase_carry → dead_bug would duplicate the circuit\'s dead_bug station. So S2 uses the swap suitcase_carry → side_plank (station seconds kept) and S1 uses replaceSessions w11d3/w12d3 → altOnly w11d3-back/w12d3-back, where the carry is dead_bug 2 × [6, 8] reps, rest 30, per side. Its note is in flag.back.',
      '6. Shoulder is not in the doc; mapped to no-overhead (the gate\'s shoulder AMBER set is overhead only, and nothing here is overhead). No flagAvoid: every doc avoid set equals the gate\'s AMBER set minus impact.',
      '7. Dropped block fields kept in rulesText: note (session.notes, session.stage1Pf), test (session.w16d1/w16d2/w16d3), gate/onPass/onFail/stopRule (session.w16d2, session.w16d3), substitute (session.walkIntervals, session.w16d3-low-impact), circuitNote (session.circuit), replaces/when (session.w16d3-low-impact). Circuit stations get no perSide: their seconds are the whole station with a switch halfway.',
      '8. Screen: 10 questions with the doc ids. onYes from the doc\'s schema table; its effects[] (not in the contract) are in screen.<id>. yesCopy is the quoted "Show:" line; Q3 has no single line, so its yesCopy joins the caesarean rules and the quoted forceps line; Q4 uses the "for everyone" line (the caesarean R15 line comes first, in screen.Q4). Q8\'s "(From 8 weeks after the birth.)" condition moved to screen.Q8 and input.screenSchedule. No shared markers (Postpartum). Q7 is a wait that ends the series (E4). {emergency} is left as a placeholder for the shared constant (rulesText.emergency).',
      '9. stopSigns: the three tiers, with the tier name at the start of each action.',
      '10. advance: minCompleted 2 (R1). maxPainToAdvance 3 from the §4 aches threshold. The doc never drops a week back for pain, and a drop back would cross a stage gate, so dropBackPainAtLeast is 11 (unreachable). longGapDays 14 (R9); R9\'s 28+ day branch (back 2 weeks within the stage, re-check the gate) is in rulesText.R9. R1 also repeats on any stop sign or scar pain, and at a stage\'s last week until the gate passes.',
      '11. No ladders: the doc has a regressions/progressions table (prog.<id>) but no slot ladders; the week-by-week variant changes are already written into the sessions.',
      '12. standalone is empty: PRD §4.9 and programs/README say Postpartum has none on purpose; the doc §3 picks are in standalone.doc.',
      '13. stages: gateLabel holds G1 (stage 1) and G2 (stage 2) in plain words. G3a and G3b gate sessions w16d2 and w16d3, not a stage, so StageSpec has no place for them; their plain labels are G3a.label and G3b.label.',
      '14. Source kinds: NHS pages (29-32, 36-38) and the GAQ-PP tool (2) → guideline; POGP and the MKUH leaflet (33, 34) → programme; Goom and both Delphis (26-28) → consensus; 21 and 35 (systematic and scoping reviews without pooling) → review; 19 and 20 (non-randomised experimental studies) → cohort, the nearest kind, with the design kept in the citation; 22 (RCT secondary analysis) → rct.',
      '15. equipment: bodyweight, band, dumbbell, bike. The doc lists a stationary bike as optional and uses it in w16d3-low-impact; elliptical appears only as that session\'s substitute and is left out. No honestLine: the doc has none.',
      '16. cues: one line per key (the first line for each); every §6 line with more than one option, plus the session-start, rest and finish alternatives and the symptom-check lines, is in _cues. cues.support is the always-visible support link copy.',
      '17. The daily pelvic floor routine (pf-daily) is not a session; it is kept in rulesText with R11.',
    ].join(' '),
  },
}
