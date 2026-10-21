// Programme registry. BFT (the week Today runs) is always here; the other series arrive with loadAllPrograms()
// (./load.ts), which imports ./all.ts, and that registers them. Routes that can need any series await it first (App.tsx).
import type { Program, ProgramId } from '../../domain/programs'
import { PROGRAM_IDS } from '../../domain/programs'
import { program as bft } from './bft'
import { program as blueprint } from './blueprint'

// Blueprint is in BFT's chunk anyway: bft.ts takes its Sunday from it.
const loaded: Partial<Record<ProgramId, Program>> = { bft, blueprint }

/** Called by ./all.ts when it loads. */
export function registerPrograms(programs: Record<ProgramId, Program>): void {
  Object.assign(loaded, programs)
}

/** A loaded programme, or null for an id that is no programme. A real series not loaded yet throws (never a silent null). */
export function getProgram(id: string): Program | null {
  const p = (loaded as Record<string, Program | undefined>)[id]
  if (p) return p
  if ((PROGRAM_IDS as string[]).includes(id)) throw new Error(`Programme ${id} is not loaded yet: await loadAllPrograms() first`)
  return null
}

/** In gallery order. Every series: only after loadAllPrograms(). */
export function programList(): Program[] {
  return PROGRAM_IDS.map((id) => getProgram(id)!)
}
