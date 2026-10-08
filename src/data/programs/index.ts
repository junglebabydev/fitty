// Programme registry. Each series is transcribed from docs/programs/<id>.md into its own file.
import type { Program, ProgramId } from '../../domain/programs'
import { PROGRAM_IDS } from '../../domain/programs'
import { program as bft } from './bft'
import { program as blueprint } from './blueprint'
import { program as gymStrength } from './gym-strength'
import { program as homeDumbbells } from './home-dumbbells'
import { program as hiit } from './hiit'
import { program as postpartum } from './postpartum'
import { program as startRunning } from './start-running'
import { program as bodyweight } from './bodyweight'

export const PROGRAMS: Record<ProgramId, Program> = {
  bft,
  blueprint,
  'gym-strength': gymStrength,
  'home-dumbbells': homeDumbbells,
  hiit,
  postpartum,
  'start-running': startRunning,
  bodyweight,
}

/** In gallery order. */
export const PROGRAM_LIST: Program[] = PROGRAM_IDS.map((id) => PROGRAMS[id])

export function getProgram(id: string): Program | null {
  return (PROGRAMS as Record<string, Program | undefined>)[id] ?? null
}
