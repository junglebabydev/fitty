// Exercise photos and demo links.
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

/** A YouTube search for the movement's form; works for every exercise, mapped or not. */
export function demoUrl(name: string): string {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' proper form')
}

export interface ExerciseMedia {
  /** Start and end position photos ([] when the exercise has no verified photo). */
  images: string[]
  demoUrl: string
  source: string | null
}

/** Photos + demo link for one of OUR exercise ids (unknown ids still get a demo search built from the id). */
export function exerciseMedia(id: string): ExerciseMedia {
  const photoId = EXERCISE_PHOTO_IDS[id]
  const images = photoId ? [`${EXERCISE_MEDIA_BASE}/${photoId}/0.jpg`, `${EXERCISE_MEDIA_BASE}/${photoId}/1.jpg`] : []
  return {
    images,
    demoUrl: demoUrl(EXERCISE_BY_ID[id]?.name ?? id.replace(/_/g, ' ')),
    source: photoId ? EXERCISE_MEDIA_SOURCE : null,
  }
}
