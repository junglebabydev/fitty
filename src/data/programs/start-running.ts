// Start Running, transcribed from docs/programs/start-running.md (Oct 2026). Every session is written out in the doc,
// so no `repeats`. Total running seconds per session (the doc's `runSeconds`, read by R4) is derivable from the blocks.
import type { Block, IntervalsBlock, Program, ProgramSession, SteadyBlock } from '../../domain/programs'

const WARMUP: SteadyBlock = { shape: 'steady', exerciseId: 'brisk_walk', minutes: 5, effort: 'brisk, warm, can talk easily', role: 'warmup' }
const COOLDOWN: SteadyBlock = { shape: 'steady', exerciseId: 'brisk_walk', minutes: 5, effort: 'easy walk, let breathing settle', role: 'cooldown' }

/** Run/walk rounds: `runSec` of easy_run, then `walkSec` of brisk_walk. */
function runWalk(rounds: number, runSec: number, walkSec: number): IntervalsBlock {
  return { shape: 'intervals', rounds, work: { exerciseId: 'easy_run', seconds: runSec }, rest: { exerciseId: 'brisk_walk', seconds: walkSec } }
}

function steadyRun(minutes: number): SteadyBlock {
  return { shape: 'steady', exerciseId: 'easy_run', minutes, effort: 'easy, can talk in sentences' }
}

/** 'w3d2' → week 3, "Week 3, run 2"; every session is warm-up, the main blocks, cool-down. */
function session(key: string, minutes: number, main: Block[]): ProgramSession {
  const [, week, run] = /^w(\d+)d(\d+)$/.exec(key)!
  return { key, week: Number(week), name: `Week ${week}, run ${run}`, type: 'conditioning', minutes, blocks: [WARMUP, ...main, COOLDOWN] }
}

export const program: Program = {
  id: 'start-running',
  status: 'preview',
  title: 'Start Running',
  promise: 'From walking to 30 minutes of easy running in nine weeks.',
  description:
    'Three runs a week, mixing short runs with walking. Running time grows in small steps, never more than 10% above your longest recent run. If something aches the next morning, you repeat the week. Nine weeks if every week goes well, longer if not. Both are fine.',
  weeks: 9,
  sessionsPerWeek: 3,
  minutes: [26, 40],
  equipment: ['bodyweight', 'treadmill', 'bike', 'elliptical'],
  needs: 'Comfortable running shoes, a phone, a safe route or a treadmill.',
  timePerWeek: 'About 80–120 minutes (3 sessions of 26–40 minutes).',
  why: [
    { text: 'No run adds more than 10%: bigger single-run jumps were linked to more overuse injuries', source: 2 },
    { text: 'Any regular running, even once a week, is linked to lower risk of early death', source: 8 },
    { text: 'Easy pace means you can talk in sentences; the talk test is a valid guide to effort', source: 13 },
  ],
  honestLine: {
    text: 'Around 1 in 5 or 6 beginners still gets injured in plans like this. A slower plan did not help in a trial.',
    sources: [3, 6],
  },
  sources: [
    { n: 1, citation: 'NHS. Couch to 5K running plan. NHS Better Health. Accessed 2026.', url: 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/', kind: 'programme' },
    { n: 2, citation: 'Schuster Brandt Frandsen J et al. How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study. Br J Sports Med. 2025.', url: 'https://pubmed.ncbi.nlm.nih.gov/40623829/', kind: 'cohort' },
    { n: 3, citation: 'Buist I et al. No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial. Am J Sports Med. 2008.', url: 'https://pubmed.ncbi.nlm.nih.gov/17940147/', kind: 'rct' },
    { n: 4, citation: 'Nielsen RØ et al. Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury. J Orthop Sports Phys Ther. 2014.', url: 'https://pubmed.ncbi.nlm.nih.gov/25155475/', kind: 'cohort' },
    { n: 5, citation: 'Videbæk S et al. Incidence of running-related injuries per 1000 h of running in different types of runners: a systematic review and meta-analysis. Sports Med. 2015.', url: 'https://pubmed.ncbi.nlm.nih.gov/25951917/', kind: 'meta-analysis' },
    { n: 6, citation: 'Bredeweg SW et al. The effectiveness of a preconditioning programme on preventing running-related injuries in novice runners: a randomised controlled trial. Br J Sports Med. 2012.', url: 'https://pubmed.ncbi.nlm.nih.gov/22842237/', kind: 'rct' },
    { n: 7, citation: 'Desai P et al. Recreational runners with a history of injury are twice as likely to sustain a running-related injury as runners with no history of injury: a 1-year prospective cohort study. J Orthop Sports Phys Ther. 2021.', url: 'https://pubmed.ncbi.nlm.nih.gov/33356768/', kind: 'cohort' },
    { n: 8, citation: 'Pedisic Z et al. Is running associated with a lower risk of all-cause, cardiovascular and cancer mortality, and is the more the better? A systematic review and meta-analysis. Br J Sports Med. 2020.', url: 'https://pubmed.ncbi.nlm.nih.gov/31685526/', kind: 'meta-analysis' },
    { n: 9, citation: 'Lee DC et al. Leisure-time running reduces all-cause and cardiovascular mortality risk. J Am Coll Cardiol. 2014.', url: 'https://pubmed.ncbi.nlm.nih.gov/25082581/', kind: 'cohort' },
    { n: 10, citation: 'Alentorn-Geli E et al. The association of recreational and competitive running with hip and knee osteoarthritis: a systematic review and meta-analysis. J Orthop Sports Phys Ther. 2017.', url: 'https://pubmed.ncbi.nlm.nih.gov/28504066/', kind: 'meta-analysis' },
    { n: 11, citation: 'Nielsen RO et al. Foot pronation is not associated with increased injury risk in novice runners wearing a neutral shoe: a 1-year prospective cohort study. Br J Sports Med. 2014.', url: 'https://pubmed.ncbi.nlm.nih.gov/23766439/', kind: 'cohort' },
    { n: 12, citation: "Nigg BM et al. Running shoes and running injuries: mythbusting and a proposal for two new paradigms: 'preferred movement path' and 'comfort filter'. Br J Sports Med. 2015.", url: 'https://pubmed.ncbi.nlm.nih.gov/26221015/', kind: 'consensus' },
    { n: 13, citation: 'Bok D et al. An examination and critique of subjective methods to determine exercise intensity: the talk test, feeling scale, and rating of perceived exertion. Sports Med. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/35507232/', kind: 'consensus' },
    { n: 14, citation: 'Bull FC et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020.', url: 'https://pubmed.ncbi.nlm.nih.gov/33239350/', kind: 'guideline' },
    { n: 15, citation: "Riebe D et al. Updating ACSM's recommendations for exercise preparticipation health screening. Med Sci Sports Exerc. 2015.", url: 'https://pubmed.ncbi.nlm.nih.gov/26473759/', kind: 'consensus' },
    { n: 16, citation: 'Lauersen JB et al. Strength training as superior, dose-dependent and safe prevention of acute and overuse sports injuries: a systematic review, qualitative analysis and meta-analysis. Br J Sports Med. 2018.', url: 'https://pubmed.ncbi.nlm.nih.gov/30131332/', kind: 'meta-analysis' },
    { n: 17, citation: 'Paluch AE et al. Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. Lancet Public Health. 2022.', url: 'https://pubmed.ncbi.nlm.nih.gov/35247352/', kind: 'meta-analysis' },
    { n: 18, citation: 'Nielsen RO et al. A prospective study on time to recovery in 254 injured novice runners. PLoS One. 2014.', url: 'https://pubmed.ncbi.nlm.nih.gov/24923269/', kind: 'cohort' },
    { n: 19, citation: 'Lauersen JB et al. The effectiveness of exercise interventions to prevent sports injuries: a systematic review and meta-analysis of randomised controlled trials. Br J Sports Med. 2014.', url: 'https://pubmed.ncbi.nlm.nih.gov/24100287/', kind: 'meta-analysis' },
    { n: 20, citation: 'Fokkema T et al. Online multifactorial prevention programme has no effect on the number of running-related injuries: a randomised controlled trial. Br J Sports Med. 2019.', url: 'https://pubmed.ncbi.nlm.nih.gov/30954948/', kind: 'rct' },
    { n: 21, citation: 'Silbernagel KG et al. Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study. Am J Sports Med. 2007.', url: 'https://pubmed.ncbi.nlm.nih.gov/17307888/', kind: 'rct' },
  ],
  // Doc §4 pre-start screen, Q1–Q5. Q6 (longest recent run) is a setup question, kept in rulesText ('setup.longestRun').
  screen: [
    {
      id: 'heart',
      text: 'Has a doctor said you have a heart condition, or do you get chest pain, fainting or unusual breathlessness when you exert yourself?',
      onYes: 'wait',
      yesCopy: 'Please get clearance from your doctor first.',
    },
    {
      id: 'known_condition',
      text: 'Do you have a known heart, kidney or metabolic condition (such as diabetes), and are you not currently active?',
      onYes: 'wait',
      yesCopy: 'Please check with your clinician first, then confirm clearance.',
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
      yesCopy: 'Use the Postpartum series first; it ends with that check.',
      shared: 'recent_birth',
    },
    {
      id: 'walk_pain',
      text: 'Do you have pain in a knee, hip, ankle, foot or shin when you walk?',
      onYes: 'path:bike-first',
      yesCopy: 'Get this checked before you run or walk for exercise. Until then, your sessions are on a bike.',
    },
    {
      id: 'knee_hip_flag',
      text: 'Do you have a knee or hip condition flag?',
      onYes: 'path:knee-checked',
      yesCopy: 'Running continues while next-morning pain stays at 3/10 or less.',
      fromFlags: ['knee_left', 'knee_right', 'hip'],
    },
    {
      id: 'running_injury',
      text: 'Have you had a running injury in the last 12 months?',
      onYes: 'note',
      yesCopy: 'A past injury roughly doubled injury risk in one study. Start at week 1.',
    },
  ],
  stopSigns: [
    {
      sign: 'Chest pain or pressure, fainting or near-fainting, a racing or irregular heartbeat, breathlessness out of proportion to the effort',
      action: '"Stop now and sit down. If it does not settle within a few minutes, call emergency services." Ends the session and locks the series until the user confirms they have seen a doctor.',
    },
    {
      sign: 'Sharp pain, or pain that makes you limp or change your stride',
      action: '"Stop running and walk home." Logs the session as stopped early, so R2 repeats the week.',
    },
    {
      sign: 'Pain at one spot on a bone (shin, foot) that hurts to press, or gets worse each run',
      action: '"Stop running and walk home gently. No running or walking for exercise until it is checked. Get this checked this week, sooner if it hurts at rest or at night." Moves the user to the bike-first path on stationary_bike only (not elliptical, which still loads the legs); with no bike, pauses the series. Walking or running returns only after the user confirms it was checked; R4 then sets the entry point.',
    },
    {
      sign: 'A knee that swells, locks or gives way',
      action: '"Stop running. Get this checked before your next run." Pauses the series.',
    },
    {
      sign: 'Dizzy, sick or confused in the heat',
      action: '"Stop, get into shade, sip water." Ends the session. If it repeats, treat as row 1.',
    },
    {
      sign: 'Next-morning pain 4/10 or more',
      action: 'No alarm. R2 or R3 applies automatically and the coach explains which.',
    },
  ],
  sessions: [
    session('w1d1', 30, [runWalk(8, 60, 90)]),
    session('w1d2', 30, [runWalk(8, 60, 90)]),
    session('w1d3', 31, [runWalk(7, 75, 105)]),
    // w2d1, w2d2 and week 8 repeat easy_run across two work blocks, as the doc intends (see _transcriptionNotes).
    session('w2d1', 27, [runWalk(4, 120, 90), runWalk(1, 90, 90)]),
    session('w2d2', 27, [runWalk(4, 120, 90), runWalk(1, 90, 90)]),
    session('w2d3', 26, [runWalk(4, 150, 90)]),
    session('w3d1', 27, [runWalk(4, 165, 90)]),
    session('w3d2', 27, [runWalk(4, 165, 90)]),
    session('w3d3', 28, [runWalk(4, 180, 90)]),
    session('w4d1', 29, [runWalk(4, 195, 90)]),
    session('w4d2', 29, [runWalk(4, 195, 90)]),
    session('w4d3', 30, [runWalk(4, 210, 90)]),
    session('w5d1', 31, [runWalk(3, 300, 120)]),
    session('w5d2', 31, [runWalk(3, 300, 120)]),
    session('w5d3', 31, [runWalk(3, 330, 90)]),
    session('w6d1', 34, [runWalk(3, 360, 120)]),
    session('w6d2', 34, [runWalk(3, 360, 120)]),
    session('w6d3', 34, [runWalk(3, 390, 90)]),
    session('w7d1', 37, [runWalk(3, 420, 120)]),
    session('w7d2', 37, [runWalk(3, 420, 120)]),
    session('w7d3', 37, [runWalk(2, 690, 120)]),
    session('w8d1', 37, [runWalk(1, 900, 120), steadyRun(10)]),
    session('w8d2', 37, [runWalk(1, 900, 120), steadyRun(10)]),
    session('w8d3', 39, [runWalk(1, 1200, 120), steadyRun(7)]),
    session('w9d1', 38, [steadyRun(28)]),
    session('w9d2', 38, [steadyRun(28)]),
    session('w9d3', 40, [steadyRun(30)]),
  ],
  paths: {
    standard: { label: 'Standard' },
    // Same sessions and swaps as standard; R9 (next-morning monitor) and today's gate do the work.
    'knee-checked': { label: 'Knee-checked running' },
    // The doc picks the fast id by equipment (incline_walk, stationary_bike, else brisk_walk); see rulesText 'path.walk-first'.
    'walk-first': { label: 'Walk-first', swaps: { easy_run: 'brisk_walk' } },
    'bike-first': { label: 'Bike-first', swaps: { easy_run: 'stationary_bike', brisk_walk: 'stationary_bike' } },
  },
  flagPaths: { knee: 'knee-checked', hip: 'knee-checked' },
  advance: {
    minCompleted: 'all',
    maxPainToAdvance: 3,
    dropBackPainAtLeast: 6,
    repeatIfFeltHard: true,
    longGapDays: 14,
  },
  standalone: [{ sessionKey: 'w1d1', name: 'First run/walk', fact: '8 × 1 min runs' }],
  cues: {
    start: 'Five minutes brisk walking first. Loosen up.',
    easy_run: 'Run now. Slow and relaxed.',
    treadmill_jog: 'Run now. Slow and relaxed.',
    brisk_walk: 'Walk now. Let your breathing settle.',
    incline_walk: "Incline walk now. Don't hold the rails.",
    stationary_bike: 'Bike now. Cadence up, resistance light.',
    rest: 'Walk now. Let your breathing settle.',
    lastRound: 'Last run of the session coming up.',
    finish: 'Session complete. That counts.',
  },
  rulesText: {
    R1: 'Advance to week N+1 when all 3 sessions of week N were completed in full AND every next-morning pain score after them was 3/10 or less. A session that R4 replaced with an earlier one does not count toward week N; the user stays on week N until its own sessions pass.',
    R2: 'Repeat week N (all 3 sessions) if any session of week N was stopped early, OR any next-morning pain score was 4/10 or 5/10.',
    R3: "Drop back to week N-1 (minimum week 1) if any next-morning pain score was 6/10 or more, OR the user limped the next morning, OR week N has been repeated twice without passing R1. With a score of 6/10 or more, also show: 'If this is not settling within a week, get it checked.'",
    R4: 'Before every session, let M = the largest number of running seconds actually completed in any running-path session in the last 30 days (a session stopped early counts only the seconds run; walk-first sessions never count). During the user\'s first 30 days in the series, M = max(that, R8 seed). If the planned runSeconds > 1.10 × M, replace it with the latest session in the ladder whose runSeconds <= 1.10 × M. If M = 0, start at w1d1. On the walk-first and bike-first paths the same rule runs separately on each path\'s fast-segment seconds; neither counts toward running.',
    R5: 'Schedule no two sessions on consecutive calendar days. If a user opens a session the day after a run, offer the walk-first version of today\'s session instead, or a rest day.',
    R6: 'If 14 or more days have passed since the last completed session, repeat the last completed week before advancing (R4 may still drop further).',
    R7: 'The next-morning pain score (0-10, any lower-limb or back pain, with where it hurts) is asked on first app open after 6 am the day after a run. If it is still unanswered when the next session starts, ask it before the session; the session cannot count toward R1 until it is answered.',
    R8: 'Entry point for someone who already runs: ask for the longest continuous run in the last 30 days (minutes). R8 seed = that × 60 seconds. Start at the latest session whose runSeconds <= 1.10 × R8 seed. Not offered, and no seed, if pre-start Q5 is yes or the user arrives from the Postpartum series with runCheckPassed (start at w1d1).',
    R9: 'Knee-checked running (knee or hip flag, no user ban): if the next-morning score for the flagged knee or hip is 4/10 or more, run the next sessions as their walk-first versions until a next-morning score after a session is 3/10 or less; then running resumes at the week R2 or R3 set. Today\'s symptom gate AMBER or RED for that region also makes today\'s session walk-first (or bike on RED). Owner decision 2026-10-02.',
    'setup.longestRun': 'Have you run 10 minutes or more without stopping in the last 30 days? If yes: asks for the longest run in minutes and applies R8 to choose the starting session. (Asked after the screen, not in it.)',
    'screen.order': 'If more than one answer is yes, the first `wait` wins, then 3b, then 4a over 4b. Q5 and Q6 still apply to whichever path starts.',
    'screen.heart': 'Does not start the series. Shows "Please get clearance from your doctor first" and keeps it locked until the user confirms clearance [15].',
    'screen.known_condition': 'Does not start. Asks the user to check with their clinician, then confirm clearance [15].',
    'screen.recent_birth': '`suggest:postpartum`, unless `postpartum.runCheckPassed` is true. A graduate starts here at w1d1 (R8 not offered), with `pf-daily` and the postpartum check-in kept on, as the Postpartum handoff promises.',
    'screen.knee_hip_flag': '`path:knee-checked`: running continues while next-morning pain stays at 3/10 or less. The result card also offers "I\'d rather not run", which sets the user\'s no-running choice and `path:walk-first`.',
    'screen.running_injury': 'Starts at w1d1 whatever the user\'s fitness (R8 is skipped). Shows: "A past injury roughly doubled injury risk in one study. Start at week 1." [7]',
    postpartumGraduates: 'This series does not repeat the postpartum checks; the Postpartum series owns them. After every session the postpartum check-in still runs, and its rules in `postpartum.md` §4 decide what a sign means. This series reads one result: while those rules block impact, every run segment uses the walk-first mapping (below), and running resumes when they no longer do. R4 is unchanged.',
    'path.knee-checked': 'Knee or hip flag, Q4a no, no user ban. The standard running sessions and rules R1–R8 apply unchanged, plus R9. A score of 6/10 or more also shows R3\'s "get it checked" line. On the day: the pre-workout symptom gate still runs. If today\'s knee or hip is AMBER or RED (pain 3/10 or more, swelling, or a red flag), `impact` is avoided for that session, so run segments become the walk-first or bike mapping. A knee RED day offers `stationary_bike` or a rest day (our proposal, not current gate behaviour). The flag still avoids `deep_knee_flexion`, which nothing in this series uses.',
    'path.walk-first': 'The user\'s choice not to run: set by "I\'d rather not run" on the screen result, by the coach ("I don\'t want to run", previewed and applied only on a tap), or on the programme page. It applies across the app until the user lifts it (PRD §6.6). The same 27 sessions, same timings, same rules R1–R8, with R4 counting fast-segment seconds on a separate tally from running. Each `easy_run` segment becomes a fast segment, chosen by equipment in this order: `incline_walk` (treadmill), `stationary_bike` (bike), else `brisk_walk` with effort "fast: breathing harder, short sentences only". Each walk break becomes an easy `brisk_walk`. Week 9 ends with 30 minutes of continuous fast walking. Deterministic mapping: for every block, `exerciseId: easy_run` → the chosen fast id, `seconds` and `minutes` unchanged; warm-up and cool-down (`role: warmup | cooldown`) unchanged. If the user lifts the choice, the running path starts where R4 puts it. With no runs in 30 days, that is w1d1.',
    'path.bike-first': 'Q4a yes, or the bone-pain stop sign. For pain on walking, whatever the flags. The same 27 sessions, same timings, same rules R1–R8, with R4 on its own fast-segment tally. Deterministic mapping: every `easy_run` work block → `stationary_bike` (else `elliptical`; the bone-pain stop sign allows `stationary_bike` only), effort "fast: breathing harder, short sentences only"; every `brisk_walk` block (warm-up, cool-down, rest) → the same machine, effort "easy, breathing settles"; `seconds` and `minutes` unchanged. The app shows "Get this checked" on every session until the user confirms it was checked. Then: with no pain on walking, the running path starts where R4 puts it (under knee-checked running if a knee or hip flag is set), unless the user has chosen not to run, in which case the walk-first path.',
    'path.back': 'Back (AMBER avoids `spinal_flexion` and `axial_load`; RED adds `spinal_load`): `easy_run` carries none of these tags, so the gate removes nothing. Back pain counts in the next-morning score (R7), so R2 and R3 still slow things down. Open question: should running carry `axial_load`? It does not today (`treadmill_jog` is `[impact, knee_load]`).',
    'path.neck': 'Neck (AMBER avoids `overhead`; RED adds `neck_load`): nothing in the series carries these tags. No change.',
    'honest.knee-checked': "Honest line for the intro, flagged users only: \"Your knee history doesn't rule out running. We check it each morning after a run and step back if it complains.\"",
    'honest.bike-first': 'Honest line for the intro: "While walking hurts, you train on a bike. Get the pain checked first."',
    'standalone.byPath': 'w1d1 as "First run/walk", fact "8 × 1 min runs". With a knee or hip flag it opens as w1d1 under knee-checked running; if the user has chosen not to run, as the walk-first w1d1; with pain on walking, as the bike-first w1d1.',
    schedule: 'Sessions per week: 3, never on consecutive days. Runs 1 and 2 are the same session; run 3 is one step up. The next week starts one step higher again.',
    regressions: '`easy_run`: slow to a shuffle at the same timings; then swap the run segments for fast `brisk_walk` (walk-first path); then `stationary_bike`. Progression only by the ladder; no speed work, hills or extra runs in this series. `treadmill_jog`: `incline_walk` at the same timings; then `treadmill_walk`; keep the 1% incline. `brisk_walk` (fast segments): easy walk; then `stationary_bike`; harder: `incline_walk` at 6–12% on a treadmill, same timings. `stationary_bike` (fast segments): lower resistance, same timings; harder: higher cadence before higher resistance.',
    _cues:
      'Session start: "Five minutes brisk walking first. Loosen up." | "Today is {{runMinutes}} minutes of running in total." | "Easy pace all session. You should be able to talk." ' +
      'easy_run (and treadmill_jog): "Run now. Slow and relaxed." | "Short, quick steps. Land softly." | "Can you talk? If not, slow down." | "Shoulders down, hands loose." | "Halfway through this run. Keep it easy." | "Thirty seconds left on this run." | "Slower is fine. Walking is fine." ' +
      'brisk_walk (walk breaks): "Walk now. Let your breathing settle." | "Keep walking briskly. Next run in thirty seconds." | "Good. That run is done." ' +
      'Walk-first and bike-first fast segments (brisk_walk fast, incline_walk, stationary_bike, elliptical): "Fast walk now. Breathe harder, still talk." | "Arms swinging, quick steps." | "Incline walk now. Don\'t hold the rails." | "Bike now. Cadence up, resistance light." | "Easy pedalling now. Let your breathing settle." ' +
      'Rests and transitions: "Last run of the session coming up." | "Last interval. You know this one." ' +
      'Finish: "Running done. Five minutes easy walking now." | "Session complete. That counts." | "Tomorrow morning, tell me how your legs feel." | "Rest day tomorrow. That is part of the plan." ' +
      'Week 9, final run: "Thirty minutes. Easy pace. You built this." ' +
      'After a repeat week (R2): "Repeating this week. That is how the plan works."',
    _transcriptionNotes: [
      'Duplicate ids: w2d1, w2d2, w8d1, w8d2 and w8d3 have easy_run in two non-role work blocks (doc "One id, many blocks": logged as one entry of timed sets). The contract has no exemption for this; the data test needs one for timed cardio work ids, or these sessions fail it. Not restructured, since any other encoding changes the prescription or the R4 run tally.',
      'shape moved from session to blocks: minutes-blocks are steady, rounds-blocks are intervals (week 8 mixes both).',
      'runSeconds dropped (derivable: easy_run work seconds × rounds + easy_run steady minutes × 60).',
      'walk-first: the doc picks the fast id by equipment (incline_walk, stationary_bike, else brisk_walk); the swap map uses brisk_walk. Swap maps cannot carry the fast/easy effort strings of walk-first and bike-first; they are in path.walk-first and path.bike-first. After the swap the work id equals the rest and warm-up/cool-down id; the engine must not treat that as a duplicate that walks the substitution chain.',
      'bike-first: elliptical fallback (no bike) and the bone-pain stop sign\'s stationary_bike-only rule are not expressible in the swap map; see path.bike-first.',
      'Q2 yesCopy: the doc gives no quoted sentence ("Asks the user to check with their clinician, then confirm clearance"); wording built from those words. Q3b yesCopy taken from doc §1. Q4b yesCopy from the screen table\'s outcome text. Q5 is a `note`; its effect (start at w1d1, skip R8) is in screen.running_injury. Q1/Q2 lock until clearance is confirmed: see screen.heart and screen.known_condition.',
      'Q6 (run 10 minutes in the last 30 days) moved out of the screen to setup.longestRun (README).',
      'Path-specific honest lines (knee-checked, bike-first) kept in rulesText; honestLine holds the general one.',
      'Sources 12 and 13 are "consensus (narrative review)" in the doc; kind consensus. The README table says 20 sources; the doc lists 21, all included.',
      'Back and neck flags keep the standard path (doc: no change); no flagAvoid (the knee/hip flag avoids only deep_knee_flexion, already in the gate\'s set).',
      'advance.minCompleted all = R1 "completed in full"; R1 also excludes sessions R4 replaced. R3 also drops back on a limp or after two failed repeats.',
      'cues: one line per key; every §6 line is kept verbatim in _cues.',
    ].join(' '),
  },
}
