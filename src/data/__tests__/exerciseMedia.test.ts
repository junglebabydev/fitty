import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXERCISES, EXERCISE_BY_ID } from '../exercises'
import {
  EXERCISE_ANIMATION_BASE, EXERCISE_ANIMATION_IDS, EXERCISE_ART_BASE, EXERCISE_ART_FRAMES, EXERCISE_ART_LOOPS, EXERCISE_MEDIA_BASE,
  EXERCISE_PHOTO_IDS, EXERCISE_PHOTO_LOOPS, EXERCISE_PHOTO_LOOPS_MALE, exerciseMedia, photoModelFor,
} from '../exerciseMedia'
import { getProgram } from '../programs'
import { SESSION_TEMPLATES } from '../../engine/planner'
import { expandSessions, sessionOnPath, toPlannedExercises } from '../../engine/programs'

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
    const m = exerciseMedia('incline_db_press')
    expect(m.images).toEqual([
      `${EXERCISE_MEDIA_BASE}/Incline_Dumbbell_Press/0.jpg`,
      `${EXERCISE_MEDIA_BASE}/Incline_Dumbbell_Press/1.jpg`,
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
    expect(exerciseMedia('incline_db_press').animation).toBe(`${EXERCISE_ANIMATION_BASE}/${EXERCISE_ANIMATION_IDS.incline_db_press}.gif`)
    expect(exerciseMedia('bird_dog').animation).toBeNull()
    expect(exerciseMedia('not_a_real_exercise').animation).toBeNull()
  })

  it('never animates or illustrates a move whose knee- or back-friendly range a stock full-range clip would contradict', () => {
    const rangeLimited = [
      'hack_squat', 'leg_press', 'single_leg_press', 'goblet_squat', 'db_split_squat', 'db_step_up', 'bb_back_squat',
      'pistol_squat_box', 'deficit_reverse_lunge', 'bench_dip', 'ab_wheel',
    ]
    for (const id of rangeLimited) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(EXERCISE_ANIMATION_IDS[id], id).toBeUndefined()
      expect(EXERCISE_ART_FRAMES[id], id).toBeUndefined()
      expect(EXERCISE_ART_LOOPS[id], id).toBeUndefined()
    }
  })

  it('maps illustrations only for library exercises, to one Workout Guide frame at a pinned commit', () => {
    expect(EXERCISE_ART_BASE).toMatch(/^https:\/\/raw\.githubusercontent\.com\/bryllim\/workout-guide\/[0-9a-f]{40}\/packages\/workout-guide\/assets$/)
    for (const [id, frame] of Object.entries(EXERCISE_ART_FRAMES)) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(frame, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\/frame-[123]$/)
    }
    expect(exerciseMedia('bird_dog').art).toBe(`${EXERCISE_ART_BASE}/bird-dog/frame-1.svg`)
    expect(exerciseMedia('incline_db_press').art).toBeNull()
    expect(exerciseMedia('not_a_real_exercise').art).toBeNull()
  })

  it('only illustrates exercises that have neither an animation nor a photo', () => {
    for (const id of Object.keys(EXERCISE_ART_FRAMES)) {
      expect(EXERCISE_ANIMATION_IDS[id], id).toBeUndefined()
      expect(EXERCISE_PHOTO_IDS[id], id).toBeUndefined()
    }
  })

  it('maps drawing loops only for library exercises, to Workout Guide frames 1-3, never alongside a single frame', () => {
    for (const [id, [slug, frames]] of Object.entries(EXERCISE_ART_LOOPS)) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(slug, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(frames.length, id).toBeGreaterThan(0)
      for (const f of frames) expect([1, 2, 3], id).toContain(f)
      expect(EXERCISE_ART_FRAMES[id], id).toBeUndefined()
    }
  })

  it('shows a drawing loop instead of the animation and photos, first frame as the still', () => {
    const m = exerciseMedia('dead_bug')
    expect(m.animation).toBeNull()
    expect(m.images).toEqual([])
    expect(m.source).toBeNull()
    expect(m.artFrames).toEqual([1, 3].map((n) => `${EXERCISE_ART_BASE}/dead-bug/frame-${n}.svg`))
    expect(m.art).toBe(m.artFrames[0])
    expect(exerciseMedia('bird_dog').artFrames).toEqual([`${EXERCISE_ART_BASE}/bird-dog/frame-1.svg`])
    expect(exerciseMedia('incline_db_press').artFrames).toEqual([])
  })

  it('ships a loop and a still for every photo-loop move in each set, and nothing else for it', () => {
    const dir = join(__dirname, '../../../public/moves')
    for (const [set, list] of [['f', EXERCISE_PHOTO_LOOPS], ['m', EXERCISE_PHOTO_LOOPS_MALE]] as const) {
      expect(new Set(list).size, set).toBe(list.length)
      for (const id of list) {
        expect(EXERCISE_BY_ID[id], id).toBeDefined()
        expect(existsSync(join(dir, 'loop', set, `${id}.svg`)), `loop/${set}/${id}.svg`).toBe(true)
        expect(existsSync(join(dir, 'still', set, `${id}.svg`)), `still/${set}/${id}.svg`).toBe(true)
        const m = exerciseMedia(id, set)
        expect(m.photoLoop, id).toBe(`/moves/loop/${set}/${id}.svg`)
        expect(m.photoStill, id).toBe(`/moves/still/${set}/${id}.svg`)
        expect([m.animation, m.art, ...m.images], id).toEqual([null, null])
      }
    }
    // Every male move has a female one (the female set is the fallback), and a missing male move falls back to it.
    for (const id of EXERCISE_PHOTO_LOOPS_MALE) expect(EXERCISE_PHOTO_LOOPS, id).toContain(id)
    const femaleOnly = EXERCISE_PHOTO_LOOPS.find((id) => !EXERCISE_PHOTO_LOOPS_MALE.includes(id))
    if (femaleOnly) expect(exerciseMedia(femaleOnly, 'm').photoLoop).toBe(`/moves/loop/f/${femaleOnly}.svg`)
    expect(exerciseMedia('bird_dog').photoLoop).toBeNull()
    expect([photoModelFor('male'), photoModelFor('female'), photoModelFor('other'), photoModelFor(null)]).toEqual(['m', 'f', 'f', 'f'])
  })

  it('gives every move of the BFT week a photo loop: standard, knee and back paths, alone and together', () => {
    // The no-overhead swaps (neck or shoulder flags) keep their drawings and GIFs for now.
    const p = getProgram('bft')!
    const named = ['low-impact', 'back']
    const lists = [['standard'], ...named.map((x) => [x]), ...named.flatMap((a) => named.filter((b) => b !== a).map((b) => [a, b]))]
    const missing = new Set<string>()
    for (const paths of lists) {
      for (const s of expandSessions(p).filter((x) => x.week === 1)) {
        for (const e of toPlannedExercises(p, sessionOnPath(p, s, paths, EXERCISES))) if (!EXERCISE_PHOTO_LOOPS.includes(e.exerciseId)) missing.add(e.exerciseId)
      }
    }
    expect([...missing].sort()).toEqual([])
  })
})
