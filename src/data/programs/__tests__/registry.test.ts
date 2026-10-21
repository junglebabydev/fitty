// The registry before and after the rest of the series load (data/programs/load.ts).
import { describe, expect, it } from 'vitest'
import { getProgram } from '../index'
import { loadAllPrograms } from '../load'

describe('programme registry', () => {
  it('has BFT at once, throws for a series not loaded yet, null for no series', async () => {
    expect(getProgram('bft')?.id).toBe('bft')
    expect(getProgram('blueprint')?.id).toBe('blueprint')
    expect(() => getProgram('gym-strength')).toThrow(/not loaded/)
    expect(getProgram('nope')).toBeNull()
    await loadAllPrograms()
    expect(getProgram('gym-strength')?.id).toBe('gym-strength')
  })
})
