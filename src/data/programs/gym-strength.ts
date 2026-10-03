// Gym Strength, transcribed from docs/programs/gym-strength.md (3-day track only; the 4-day track is in rulesText).
// Doc-only fields (role main/accessory, rampSets, sameAs, schedule, redDaySwaps) are kept in rulesText.
import type { Block, Program, ProgramSession } from '../../domain/programs'

const warmup: Block = { shape: 'steady', exerciseId: 'stationary_bike', minutes: 5, effort: 'easy, can talk in sentences', role: 'warmup' }

function sets(exerciseId: string, n: number, reps: [number, number], restSec: number, perSide?: true): Block {
  return perSide ? { shape: 'sets', exerciseId, sets: n, reps, restSec, perSide } : { shape: 'sets', exerciseId, sets: n, reps, restSec }
}

// Phase 1, weeks 1 and 6: two sets each (doc w1d1, w1d2).
const A_EASY: Block[] = [
  warmup,
  sets('leg_press', 2, [8, 12], 120),
  sets('db_bench_press', 2, [8, 12], 120),
  sets('lat_pulldown', 2, [8, 12], 90),
  sets('dowel_hip_hinge', 1, [8, 10], 30),
  sets('db_rdl', 2, [8, 12], 120),
  sets('lateral_raise', 2, [12, 15], 60),
  sets('dead_bug', 2, [6, 10], 45, true),
]
const B_EASY: Block[] = [
  warmup,
  sets('goblet_squat', 2, [8, 12], 120),
  sets('seated_cable_row', 2, [8, 12], 90),
  sets('db_shoulder_press', 2, [8, 12], 90),
  sets('seated_leg_curl', 2, [10, 15], 90),
  sets('machine_chest_press', 2, [10, 15], 90),
  sets('pallof_press', 2, [8, 12], 45, true),
]

// Phase 1, weeks 2-5: build versions (doc w2d2 = A, w2d1 = B).
const A_BUILD: Block[] = [
  warmup,
  sets('leg_press', 3, [8, 12], 120),
  sets('db_bench_press', 3, [8, 12], 120),
  sets('lat_pulldown', 3, [8, 12], 90),
  sets('db_rdl', 3, [8, 12], 120),
  sets('lateral_raise', 2, [12, 15], 60),
  sets('dead_bug', 2, [6, 10], 45, true),
]
const B_BUILD: Block[] = [
  warmup,
  sets('goblet_squat', 3, [8, 12], 120),
  sets('seated_cable_row', 3, [8, 12], 90),
  sets('db_shoulder_press', 3, [8, 12], 90),
  sets('seated_leg_curl', 3, [10, 15], 90),
  sets('machine_chest_press', 2, [10, 15], 90),
  sets('pallof_press', 2, [8, 12], 45, true),
]

// Phase 2, weeks 7-12, 3-day track (doc w7d1 = A2, w7d2 = B2).
const A2: Block[] = [
  warmup,
  sets('leg_press', 3, [6, 10], 120),
  sets('db_bench_press', 3, [6, 10], 120),
  sets('lat_pulldown', 3, [8, 12], 120),
  sets('db_rdl', 3, [6, 10], 120),
  sets('lateral_raise', 2, [12, 15], 60),
  sets('triceps_pushdown', 2, [10, 15], 60),
]
const B2: Block[] = [
  warmup,
  sets('db_split_squat', 3, [8, 12], 90, true),
  sets('chest_supported_db_row', 3, [8, 12], 120),
  sets('incline_db_press', 3, [8, 12], 120),
  sets('seated_leg_curl', 3, [10, 15], 90),
  sets('db_shoulder_press', 2, [8, 12], 90),
  sets('pallof_press', 2, [8, 12], 45, true),
]

function session(key: string, week: number, name: string, minutes: number, blocks: Block[]): ProgramSession {
  return { key, week, name, type: 'strength', minutes, blocks }
}

const sessions: ProgramSession[] = [
  // Week 1 (A-B-A, two sets)
  session('w1d1', 1, 'Full Body A', 46, A_EASY),
  session('w1d2', 1, 'Full Body B', 44, B_EASY),
  session('w1d3', 1, 'Full Body A', 46, A_EASY),
  // Week 2 (B-A-B); week 4 repeats it
  session('w2d1', 2, 'Full Body B', 53, B_BUILD),
  session('w2d2', 2, 'Full Body A', 54, A_BUILD),
  session('w2d3', 2, 'Full Body B', 53, B_BUILD),
  // Week 3 (A-B-A); week 5 repeats it
  session('w3d1', 3, 'Full Body A', 54, A_BUILD),
  session('w3d2', 3, 'Full Body B', 53, B_BUILD),
  session('w3d3', 3, 'Full Body A', 54, A_BUILD),
  // Week 6: planned easier week (B-A-B, two sets, week 5 loads)
  session('w6d1', 6, 'Full Body B (easier)', 44, B_EASY),
  session('w6d2', 6, 'Full Body A (easier)', 46, A_EASY),
  session('w6d3', 6, 'Full Body B (easier)', 44, B_EASY),
  // Week 7 (A2-B2-A2); weeks 9 and 11 repeat it
  session('w7d1', 7, 'Full Body A2', 55, A2),
  session('w7d2', 7, 'Full Body B2', 55, B2),
  session('w7d3', 7, 'Full Body A2', 55, A2),
  // Week 8 (B2-A2-B2); weeks 10 and 12 repeat it
  session('w8d1', 8, 'Full Body B2', 55, B2),
  session('w8d2', 8, 'Full Body A2', 55, A2),
  session('w8d3', 8, 'Full Body B2', 55, B2),
]

export const program: Program = {
  id: 'gym-strength',
  status: 'ready',
  title: 'Gym Strength',
  promise: 'Get stronger in 12 weeks with three gym sessions a week.',
  description:
    'A 12-week plan built on a small set of standard gym lifts. You repeat the same lifts and add reps, then weight, as they get easier. Every set stops with reps to spare. Week 6 is lighter so you recover. After that you can stay at three days or move to four.',
  weeks: 12,
  sessionsPerWeek: 3,
  minutes: [45, 55],
  equipment: ['machine', 'cable', 'dumbbell', 'bike'],
  needs: 'A gym with a leg press, cable machine, dumbbells and a bench. A barbell is optional.',
  timePerWeek: 'about 2.5 hours (3 × 45–55 min); up to about 3.5 hours on the 4-day option.',
  why: [
    { text: 'The WHO advises muscle-strengthening work for all major muscles on 2 or more days a week', source: 3 },
    { text: 'The plan builds towards 10 sets per muscle a week, the level linked to more muscle growth', source: 2 },
    { text: 'In a 10-week trial, repeating the same leg exercises built as much strength and size as rotating them', source: 14 },
  ],
  honestLine: {
    text: "Expect your lifts to go up over the 12 weeks, expect size to change more slowly, and expect your result to differ from someone else's.",
    sources: [2, 21],
  },
  sources: [
    { n: 1, kind: 'guideline', url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/', citation: 'American College of Sports Medicine. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. Medicine & Science in Sports & Exercise. 2009;41(3):687–708.' },
    { n: 2, kind: 'guideline', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/', citation: 'Currier BS, et al. American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Medicine & Science in Sports & Exercise. 2026.' },
    { n: 3, kind: 'guideline', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/', citation: 'Bull FC, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine. 2020.' },
    { n: 4, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/', citation: 'Schoenfeld BJ, et al. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. Journal of Sports Sciences. 2017.' },
    { n: 5, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/', citation: 'Pelland JC, et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. Sports Medicine. 2026 (online Dec 2025).' },
    { n: 6, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/', citation: 'Schoenfeld BJ, et al. Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Medicine. 2016.' },
    { n: 7, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/30558493/', citation: 'Schoenfeld BJ, et al. How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis. Journal of Sports Sciences. 2019.' },
    { n: 8, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/29470825/', citation: 'Grgic J, et al. Effect of Resistance Training Frequency on Gains in Muscular Strength: A Systematic Review and Meta-Analysis. Sports Medicine. 2018.' },
    { n: 9, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/36334240/', citation: 'Refalo MC, et al. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Medicine. 2023.' },
    { n: 10, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/', citation: 'Robinson ZP, et al. Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. Sports Medicine. 2024.' },
    { n: 11, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/31797219/', citation: 'Androulakis-Korakakis P, et al. The Minimum Effective Training Dose Required to Increase 1RM Strength in Resistance-Trained Men: A Systematic Review and Meta-Analysis. Sports Medicine. 2020.' },
    { n: 12, kind: 'review', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11127831/', citation: 'Nuzzo JL, Pinto MD, et al. Resistance Exercise Minimal Dose Strategies for Increasing Muscle Strength in the General Population: an Overview. Sports Medicine. 2024.' },
    { n: 13, kind: 'review', url: 'https://pubmed.ncbi.nlm.nih.gov/35438660/', citation: 'Kassiano W, et al. Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review. Journal of Strength and Conditioning Research. 2022.' },
    { n: 14, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/39388663/', citation: 'Kassiano W, et al. Muscle Hypertrophy and Strength Adaptations to Systematically Varying Resistance Exercises. Research Quarterly for Exercise and Sport. 2025 (online Oct 2024).' },
    { n: 15, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/26605807/', citation: 'Schoenfeld BJ, et al. Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men. Journal of Strength and Conditioning Research. 2016.' },
    { n: 16, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/39205815/', citation: 'Singer A, et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Frontiers in Sports and Active Living. 2024.' },
    { n: 17, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/36199287/', citation: 'Plotkin D, et al. Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations. PeerJ. 2022.' },
    { n: 18, kind: 'rct', url: 'https://pubmed.ncbi.nlm.nih.gov/38274324/', citation: 'Coleman M, et al. Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. PeerJ. 2024.' },
    { n: 19, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/37730925/', citation: 'Bell L, et al. Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach. Sports Medicine - Open. 2023.' },
    { n: 20, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/26049792/', citation: 'Zourdos MC, et al. Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. Journal of Strength and Conditioning Research. 2016.' },
    { n: 21, kind: 'cohort', url: 'https://pubmed.ncbi.nlm.nih.gov/15947721/', citation: 'Hubal MJ, et al. Variability in muscle size and strength gain after unilateral resistance training. Medicine & Science in Sports & Exercise. 2005.' },
    { n: 22, kind: 'meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/32079265/', citation: 'Benito PJ, et al. A Systematic Review with Meta-Analysis of the Effect of Resistance Training on Whole-Body Muscle Growth in Healthy Adult Males. International Journal of Environmental Research and Public Health. 2020.' },
    { n: 23, kind: 'consensus', url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', citation: "Riebe D, et al. Updating ACSM's Recommendations for Exercise Preparticipation Health Screening. Medicine & Science in Sports & Exercise. 2015." },
    { n: 24, kind: 'guideline', url: 'https://eparmedx.com/wp-content/uploads/2025/01/PARQPlus2025Fillable.pdf', citation: 'PAR-Q+ Collaboration. The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+), 2025 version. 2025.' },
    { n: 25, kind: 'guideline', url: 'https://www.nhs.uk/conditions/fainting/', citation: 'NHS. Fainting.' },
    { n: 26, kind: 'guideline', url: 'https://www.nhs.uk/symptoms/headaches/', citation: 'NHS. Headaches.' },
  ],
  screen: [
    {
      id: 'heart',
      text: 'Has a doctor told you that you have a heart condition or high blood pressure, or do you get chest pain at rest, in daily life or when active?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from a doctor first. Tap "Got clearance" once you have it.',
    },
    {
      id: 'fainting',
      text: 'In the last 12 months, have you fainted, or lost your balance because of dizziness?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from a doctor first. Tap "Got clearance" once you have it.',
    },
    {
      id: 'supervision',
      text: 'Has a doctor said you should only exercise under medical supervision?',
      onYes: 'wait',
      yesCopy: "This series is unsupervised, so it isn't the right fit right now.",
    },
    {
      id: 'joint',
      text: 'Do you have a bone, joint or muscle problem (knee, hip, back, neck or shoulder) that limits you right now?',
      onYes: 'note',
      yesCopy: "We'll run a quick check-in for that area. If it's mild you get a modified path; if not, get it assessed first.",
      fromFlags: ['knee_left', 'knee_right', 'hip', 'back_lower', 'back_mid', 'back_upper', 'neck', 'shoulder'],
    },
    {
      id: 'pregnant',
      text: 'Are you pregnant?',
      onYes: 'wait',
      yesCopy: 'Please talk to your midwife or doctor about exercise in pregnancy before starting this series.',
      shared: 'pregnant',
    },
    {
      id: 'recent_birth',
      text: 'Have you had a baby in the last 12 months?',
      onYes: 'suggest:postpartum',
      yesCopy: 'Postpartum Return is built for this. Start there first.',
      shared: 'recent_birth',
    },
    {
      id: 'unwell',
      text: 'Do you feel unwell today, such as a cold or fever?',
      onYes: 'wait',
      yesCopy: "Let's not start today. We can start tomorrow if you feel better.",
    },
  ],
  stopSigns: [
    { sign: 'Chest pain, pressure or tightness; pain spreading to arm, jaw or back', action: 'Stop the session. Sit down. If it does not ease within a few minutes of rest, call 995 or go to A&E. Pause the series until they confirm a doctor has checked them.' },
    { sign: 'Fainting (passing out, even briefly)', action: 'Stop the session. Call 995 or go to A&E now. Pause the series until they confirm a doctor has checked them.' },
    { sign: 'Near-fainting, sudden dizziness or vision change', action: 'Stop the session. Sit or lie down. If it does not ease within a few minutes of rest, call 995 or go to A&E. Pause the series until they confirm a doctor has checked them.' },
    { sign: 'Breathlessness far beyond what the effort explains, or a racing or irregular heartbeat that does not settle with rest', action: 'Stop the session. Sit down. If it does not ease within a few minutes of rest, call 995 or go to A&E. Pause the series until they confirm a doctor has checked them.' },
    { sign: 'Sudden sharp pain in a joint or a pop', action: 'Stop that exercise. Log a pain flag (E5). Run the symptom check-in; the gate swaps or removes the exercise.' },
    { sign: 'A knee giving way or locking', action: 'Stop the session. Run the check-in; both are RED flags in symptomGate.ts. Suggest assessment.' },
    { sign: 'Numbness, tingling or weakness down an arm or leg', action: 'Stop the session. Run the check-in; these are RED flags in symptomGate.ts. Suggest assessment.' },
    { sign: 'A headache that starts suddenly during effort and is extremely painful', action: 'Stop the session. Call 995 or go to A&E now. Pause the series until they confirm a doctor has checked them.' },
    { sign: '1–3 days later: very dark urine with severe, swollen, unusually painful muscles', action: 'Suggest same-day medical advice. Pause the series.' },
    { sign: 'Normal muscle soreness 1–3 days later', action: 'Not a stop sign. The coach says it usually eases within a few days and it is fine to train lightly.' },
  ],
  sessions,
  repeats: [
    { week: 4, copyOf: 2 },
    { week: 5, copyOf: 3 },
    { week: 9, copyOf: 7 },
    { week: 10, copyOf: 8 },
    { week: 11, copyOf: 7 },
    { week: 12, copyOf: 8 },
  ],
  paths: {
    standard: { label: 'Standard' },
    'low-impact': { label: 'Knee and hip: knee-friendly legs', swaps: { goblet_squat: 'leg_press', db_split_squat: 'single_leg_press' } },
    back: { label: 'Back-friendly', swaps: { goblet_squat: 'leg_press' } },
    // assisted_pull_up is only in the 4-day track (rulesText.fourDayTrack); kept so the map matches the doc.
    'no-overhead': { label: 'No overhead', swaps: { db_shoulder_press: 'lateral_raise', assisted_pull_up: 'lat_pulldown' } },
  },
  flagPaths: { knee: 'low-impact', hip: 'low-impact', back: 'back', neck: 'no-overhead', shoulder: 'no-overhead' },
  advance: {
    minCompleted: 2,
    maxPainToAdvance: 3,
    dropBackPainAtLeast: 6, // owner-facing convention 2026-10-03: same as Start Running R3 (the doc has no week-level drop-back)
    repeatIfFeltHard: true,
    longGapDays: 14,
  },
  standalone: [
    { sessionKey: 'w2d2', name: 'Full Body A', fact: '54 min, machines and dumbbells' },
    { sessionKey: 'w2d1', name: 'Full Body B', fact: '53 min, machines and dumbbells' },
  ],
  cues: {
    start: 'Five easy minutes on the bike first.',
    rest: 'Log your reps and how many were left.',
    finish: "Session done. That's the work that counts.",
    leg_press: 'Lower under control. Stop before your hips lift.',
    goblet_squat: 'Sit back to the box, chest tall.',
    db_split_squat: 'Short drop, front heel down, stand straight up.',
    db_rdl: 'Hips back, dumbbells close, back flat.',
    dowel_hip_hinge: 'Keep the stick on head, back and hips.',
    hip_thrust: 'Chin tucked, squeeze your glutes at the top.',
    db_bench_press: 'Shoulder blades back. Lower to chest level, then press.',
    incline_db_press: 'Elbows slightly in. Press up and together.',
    db_shoulder_press: 'Ribs down, press straight up, no arching.',
    lat_pulldown: 'Pull your elbows down towards your ribs.',
    seated_cable_row: 'Sit tall. Pull the handle to your stomach.',
    chest_supported_db_row: 'Chest on the pad. Elbows drive back.',
    seated_leg_curl: 'Curl all the way, then lower slowly.',
    lateral_raise: 'Lead with elbows. Stop at shoulder height.',
    dead_bug: 'Low back stays down. Move slowly.',
    pallof_press: "Press out and hold. Don't let it twist you.",
  },
  rulesText: {
    // Per exercise (doc §3 progression)
    E1: 'Increase load when every working set reaches the top of the rep range and every set was logged with RIR >= 1 (or RPE < 10). Dumbbell +2 kg per hand; barbell +2.5 kg; machine or cable: the larger of +5% or +2.5 kg, rounded to 0.5 kg.',
    E2: 'Bodyweight or unloaded: when every set reaches the top of the range, move the range up 2 reps. Timed holds: add 10 s to both ends of the range.',
    E3: 'If any set falls below the bottom of the range, keep the same load next session.',
    E4: 'If any set falls below the bottom of the range two sessions running (no pain flag), cut the load 10%, rounded down to the equipment step.',
    E5: 'If any set was logged with a pain flag, hold the load and keep the pain-free range. A symptom check-in decides whether the exercise is swapped (symptom gate).',
    E6: 'If all sets hit the top of the range but at least one was at failure (RIR 0 or RPE 10), repeat the load with 1-2 in reserve before adding weight.',
    // Programme level (coaching conventions)
    P1: 'A week is complete when at least 2 of 3 sessions (3day) or 3 of 4 sessions (4day) are logged. Then advance to the next week.',
    P2: 'If fewer sessions than P1 are logged in a calendar week, repeat that week once. If the repeat is also incomplete, advance anyway and keep loads the same for the first session.',
    P3: 'If 14-27 days pass with no logged session, restart at the week before the last completed week (minimum week 1) and cut every load 10%. If 28+ days pass, restart at week 1 with loads 20% lower than the last logged.',
    P4: 'Early easier week: if 3 or more exercises trigger E4 within the same calendar week, the next week becomes an easier week (week 6 rules), then the programme resumes where it left off. At most one early easier week per phase.',
    P5: 'Week 6 is the planned easier week: week 1 structure (2 sets per exercise), week 5 loads, no load increases from E1 during the week.',
    P6: 'Volume step in weeks 9-11: add 1 set to the first two blocks after the warm-up only if weeks 7-8 were complete (P1) and no exercise triggered E4 in week 8. Otherwise keep sets as written.',
    P7: '4day track is offered at the end of week 6 only if at least 15 of the 18 phase-1 sessions were logged. Otherwise the app keeps the 3day track and does not ask again.',
    P8: 'Phase 2 starting loads: for an exercise carried over from phase 1, start at the last phase-1 load (the lower rep range makes the same load harder). For a new exercise, the first session is a find-your-load session: pick a weight that leaves 3 in reserve at the top of the range.',
    P9: "At the end of week 12, compare each main lift's best set (load x reps, estimated 1RM by Epley) with its first logged set in week 2 or week 7, and show the change. Suggest one easier week before any next block.",
    // Schedule
    order: 'Sessions alternate A and B. Odd weeks run A-B-A; even weeks B-A-B. Leave at least one day between sessions (convention).',
    schedule: [
      'phase1: templates { A: w2d2, B: w2d1 } (build-week versions); easyTemplates { A: w1d1, B: w1d2 } (2-set versions, used in weeks 1 and 6);',
      'oddWeekOrder [A, B, A]; evenWeekOrder [B, A, B];',
      'weeks: [1] use easyTemplates; [2, 3, 4, 5] use templates; [6] use easyTemplates, loads: "week 5 loads, no increases".',
      'phase2 3day: templates { A: w7d1, B: w7d2 }; oddWeekOrder [A, B, A]; evenWeekOrder [B, A, B]; weeks [7..12];',
      'extraSet: { weeks: [9, 10, 11], blocks: "first two blocks after the warm-up", condition: P6 }.',
    ].join(' '),
    weekPlan: [
      'RIR = reps in reserve at the end of each working set (main / accessory).',
      'Week 1 phase 1 "Learn the lifts", 2 per exercise, 3/3.',
      'Week 2 phase 1 "Build", as written, 3/2.',
      'Week 3 phase 1 "Build", as written, 2/2.',
      'Week 4 phase 1 "Build", as written, 2/1.',
      'Week 5 phase 1 "Build", as written, 2/1.',
      'Week 6 phase 1 "Easier week", 2 per exercise, week 5 loads, 3/3.',
      'Week 7 phase 2 "New lifts", as written, 3/2.',
      'Week 8 phase 2 "Build", as written, 2/1.',
      'Week 9 phase 2 "Build", as written, +1 set on the first two lifts if earned (P6), 2/1.',
      'Week 10 phase 2 "Build", as week 9, 1/1.',
      'Week 11 phase 2 "Build", as week 9, 1/1.',
      'Week 12 phase 2 "Finish and review", as written (no extra set), 2/1.',
    ].join(' '),
    tiers: [
      'Doc role main | accessory: which RIR target from weekPlan applies to the block.',
      'Main: leg_press, db_bench_press, lat_pulldown, db_rdl, goblet_squat, seated_cable_row, db_shoulder_press (A, B, A2);',
      'db_split_squat, chest_supported_db_row, incline_db_press (B2). Accessory: everything else, including db_shoulder_press in B2 and dowel_hip_hinge.',
    ].join(' '),
    rampSets: [
      'rampSets N: N lighter warm-up sets before the first working set (not logged as work).',
      'A, A-easy, A2: leg_press 2, db_bench_press 1. B, B-easy: goblet_squat 2, seated_cable_row 1. B2: db_split_squat 1, chest_supported_db_row 1.',
    ].join(' '),
    swapRule: [
      'Swaps are keyed by template session in the doc; every session built from that template inherits them (here they are flattened to one map per path, which gives the same result for every 3-day session).',
      '1. Use the mapped id. null means drop that block for the session.',
      '2. If the mapped id is blocked today or already in the session, walk the exercise\'s library substitution chain in order, skipping blocked ids and ids already in the session.',
      '3. If nothing is left, drop the block.',
    ].join(' '),
    redDaySwaps: [
      'A RED check-in today, applied on top of the user\'s path, same swap rule.',
      'knee (adds knee_load): w1d1 { leg_press: hip_thrust }; w2d2 { leg_press: hip_thrust }; w7d1 { leg_press: hip_thrust };',
      'w1d2 { goblet_squat: glute_bridge, leg_press: glute_bridge }; w2d1 { goblet_squat: glute_bridge, leg_press: glute_bridge };',
      'w7d2 { db_split_squat: glute_bridge, single_leg_press: glute_bridge }; w7l1 { leg_press: hip_thrust, leg_extension: null } (dropped, not swapped: a coaching choice);',
      'w7l2 { db_split_squat: glute_bridge, single_leg_press: glute_bridge }.',
      'hip: {} (adds axial_load; after the low-impact swaps no lift in the base programme carries it).',
      'back (adds spinal_load): w1d1 { db_rdl: seated_leg_curl }; w2d2 { db_rdl: seated_leg_curl }; w7d1 { db_rdl: seated_leg_curl };',
      'w7l1 { db_rdl: glute_bridge } (seated_leg_curl is already in Lower 1); w7l2 { hip_thrust: glute_bridge }.',
      'neck: {} (adds neck_load; only db_shoulder_press carries it, and no-overhead already swapped it).',
      'Template inheritance: w1d1 (A, 2 sets): w1d3, w6d2. w1d2 (B, 2 sets): w6d1, w6d3. w2d2 (A): weeks 3-5 A. w2d1 (B): w2d3, weeks 3-5 B. w7d1 (A2): w7d3, 3day A2 in weeks 8-12. w7d2 (B2): 3day B2 in weeks 8-12. w7u1, w7l1, w7u2, w7l2: the same slot in weeks 8-12.',
    ].join(' '),
    fourDayTrack: [
      'Optional 4day upper/lower track, weeks 7-12, chosen at the end of week 6 (P7). order: [w7u1, w7l1, w7u2, w7l2]; weeks [7..12];',
      'extraSet: { weeks: [9, 10, 11], blocks: "first two blocks after the warm-up", condition: P6 }.',
      'Keys w8u1, w8l1, w8u2, w8l2 ... w12l2 repeat week 7 in the order Upper 1, Lower 1, Upper 2, Lower 2. Every session starts with stationary_bike 5 min "easy, can talk in sentences".',
      'w7u1 Upper 1 (53 min): db_bench_press 3x6-10 r120 main ramp2; seated_cable_row 3x8-12 r120 main ramp1; db_shoulder_press 3x8-12 r120 main; cable_fly 3x10-15 r60 acc; cable_curl 2x10-15 r60 acc; triceps_pushdown 2x10-15 r60 acc.',
      'w7l1 Lower 1 (52 min): leg_press 3x6-10 r120 main ramp2; db_rdl 3x6-10 r120 main ramp1; seated_leg_curl 3x10-15 r90 acc; leg_extension 2x12-15 r60 acc; seated_calf_raise 3x10-15 r60 acc; dead_bug 2x6-10 r45 acc perSide.',
      'w7u2 Upper 2 (53 min): incline_db_press 3x8-12 r120 main ramp2; chest_supported_db_row 3x8-12 r120 main ramp1; assisted_pull_up 3x6-10 r120 main; lateral_raise 3x12-15 r60 acc; face_pull 2x12-15 r60 acc; hammer_curl 2x10-15 r60 acc.',
      'w7l2 Lower 2 (52 min): db_split_squat 3x8-12 r90 main perSide ramp1; hip_thrust 3x8-12 r120 main ramp1; lying_leg_curl 3x10-15 r90 acc; calf_press_leg_press 3x10-15 r60 acc; pallof_press 2x8-12 r45 acc perSide; side_plank 2x20-40 s r45 acc perSide.',
      'Paths: low-impact w7l2 { db_split_squat: single_leg_press }; no-overhead w7u1 { db_shoulder_press: lateral_raise }, w7u2 { assisted_pull_up: lat_pulldown }.',
    ].join(' '),
    progressionsTable: [
      'Regressions and progressions for the key movements: use the regression for a bad day or missing equipment; offer a progression only after 3+ load increases (E1) on the current lift and no pain flag in 4 weeks; a swap starts with a find-your-load session (P8).',
      'Squat: regression leg_press (moderate range), single_leg_press | lift goblet_squat, leg_press | progression smith_squat, then bb_back_squat.',
      'Single leg: db_step_up, bw_split_squat | db_split_squat | bulgarian_split_squat.',
      'Hinge: glute_bridge, cable_pull_through | db_rdl (dowel_hip_hinge to learn it) | bb_rdl, then trap_bar_deadlift.',
      'Hip extension: glute_bridge | hip_thrust | bb_hip_thrust.',
      'Horizontal push: machine_chest_press, incline_push_up | db_bench_press, incline_db_press | bb_bench_press, bb_incline_bench.',
      'Vertical push: machine_shoulder_press | db_shoulder_press | landmine_press, then bb_overhead_press.',
      'Vertical pull: lat_pulldown (lighter) | lat_pulldown, assisted_pull_up | negative_pull_up, then chin_up / pull_up.',
      'Horizontal pull: machine_row | seated_cable_row, chest_supported_db_row | one_arm_db_row, then bb_row.',
      'Core: dead_bug (shorter range) | dead_bug, pallof_press, side_plank | half_kneeling_pallof, suitcase_carry.',
      'Barbell lifts are progressions, not requirements. Every barbell progression still passes through the symptom gate. smith_squat, bb_back_squat, trap_bar_deadlift, bb_overhead_press and suitcase_carry carry axial_load, so they are never offered to a back-flag user.',
      'Knee/hip path: every squat and single-leg progression (smith_squat, bb_back_squat, bulgarian_split_squat) carries deep_knee_flexion, so the only leg progression is adding load on leg_press and single_leg_press. Neck: bb_overhead_press and landmine_press are never offered.',
    ].join(' '),
    screenNotes: [
      'Q1 heart / Q2 fainting: clearance first, do not start; show a "Got clearance" button that unlocks the series.',
      'Q3 supervision: does not start; no unlock button.',
      'Q4 joint: runs the symptom check-in for that region. AMBER: sets the condition flag and shows the modified path. RED: does not start; suggests getting it assessed.',
      'Q5b recent birth: if the user\'s Postpartum enrolment has status \'done\', the answer is noted and this series starts as normal. The 12-month cut-off is a coaching convention.',
      'Q6 unwell: does not start today; offers to start tomorrow.',
      'Note for Q1: the PAR-Q+ also advises people over 45 who are not used to hard exercise to talk to a qualified exercise professional before vigorous or maximal effort. This series never asks for a maximal lift, and RIR targets never go below 1.',
    ].join(' '),
    pathNotes: [
      'Low-impact: leg press is then the only squat-pattern lift in both A and B; keep its range "moderate". Trade-off: full range of motion builds more strength than partial range [2]; the copy must not claim the path is identical.',
      'Back: db_rdl and hip_thrust carry spinal_load, which only RED removes; they stay on the flag (a past back complaint does not ban loaded hinging). The db_rdl cue stresses a flat back and stopping where the hamstrings stretch.',
      'No overhead: db_shoulder_press chain lists machine_shoulder_press first, but it is also overhead, so it is skipped.',
    ].join(' '),
    cuesAll: [
      'Session start: "Session A today. Six lifts, about fifty minutes." | "Five easy minutes on the bike first." | "Two light sets first, then your working weight." | "Easier week. Same weights, fewer sets, finish fresh."',
      'Effort: "Stop with two good reps left." | "That looked smooth. How many reps were left?" | "Every set hit the top. Add weight next time." | "Same weight next time. Aim for one more rep."',
      'db_rdl (second line): "Stop where the backs of your legs stretch."',
      'Rests: "Rest two minutes. Breathe easy." | "Thirty seconds. Get set for the next set." | "Log your reps and how many were left." | "Any sharp pain? Stop this one, we\'ll swap it."',
      'Finish: "Session done. That\'s the work that counts." | "Three lifts went up this week. Nice and steady." | "Week twelve done. Let\'s look at your numbers."',
    ].join(' '),
    setup: 'No setup questions in this doc. Experienced lifters (2+ years of consistent training) are out of scope (not unsafe, just not the right series); under-18s are out of scope.',
    _transcriptionNotes: [
      '1. Only the 3-day track is in sessions; the 4-day track is rulesText.fourDayTrack. The description and timePerWeek still mention the 4-day option, verbatim from §5.',
      '2. Weeks 4, 5, 9, 10, 11, 12 come from repeats (A-B-A / B-A-B alternation). The P6 extra set in weeks 9-11 is conditional and is NOT baked in.',
      '3. Doc paths are per template session; flattened to one swap map per path, which is equivalent for every 3-day session. back-friendly renamed back. The no-overhead path keeps assisted_pull_up → lat_pulldown, which only applies to the 4-day track.',
      '4. flagAvoid omitted: every path\'s doc avoid-set equals the gate\'s AMBER set; per the owner decision of 2026-10-02 impact is not added for knee/hip.',
      '5. advance: minCompleted 2 (P1). The doc has no week-level pain thresholds (pain is handled per exercise by E5 and the gate); maxPainToAdvance 3 follows the app-wide 3/10 rule and dropBackPainAtLeast 7 is a conservative placeholder. longGapDays 14 from P3, but P3 restarts at the week before the last completed week with loads cut 10% (and week 1 at 28+ days), which the contract cannot express.',
      '6. equipment uses library values machine, cable, dumbbell, bike; barbell is optional in the doc and left out so the gate never swaps into it.',
      '7. Screen Q4 (joint problem) maps to note: the doc runs a symptom check-in (AMBER → flag and path via flagPaths, RED → no start), which the outcome type cannot express. Q1/Q2 "Got clearance" unlock and Q6 "start tomorrow" are in screenNotes. yesCopy lines are written from the doc\'s "If yes" column.',
      '8. honestLine is the §2 "App copy should say" line (sources [2] gains, [21] variability).',
      '9. Source 24 (PAR-Q+, an official screening tool) is kind guideline; 12 (narrative review) and 13 (systematic review) are kind review.',
      '10. Cues keep one line per key; all doc cue lines are in cuesAll. rest uses the generic logging line since rests vary 30-120 s.',
      '11. Doc role main/accessory and rampSets are dropped from blocks; kept in tiers and rampSets.',
    ].join(' '),
  },
}
