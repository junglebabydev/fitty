import { describe, expect, it } from 'vitest'
import type { PlannedExercise } from '../../../domain/types'
import { EXERCISE_BY_ID } from '../../../data/exercises'
import { parseGateReply, parseWorkoutReply } from '../parse'
import { currentStep, describeStep, progress, stepLine } from '../step'

const byId = new Map(Object.entries(EXERCISE_BY_ID))
const pe = (exerciseId: string, sets: number, repMin: number, repMax: number, extra: Partial<PlannedExercise> = {}): PlannedExercise =>
  ({ exerciseId, sets, repMin, repMax, loadKg: null, restSec: 60, ...extra })
const set = (exerciseId: string) => ({ exerciseId })

describe('parseWorkoutReply', () => {
  it('reads a bare number in the step unit', () => {
    expect(parseWorkoutReply('12', 'reps')).toEqual({ kind: 'reps', reps: 12, loadKg: null })
    expect(parseWorkoutReply('45', 'hold')).toEqual({ kind: 'seconds', sec: 45 })
    expect(parseWorkoutReply('20', 'steady')).toEqual({ kind: 'seconds', sec: 1200 })
    expect(parseWorkoutReply('did 10', 'reps')).toEqual({ kind: 'reps', reps: 10, loadKg: null })
  })

  it('reads reps with a load, in kg or lb', () => {
    expect(parseWorkoutReply('10 at 16 kg', 'reps')).toEqual({ kind: 'reps', reps: 10, loadKg: 16 })
    expect(parseWorkoutReply('10 x 16', 'reps')).toEqual({ kind: 'reps', reps: 10, loadKg: 16 })
    expect(parseWorkoutReply('8 reps @ 35 lb', 'reps')).toEqual({ kind: 'reps', reps: 8, loadKg: 16 })
    expect(parseWorkoutReply('16 kg, 12', 'reps')).toEqual({ kind: 'reps', reps: 12, loadKg: 16 })
  })

  it('reads durations with units', () => {
    expect(parseWorkoutReply('held it 40 seconds', 'hold')).toEqual({ kind: 'seconds', sec: 40 })
    expect(parseWorkoutReply('25 min', 'steady')).toEqual({ kind: 'seconds', sec: 1500 })
    expect(parseWorkoutReply('1.5 min', 'hold')).toEqual({ kind: 'seconds', sec: 90 })
  })

  it('understands the commands', () => {
    expect(parseWorkoutReply('done', 'reps')).toEqual({ kind: 'done' })
    expect(parseWorkoutReply('Next', 'hold')).toEqual({ kind: 'done' })
    expect(parseWorkoutReply('skip', 'reps')).toEqual({ kind: 'skip' })
    expect(parseWorkoutReply("can't do this", 'reps')).toEqual({ kind: 'skip' })
    expect(parseWorkoutReply('how do I do this?', 'reps')).toEqual({ kind: 'how' })
    expect(parseWorkoutReply('go', 'hold')).toEqual({ kind: 'start' })
    expect(parseWorkoutReply('skip rest', 'reps')).toEqual({ kind: 'start' })
    expect(parseWorkoutReply('undo', 'reps')).toEqual({ kind: 'undo' })
    expect(parseWorkoutReply("I'm done for today", 'reps')).toEqual({ kind: 'finish' })
  })

  it('takes any mention of pain as a report, but not reassurance', () => {
    expect(parseWorkoutReply('my knee hurts', 'reps')).toEqual({ kind: 'pain' })
    expect(parseWorkoutReply('sharp pain in my back', 'hold')).toEqual({ kind: 'pain' })
    expect(parseWorkoutReply('12, no pain', 'reps')).toEqual({ kind: 'reps', reps: 12, loadKg: null })
  })

  it('leaves questions for the coach', () => {
    expect(parseWorkoutReply('why am I doing wall sits?', 'hold')).toEqual({ kind: 'other' })
    expect(parseWorkoutReply('what should I eat after this', 'reps')).toEqual({ kind: 'other' })
  })
})

describe('parseGateReply', () => {
  it('starts only on a whole, short all-clear', () => {
    for (const t of ['All good', 'no', 'Nope.', 'fine', 'ok', "I'm good", 'no pain', 'nothing hurts']) expect(parseGateReply(t), t).toBe('all_good')
  })

  it('treats any pain word as a report, whatever comes first', () => {
    for (const t of ['no, but my knee hurts', 'fine but my back aches', "good question, knee's sore", 'a bit sore']) expect(parseGateReply(t), t).toBe('hurts')
  })

  it('leaves anything else for the coach', () => {
    expect(parseGateReply('what are we doing today?')).toBe('other')
    expect(parseGateReply('fine, what is first?')).toBe('other')
  })
})

describe('steps', () => {
  it('describes reps, holds and steady blocks in plain words', () => {
    expect(stepLine(describeStep(0, pe('push_up', 3, 8, 12), byId.get('push_up')!, 1))).toBe('Push-Up · Set 2 of 3 · 8–12 reps')
    expect(stepLine(describeStep(0, pe('bird_dog', 2, 6, 8, { perSide: true, circuit: 'c1' }), byId.get('bird_dog')!, 0))).toBe('Bird Dog · Round 1 of 2 · 6–8 each side')
    const plank = describeStep(0, pe('plank', 3, 20, 30), byId.get('plank')!, 0)
    expect([plank.kind, plank.target, plank.seconds]).toEqual(['hold', '20–30 s', 20])
    const z2 = describeStep(0, pe('zone2_cardio', 1, 1500, 1500), byId.get('zone2_cardio')!, 0)
    expect([z2.kind, z2.target, z2.label]).toEqual(['steady', '25 min', ''])
    expect(describeStep(0, pe('stationary_bike', 1, 300, 300, { role: 'warmup' }), byId.get('stationary_bike')!, 0).label).toBe('Warm-up')
  })

  it('follows the player: circuits round-robin, stopped entries are skipped, null at the end', () => {
    const plan = [
      pe('arm_circles', 1, 60, 60, { role: 'warmup' }),
      pe('cat_cow', 2, 60, 60, { circuit: 'c1' }),
      pe('cobra_pose', 2, 30, 30, { circuit: 'c1' }),
      pe('meditation', 1, 900, 900),
    ]
    expect(currentStep(plan, [], [], byId)?.exercise.id).toBe('arm_circles')
    expect(currentStep(plan, [set('arm_circles')], [], byId)?.exercise.id).toBe('cat_cow')
    expect(currentStep(plan, [set('arm_circles'), set('cat_cow')], [], byId)?.exercise.id).toBe('cobra_pose')
    const r2 = currentStep(plan, [set('arm_circles'), set('cat_cow'), set('cobra_pose')], [], byId)!
    expect([r2.exercise.id, r2.label]).toEqual(['cat_cow', 'Round 2 of 2'])
    expect(currentStep(plan, [set('arm_circles')], ['cat_cow', 'cobra_pose'], byId)?.exercise.id).toBe('meditation')
    const all = [set('arm_circles'), set('cat_cow'), set('cobra_pose'), set('cat_cow'), set('cobra_pose'), set('meditation')]
    expect(currentStep(plan, all, [], byId)).toBeNull()
    expect(progress(plan, all.slice(0, 3), ['meditation'])).toEqual({ done: 3, total: 5 })
  })
})
