// Exercise library browsing (Train → Library): body-area tabs, "your equipment" filter and search. Pure.
import type { Exercise } from '../../domain/types'
import { findExerciseByAlias } from '../../data'

export type LibraryArea = 'all' | 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'cardio'

export const LIBRARY_AREAS: { value: LibraryArea; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'legs', label: 'Legs' },
  { value: 'core', label: 'Core' },
  { value: 'cardio', label: 'Cardio' },
]

/** Movement pattern → body area. Hinges count as legs (posterior chain); carries as core. */
const AREA_BY_PATTERN: Record<string, Exclude<LibraryArea, 'all'>> = {
  horizontal_push: 'chest', chest_isolation: 'chest',
  vertical_pull: 'back', horizontal_pull: 'back', shrug: 'back',
  vertical_push: 'shoulders', shoulder_abduction: 'shoulders', shoulder_flexion: 'shoulders', rear_delt: 'shoulders',
  elbow_flexion: 'arms', elbow_extension: 'arms',
  squat: 'legs', lunge: 'legs', hinge: 'legs', knee_extension: 'legs', knee_flexion: 'legs', calf: 'legs',
  hip_abduction: 'legs', hip_adduction: 'legs', hip_extension: 'legs',
  core_anti_extension: 'core', core_lateral: 'core', core_anti_rotation: 'core', core_flexion: 'core', carry: 'core',
  cardio: 'cardio', swim: 'cardio',
}

export function libraryArea(e: Exercise): Exclude<LibraryArea, 'all'> {
  return AREA_BY_PATTERN[e.pattern] ?? 'core'
}

/** Exercise equipment → the profile equipment values (options or typed extras) that provide it. */
const PROVIDED_BY: Record<string, string[]> = {
  dumbbell: ['dumbbell', 'dumbbells'],
  machine: ['machine', 'machines'],
  cable: ['cable', 'cables', 'lat_pulldown'],
  bike: ['bike', 'stationary_bike'],
  treadmill: ['treadmill'],
  elliptical: ['elliptical'],
  pool: ['pool'],
  barbell: ['barbell', 'barbells'],
  kettlebell: ['kettlebell', 'kettlebells'],
  band: ['band', 'bands', 'resistance_band', 'resistance_bands'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_')

/** True when the profile's equipment covers this exercise. Bodyweight always; an empty profile list means "anything". */
export function ownsEquipment(profileEquipment: string[], equipment: string): boolean {
  if (equipment === 'bodyweight' || profileEquipment.length === 0) return true
  const owned = new Set(profileEquipment.map(norm))
  return (PROVIDED_BY[equipment] ?? [equipment]).some((v) => owned.has(v))
}

/** Search by name, muscle, pattern or alias; the alias hit (e.g. "bench") floats to the top. */
export function filterLibrary(list: Exercise[], q: string): Exercise[] {
  const query = q.trim().toLowerCase()
  if (!query) return list
  const tokens = query.split(/\s+/).filter(Boolean)
  const score = (e: Exercise) => {
    const hay = `${e.name} ${e.equipment} ${e.pattern.replace(/_/g, ' ')} ${e.primaryMuscles.join(' ')} ${e.secondaryMuscles.join(' ')}`.toLowerCase()
    let s = 0
    for (const t of tokens) {
      if (e.name.toLowerCase().startsWith(t)) s += 3
      else if (e.name.toLowerCase().includes(t)) s += 2
      else if (hay.includes(t)) s += 1
      else return 0
    }
    return s
  }
  const scored = list.map((e) => ({ e, s: score(e) })).filter((x) => x.s > 0)
  // Alias hit (e.g. "bench" → Dumbbell Bench Press) floats to the top.
  const alias = findExerciseByAlias(query, list)
  scored.sort((a, b) => Number(b.e.id === alias?.id) - Number(a.e.id === alias?.id) || b.s - a.s || a.e.name.localeCompare(b.e.name))
  if (alias && !scored.some((x) => x.e.id === alias.id)) scored.unshift({ e: alias, s: 99 })
  return scored.map((x) => x.e)
}

export interface LibraryFilter {
  query: string
  area: LibraryArea
  /** Only exercises the profile's equipment covers. */
  mineOnly: boolean
  profileEquipment: string[]
}

/**
 * What the Library shows. A search looks through everything (a typed name should never be hidden by a tab or
 * the equipment filter); otherwise the area tab and the equipment filter apply, A–Z.
 */
export function libraryResults(list: Exercise[], f: LibraryFilter): Exercise[] {
  if (f.query.trim()) return filterLibrary(list, f.query)
  return list
    .filter((e) => f.area === 'all' || libraryArea(e) === f.area)
    .filter((e) => !f.mineOnly || ownsEquipment(f.profileEquipment, e.equipment))
    .sort((a, b) => a.name.localeCompare(b.name))
}
