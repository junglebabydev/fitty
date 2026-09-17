// Repository round-trip, the opt-in gate for coach context, and the additive third argument of buildCoachSystemPrompt.
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../../db/database'
import { addReport, deleteReport, getReport, listReports, setSetting, updateReport } from '../../../db/repositories'
import type { HealthReport } from '../../../domain/types'
import { REPORTS_CONTEXT_RULE, buildCoachSystemPrompt, type CoachFacts } from '../../../engine/coach'
import { computeReadiness } from '../../../engine/readiness'
import { evaluateSymptomGate } from '../../../engine/symptomGate'
import { TARGET, TODAY } from '../../../engine/__tests__/fixtures'
import { SHARE_REPORTS_KEY, reportContextLines } from '../context'
import { computeFlag } from '../markers'

function newReport(over: Partial<Omit<HealthReport, 'id'>> = {}): Omit<HealthReport, 'id'> {
  return {
    ts: '2026-08-02T04:00:00.000Z', kind: 'blood', title: 'Lipid panel', fileName: 'lipids.pdf', mediaType: 'application/pdf',
    fileDataUrl: 'data:application/pdf;base64,QUJD', status: 'extracted', summary: 'A lipid panel.', notes: '',
    markers: [{ name: 'LDL', value: 3.9, valueText: '3.9', unit: 'mmol/L', refLow: null, refHigh: 3.4, flag: computeFlag(3.9, null, 3.4), category: 'Lipids' }],
    ...over,
  }
}

function facts(): CoachFacts {
  return {
    today: TODAY, hourNow: 12,
    readiness: computeReadiness({ sleepLastNightMin: 450, sleepAvg7Min: 450, symptoms: [], checkIn: null, sessionsLast7: 2 }),
    gate: evaluateSymptomGate([]), plannedToday: null, sessionsThisWeek: [], weekTier: 'target',
    intakeToday: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, target: TARGET, proteinPaceExpected: 0,
    savedMealNames: [], recentHighProteinFoods: [], weight: { latest: null, avg7: null, prevAvg7: null, goal: null },
    sleepLastNightMin: null, sleepAvg7Min: null, missedThisWeek: 0, nutritionTrend: null, stalls: [], loggedMealDaysLast7: 0,
  }
}

beforeAll(async () => {
  await db.init()
})

describe('report repositories', () => {
  it('round-trips, updates, lists newest first and deletes', () => {
    const a = addReport(newReport())
    const b = addReport(newReport({ ts: '2026-09-01T04:00:00.000Z', kind: 'body_composition', title: 'InBody', status: 'manual', markers: [], fileDataUrl: null }))
    expect(getReport(a)).toEqual({ id: a, ...newReport() })
    expect(listReports().map((r) => r.id)).toEqual([b, a])

    updateReport(b, { title: 'InBody 770', markers: newReport().markers, fileDataUrl: null })
    expect(getReport(b)).toMatchObject({ title: 'InBody 770', fileDataUrl: null, status: 'manual' })
    expect(getReport(b)?.markers[0].name).toBe('LDL')

    deleteReport(a)
    expect(getReport(a)).toBeNull()
    expect(listReports().map((r) => r.id)).toEqual([b])
    expect(getReport(9999)).toBeNull()
  })
})

describe('reportContextLines', () => {
  it('is empty by default and only returns lines after the user opts in', () => {
    addReport(newReport())
    expect(reportContextLines()).toEqual([])
    setSetting(SHARE_REPORTS_KEY, true)
    const lines = reportContextLines()
    expect(lines.length).toBe(listReports().length)
    expect(lines.join('\n')).toMatch(/"Lipid panel" \(2026-08-02\): LDL 3\.9 mmol\/L \[High, printed range ≤ 3\.4\]/)
    expect(lines.join('\n')).not.toMatch(/base64|data:/)
    setSetting(SHARE_REPORTS_KEY, false)
    expect(reportContextLines()).toEqual([])
  })
})

describe('buildCoachSystemPrompt extras', () => {
  it('is unchanged without extras', () => {
    expect(buildCoachSystemPrompt(facts(), 'V')).toBe(buildCoachSystemPrompt(facts(), 'V', {}))
    expect(buildCoachSystemPrompt(facts(), 'V', { reports: [], baseline: '  ' })).toBe(buildCoachSystemPrompt(facts(), 'V'))
    expect(buildCoachSystemPrompt(facts(), 'V')).not.toMatch(/HEALTH REPORTS|STARTING POINT/)
  })

  it('appends the baseline and the report lines with the clinician rule', () => {
    const s = buildCoachSystemPrompt(facts(), 'V', { baseline: 'Returning lifter, left knee history.', reports: ['Blood test "Lipid panel" (2026-08-02): LDL 3.9 mmol/L [High, printed range ≤ 3.4]'] })
    expect(s).toMatch(/STARTING POINT[^\n]*\nReturning lifter, left knee history\./)
    expect(s).toMatch(/HEALTH REPORTS[^\n]*\n- Blood test "Lipid panel"/)
    expect(s.endsWith(REPORTS_CONTEXT_RULE)).toBe(true)
    expect(REPORTS_CONTEXT_RULE).toMatch(/never diagnose, never contradict the user's clinician/)
  })
})
