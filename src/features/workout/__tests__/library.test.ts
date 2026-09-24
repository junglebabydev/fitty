import { describe, expect, it } from 'vitest'
import { EXERCISES, EXERCISE_BY_ID } from '../../../data'
import { LIBRARY_AREAS, libraryArea, libraryResults, ownsEquipment } from '../library'

const OWNER_EQUIPMENT = ['dumbbells', 'machines', 'bench', 'cables', 'lat_pulldown', 'stationary_bike', 'treadmill', 'pool', 'bodyweight']
const base = { query: '', area: 'all' as const, mineOnly: false, profileEquipment: OWNER_EQUIPMENT }

describe('library areas', () => {
  it('puts every exercise in exactly one real area', () => {
    const areas = new Set(LIBRARY_AREAS.map((a) => a.value).filter((a) => a !== 'all'))
    for (const e of EXERCISES) expect(areas.has(libraryArea(e)), `${e.id} (${e.pattern})`).toBe(true)
  })

  it('files familiar movements where people look for them', () => {
    expect(libraryArea(EXERCISE_BY_ID.db_bench_press)).toBe('chest')
    expect(libraryArea(EXERCISE_BY_ID.lat_pulldown)).toBe('back')
    expect(libraryArea(EXERCISE_BY_ID.lateral_raise)).toBe('shoulders')
    expect(libraryArea(EXERCISE_BY_ID.hammer_curl)).toBe('arms')
    expect(libraryArea(EXERCISE_BY_ID.db_rdl)).toBe('legs')
    expect(libraryArea(EXERCISE_BY_ID.plank)).toBe('core')
    expect(libraryArea(EXERCISE_BY_ID.stationary_bike)).toBe('cardio')
  })

  it('no area tab is empty', () => {
    for (const a of LIBRARY_AREAS) expect(libraryResults(EXERCISES, { ...base, area: a.value }).length, a.value).toBeGreaterThan(0)
  })
})

describe('ownsEquipment', () => {
  it('maps profile equipment (options and typed extras) onto exercise equipment', () => {
    expect(ownsEquipment(OWNER_EQUIPMENT, 'dumbbell')).toBe(true)
    expect(ownsEquipment(OWNER_EQUIPMENT, 'cable')).toBe(true)
    expect(ownsEquipment(OWNER_EQUIPMENT, 'bike')).toBe(true)
    expect(ownsEquipment(OWNER_EQUIPMENT, 'barbell')).toBe(false)
    expect(ownsEquipment(OWNER_EQUIPMENT, 'kettlebell')).toBe(false)
    expect(ownsEquipment(['Kettlebells'], 'kettlebell')).toBe(true)
    expect(ownsEquipment(['lat pulldown'], 'cable')).toBe(true)
  })

  it('always allows bodyweight, and everything when the profile lists nothing', () => {
    expect(ownsEquipment(['dumbbells'], 'bodyweight')).toBe(true)
    expect(ownsEquipment([], 'barbell')).toBe(true)
  })
})

describe('libraryResults', () => {
  it('filters by area and equipment, A–Z', () => {
    const legs = libraryResults(EXERCISES, { ...base, area: 'legs', mineOnly: true })
    expect(legs.length).toBeGreaterThan(0)
    for (const e of legs) {
      expect(libraryArea(e)).toBe('legs')
      expect(ownsEquipment(OWNER_EQUIPMENT, e.equipment), e.id).toBe(true)
    }
    expect(legs.map((e) => e.name)).toEqual([...legs.map((e) => e.name)].sort((a, b) => a.localeCompare(b)))
    expect(legs.some((e) => e.id === 'bb_deadlift')).toBe(false)
    expect(libraryResults(EXERCISES, { ...base, area: 'legs' }).some((e) => e.id === 'bb_deadlift')).toBe(true)
  })

  it('searches everything, ignoring the tab and the equipment filter', () => {
    const hits = libraryResults(EXERCISES, { ...base, query: 'deadlift', area: 'chest', mineOnly: true })
    expect(hits.some((e) => e.id === 'bb_deadlift')).toBe(true)
  })
})
