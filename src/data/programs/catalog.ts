// "Start now" picks of the ready series, in gallery order, without loading the series: Today's "More workouts" tiles.
// Kept by hand; data/programs/__tests__/programs.test.ts checks it against startNowPicks() over the full data.
import type { ProgramId } from '../../domain/programs'

export interface StartNowEntry { programId: ProgramId; title: string; key: string; name: string; minutes: number }

export const START_NOW: StartNowEntry[] = [
  { programId: 'bft', title: 'BFT', key: 'w1d4', name: 'HIIT', minutes: 46 },
  { programId: 'bft', title: 'BFT', key: 'w1d2', name: 'Summit', minutes: 48 },
  { programId: 'blueprint', title: 'Blueprint', key: 'w1d1', name: 'Strength + zone 2', minutes: 60 },
  { programId: 'blueprint', title: 'Blueprint', key: 'w1d2', name: 'Sprints + zone 2', minutes: 15 },
  { programId: 'blueprint', title: 'Blueprint', key: 'w1d4', name: 'Norwegian 4×4', minutes: 40 },
  { programId: 'gym-strength', title: 'Gym Strength', key: 'w2d2', name: 'Full Body A', minutes: 54 },
  { programId: 'gym-strength', title: 'Gym Strength', key: 'w2d1', name: 'Full Body B', minutes: 53 },
  { programId: 'home-dumbbells', title: 'Home Dumbbells', key: 'w3d1', name: 'Dumbbell full body A', minutes: 35 },
  { programId: 'bodyweight', title: 'Bodyweight Anywhere', key: 'w3d2', name: 'Bodyweight circuit', minutes: 20 },
]
