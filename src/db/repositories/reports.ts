// Health reports: uploaded blood tests, body-composition scans, clinical notes and imaging reports.
// Marker values and reference ranges are stored exactly as transcribed from the report; nothing here interprets them.
import { db } from '../database'
import type { HealthReport } from '../../domain/types'
import { updateById, type ColumnMap } from './common'
import { mapHealthReport, type HealthReportRow } from './mappers'

export function addReport(r: Omit<HealthReport, 'id'>): number {
  return db.run(
    `INSERT INTO health_reports (ts, kind, title, file_name, media_type, file_data_url, status, summary, markers_json, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.ts, r.kind, r.title ?? '', r.fileName ?? '', r.mediaType ?? '', r.fileDataUrl ?? null, r.status, r.summary ?? '', JSON.stringify(r.markers ?? []), r.notes ?? ''],
  )
}

const REPORT_COLUMNS: ColumnMap<Omit<HealthReport, 'id'>> = {
  ts: 'ts',
  kind: 'kind',
  title: 'title',
  fileName: 'file_name',
  mediaType: 'media_type',
  fileDataUrl: 'file_data_url',
  status: 'status',
  summary: 'summary',
  markers: 'markers_json',
  notes: 'notes',
}

export function updateReport(id: number, patch: Partial<Omit<HealthReport, 'id'>>): void {
  updateById('health_reports', REPORT_COLUMNS, id, patch)
}

export function deleteReport(id: number): void {
  db.run('DELETE FROM health_reports WHERE id = ?', [id])
}

export function getReport(id: number): HealthReport | null {
  const row = db.get<HealthReportRow>('SELECT * FROM health_reports WHERE id = ?', [id])
  return row ? mapHealthReport(row) : null
}

/** Newest first. */
export function listReports(): HealthReport[] {
  return db.all<HealthReportRow>('SELECT * FROM health_reports ORDER BY ts DESC, id DESC').map(mapHealthReport)
}
