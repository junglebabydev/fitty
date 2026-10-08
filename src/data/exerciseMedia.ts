// Exercise animations and photos.
//
// Photos come from free-exercise-db (https://github.com/yuhonas/free-exercise-db). The repository is
// released under the Unlicense (LICENSE.md) and describes itself as an "Open Public Domain Exercise
// Dataset"; no attribution is required, we credit it anyway (README → Media & attribution). Photos are
// loaded on demand from GitHub's raw host and cached by the service worker (`runtimeCaching` in
// vite.config.ts); nothing is bundled.
//
// Every id in EXERCISE_PHOTO_IDS was verified on 2026-09-17: present in the dataset index
// (dist/exercises.json) and <ID>.json, <ID>/0.jpg and <ID>/1.jpg all answered HTTP 200. Exercises
// without a faithful match (assisted pull-up, single-leg press, cable / side-lying hip abduction,
// bird dog, hollow hold, suitcase carry, the swims) are left out on purpose: ExerciseVisual then shows
// the MuscleMap tile. Never add an id here without checking it.
// A few photos use different equipment from our variant (barbell hip thrust, kettlebell goblet squat,
// dumbbell rear lunge) and may show a fuller range than our knee-friendly versions: the photo
// illustrates the movement, the exercise's own instructions set the range and load.

export const EXERCISE_MEDIA_SOURCE = 'free-exercise-db (public domain, Unlicense)'
export const EXERCISE_MEDIA_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

/** Our exercise id → free-exercise-db folder id. */
export const EXERCISE_PHOTO_IDS: Record<string, string> = {
  db_bench_press: 'Dumbbell_Bench_Press',
  incline_db_press: 'Incline_Dumbbell_Press',
  machine_chest_press: 'Machine_Bench_Press',
  db_floor_press: 'Dumbbell_Floor_Press',
  cable_fly: 'Cable_Crossover',
  pec_deck: 'Butterfly',
  push_up: 'Pushups',
  incline_push_up: 'Incline_Push-Up',
  lat_pulldown: 'Wide-Grip_Lat_Pulldown',
  straight_arm_pulldown: 'Straight-Arm_Pulldown',
  db_pullover: 'Straight-Arm_Dumbbell_Pullover',
  seated_cable_row: 'Seated_Cable_Rows',
  machine_row: 'Leverage_Iso_Row',
  chest_supported_db_row: 'Dumbbell_Incline_Row',
  one_arm_db_row: 'One-Arm_Dumbbell_Row',
  bent_over_db_row: 'Bent_Over_Two-Dumbbell_Row',
  inverted_row: 'Inverted_Row',
  db_shoulder_press: 'Seated_Dumbbell_Press',
  machine_shoulder_press: 'Machine_Shoulder_Military_Press',
  arnold_press: 'Arnold_Dumbbell_Press',
  lateral_raise: 'Side_Lateral_Raise',
  cable_lateral_raise: 'Standing_Low-Pulley_Deltoid_Raise',
  db_front_raise: 'Front_Dumbbell_Raise',
  face_pull: 'Face_Pull',
  rear_delt_fly: 'Reverse_Flyes',
  reverse_pec_deck: 'Reverse_Machine_Flyes',
  band_pull_apart: 'Band_Pull_Apart',
  db_shrug: 'Dumbbell_Shrug',
  db_curl: 'Dumbbell_Bicep_Curl',
  hammer_curl: 'Hammer_Curls',
  incline_db_curl: 'Incline_Dumbbell_Curl',
  cable_curl: 'Standing_Biceps_Cable_Curl',
  preacher_curl_machine: 'Machine_Preacher_Curls',
  triceps_pushdown: 'Triceps_Pushdown',
  overhead_cable_triceps: 'Cable_Rope_Overhead_Triceps_Extension',
  db_lying_triceps_extension: 'Lying_Dumbbell_Tricep_Extension',
  machine_triceps_extension: 'Machine_Triceps_Extension',
  db_kickback: 'Tricep_Dumbbell_Kickback',
  leg_press: 'Leg_Press',
  hack_squat: 'Hack_Squat',
  goblet_squat: 'Goblet_Squat',
  db_split_squat: 'Split_Squat_with_Dumbbells',
  reverse_lunge: 'Dumbbell_Rear_Lunge',
  db_step_up: 'Dumbbell_Step_Ups',
  leg_extension: 'Leg_Extensions',
  hip_thrust: 'Barbell_Hip_Thrust',
  glute_bridge: 'Butt_Lift_Bridge',
  single_leg_glute_bridge: 'Single_Leg_Glute_Bridge',
  db_rdl: 'Stiff-Legged_Dumbbell_Deadlift',
  cable_pull_through: 'Pull_Through',
  back_extension_45: 'Hyperextensions_Back_Extensions',
  lying_leg_curl: 'Lying_Leg_Curls',
  seated_leg_curl: 'Seated_Leg_Curl',
  swiss_ball_leg_curl: 'Ball_Leg_Curl',
  standing_calf_raise: 'Standing_Calf_Raises',
  seated_calf_raise: 'Seated_Calf_Raise',
  calf_press_leg_press: 'Calf_Press_On_The_Leg_Press_Machine',
  hip_abduction_machine: 'Thigh_Abductor',
  hip_adduction_machine: 'Thigh_Adductor',
  glute_kickback_machine: 'One-Legged_Cable_Kickback',
  dead_bug: 'Dead_Bug',
  plank: 'Plank',
  side_plank: 'Side_Bridge',
  pallof_press: 'Pallof_Press',
  cable_crunch: 'Cable_Crunch',
  reverse_crunch: 'Reverse_Crunch',
  farmers_carry: 'Farmers_Walk',
  stationary_bike: 'Bicycling_Stationary',
  bike_intervals: 'Bicycling_Stationary',
  incline_walk: 'Walking_Treadmill',
  treadmill_walk: 'Walking_Treadmill',
  treadmill_jog: 'Jogging_Treadmill',
  stair_climber: 'Stairmaster',
  elliptical: 'Elliptical_Trainer',
}

// Animations come from ExerciseDB's free V1 API (https://oss.exercisedb.dev, 180×180 GIFs): free for
// non-commercial use with attribution, which fits this single-user personal app. The art is ExerciseDB's
// (it matches Gym Visual's style), so it is never copied into the repo: GIFs load on demand from their CDN
// and the service worker caches them (`exercise-animations` in vite.config.ts). Credit: README → Media.
//
// Every id in EXERCISE_ANIMATION_IDS was picked by hand on 2026-09-24 and its GIF checked by eye against our
// exercise. Deliberately left out: moves with no faithful match (bird dog, hollow hold, suitcase carry,
// face pull, the swims, glute kickback, …) and moves whose knee- or back-friendly range limit a stock
// full-range clip would contradict (hack squat, leg press, box goblet squat, short split squat, low step-up,
// back squat, pistol to box, deficit lunge, bench dip, ab wheel). Those keep the photo or the MuscleMap tile.
// Never add an id without looking at the GIF.

export const EXERCISE_ANIMATION_SOURCE = 'ExerciseDB (free, non-commercial)'
export const EXERCISE_ANIMATION_BASE = 'https://static.exercisedb.dev/media'

/** Our exercise id → ExerciseDB exercise id. */
export const EXERCISE_ANIMATION_IDS: Record<string, string> = {
  db_bench_press: 'SpYC0Kp', incline_db_press: 'ns0SIbU', machine_chest_press: 'DOoWcnA', cable_fly: 'Pr9Rhf4',
  pec_deck: 'v3xmPAR', push_up: 'I4hDWkc', incline_push_up: 'B1EVP9F', lat_pulldown: 'qdRxqCj', straight_arm_pulldown: 'x69MAlq',
  assisted_pull_up: 'kiJ4Z2K', db_pullover: '9XjtHvS', seated_cable_row: 'fUBheHs', machine_row: '7I6LNUG',
  chest_supported_db_row: '7vG5o25', one_arm_db_row: 'C0MA9bC', bent_over_db_row: 'BJ0Hz5L', inverted_row: 'bZGHsAZ',
  db_shoulder_press: 'znQUdHY', machine_shoulder_press: 'vqsbmL0', arnold_press: 'Xy4jlWA', lateral_raise: 'DsgkuIt',
  cable_lateral_raise: 'goJ6ezq', db_front_raise: '3eGE2JC', reverse_pec_deck: 'myfUsKf', band_pull_apart: 'sTfvVsG',
  db_shrug: 'NJzBsGJ', db_curl: '3s4NnTh', hammer_curl: 'slDvUAU', incline_db_curl: 'ae9UoXQ', cable_curl: 'G08RZcQ',
  preacher_curl_machine: 'b6hQYMb', triceps_pushdown: 'gAwDzB3', overhead_cable_triceps: '2IxROQ1', db_lying_triceps_extension: 'mpKZGWz',
  machine_triceps_extension: 'Ser9eQp', db_kickback: 'W6PxUkg', reverse_lunge: 'SSsBDwB', leg_extension: 'my33uHU',
  glute_bridge: 'u0cNiij', single_leg_glute_bridge: 'rmEukuS', db_rdl: 'rR0LJzx', cable_pull_through: 'OM46QHm',
  lying_leg_curl: '17lJ1kr', seated_leg_curl: 'Zg3XY7P', standing_calf_raise: 'ykUOVze', seated_calf_raise: 'bOOdeyc',
  calf_press_leg_press: 'ykHcWme', hip_abduction_machine: 'CHpahtl', hip_adduction_machine: 'oHsrypV', dead_bug: 'iny3m5y',
  pallof_press: '9pa4H5m', cable_crunch: 'WW95auq', reverse_crunch: 'nCU1Ekp', farmers_carry: 'qPEzJjA',
  stationary_bike: 'a8VDgLw', bike_intervals: 'a8VDgLw', incline_walk: 'rjiM4L3', stair_climber: 'j9Q5crt',
  elliptical: 'rjtuP6X', bb_front_squat: 'zG0zs85', bb_walking_lunge: 't8iSghb', bb_deadlift: 'ila4NZS',
  trap_bar_deadlift: 'jQGwmxN', bb_rdl: 'wQ2c4XD', bb_good_morning: 'XlZ4lAC', bb_bench_press: 'EIeI8Vf',
  bb_incline_bench: '3TZduzM', bb_overhead_press: 'wdRZISl', close_grip_bench: 'J6Dx1Mu', bb_row: 'eZyBC3j',
  pendlay_row: 'r0z6xzQ', bb_curl: '25GPyDY', kb_swing: 'UHJlbu3', kb_goblet_squat: 'ZA8b5hc', kb_clean: 'LHWF7us',
  kb_press: 'blBXysN', kb_snatch: 'aXcUyKb', kb_turkish_get_up: 'Ha7SZ3y', pull_up: 'lBDjFxJ', chin_up: 'T2mxWqc',
  band_assisted_pull_up: 'r1XNRYB', parallel_bar_dip: 'O2K9Vb5', decline_push_up: 'i5cEhka', diamond_push_up: 'soIB2rj',
  archer_push_up: 'A9qxk2F', wall_handstand_hold: 'XooAdhl', bw_split_squat: '9E25EOx', bulgarian_split_squat: 'qx4fgX7',
  single_leg_rdl_bw: 'gKozT8X', hanging_leg_raise: 'I3tsCnC', walking_lunge_bw: 'IZVHb27', lateral_lunge: 'py1HSzx',
  curtsy_lunge: 'gUjqdei', overhead_carry: 'mWBtgmb', renegade_row: 'b9kqlBy', band_chest_press: '4x5Okof',
  band_overhead_press: 'peAeMR3', band_curl: '3omWx6P', band_monster_walk: 'O95afRA', burpee: 'dK9394r',
  thruster: 'f7Y9eDZ', jump_rope: 'e1e76I2', mountain_climber: 'RJgzwny', ski_erg: 'vpQaQkH', assisted_dip_machine: 'J60bN17',
  smith_squat: 'jFtipLl', ab_crunch_machine: 'Wgaz7pm',
}

// Line illustrations come from Workout Guide by Bryl Lim (https://github.com/bryllim/workout-guide), built on
// Everkinetic pose artwork; both are CC BY-SA 4.0 (the repository's code is MIT). They fill only the exercises
// that have neither an animation nor a photo. Each is a white single-path 512 × 512 SVG, loaded on demand from
// GitHub's raw host at a pinned commit and cached by the service worker (`exercise-art` in vite.config.ts);
// ExerciseVisual draws it dark on the white media tile. Credit: README → Media, and a line on the exercise screen.
//
// The three frames of an exercise vary in quality and pose, so each entry names the one frame that matches our
// variant (the tucked hollow hold and tuck L-sit use frame 3; frames 1 show the full versions). Every frame was
// picked by eye on 2026-10-01 and answered HTTP 200 as image/svg+xml. Deliberately left out: the swims (the
// "swimming" drawing is a machine, not a pool), band moves drawn with other equipment, box step-over, mixed carry,
// and the range-limited moves the animations also skip. Judgement calls: side plank reach shows the start
// position only, shrimp squat is drawn holding a pole, landmine row uses the T-bar row drawing.

export const EXERCISE_ART_SOURCE = 'Workout Guide by Bryl Lim, after Everkinetic (CC BY-SA 4.0)'
export const EXERCISE_ART_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'
export const EXERCISE_ART_BASE =
  'https://raw.githubusercontent.com/bryllim/workout-guide/aac599224bb9780305239607ef98540b7e0ce389/packages/workout-guide/assets'

/** Our exercise id → Workout Guide `<slug>/frame-<n>`. */
export const EXERCISE_ART_FRAMES: Record<string, string> = {
  bird_dog: 'bird-dog/frame-1', hollow_hold: 'hollow-body-hold/frame-3', cable_hip_abduction: 'cable-standing-hip-abduction/frame-1',
  side_lying_hip_abduction: 'side-lying-hip-abduction/frame-2', bb_hip_thrust: 'hip-thrust/frame-1', bb_push_press: 'push-press/frame-1',
  landmine_press: 'landmine-press/frame-1', landmine_row: 't-bar-row/frame-1', negative_pull_up: 'negative-pull-up/frame-2',
  hanging_knee_raise: 'hanging-knee-raise/frame-1', pike_push_up: 'pike-push-up/frame-1', bodyweight_squat: 'bodyweight-squat/frame-1',
  shrimp_squat: 'shrimp-squat/frame-1', nordic_curl_negative: 'nordic-hamstring-curl/frame-1', wall_sit: 'wall-sit/frame-1',
  copenhagen_plank: 'copenhagen-plank/frame-1', side_plank_reach: 'side-plank/frame-1', l_sit_tuck: 'l-sit-hold/frame-3',
  half_kneeling_pallof: 'half-kneeling-pallof-press/frame-1', battle_rope: 'battle-ropes/frame-1', rowing_machine: 'rowing/frame-1',
  assault_bike: 'assault-bike/frame-1',
}

// Drawings first (2026-10-04, for the Blueprint week): these exercises show Workout Guide line art even when they
// also have an animation or a photo, so a whole session reads in one style. Each entry lists frames in play order and
// the first is the still (thumbnails, reduced motion); the frames of one exercise form a movement loop. Picked by eye
// on 2026-10-04. Frame 2 of push-up, reverse lunge and step-up is drawn in a heavier stroke, so it is skipped. The
// range-limited moves stay out (goblet squat, low step-up keep their photos). Judgement calls: the single-leg RDL is
// drawn holding dumbbells, single-leg balance uses the single-leg calf raise drawing (one leg, hand on a support), and
// zone 2 cardio shows walking.
export const EXERCISE_ART_LOOPS: Record<string, [slug: string, frames: number[]]> = {
  push_up: ['push-up', [1, 3]], one_arm_db_row: ['one-arm-dumbbell-row', [1, 3]], kb_swing: ['kettlebell-swing', [1, 2, 3, 2]],
  farmers_carry: ['farmer-carry', [1, 3]], plank: ['plank', [1]], side_plank: ['side-plank', [1]],
  single_leg_balance: ['single-leg-calf-raise', [2]], single_leg_rdl_bw: ['single-leg-romanian-deadlift', [1, 3]],
  dead_bug: ['dead-bug', [1, 3]], plank_shoulder_tap: ['plank-shoulder-tap', [1, 2, 3, 2]],
  reverse_lunge: ['reverse-lunge', [1, 3]], db_shoulder_press: ['seated-dumbbell-press', [1, 3]],
  db_bench_press: ['dumbbell-bench-press', [3, 1]], db_rdl: ['dumbbell-romanian-deadlift', [1, 3]],
  bent_over_db_row: ['dumbbell-bent-over-row', [1, 3]], glute_bridge: ['glute-bridge', [1, 3]],
  stationary_bike: ['cycling', [1]], bike_intervals: ['cycling', [1]], zone2_cardio: ['walking', [1]],
  arm_circles: ['arm-circles', [1]], leg_swings: ['leg-swings-stretch', [1, 2, 3, 2]], high_knees: ['high-knees', [1, 3]],
  lateral_lunge: ['lateral-lunge', [1, 2, 3, 2]], cat_cow: ['cat-cow-stretch', [1, 3]], butterfly_stretch: ['butterfly-stretch', [1]],
  childs_pose: ['childs-pose', [1]], hamstring_stretch: ['hamstring-stretch', [1]],
}

/** One Workout Guide frame as a URL. */
export function artFrameUrl(slug: string, frame: number): string {
  return `${EXERCISE_ART_BASE}/${slug}/frame-${frame}.svg`
}

export interface ExerciseMedia {
  /** Looping GIF of the movement, or null when the exercise has no checked animation. */
  animation: string | null
  /** Start and end position photos ([] when the exercise has no verified photo). */
  images: string[]
  /** One white line-art frame (SVG), or null when the exercise has no checked illustration. */
  art: string | null
  /** Every frame of the drawing in play order (`art` first); [] without one. */
  artFrames: string[]
  source: string | null
}

/** Animation + photos for one of OUR exercise ids (unknown ids get neither). A drawing loop replaces both. */
export function exerciseMedia(id: string): ExerciseMedia {
  const loop = EXERCISE_ART_LOOPS[id]
  if (loop) {
    const artFrames = loop[1].map((n) => artFrameUrl(loop[0], n))
    return { animation: null, images: [], art: artFrames[0], artFrames, source: null }
  }
  const animId = EXERCISE_ANIMATION_IDS[id]
  const photoId = EXERCISE_PHOTO_IDS[id]
  const artFrame = EXERCISE_ART_FRAMES[id]
  const images = photoId ? [`${EXERCISE_MEDIA_BASE}/${photoId}/0.jpg`, `${EXERCISE_MEDIA_BASE}/${photoId}/1.jpg`] : []
  return {
    animation: animId ? `${EXERCISE_ANIMATION_BASE}/${animId}.gif` : null,
    images,
    art: artFrame ? `${EXERCISE_ART_BASE}/${artFrame}.svg` : null,
    artFrames: artFrame ? [`${EXERCISE_ART_BASE}/${artFrame}.svg`] : [],
    source: photoId ? EXERCISE_MEDIA_SOURCE : null,
  }
}
