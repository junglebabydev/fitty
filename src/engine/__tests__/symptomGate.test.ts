import { describe, expect, it } from 'vitest'
import { evaluateSymptomGate, findSubstitute, isExerciseAllowed } from '../symptomGate'
import { LIBRARY, byId, sym } from './fixtures'

describe('evaluateSymptomGate (PRD §9.3 mapping)', () => {
  it('empty symptoms → OK with no avoid tags', () => {
    const g = evaluateSymptomGate([])
    expect(g.overall).toBe('OK')
    expect(g.avoidTags).toEqual([])
    expect(g.regions).toEqual([])
  })

  it('knee AMBER avoids impact + deep_knee_flexion; knee RED adds knee_load', () => {
    const amber = evaluateSymptomGate([sym('knee_left', 4)])
    expect(amber.overall).toBe('AMBER')
    expect(amber.avoidTags.sort()).toEqual(['deep_knee_flexion', 'impact'])
    const red = evaluateSymptomGate([sym('knee_left', 7)])
    expect(red.overall).toBe('RED')
    expect(red.avoidTags.sort()).toEqual(['deep_knee_flexion', 'impact', 'knee_load'])
  })

  it('back AMBER avoids spinal_flexion + axial_load; back RED adds spinal_load', () => {
    expect(evaluateSymptomGate([sym('back_lower', 3)]).avoidTags.sort()).toEqual(['axial_load', 'spinal_flexion'])
    expect(evaluateSymptomGate([sym('back_mid', 6)]).avoidTags.sort()).toEqual(['axial_load', 'spinal_flexion', 'spinal_load'])
  })

  it('neck AMBER avoids overhead; neck RED adds neck_load', () => {
    expect(evaluateSymptomGate([sym('neck', 4)]).avoidTags).toEqual(['overhead'])
    expect(evaluateSymptomGate([sym('neck', 8)]).avoidTags.sort()).toEqual(['neck_load', 'overhead'])
  })

  it('red flags force RED regardless of pain score', () => {
    const g = evaluateSymptomGate([sym('knee_right', 1, { givingWay: true })])
    expect(g.overall).toBe('RED')
    expect(g.regions[0].level).toBe('RED')
    expect(g.regions[0].reasons[0]).toMatch(/giving way/)
    expect(g.avoidTags).toContain('knee_load')
    const neuro = evaluateSymptomGate([sym('back_lower', 2, { numbness: true, radiating: true })])
    expect(neuro.overall).toBe('RED')
    expect(neuro.avoidTags).toContain('spinal_load')
    expect(neuro.advice.join(' ')).toMatch(/assessment/i)
  })

  it('RED from pain alone (> 5/10, no red flags) advises a clinical assessment; AMBER does not', () => {
    for (const region of ['knee_left', 'back_lower', 'neck'] as const) {
      const g = evaluateSymptomGate([sym(region, 7)])
      expect(g.overall).toBe('RED')
      expect(g.advice.join(' ')).toMatch(/pain above 5\/10.*clinical assessment/i)
      expect(g.advice.join(' ')).toMatch(/does not diagnose/i)
      expect(g.advice.join(' ')).not.toMatch(/locking|numbness/i)
    }
    expect(evaluateSymptomGate([sym('knee_left', 4)]).advice.join(' ')).not.toMatch(/assessment/i)
    const both = evaluateSymptomGate([sym('knee_left', 8, { locking: true })])
    expect(both.advice.join(' ')).toMatch(/pain above 5\/10/i)
    expect(both.advice.join(' ')).toMatch(/locking/i)
  })

  it('pain 1–2 is OK with a monitor note and advice; overall stays OK', () => {
    const g = evaluateSymptomGate([sym('knee_left', 2)])
    expect(g.overall).toBe('OK')
    expect(g.regions[0].level).toBe('OK')
    expect(g.regions[0].painScore).toBe(2)
    expect(g.avoidTags).toEqual([])
    expect(g.advice[0]).toMatch(/monitor/i)
  })

  it('overall is the worst region', () => {
    const g = evaluateSymptomGate([sym('knee_left', 2), sym('neck', 4), sym('back_lower', 6)])
    expect(g.overall).toBe('RED')
    expect(g.regions[0].region).toBe('back_lower')
  })
})

describe('isExerciseAllowed / findSubstitute', () => {
  it('blocks exercises carrying an avoided tag with a readable reason', () => {
    const gate = evaluateSymptomGate([sym('neck', 4)])
    const res = isExerciseAllowed(byId('db_shoulder_press'), gate)
    expect(res.allowed).toBe(false)
    expect(res.reasons[0]).toMatch(/Overhead work — neck AMBER/)
    expect(isExerciseAllowed(byId('db_bench_press'), gate).allowed).toBe(true)
  })

  it('prefers listed substitutions that pass the gate', () => {
    const gate = evaluateSymptomGate([sym('neck', 4)])
    const sub = findSubstitute(byId('db_shoulder_press'), gate, LIBRARY)
    expect(sub?.id).toBe('lateral_raise') // machine_shoulder_press is listed first but is overhead
  })

  it('falls back to same-pattern, preferring machines/cables and skipping avoided tags', () => {
    const gate = evaluateSymptomGate([sym('knee_left', 7)])
    const sub = findSubstitute(byId('hack_squat'), gate, LIBRARY) // listed sub leg_press is knee_load → blocked
    expect(sub).toBeNull() // every squat-pattern option carries knee_load under a RED knee
    const kneeAmber = evaluateSymptomGate([sym('knee_left', 4)])
    const sub2 = findSubstitute(byId('goblet_squat'), kneeAmber, LIBRARY)
    expect(sub2?.id).toBe('leg_press') // listed first, only knee_load which AMBER allows
  })

  it('returns null when nothing safe exists', () => {
    const gate = evaluateSymptomGate([sym('neck', 8)])
    const lib = [byId('db_shoulder_press'), byId('machine_shoulder_press')]
    expect(findSubstitute(byId('db_shoulder_press'), gate, lib)).toBeNull()
  })
})
