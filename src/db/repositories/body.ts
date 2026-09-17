import { db } from '../database'
import type { BodyMetric } from '../../domain/types'
import { dayRange, mapBodyMetric, sinceIso, type BodyMetricRow } from './mappers'

export function addBodyMetric(m: Omit<BodyMetric, 'id'>): number {
  return db.run(
    `INSERT INTO body_metrics (ts, type, value, unit, source) VALUES (?, ?, ?, ?, ?)`,
    [m.ts, m.type, m.value, m.unit, m.source],
  )
}

/** Ascending by ts. `days` limits to today plus the previous `days - 1` calendar days; omit for everything. */
export function getBodyMetrics(type: BodyMetric['type'], days?: number): BodyMetric[] {
  const rows = days == null
    ? db.all<BodyMetricRow>('SELECT * FROM body_metrics WHERE type = ? ORDER BY ts ASC, id ASC', [type])
    : db.all<BodyMetricRow>('SELECT * FROM body_metrics WHERE type = ? AND ts >= ? ORDER BY ts ASC, id ASC', [type, sinceIso(days)])
  return rows.map(mapBodyMetric)
}

export function latestBodyMetric(type: BodyMetric['type']): BodyMetric | null {
  const row = db.get<BodyMetricRow>('SELECT * FROM body_metrics WHERE type = ? ORDER BY ts DESC, id DESC LIMIT 1', [type])
  return row ? mapBodyMetric(row) : null
}

/** Latest entry of `type` recorded on the local calendar date. */
export function metricForDate(type: BodyMetric['type'], date: string): BodyMetric | null {
  const [start, end] = dayRange(date)
  const row = db.get<BodyMetricRow>(
    'SELECT * FROM body_metrics WHERE type = ? AND ts >= ? AND ts < ? ORDER BY ts DESC, id DESC LIMIT 1',
    [type, start, end],
  )
  return row ? mapBodyMetric(row) : null
}

export function deleteBodyMetric(id: number): void {
  db.run('DELETE FROM body_metrics WHERE id = ?', [id])
}
