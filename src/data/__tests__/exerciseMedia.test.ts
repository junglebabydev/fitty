import { describe, expect, it } from 'vitest'
import { EXERCISES, EXERCISE_BY_ID } from '../exercises'
import { EXERCISE_ANIMATION_BASE, EXERCISE_ANIMATION_IDS, EXERCISE_MEDIA_BASE, EXERCISE_PHOTO_IDS, exerciseMedia } from '../exerciseMedia'
import { SESSION_TEMPLATES } from '../../engine/planner'

describe('exerciseMedia', () => {
  it('only maps exercise ids that exist in our library', () => {
    for (const id of Object.keys(EXERCISE_PHOTO_IDS)) expect(EXERCISE_BY_ID[id], id).toBeDefined()
  })

  it('uses well-formed free-exercise-db folder ids', () => {
    for (const [id, photoId] of Object.entries(EXERCISE_PHOTO_IDS)) {
      expect(photoId, id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    }
  })

  it('returns two photo URLs and the source for a mapped exercise', () => {
    const m = exerciseMedia('db_bench_press')
    expect(m.images).toEqual([
      `${EXERCISE_MEDIA_BASE}/Dumbbell_Bench_Press/0.jpg`,
      `${EXERCISE_MEDIA_BASE}/Dumbbell_Bench_Press/1.jpg`,
    ])
    expect(m.source).toContain('free-exercise-db')
  })

  it('falls back cleanly for unmapped and unknown ids', () => {
    for (const id of ['bird_dog', 'not_a_real_exercise']) {
      const m = exerciseMedia(id)
      expect(m.images).toEqual([])
      expect(m.source).toBeNull()
    }
  })

  it('covers most of the library and nearly all template exercises', () => {
    const mapped = EXERCISES.filter((e) => EXERCISE_PHOTO_IDS[e.id]).length
    expect(mapped).toBeGreaterThanOrEqual(30)

    const templateIds = new Set<string>()
    for (const t of Object.values(SESSION_TEMPLATES)) for (const e of t.exercises) templateIds.add(e.exerciseId)
    const unmapped = [...templateIds].filter((id) => !EXERCISE_PHOTO_IDS[id])
    // No faithful photo exists in the dataset for these; they show the MuscleMap tile instead.
    const knownNoPhoto = [
      'assisted_pull_up', 'single_leg_press', 'cable_hip_abduction', 'side_lying_hip_abduction', 'bird_dog', 'hollow_hold',
      'suitcase_carry', 'swim_freestyle', 'swim_easy', 'swim_kickboard',
    ]
    for (const id of unmapped) expect(knownNoPhoto, id).toContain(id)
  })

  it('maps animations only for library exercises, to well-formed ExerciseDB ids', () => {
    for (const [id, animId] of Object.entries(EXERCISE_ANIMATION_IDS)) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(animId, id).toMatch(/^[A-Za-z0-9]{7}$/)
    }
    expect(exerciseMedia('db_bench_press').animation).toBe(`${EXERCISE_ANIMATION_BASE}/${EXERCISE_ANIMATION_IDS.db_bench_press}.gif`)
    expect(exerciseMedia('bird_dog').animation).toBeNull()
    expect(exerciseMedia('not_a_real_exercise').animation).toBeNull()
  })

  it('never animates a move whose knee- or back-friendly range a stock full-range clip would contradict', () => {
    const rangeLimited = [
      'hack_squat', 'leg_press', 'single_leg_press', 'goblet_squat', 'db_split_squat', 'db_step_up', 'bb_back_squat',
      'pistol_squat_box', 'deficit_reverse_lunge', 'bench_dip', 'ab_wheel',
    ]
    for (const id of rangeLimited) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(EXERCISE_ANIMATION_IDS[id], id).toBeUndefined()
    }
  })
})
