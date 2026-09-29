// Repository round-trip and the opt-in gate for coach context. How reports appear in the prompt is tested with the
// coach (coach/__tests__/prompt.test.ts).
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../../db/database'
import { addReport, deleteReport, getReport, listReports, setSetting, updateReport } from '../../../db/repositories'
import type { HealthReport } from '../../../domain/types'
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
