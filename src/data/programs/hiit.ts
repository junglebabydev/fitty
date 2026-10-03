// HIIT, transcribed from docs/programs/hiit.md (§3 YAML, §4 safety, §5 intro, §6 cues, Sources).
// Standard track = days 1-3 below; the low-impact circuits ('-li') are altOnly and reached via paths['low-impact'].
import type { Block, Program, ProgramSession } from '../../domain/programs'

// ---- shared blocks ------------------------------------------------------------------------------------------

const bikeWarmup: Block = { shape: 'steady', exerciseId: 'stationary_bike', minutes: 5, effort: 'easy, building to 4 of 10', role: 'warmup' }
const bikeCooldown: Block = { shape: 'steady', exerciseId: 'stationary_bike', minutes: 3, effort: 'easy, can talk in sentences', role: 'cooldown' }
const marchWarmup: Block = { shape: 'steady', exerciseId: 'march_in_place', minutes: 4, effort: 'easy, building to 4 of 10', role: 'warmup' }
const marchCooldown: Block = { shape: 'steady', exerciseId: 'march_in_place', minutes: 3, effort: 'slow, let the breathing settle', role: 'cooldown' }

/** Machine intervals on the default machine (rest is easy spinning on the same machine). */
function bike(rounds: number, workSec: number, workEffort: string, restSec: number, restEffort: string): Block {
  return {
    shape: 'intervals',
    rounds,
    work: { exerciseId: 'stationary_bike', seconds: workSec, effort: workEffort },
    rest: { exerciseId: 'stationary_bike', seconds: restSec, effort: restEffort },
  }
}

/** Bodyweight circuit: every station runs `seconds`. */
function circuit(rounds: number, ids: string[], seconds: number, restBetweenStationsSec: number): Block {
  return {
    shape: 'circuit',
    rounds,
    stations: ids.map((exerciseId) => ({ exerciseId, seconds })),
    restBetweenStationsSec,
    restBetweenRoundsSec: 60,
  }
}

function machineDay(key: string, week: number, name: string, minutes: number, main: Block, coolDown = true): ProgramSession {
  return { key, week, name, type: 'conditioning', minutes, blocks: coolDown ? [bikeWarmup, main, bikeCooldown] : [bikeWarmup, main] }
}

function circuitDay(key: string, week: number, name: string, minutes: number, main: Block, altOnly = false): ProgramSession {
  const s: ProgramSession = { key, week, name, type: 'conditioning', minutes, blocks: [marchWarmup, main, marchCooldown] }
  return altOnly ? { ...s, altOnly: true } : s
}

const HARD_30 = 'hard, 8 of 10, a word or two only'
const STEADY_HARD = 'hard but steady, 7 of 10, a few words'
const EASY_SPIN = 'easy spin, 3 of 10'
const FOUR_BY_FOUR = 'hard, 8 of 10, a few words; 90-95% max HR if worn'
const LAST_IS_COOLDOWN = 'easy spin, 3 of 10; the last one is the cool-down'

// ---- sessions -----------------------------------------------------------------------------------------------

const sessions: ProgramSession[] = [
  // Week 1
  machineDay('w1d1', 1, 'Short intervals, long rests', 20, bike(6, 30, HARD_30, 90, EASY_SPIN)),
  circuitDay('w1d2', 1, 'First circuit', 20, circuit(3, ['jumping_jack', 'bodyweight_squat', 'mountain_climber', 'incline_push_up'], 30, 30)),
  circuitDay('w1d2-li', 1, 'First circuit (low impact)', 20, circuit(3, ['step_jack', 'glute_bridge', 'mountain_climber', 'incline_push_up'], 30, 30), true),
  machineDay('w1d3', 1, 'Two-minute efforts', 24, bike(4, 120, STEADY_HARD, 120, EASY_SPIN)),
  // Week 2
  machineDay('w2d1', 2, 'Short intervals, long rests', 24, bike(8, 30, HARD_30, 90, EASY_SPIN)),
  circuitDay('w2d2', 2, 'Five-station circuit', 23, circuit(3, ['jumping_jack', 'bodyweight_squat', 'mountain_climber', 'incline_push_up', 'high_knees'], 30, 30)),
  circuitDay('w2d2-li', 2, 'Five-station circuit (low impact)', 23, circuit(3, ['step_jack', 'glute_bridge', 'mountain_climber', 'incline_push_up', 'shadow_boxing'], 30, 30), true),
  machineDay('w2d3', 2, 'Three-minute efforts', 23, bike(3, 180, STEADY_HARD, 120, EASY_SPIN)),
  // Week 3
  machineDay('w3d1', 3, 'Shorter rests', 20, bike(8, 30, HARD_30, 60, EASY_SPIN)),
  circuitDay('w3d2', 3, 'Forty-twenty circuit', 23, circuit(3, ['jumping_jack', 'bodyweight_squat', 'mountain_climber', 'incline_push_up', 'high_knees'], 40, 20)),
  circuitDay('w3d2-li', 3, 'Forty-twenty circuit (low impact)', 23, circuit(3, ['step_jack', 'glute_bridge', 'mountain_climber', 'incline_push_up', 'shadow_boxing'], 40, 20), true),
  machineDay('w3d3', 3, 'Three-minute efforts', 28, bike(4, 180, STEADY_HARD, 120, EASY_SPIN)),
  // Week 4
  machineDay('w4d1', 4, 'Shorter rests, more rounds', 23, bike(10, 30, HARD_30, 60, EASY_SPIN)),
  circuitDay('w4d2', 4, 'Six-station circuit', 26, circuit(3, ['jumping_jack', 'bodyweight_squat', 'mountain_climber', 'push_up', 'high_knees', 'plank'], 40, 20)),
  circuitDay('w4d2-li', 4, 'Six-station circuit (low impact)', 26, circuit(3, ['step_jack', 'glute_bridge', 'mountain_climber', 'push_up', 'shadow_boxing', 'plank'], 40, 20), true),
  machineDay('w4d3', 4, 'Four-minute efforts', 29, bike(3, 240, STEADY_HARD, 180, EASY_SPIN)),
  // Week 5 (d1: the doc's 2 sets × 6 with 180 s between sets, collapsed to 12 rounds; see rulesText.setRest)
  machineDay('w5d1', 5, 'Forty-twenty sets', 23, bike(12, 40, 'hard but repeatable, 7 to 8 of 10', 20, 'easy spin')),
  circuitDay('w5d2', 5, 'Six-station circuit with burpees', 26, circuit(3, ['burpee', 'bodyweight_squat', 'mountain_climber', 'push_up', 'high_knees', 'plank'], 40, 20)),
  circuitDay('w5d2-li', 5, 'Six-station circuit (low impact)', 26, circuit(3, ['step_jack', 'single_leg_glute_bridge', 'mountain_climber', 'push_up', 'shadow_boxing', 'plank'], 40, 20), true),
  machineDay('w5d3', 5, 'Four-minute efforts', 29, bike(3, 240, 'hard, 7 to 8 of 10, a few words', 180, EASY_SPIN)),
  // Week 6 (d1: 2 sets × 8, collapsed to 16 rounds)
  machineDay('w6d1', 6, 'Forty-twenty sets', 27, bike(16, 40, 'hard but repeatable, 7 to 8 of 10', 20, 'easy spin')),
  circuitDay('w6d2', 6, 'Four-round circuit', 29, circuit(4, ['burpee', 'bodyweight_squat', 'mountain_climber', 'push_up', 'high_knees'], 40, 20)),
  circuitDay('w6d2-li', 6, 'Four-round circuit (low impact)', 29, circuit(4, ['step_jack', 'single_leg_glute_bridge', 'mountain_climber', 'push_up', 'shadow_boxing'], 40, 20), true),
  machineDay('w6d3', 6, 'Four-minute efforts, harder', 29, bike(3, 240, 'hard, 8 of 10, a few words', 180, EASY_SPIN)),
  // Week 7 (d3: no cool-down block; the last rest is the cool-down)
  machineDay('w7d1', 7, 'Twelve sharp efforts', 26, bike(12, 30, 'very hard, 8 to 9 of 10', 60, EASY_SPIN)),
  circuitDay('w7d2', 7, 'Six-station circuit', 26, circuit(3, ['burpee', 'bodyweight_squat', 'mountain_climber', 'push_up', 'high_knees', 'jumping_jack'], 40, 20)),
  circuitDay('w7d2-li', 7, 'Six-station circuit (low impact)', 26, circuit(3, ['step_jack', 'single_leg_glute_bridge', 'mountain_climber', 'push_up', 'shadow_boxing', 'march_in_place'], 40, 20), true),
  machineDay('w7d3', 7, 'Four by four', 33, bike(4, 240, FOUR_BY_FOUR, 180, LAST_IS_COOLDOWN), false),
  // Week 8 (d1: 2 sets × 8, collapsed to 16 rounds)
  machineDay('w8d1', 8, 'Forty-twenty sets', 27, bike(16, 40, 'hard but repeatable, 8 of 10', 20, 'easy spin')),
  circuitDay('w8d2', 8, 'Four-round circuit', 29, circuit(4, ['burpee', 'bodyweight_squat', 'mountain_climber', 'push_up', 'high_knees'], 40, 20)),
  circuitDay('w8d2-li', 8, 'Four-round circuit (low impact)', 29, circuit(4, ['step_jack', 'single_leg_glute_bridge', 'mountain_climber', 'push_up', 'shadow_boxing'], 40, 20), true),
  machineDay('w8d3', 8, 'Four by four', 33, bike(4, 240, FOUR_BY_FOUR, 180, LAST_IS_COOLDOWN), false),
]

// ---- programme ----------------------------------------------------------------------------------------------

export const program: Program = {
  id: 'hiit',
  status: 'preview',
  title: 'HIIT',
  promise: 'Raise your fitness with three short, hard sessions a week.',
  description:
    'Eight weeks of interval training: two machine sessions and one bodyweight circuit each week, 20 to 33 minutes each. You work hard in short bursts and recover in between. Expect better fitness within weeks. Do not expect much change in body fat; short programmes rarely shift it. Knee or hip issues? The low-impact track keeps every move off the jump.',
  weeks: 8,
  sessionsPerWeek: 3,
  minutes: [20, 33],
  equipment: ['bike', 'machine', 'elliptical', 'bodyweight'],
  needs: 'A bike, air bike, rower, elliptical or ski erg for two sessions; a mat-sized space for the third. No machine? We swap in bodyweight intervals.',
  timePerWeek: 'About 65 minutes in week 1, rising to about 90 in week 8.',
  why: [
    { text: 'Hard intervals raise aerobic fitness more than no exercise, and slightly more than steady cardio', source: 2 },
    { text: 'Sessions of 15 minutes or less improved fitness about as much as longer steady cardio', source: 8 },
    { text: 'In an 8-week running trial, 4 × 4-minute hard efforts raised fitness 7%', source: 10 },
  ],
  sources: [
    { n: 1, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/26243014/', citation: 'Milanović Z et al. Effectiveness of High-Intensity Interval Training (HIT) and Continuous Endurance Training for VO2max Improvements: A Systematic Review and Meta-Analysis of Controlled Trials. Sports Medicine. 2015.' },
    { n: 2, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/38760916/', citation: 'Poon ET et al. High-intensity interval training and cardiorespiratory fitness in adults: An umbrella review of systematic reviews and meta-analyses. Scandinavian Journal of Medicine & Science in Sports. 2024.' },
    { n: 3, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/28401638/', citation: 'Wewege M et al. The effects of high-intensity interval training vs. moderate-intensity continuous training on body composition in overweight and obese adults: a systematic review and meta-analysis. Obesity Reviews. 2017.' },
    { n: 4, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/28513103/', citation: 'Keating SE et al. A systematic review and meta-analysis of interval training versus moderate-intensity continuous training on body adiposity. Obesity Reviews. 2017.' },
    { n: 5, kind: 'retraction', url: 'https://doi.org/10.1136/bjsports-2018-099928.ret', citation: 'Viana RB et al. Is interval training the magic bullet for fat loss? (RETRACTED December 2020; retraction notice). British Journal of Sports Medicine. 2019 (retracted 2020). Retraction notice dated 15 December 2020 in its Crossref record (original record: https://pubmed.ncbi.nlm.nih.gov/30765340/).' },
    { n: 6, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/27115137/', citation: 'Gillen JB et al. Twelve Weeks of Sprint Interval Training Improves Indices of Cardiometabolic Health Similar to Traditional Endurance Training despite a Five-Fold Lower Exercise Volume and Time Commitment. PLoS One. 2016. Controlled trial (small; groups matched, not randomised).' },
    { n: 7, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/22289907/', citation: 'Gibala MJ et al. Physiological adaptations to low-volume, high-intensity interval training in health and disease. Journal of Physiology. 2012.' },
    { n: 8, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/37939367/', citation: 'Yin M et al. Is low-volume high-intensity interval training a time-efficient strategy to improve cardiometabolic health and body composition? A meta-analysis. Applied Physiology, Nutrition, and Metabolism. 2024.' },
    { n: 9, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/8897392/', citation: 'Tabata I et al. Effects of moderate-intensity endurance and high-intensity intermittent training on anaerobic capacity and VO2max. Medicine & Science in Sports & Exercise. 1996. Uncontrolled training study.' },
    { n: 10, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/17414804/', citation: 'Helgerud J et al. Aerobic high-intensity intervals improve VO2max more than moderate training. Medicine & Science in Sports & Exercise. 2007.' },
    { n: 11, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/33028588/', citation: 'Stensvold D et al. Effect of exercise training for five years on all cause mortality in older adults — the Generation 100 study: randomised controlled trial. BMJ. 2020.' },
    { n: 12, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/22879367/', citation: 'Rognmo Ø et al. Cardiovascular risk of high- versus moderate-intensity aerobic exercise in coronary heart disease patients. Circulation. 2012.' },
    { n: 13, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/28082387/', citation: 'Ellingsen Ø et al. High-Intensity Interval Training in Patients With Heart Failure With Reduced Ejection Fraction. Circulation. 2017.' },
    { n: 14, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/24144531/', citation: 'Weston KS et al. High-intensity interval training in patients with lifestyle-induced cardiometabolic disease: a systematic review and meta-analysis. British Journal of Sports Medicine. 2014.' },
    { n: 15, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', citation: "Riebe D et al. Updating ACSM's Recommendations for Exercise Preparticipation Health Screening. Medicine & Science in Sports & Exercise. 2015." },
    { n: 16, kind: 'consensus', url: 'https://eparmedx.com/wp-content/uploads/2025/01/PARQPlus2025Fillable.pdf', citation: 'PAR-Q+ Collaboration. The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+), 2025 version. eparmedx.com. 2025. Screening tool.' },
    { n: 17, kind: 'guideline', url: 'https://acsm.org/wp-content/uploads/2025/03/GETP11-12-crosswalk.pdf', citation: "Bayles MP, Hardwick J (American College of Sports Medicine). GETP 11–12 Crosswalk: updates from ACSM's Guidelines for Exercise Testing and Prescription 11th to 12th editions. ACSM. 2025." },
    { n: 18, kind: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/21694556/', citation: 'Garber CE et al. American College of Sports Medicine position stand. Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. Medicine & Science in Sports & Exercise. 2011.' },
    { n: 19, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/17101527/', citation: 'LaForgia J et al. Effects of exercise intensity and duration on the excess post-exercise oxygen consumption. Journal of Sports Sciences. 2006. Narrative review.' },
    { n: 20, kind: 'review', url: 'https://pubmed.ncbi.nlm.nih.gov/32656951/', citation: 'Panissa VLG et al. Magnitude and duration of excess of post-exercise oxygen consumption between high-intensity interval and moderate-intensity continuous exercise: A systematic review. Obesity Reviews. 2021.' },
    { n: 21, kind: 'guideline', url: 'https://www.cdc.gov/physical-activity-basics/measuring/index.html', citation: 'Centers for Disease Control and Prevention. How to Measure Physical Activity Intensity. CDC. 2025.' },
    { n: 22, kind: 'review', url: 'https://pubmed.ncbi.nlm.nih.gov/39076925/', citation: 'Vieira AM et al. Application and Measurement Properties of the Talk Test in Cardiopulmonary Patients: A Systematic Review. Reviews in Cardiovascular Medicine. 2022.' },
    { n: 23, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/30685470/', citation: 'Taylor JL et al. Guidelines for the delivery and monitoring of high intensity interval training in clinical populations. Progress in Cardiovascular Diseases. 2019.' },
    { n: 24, kind: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/33239350/', citation: 'Bull FC et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine. 2020.' },
    { n: 25, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/29874256/', citation: 'Oliveira BRR et al. Affective and enjoyment responses in high intensity interval training and continuous training: A systematic review and meta-analysis. PLoS One. 2018.' },
    { n: 26, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/30758171/', citation: 'Rynecki ND et al. Injuries sustained during high intensity interval training: are modern fitness trends contributing to increased injury rates? Journal of Sports Medicine and Physical Fitness. 2019. Surveillance data.' },
    { n: 27, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/34055156/', citation: 'Archila LR et al. Simple Bodyweight Training Improves Cardiorespiratory Fitness with Minimal Time Commitment: A Contemporary Application of the 5BX Approach. International Journal of Exercise Science. 2021. Small RCT.' },
    { n: 28, kind: 'consensus', url: 'https://www.absolute.physio/wp-content/uploads/2019/09/returning-to-running-postnatal-guidelines.pdf', citation: 'Goom T, Donnelly G, Brockwell E. Returning to running postnatal: guidelines for medical, health and fitness professionals managing this population. March 2019. The authors grade it level 4, expert opinion.' },
  ],
  screen: [
    {
      id: 'heart',
      text: 'Has a doctor told you that you have a heart condition or high blood pressure, or that you should only exercise with medical supervision? Do you get chest pain at rest, in daily life or when active? In the past 12 months, have you fainted or lost balance from dizziness? (Not dizziness from over-breathing during hard exercise.)',
      onYes: 'wait',
      yesCopy: 'Please check with your doctor first. Interval training is used in supervised heart programmes, and that is the right place to start it.',
    },
    {
      id: 'recent_birth',
      text: 'Have you had a baby in the last 12 months?',
      onYes: 'suggest:postpartum',
      yesCopy: 'Please start with the Postpartum series.',
      shared: 'recent_birth',
    },
    {
      id: 'pregnant',
      text: 'Are you pregnant?',
      onYes: 'wait',
      yesCopy: 'Please talk to your midwife or doctor about exercise in pregnancy.',
      shared: 'pregnant',
    },
    {
      id: 'condition',
      text: 'Do you have another long-term medical condition, or take prescribed medicine for one?',
      onYes: 'wait',
      yesCopy: 'Check with your doctor or a qualified exercise professional first.',
    },
    {
      id: 'joint',
      text: 'Do you have a bone, joint or muscle problem from the past 12 months that more activity could make worse?',
      onYes: 'path:low-impact',
      yesCopy: 'We will use the low-impact track. If it hurts now, see a physio first.',
    },
    {
      id: 'easy_start',
      text: 'Are you 45 or over and not used to hard, breathless exercise? Or have you done little planned exercise in the past month?',
      onYes: 'note',
      yesCopy: 'Weeks 1 and 2 start on the easy start setting. Talking to a qualified exercise professional first is advised.',
    },
  ],
  stopSigns: [
    {
      sign: 'Chest pain, pressure or tightness. Pain spreading to the arm, jaw or back. Fainting, or nearly fainting.',
      action: 'Stop and sit or lie down. If it does not ease within a few minutes, or there was a faint, show "Call emergency services now" with a one-tap dial. Log the stop sign; P8 applies.',
    },
    {
      sign: 'A racing, pounding or irregular heartbeat that does not settle with rest. Unusual breathlessness that does not ease within about 3 minutes of easy movement.',
      action: 'Stop the session. Advise seeing a doctor before the next one. P8 applies.',
    },
    {
      sign: 'Dizziness or light-headedness.',
      action: 'Keep moving gently; do not stop dead on the bike. Sit if it continues. If it recurs in a later session, treat it as the sign above.',
    },
    {
      sign: 'Sharp joint pain, or pain that changes how you move.',
      action: 'Stop that move. Switch to the low-impact track for the rest of the session. Log it to the symptom check-in, which sets the gate.',
    },
    {
      sign: 'Feeling sick, or a headache that builds during effort.',
      action: 'Stop the hard rounds and finish with easy spinning only.',
    },
  ],
  sessions,
  paths: {
    standard: { label: 'Standard' },
    'knee-checked': {
      label: 'Standard, knee-checked',
      swaps: { bodyweight_squat: 'glute_bridge' },
    },
    'low-impact': {
      label: 'Low impact',
      replaceSessions: {
        w1d2: 'w1d2-li',
        w2d2: 'w2d2-li',
        w3d2: 'w3d2-li',
        w4d2: 'w4d2-li',
        w5d2: 'w5d2-li',
        w6d2: 'w6d2-li',
        w7d2: 'w7d2-li',
        w8d2: 'w8d2-li',
      },
    },
    'no-overhead': {
      label: 'No overhead',
      swaps: { jumping_jack: 'step_jack' },
    },
  },
  flagPaths: { knee: 'knee-checked', hip: 'knee-checked', neck: 'no-overhead', shoulder: 'no-overhead' },
  advance: {
    minCompleted: 2,
    maxPainToAdvance: 3, // not in the doc: house 3/10 ceiling (P13 convention)
    dropBackPainAtLeast: 11, // the doc has no pain drop-back (P3 drops back only after two failed weeks); 11 is unreachable on 0-10
    repeatIfFeltHard: true,
    longGapDays: 10,
  },
  standalone: [
    { sessionKey: 'w3d1', name: 'Bike intervals 8 × 30/60', fact: 'one machine' },
    { sessionKey: 'w7d3', name: '4 × 4 on a machine', fact: '33 min' },
    { sessionKey: 'w3d2-li', name: 'Low-impact circuit', fact: 'no jumps' },
  ],
  cues: {
    start: 'Easy spin first. Five minutes, just warming up.',
    rest: 'Easy now. Let the breathing come down.',
    finish: 'Done. Three easy minutes to bring it down.',
    stationary_bike: 'Seat high, slight bend in the knee at the bottom.',
    assault_bike: 'Push and pull. Arms and legs share it.',
    rowing_machine: 'Legs, then body, then arms. Reverse on return.',
    elliptical: 'Whole foot on the pedal. Stand tall.',
    ski_erg: 'Hinge at the hips, drive the handles past them.',
    jumping_jack: 'Light feet, soft knees on landing.',
    step_jack: 'Step out, arms to shoulders, step in. Keep it brisk.',
    bodyweight_squat: 'Sit back, chest up, knees follow the toes.',
    glute_bridge: 'Squeeze the glutes, ribs down, pause at the top.',
    single_leg_glute_bridge: 'Hips level. Switch legs at halfway.',
    mountain_climber: 'Shoulders over hands, hips level, knees drive.',
    push_up: 'Body in one line, chest to the floor.',
    incline_push_up: 'Hands on the bench, body in one line.',
    high_knees: 'Quick feet, knees to hip height, land softly.',
    march_in_place: 'Knees up, arms swinging, stay tall.',
    shadow_boxing: 'Fast hands, loose shoulders, keep breathing out.',
    plank: 'Elbows under shoulders, squeeze glutes, breathe.',
    burpee: 'Step back if you need to. Clean beats fast.',
  },
  rulesText: {
    // Progression (§3 YAML). Every threshold is a coaching convention.
    'P1-advance': "Move to the next week when at least 2 of the week's 3 sessions (2 of 2 on the two-day option) are logged complete, none was cut short, and none had a logged hard-effort rating of 10.",
    'P2-repeat': 'If P1 is not met by the end of the week, repeat the same week.',
    'P3-drop-back': 'If the same week fails P1 twice in a row, drop back one week (never below week 1).',
    'P4-gap': '10 to 20 days since the last HIIT session: resume one week earlier than the next scheduled week. 21 days or more: restart at week 1.',
    'P5-spacing': 'Never schedule HIIT on consecutive calendar days. At most 3 HIIT sessions (from any series) in any rolling 7 days.',
    'P6-easy-start': "If easyStart is set by the pre-start screen, every work effort in weeks 1-2 is capped at 'hard but steady, 7 of 10'. From week 3, normal labels apply.",
    'P7-track': "Use track low_impact when today's knee or hip gate is AMBER or RED, the user has said they don't want to jump or run (the shared no-impact choice, PRD §6.6), the user had a baby in the last 12 months and runCheckPassed is not set (screen Q2, P12), P13 applies, or the user chose it. While the no-impact choice or that postpartum condition holds, standard cannot be selected. Owner decision 2026-10-02: a standing knee or hip flag on its own no longer forces low_impact; the standard track runs knee-checked (P13), and bodyweight_squat still swaps to glute_bridge because the flag keeps avoiding deep_knee_flexion.",
    'P13-knee-checked': 'With a standing knee or hip flag and the standard track, ask the next-morning pain score (0-10, with where it hurts) after each circuit day. If the flagged knee or hip scores 4/10 or more, use low_impact for the following sessions until a next-morning score after a session is 3/10 or less.',
    'P8-stop-sign': 'Any logged stop sign (section 4) pauses the series. It resumes only after the user confirms they have been checked and cleared, and then one week earlier than where they stopped.',
    'P9-resistance': 'If the logged hard-effort rating on the machine is 6 or lower in two sessions of the same day type in a row, the coach suggests one resistance step higher next time. Never more than one step per session.',
    'P10-finish': 'After week 8 is complete, offer: repeat weeks 5-8, or maintain with 2 sessions a week (w8d1 and w8d3).',
    'P11-knee-red': "On a day the knee gate is RED, cap every work effort at 7 of 10. If that day's session is a d2 circuit, run the same week's d1 session instead.",
    'P12-postpartum': 'Screen Q2 yes (a baby in the last 12 months): do not enrol; suggest the Postpartum series. Exception: the user has completed the Postpartum series (postpartumCompleted). Then enrol, on low_impact unless runCheckPassed is set (P7).',
    // Programme-level YAML fields the Program type has no slot for.
    tracks: 'standard: may include ids tagged impact. low_impact: no ids tagged impact, deep_knee_flexion or knee_load. Days 1 and 3 are both, because the machines carry no safety tags. Day 2 is written out twice, once per track.',
    machineChoice: 'default: stationary_bike. rule: The chosen machine replaces every stationary_bike id in track: both sessions (warm-up, work, rest, set rest and cool-down). options: [stationary_bike, assault_bike, rowing_machine, elliptical, ski_erg]. overheadFlagExcludes: [ski_erg] (applies to the neck flag and the shoulder flag). backFlagDefault: stationary_bike.',
    noMachineFallback: 'Applies to track: both sessions when the user has no machine. (1) Every stationary_bike block or item with a role (warm-up, rest, set rest, cool-down) becomes march_in_place with the same time and keeps its role; the role is what lets march_in_place be both work and rest on the low_impact track. (2) Work bouts of 40 s or less keep their rounds, sets and times; the work id alternates by round through the list for the user\'s track, starting with the first. (3) Work bouts of 120 s or more become 60 s work / 60 s march_in_place (role: rest), with rounds = floor(rounds x (work + rest) / 120); for example w7d3 becomes 14 x 60/60. standard: { work: [high_knees, jumping_jack], rest: march_in_place }. low_impact: { work: [shadow_boxing, march_in_place], rest: march_in_place }.',
    effortScale: '0-10, where 0 is sitting and 10 is maximal; vigorous starts at 7',
    twoDayOption: 'Keep d1 and d3, drop d2. Weeks and progression unchanged.',
    spacing: 'Sessions: 3 a week, on non-consecutive days. A 2-a-week option drops the circuit day.',
    setRest: 'sets + setRestSec (intervals only): repeat the whole rounds block `sets` times, with setRestSec of easy movement between sets. The set rest uses the block\'s rest exerciseId and counts as role: rest. w5d1: sets 2, setRestSec 180, rounds 6 (40/20). w6d1 and w8d1: sets 2, setRestSec 180, rounds 8 (40/20).',
    circuitEffort: "Circuit block effort: w1d2, w2d2 (and -li): 'brisk, 7 of 10, good form first'. w3d2 to w8d2 (and -li): 'hard, 8 of 10, good form first'.",
    minutesCount: 'An interval block is sets × rounds × (work + rest) + (sets − 1) × setRestSec, with sets 1 unless stated. The last rest is easy movement that flows into the cool-down. In the 4 × 4 sessions it is the cool-down. A circuit is rounds × (stations × work + (stations − 1) × restBetweenStations) + (rounds − 1) × restBetweenRounds.',
    // Screen (§4).
    screenSchedule: 'Ask the pre-start screen once at the start, and again after any 21-day gap.',
    'Q1-heart': 'Yes (wait): do not start. No override in the app. The same sheet carries one line: "Chest pain now? Call emergency services." with the one-tap dial.',
    'Q2-recent-birth': 'Yes (suggest:postpartum): do not start this series; suggest the Postpartum series. Exception: a user who has completed the Postpartum series can start, on the low-impact track unless its symptom check before running was passed (runCheckPassed) (P7, P12).',
    'Q4-condition': 'Yes: show "Check with your doctor or a qualified exercise professional first." The series unlocks when the user confirms they have been cleared. The app stores that confirmation with the date. It does not ask which condition.',
    'Q5-joint': 'Yes: default to the low-impact track. Ask which area and set the matching knee, hip, back, neck or shoulder condition flag if not already set. If it hurts now, suggest a physio check first.',
    'Q6-easy-start': 'Yes: set easyStart (P6). The app suggests talking to a qualified exercise professional, as PAR-Q+ advises for the over-45 case.',
    illness: 'If they have a cold or fever today, skip today\'s session and do not count it as missed.',
    stopSignBehaviour: 'On any stop sign the coach says "Stop now", and the timer pauses and does not resume on its own.',
    // Condition flags (§4).
    kneeHipFlag: 'Knee or hip flag (owner decision 2026-10-02): a standing flag is history, not today\'s symptom. It keeps avoiding deep_knee_flexion (so bodyweight_squat becomes the glute bridge) but no longer removes impact. The standard track runs knee-checked (P13).',
    kneeHipToday: "Knee or hip AMBER or RED today, or the user's no-impact choice: the low-impact track is used (P7). Machine days are unchanged. Bike cue: seat high enough for a slight knee bend at the bottom.",
    kneeRedToday: "Knee RED today: cap effort at 7 of 10 that day and swap the circuit for that week's day-1 bike session (P11).",
    hipRedToday: 'Hip RED today: the RED set adds axial_load. No id in this series carries it, so the gate removes nothing beyond the low-impact track. No extra effort cap is set.',
    backFlag: 'No id in this series carries spinal_flexion, axial_load or spinal_load, so the gate removes nothing. The machine default is stationary_bike, not rowing_machine, because rowing repeats a forward bend at the catch; the user can change it. Plank and mountain climber cue: "hips level, no sag".',
    neckFlag: 'The gate removes jumping_jack (overhead) and step_jack takes its place. The series removes ski_erg from the machine choice for neck-flag and shoulder-flag users (overheadFlagExcludes). Push-up and plank cue: "eyes to the floor just ahead of your hands".',
    shoulderFlag: 'The gate removes jumping_jack (step_jack takes its place) and nothing else. overheadFlagExcludes takes ski_erg off the machine list. If a station hurts, the sharp-pain stop sign applies.',
    // Cues the one-line-per-key map cannot hold (§6).
    extraCues: 'Session start: "Hard means a word or two. Easy means sentences." / "Today: six short efforts. Long rests. You\'ve got this." stationary_bike: "Spin faster first, then add resistance." 4 × 4: "Settle in. Hard, but you could hold five minutes." / "Halfway. Same pace, steady breathing." Rests: "Ten seconds. Get ready to go." / "Next up: mountain climbers. Hips level." / "That round counted. Two to go." Finish: "Session logged. How hard was it, zero to ten?" / "Another week in the bank. Rest day tomorrow."',
    _transcriptionNotes: [
      '1. Intervals with sets/setRestSec (w5d1, w6d1, w8d1) cannot be expressed by IntervalsBlock; they are a single block with rounds = sets × rounds (12, 16, 16), keeping the doc\'s minutes. The 3-minute easy set rest is kept in rulesText.setRest only. Two blocks would repeat stationary_bike as non-role work.',
      '2. role: rest on the intervals rest sub-object, track, and circuit effort are dropped (no field); circuit effort is in rulesText.circuitEffort. shape moved from session to block.',
      '3. w7d3 and w8d3 have no cool-down block, as in the doc (the last rest is the cool-down).',
      '4. Screen Q5 (joint) goes to path:low-impact with no fromFlags: with fromFlags a standing knee or hip flag would force low-impact, against P7 and the owner decision (flagPaths knee/hip -> knee-checked). Standing flags route through flagPaths instead.',
      '5. Q4 is wait (unlocks on confirmed clearance, rulesText Q4-condition). Q6 is note; easyStart (P6) has no screen outcome. yesCopy for Q2, Q5 and Q6 is assembled from the doc\'s action text (the doc gives no exact sentence).',
      '6. advance: minCompleted 2 (P1); longGapDays 10 (P4: resume one week earlier = repeat last completed week; 21+ days restart at week 1 is in rulesText). The doc has no pain thresholds for advancing: maxPainToAdvance 3 follows the P13 3/10 convention (not in the doc). dropBackPainAtLeast 11 (unreachable): pain 4+ switches track (P13), and drop-back happens only after the same week fails twice (P3), so no pain drop-back is added. needs and timePerWeek capitalised for display.',
      '7. No back path (the doc defines none; the back flag only changes the default machine). flagAvoid omitted: the gate AMBER sets already cover deep_knee_flexion (knee, hip) and overhead (neck, shoulder).',
      '8. The intro description still says "Knee or hip issues? The low-impact track keeps every move off the jump." That predates the owner decision (knee/hip flags now run knee-checked standard); kept verbatim.',
      '9. No honestLine in the doc. No lastRound cue in the doc.',
    ].join(' '),
  },
}
