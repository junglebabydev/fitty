// Coach tools (docs/PRD_COACH_CHAT.md §12) against the real sql.js engine with the demo seed.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EXERCISES } from '../../../data'
import { db } from '../../../db/database'
import { getSleepRecords, tableCounts } from '../../../db/repositories'
import { seedIfEmpty } from '../../../db/seed'
import { AGENT_TOOLS, type ToolName } from '../../../engine'
import { fmtDuration, todayStr } from '../../../lib/util'
import { TOOL_SPECS, findExercise, runCoachTool, searchLibrary, summarizeSleep } from '../tools'

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const TODAY = todayStr()
const ALL: ToolName[] = ['get_sleep', 'get_training', 'get_exercise_history', 'get_nutrition', 'search_library']
const run = (name: string, args: unknown) => JSON.parse(runCoachTool(name, typeof args === 'string' ? args : JSON.stringify(args), TODAY, ALL))

beforeAll(async () => {
  await db.init()
  seedIfEmpty()
})
afterAll(() => errorSpy.mockRestore())

describe('coach tools on the seeded database', () => {
  it('get_sleep returns engine-computed averages that match the records', () => {
    const r = run('get_sleep', { days: 7 })
    const mins = getSleepRecords(7).map((x) => x.durationMin)
    expect(r.nightsLogged).toBe(mins.length)
    expect(r.averageMinutes).toBe(Math.round(mins.reduce((a, b) => a + b, 0) / mins.length))
    expect(r.average).toBe(fmtDuration(r.averageMinutes))
  })

  it('get_nutrition reports the target and one row per day', () => {
    const r = run('get_nutrition', { days: 14 })
    expect(r.perDay).toHaveLength(14)
    expect(r.target).toMatchObject({ proteinG: expect.any(Number), kcal: expect.any(Number) })
  })

  it('get_training lists sessions with a status', () => {
    const r = run('get_training', { days: 30 })
    expect(r.sessions.length).toBeGreaterThan(0)
    expect(r.completed).toBe(r.sessions.filter((s: { status: string }) => s.status === 'completed').length)
  })

  it('get_exercise_history resolves names and says when there is none', () => {
    expect(run('get_exercise_history', { exercise: 'leg press' }).exercise).toMatch(/^Leg Press/)
    expect(run('get_exercise_history', { exercise: 'underwater basket weaving' }).error).toMatch(/No exercise/)
  })

  it('search_library finds exercises and foods, per-serving numbers rounded', () => {
    const r = run('search_library', { query: 'chicken rice' })
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matches[0]).toMatchObject({ type: 'food' })
    expect(Number.isInteger(r.matches[0].perServing.kcal)).toBe(true)
    expect(searchLibrary('hip hinge').matches.some((m) => m.type === 'exercise')).toBe(true)
  })

  it('never writes', () => {
    const before = JSON.stringify(tableCounts())
    for (const name of ALL) run(name, name === 'search_library' ? { query: 'squat' } : name === 'get_exercise_history' ? { exercise: 'squat' } : { days: 30 })
    expect(JSON.stringify(tableCounts())).toBe(before)
  })

  it('bad names, bad arguments and tools the agent was not given return an error, never throw', () => {
    expect(run('drop_tables', {}).error).toMatch(/Unknown tool/)
    expect(run('get_sleep', { days: 9 }).error).toMatch(/7, 14 or 30/)
    expect(run('get_sleep', 'not json').error).toMatch(/JSON object/)
    expect(run('search_library', { query: '' }).error).toMatch(/required/)
    expect(JSON.parse(runCoachTool('get_sleep', '{"days":7}', TODAY, AGENT_TOOLS.symptoms)).error).toMatch(/Unknown tool/)
  })
})

describe('tool specs and summaries', () => {
  it('every agent tool has a spec whose name matches, in the shape the Worker accepts', () => {
    for (const tools of Object.values(AGENT_TOOLS)) {
      for (const n of tools) {
        expect(TOOL_SPECS[n].name).toBe(n)
        expect(TOOL_SPECS[n].name).toMatch(/^[a-z_]{1,40}$/)
        expect(JSON.stringify(TOOL_SPECS[n].parameters).length).toBeLessThan(2_000)
      }
    }
    expect(AGENT_TOOLS.symptoms).toEqual([])
    expect(AGENT_TOOLS.mind).toEqual([])
  })

  it('summarizeSleep counts short nights and handles no data', () => {
    const rec = (min: number) => ({ id: 1, startTs: '2026-09-01T23:00:00', endTs: '2026-09-02T06:00:00', durationMin: min, source: 'manual' as const, quality: null })
    expect(summarizeSleep([rec(300), rec(420)], 7)).toMatchObject({ nightsLogged: 2, averageMinutes: 360, average: fmtDuration(360), nightsUnder5h30: 1 })
    expect(summarizeSleep([], 7)).toMatchObject({ nightsLogged: 0, averageMinutes: null, average: null })
  })

  it('findExercise prefers an exact name', () => {
    const exact = EXERCISES[3].name
    expect(findExercise(exact.toUpperCase())?.id).toBe(EXERCISES[3].id)
    expect(findExercise('')).toBeNull()
  })
})
