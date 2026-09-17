// Mobility routines. Every movement is gentle and non-provocative for the
// regions the symptom gate watches (knees, back, neck):
// no loaded deep knee flexion, no end-range neck loading, no loaded spinal
// flexion, no ballistic stretching. Cues say when to stop.

export type MobilityRegion = 'hips' | 'hamstrings' | 'shoulders' | 'back' | 'neck' | 'general'
export type MobilityContext = 'pre_upper' | 'pre_lower' | 'post' | 'recovery' | 'anytime'

export interface MobilityMovement {
  name: string
  durationSec?: number
  reps?: number
  cue: string
}

export interface MobilityRoutine {
  id: string
  name: string
  regions: MobilityRegion[]
  context: MobilityContext[]
  durationMin: number
  movements: MobilityMovement[]
  safetyNote: string
}

export const MOBILITY_ROUTINES: MobilityRoutine[] = [
  {
    id: 'hip_opener_10',
    name: 'Hip Opener',
    regions: ['hips', 'general'],
    context: ['pre_lower', 'recovery', 'anytime'],
    durationMin: 10,
    movements: [
      { name: 'Supine knee-to-chest', durationSec: 40, cue: 'Lie on your back, hug one knee towards the chest with the other leg long. Pull only to a mild stretch — never yank the knee shut. Both sides.' },
      { name: '90/90 hip switches (supported)', reps: 8, cue: 'Sit with both knees bent at 90 degrees, hands behind you for support, and rotate the knees slowly from one side to the other. Keep the range small enough that the knees never pinch.' },
      { name: 'Half-kneeling hip flexor stretch', durationSec: 40, cue: 'Kneel on a folded towel, back foot flat, and tuck the pelvis under until you feel the front of the hip. Do not lean back or arch the lower back. Both sides.' },
      { name: 'Figure-4 glute stretch (lying)', durationSec: 40, cue: 'On your back, cross one ankle over the other knee and draw the legs in gently. Keep the head on the floor and the neck relaxed. Both sides.' },
      { name: 'Glute bridge with hold', reps: 10, cue: 'Squeeze the glutes to lift the hips, hold two seconds at the top, lower slowly. Ribs down, no lower-back arch.' },
      { name: 'Standing hip circles (rail support)', reps: 8, cue: 'Hold the rail and draw slow circles with one knee, keeping the movement pain-free and the standing knee soft. Both directions, both sides.' },
    ],
    safetyNote: 'Keep every stretch below a 3/10 discomfort. If a knee catches, locks or clicks painfully in the 90/90 switches, drop that movement and stay on the supine work.',
  },
  {
    id: 'hamstring_release_8',
    name: 'Hamstring Release',
    regions: ['hamstrings', 'hips'],
    context: ['pre_lower', 'post', 'recovery'],
    durationMin: 8,
    movements: [
      { name: 'Supine hamstring stretch with strap or towel', durationSec: 45, cue: 'Lie on your back, loop a towel around one foot and raise the leg with a slightly bent knee until the hamstring tightens. Keep the other leg down and the head on the floor. Both sides.' },
      { name: 'Hamstring floss (bent-knee to straight)', reps: 10, cue: 'Holding the thigh, slowly straighten the knee to a mild stretch then bend it again. Never lock the knee out hard. Both sides.' },
      { name: 'Seated hip hinge reach (neutral spine)', reps: 8, cue: 'Sit on the edge of a bench, one leg out with heel on the floor, and hinge forward from the hips with a flat back until you feel the hamstring. Do not round the spine to reach further.' },
      { name: 'Standing single-leg heel taps to low step', reps: 8, cue: 'Hold the rail, hinge at the hip to tap the free heel to a low step and return. Slight knee bend, spine long, eyes level.' },
    ],
    safetyNote: 'A hamstring stretch should feel like tension, not a pull behind the knee — if it does, bend the knee more. Skip the standing taps on days the knees are unstable.',
  },
  {
    id: 'shoulder_prep_8',
    name: 'Shoulder Prep',
    regions: ['shoulders', 'back'],
    context: ['pre_upper', 'anytime'],
    durationMin: 8,
    movements: [
      { name: 'Arm circles (small to medium)', durationSec: 40, cue: 'Slow controlled circles forward then backward, growing gradually. Shoulders stay down away from the ears.' },
      { name: 'Band pull-aparts', reps: 15, cue: 'Light band at chest height, pull it apart squeezing the shoulder blades, return slowly. Chin neutral, ribs down.' },
      { name: 'Wall slides', reps: 10, cue: 'Back against a wall, forearms on the wall in a goal-post position, slide the arms up only as far as the lower back stays flat and the shoulders stay relaxed. Stop before the neck strains.' },
      { name: 'Scapular push-ups (incline)', reps: 10, cue: 'Hands on a bench, arms straight, let the shoulder blades pinch together then push them apart. No elbow bend; head neutral.' },
      { name: 'Cross-body shoulder stretch', durationSec: 30, cue: 'Draw one arm across the chest with the other forearm and hold gently. Keep the shoulder down. Both sides.' },
      { name: 'External rotation with band', reps: 12, cue: 'Elbow pinned to the side at 90 degrees, rotate the forearm outward against a light band and return slowly. Both sides.' },
    ],
    safetyNote: 'No overhead reaching beyond a comfortable range and nothing that makes the neck work. If wall slides tighten the neck, lower the arms and shorten the range.',
  },
  {
    id: 'upper_back_unlock_8',
    name: 'Upper Back Unlock',
    regions: ['back', 'shoulders', 'neck'],
    context: ['pre_upper', 'post', 'recovery', 'anytime'],
    durationMin: 8,
    movements: [
      { name: 'Cat-cow (small range)', reps: 10, cue: 'On hands and knees, gently round then lengthen the spine through a comfortable middle range. Keep the head following the spine, not thrown back or dropped.' },
      { name: 'Thread the needle (supported)', reps: 8, cue: 'From hands and knees, slide one arm under the body and rest the shoulder and head on the floor, rotating the upper back. Move slowly and stop before any pinch. Both sides.' },
      { name: 'Open book (side-lying rotation)', reps: 8, cue: 'Lie on your side with knees bent and stacked, arms together in front. Open the top arm across the body and let the upper back rotate, keeping the knees together and the head supported on a pillow. Both sides.' },
      { name: 'Thoracic extension over foam roller or rolled towel', durationSec: 40, cue: 'Roller under the mid back, hands supporting the head, gently extend over it without arching the lower back. Never let the head hang unsupported.' },
      { name: 'Seated thoracic rotation', reps: 8, cue: 'Sit tall with hands on the chest and rotate the ribcage slowly side to side. Hips stay square, eyes follow the chest.' },
    ],
    safetyNote: 'All rotation comes from the mid back, not the lower back or neck. Support the head in every lying movement; if a movement sends tingling into the arms, stop and note it as a symptom.',
  },
  {
    id: 'neck_reset_5',
    name: 'Neck Reset',
    regions: ['neck', 'shoulders'],
    context: ['recovery', 'anytime', 'post'],
    durationMin: 5,
    movements: [
      { name: 'Chin tucks (supine)', reps: 10, cue: 'Lie on your back with a thin pillow and gently nod the chin down as if making a double chin, hold two seconds, release. Tiny movement — no lifting the head.' },
      { name: 'Slow neck rotation (mid range)', reps: 6, cue: 'Seated and tall, turn the head slowly to a comfortable point and back, then the other side. Stay well short of end range and keep the shoulders down.' },
      { name: 'Ear-to-shoulder tilt (assisted only by gravity)', durationSec: 20, cue: 'Let the head tilt gently towards one shoulder without pulling on it with the hand. Both sides. Stop if anything radiates.' },
      { name: 'Shoulder rolls', reps: 10, cue: 'Roll the shoulders up, back and down slowly to unload the upper traps.' },
      { name: 'Scapular retraction holds', reps: 8, cue: 'Draw the shoulder blades gently together and down, hold five seconds, release. Chin stays level.' },
    ],
    safetyNote: 'Never load the neck at end range, never pull on the head with the hands and skip the tilts entirely if there is any numbness, tingling or radiating pain — that is a red flag, not a stiffness.',
  },
  {
    id: 'lower_body_warmup_8',
    name: 'Lower-Body Warm-Up',
    regions: ['hips', 'hamstrings', 'general'],
    context: ['pre_lower'],
    durationMin: 8,
    movements: [
      { name: 'Easy bike spin', durationSec: 180, cue: 'Light resistance, seat set so the knee has a slight bend at the bottom, sitting tall with relaxed shoulders.' },
      { name: 'Glute bridges', reps: 12, cue: 'Squeeze the glutes to lift, two-second hold, slow lower. No arching the lower back.' },
      { name: 'Side-lying hip abductions', reps: 12, cue: 'Top leg straight, toes slightly down, lift about 30 degrees and lower slowly. Head resting on the arm. Both sides.' },
      { name: 'Bodyweight box squats to bench (partial range)', reps: 8, cue: 'Sit back to a bench and stand without bouncing. Knees over the toes, heels down, chest tall — no deeper than the bench.' },
      { name: 'Standing calf raises (rail support)', reps: 12, cue: 'Rise onto the toes and lower slowly, knees straight but not locked.' },
      { name: 'Dead bugs', reps: 8, cue: 'Lower back pressed into the floor, extend opposite arm and leg slowly, breathe out. Head stays down.' },
    ],
    safetyNote: 'The box squats are bodyweight only and never below bench height. If a knee is swollen or catching today, replace them with extra glute bridges and keep the bike spin easy.',
  },
  {
    id: 'upper_body_warmup_6',
    name: 'Upper-Body Warm-Up',
    regions: ['shoulders', 'back', 'general'],
    context: ['pre_upper'],
    durationMin: 6,
    movements: [
      { name: 'Easy bike or walk', durationSec: 120, cue: 'Two minutes to raise the heart rate; sit or stand tall with relaxed shoulders and a neutral neck.' },
      { name: 'Band pull-aparts', reps: 15, cue: 'Squeeze the shoulder blades, return slowly, chin level.' },
      { name: 'Cat-cow (small range)', reps: 8, cue: 'Gentle spinal movement in the middle range, head following the spine.' },
      { name: 'Face pulls (light)', reps: 12, cue: 'Rope to the eyes, elbows high, no jutting the head forward.' },
      { name: 'Ramp-up sets of the first pressing exercise', reps: 8, cue: 'Two sets at roughly 40 and 60 percent of working weight, focusing on the head staying on the bench and the ribs down.' },
    ],
    safetyNote: 'No overhead reaching before the neck is warm. Keep every band and cable movement light enough that the traps stay relaxed.',
  },
  {
    id: 'post_session_cooldown_8',
    name: 'Post-Session Cool-Down',
    regions: ['general', 'hips', 'hamstrings', 'shoulders'],
    context: ['post'],
    durationMin: 8,
    movements: [
      { name: 'Easy walk or spin', durationSec: 180, cue: 'Three minutes easy to bring the heart rate down; sit or stand tall.' },
      { name: 'Supine hamstring stretch', durationSec: 40, cue: 'Towel around the foot, slight knee bend, head down. Both sides.' },
      { name: 'Figure-4 glute stretch (lying)', durationSec: 40, cue: 'Draw the legs in gently, keep the head on the floor. Both sides.' },
      { name: 'Half-kneeling hip flexor stretch', durationSec: 30, cue: 'Tuck the pelvis, do not arch. Both sides.' },
      { name: 'Cross-body shoulder stretch', durationSec: 30, cue: 'Shoulder down, gentle hold. Both sides.' },
      { name: 'Slow nasal breathing on the floor', durationSec: 60, cue: 'Lie on your back with knees bent, one hand on the belly, breathing slowly through the nose to switch off.' },
    ],
    safetyNote: 'Static stretches stay at a mild intensity after training. No stretch should be held into pain, and none of these should be done kneeling on a bare floor if the knees are sore — use a towel or skip the kneeling stretch.',
  },
  {
    id: 'lower_back_relief_8',
    name: 'Lower-Back Relief',
    regions: ['back', 'hips'],
    context: ['recovery', 'anytime'],
    durationMin: 8,
    movements: [
      { name: 'Supine knee rocks', reps: 10, cue: 'On your back with knees bent and feet flat, let the knees rock gently a few centimetres side to side. Small, relaxed movement.' },
      { name: 'Pelvic tilts', reps: 10, cue: 'Flatten the lower back into the floor then release to neutral. No pushing into an arch.' },
      { name: 'Single knee-to-chest', durationSec: 30, cue: 'Hug one knee gently, other leg long or bent. Both sides.' },
      { name: 'Bird dog (slow)', reps: 8, cue: 'Reach opposite arm and leg to level with the torso, pause two seconds, return. Neck long, eyes on the floor.' },
      { name: 'Child\'s pose (arms by sides, knees apart)', durationSec: 40, cue: 'Sit back towards the heels only as far as the knees allow — use a cushion between calves and thighs so the knees never fold to end range. Forehead resting, arms relaxed by the sides.' },
      { name: 'Standing hip hinge with dowel or hands on thighs', reps: 8, cue: 'Push the hips back with a flat back and soft knees, stand tall. Rehearses a neutral spine for the next lower session.' },
    ],
    safetyNote: 'Everything here is unloaded and mid-range. If child\'s pose pinches either knee, replace it with another knee-to-chest. Any new numbness, weakness or radiating pain means stop and log a symptom check.',
  },
  {
    id: 'desk_break_5',
    name: 'Desk Break',
    regions: ['neck', 'shoulders', 'back', 'hips'],
    context: ['anytime'],
    durationMin: 5,
    movements: [
      { name: 'Standing chin tucks', reps: 8, cue: 'Stand tall and glide the chin straight back, hold two seconds. No tilting the head down or up.' },
      { name: 'Shoulder rolls', reps: 10, cue: 'Up, back and down slowly.' },
      { name: 'Doorway chest stretch (low arms)', durationSec: 30, cue: 'Forearms on the door frame below shoulder height, step through gently. Keep the ribs down and the neck neutral.' },
      { name: 'Standing hip flexor stretch (rail support)', durationSec: 30, cue: 'One foot back, pelvis tucked, hold the rail. Both sides.' },
      { name: 'Seated thoracic rotation', reps: 8, cue: 'Hands on the chest, rotate the ribcage slowly side to side.' },
      { name: 'Walk', durationSec: 60, cue: 'One minute of easy walking to finish.' },
    ],
    safetyNote: 'Designed to be done in work clothes with no floor work. Keep the neck movements tiny and slow; the neck should never be the thing that feels the stretch most.',
  },
  {
    id: 'swim_recovery_10',
    name: 'Pool Recovery',
    regions: ['general', 'hips', 'back'],
    context: ['recovery'],
    durationMin: 10,
    movements: [
      { name: 'Water walking (waist to chest deep)', durationSec: 180, cue: 'Walk forward, backward and sideways with tall posture. The water unloads the knees and spine.' },
      { name: 'Easy backstroke or float kick', durationSec: 180, cue: 'Relaxed flutter kick from the hips with soft knees; face up so the neck stays neutral. No breaststroke kick.' },
      { name: 'Standing hip swings holding the wall', reps: 10, cue: 'Swing one leg gently forward and back through a small range. Both sides.' },
      { name: 'Wall-supported calf and hamstring stretch', durationSec: 30, cue: 'Heel on a step, hinge slightly with a flat back. Both sides.' },
      { name: 'Slow breathing float', durationSec: 60, cue: 'Float or stand and breathe slowly to finish.' },
    ],
    safetyNote: 'Only easy strokes and no breaststroke or whip kick, which twist the knees. Get out if the water makes the back or knees ache rather than easing them.',
  },
]

export const MOBILITY_BY_ID: Record<string, MobilityRoutine> = Object.fromEntries(MOBILITY_ROUTINES.map(r => [r.id, r]))

export function getMobilityRoutine(id: string): MobilityRoutine | null {
  return MOBILITY_BY_ID[id] ?? null
}

/**
 * Routines that fit a context, optionally narrowed to ones touching any of the
 * given regions. Results are ordered so routines covering more of the requested
 * regions come first, then shorter routines.
 */
export function routinesFor(context: MobilityContext, regions?: MobilityRegion[]): MobilityRoutine[] {
  const wanted = regions && regions.length ? regions : null
  const out = MOBILITY_ROUTINES.filter(r => r.context.includes(context) && (!wanted || r.regions.some(x => wanted.includes(x))))
  if (!wanted) return out.slice().sort((a, b) => a.durationMin - b.durationMin)
  const overlap = (r: MobilityRoutine) => r.regions.filter(x => wanted.includes(x)).length
  return out.slice().sort((a, b) => overlap(b) - overlap(a) || a.durationMin - b.durationMin)
}

/** Total seconds a routine takes if every movement is followed (reps assumed at 4 s each). */
export function routineDurationSec(r: MobilityRoutine): number {
  return r.movements.reduce((sum, m) => sum + (m.durationSec ?? (m.reps ?? 0) * 4), 0)
}
