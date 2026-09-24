// Exercise animations, photos and demo links.
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

import { EXERCISE_BY_ID } from './exercises'

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

/** A YouTube search for the movement's form; works for every exercise, mapped or not. */
export function demoUrl(name: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' proper form')
}

export interface ExerciseMedia {
  /** Looping GIF of the movement, or null when the exercise has no checked animation. */
  animation: string | null
  /** Start and end position photos ([] when the exercise has no verified photo). */
  images: string[]
  demoUrl: string
  source: string | null
}

/** Animation + photos + demo link for one of OUR exercise ids (unknown ids still get a demo search built from the id). */
export function exerciseMedia(id: string): ExerciseMedia {
  const animId = EXERCISE_ANIMATION_IDS[id]
  const photoId = EXERCISE_PHOTO_IDS[id]
  const images = photoId ? [`${EXERCISE_MEDIA_BASE}/${photoId}/0.jpg`, `${EXERCISE_MEDIA_BASE}/${photoId}/1.jpg`] : []
  return {
    animation: animId ? `${EXERCISE_ANIMATION_BASE}/${animId}.gif` : null,
    images,
    demoUrl: demoUrl(EXERCISE_BY_ID[id]?.name ?? id.replace(/_/g, ' ')),
    source: photoId ? EXERCISE_MEDIA_SOURCE : null,
  }
}
