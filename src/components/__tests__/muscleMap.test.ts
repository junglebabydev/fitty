import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../../data/exercises'
import { REGION_LABELS, muscleRegions, type RegionId } from '../MuscleMap'

const ALL_REGIONS = Object.keys(REGION_LABELS) as RegionId[]

describe('muscleRegions', () => {
  it('maps every primary muscle of every exercise to at least one region', () => {
    expect(EXERCISES.length).toBeGreaterThan(50)
    for (const e of EXERCISES) {
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0)
      for (const m of e.primaryMuscles) {
        expect(muscleRegions([m]).length, `${e.id}: "${m}"`).toBeGreaterThan(0)
      }
      expect(muscleRegions(e.primaryMuscles).length, e.id).toBeGreaterThan(0)
    }
  })

  it('maps every secondary muscle too, except the non-muscular "cardiovascular"', () => {
    for (const e of EXERCISES) {
      for (const m of e.secondaryMuscles) {
        if (m === 'cardiovascular') { expect(muscleRegions([m])).toEqual([]); continue }
        expect(muscleRegions([m]).length, `${e.id}: "${m}"`).toBeGreaterThan(0)
      }
    }
  })

  it('only ever returns known region ids', () => {
    for (const e of EXERCISES) {
      for (const r of muscleRegions([...e.primaryMuscles, ...e.secondaryMuscles])) expect(ALL_REGIONS, `${e.id}: ${r}`).toContain(r)
    }
  })

  it('is case, spacing and punctuation tolerant', () => {
    expect(muscleRegions(['Front Delts'])).toEqual(['frontDelts'])
    expect(muscleRegions(['  MID   BACK '])).toEqual(['midBack'])
    expect(muscleRegions(['mid-back'])).toEqual(['midBack'])
    expect(muscleRegions(['Deep Core'])).toContain('obliques')
    expect(muscleRegions(['Glutes'])).toEqual(['glutes'])
    expect(muscleRegions(['Lats'])).toEqual(['lats'])
    expect(muscleRegions(['calves (soleus)'])).toEqual(['calves'])
    expect(muscleRegions(['triceps (long head)'])).toEqual(['triceps'])
    expect(muscleRegions(['glute medius'])).toContain('abductors')
    expect(muscleRegions(['upper chest'])).toEqual(['chest'])
    expect(muscleRegions(['rotator cuff'])).toEqual(['rearDelts'])
  })

  it('expands group names', () => {
    expect(muscleRegions(['shoulders'])).toEqual(['frontDelts', 'sideDelts', 'rearDelts'])
    expect(muscleRegions(['arms'])).toEqual(['biceps', 'triceps', 'forearms'])
    expect(muscleRegions(['legs'])).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
    expect(muscleRegions(['full body']).length).toBeGreaterThanOrEqual(6)
  })

  it('understands names it has never seen through keywords', () => {
    expect(muscleRegions(['Latissimus dorsi'])).toEqual(['lats'])
    expect(muscleRegions(['posterior deltoid'])).toEqual(['rearDelts'])
    expect(muscleRegions(['Rectus abdominis'])).toEqual(['abs'])
    expect(muscleRegions(['erector spinae'])).toEqual(['lowerBack'])
    expect(muscleRegions(['gastrocnemius'])).toEqual(['calves'])
  })

  it('deduplicates, keeps input order and ignores junk', () => {
    expect(muscleRegions(['chest', 'upper chest', 'Chest'])).toEqual(['chest'])
    expect(muscleRegions(['quads', 'glutes', 'legs'])).toEqual(['quads', 'glutes', 'hamstrings', 'calves'])
    expect(muscleRegions(['', '   ', 'zzz'])).toEqual([])
    expect(muscleRegions([])).toEqual([])
  })
})
