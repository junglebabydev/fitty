// Library top-up on boot (PRD_TRAINING_PROGRAMS §5.4): a database written by an older build gains the new
// exercise ids and the fixed entries on the next boot, and a second boot changes nothing.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../database'
import { exerciseCount, getExercise, tableCounts } from '../repositories'
import { LIBRARY_META_KEY, libraryFingerprint, seedIfEmpty } from '../seed'
import { EXERCISES, EXERCISE_BY_ID } from '../../data/exercises'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const PROD = { dev: false, search: '' }

const storedFingerprint = () => db.get<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, [LIBRARY_META_KEY])?.value ?? null
const libraryRows = () => db.all(`SELECT * FROM exercises ORDER BY id`)

beforeAll(async () => {
  await db.init()
})

afterAll(() => {
  errorSpy.mockRestore()
})

describe('libraryFingerprint', () => {
  it('is stable for the same library and changes when an entry is added or edited', () => {
    expect(libraryFingerprint()).toBe(libraryFingerprint([...EXERCISES]))
    expect(libraryFingerprint(EXERCISES.slice(0, -1))).not.toBe(libraryFingerprint())
    const edited = EXERCISES.map(e => (e.id === 'wall_sit' ? { ...e, instructions: 'old text' } : e))
    expect(libraryFingerprint(edited)).not.toBe(libraryFingerprint())
  })
})

describe('seedReference library top-up', () => {
  it('a fresh database gets the whole library and the fingerprint', async () => {
    await seedIfEmpty(PROD)
    expect(exerciseCount()).toBe(EXERCISES.length)
    expect(storedFingerprint()).toBe(libraryFingerprint())
  })

  it('an old database with the original library gains the new ids and fixed entries on boot', async () => {
    await seedIfEmpty(PROD)
    // Rewind to an older build: no fingerprint, a new id missing, an entry still holding its old text.
    db.transaction(() => {
      db.run(`DELETE FROM meta WHERE key = ?`, [LIBRARY_META_KEY])
      db.run(`DELETE FROM exercises WHERE id IN ('brisk_walk', 'easy_run')`)
      db.run(`UPDATE exercises SET instructions = 'old text', safety_tags_json = '[]' WHERE id = 'ski_erg'`)
    })
    expect(getExercise('brisk_walk')).toBeNull()

    await seedIfEmpty(PROD)
    expect(getExercise('brisk_walk')?.name).toBe(EXERCISE_BY_ID.brisk_walk.name)
    expect(getExercise('easy_run')?.safetyTags).toEqual(['impact', 'knee_load'])
    expect(getExercise('ski_erg')?.safetyTags).toEqual(EXERCISE_BY_ID.ski_erg.safetyTags)
    expect(getExercise('ski_erg')?.instructions).toBe(EXERCISE_BY_ID.ski_erg.instructions)
    expect(exerciseCount()).toBe(EXERCISES.length)
    expect(storedFingerprint()).toBe(libraryFingerprint())
  })

  it('a stale fingerprint with every row present still rewrites edited entries', async () => {
    await seedIfEmpty(PROD)
    db.transaction(() => {
      db.run(`UPDATE meta SET value = 'stale' WHERE key = ?`, [LIBRARY_META_KEY])
      db.run(`UPDATE exercises SET instructions = 'old text' WHERE id = 'wall_sit'`)
    })
    await seedIfEmpty(PROD)
    expect(getExercise('wall_sit')?.instructions).toMatch(/thighs above parallel/)
  })

  it('a second boot changes nothing', async () => {
    await seedIfEmpty(PROD)
    const counts = tableCounts()
    const rows = libraryRows()
    const fingerprint = storedFingerprint()
    await seedIfEmpty(PROD)
    await seedIfEmpty(PROD)
    expect(tableCounts()).toEqual(counts)
    expect(libraryRows()).toEqual(rows)
    expect(storedFingerprint()).toBe(fingerprint)
  })

  it('refills an emptied exercises table even when the fingerprint matches', async () => {
    await seedIfEmpty(PROD)
    db.run(`DELETE FROM exercises`)
    await seedIfEmpty(PROD)
    expect(exerciseCount()).toBe(EXERCISES.length)
  })
})
