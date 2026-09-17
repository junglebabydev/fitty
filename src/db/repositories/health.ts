import { db } from '../database'
import type { HealthMetric } from '../../domain/types'
import { mapHealthMetric, sinceIso, type HealthMetricRow } from './mappers'

export function addHealthMetric(m: Omit<HealthMetric, 'id'>): number {
  return db.run(
    `INSERT INTO health_metrics (ts, type, value, unit, source) VALUES (?, ?, ?, ?, ?)`,
    [m.ts, m.type, m.value, m.unit, m.source],
  )
}

/** Ascending by ts, within the last `days` calendar days (today inclusive). */
export function getHealthMetrics(type: HealthMetric['type'], days: number): HealthMetric[] {
  return db
    .all<HealthMetricRow>('SELECT * FROM health_metrics WHERE type = ? AND ts >= ? ORDER BY ts ASC, id ASC', [type, sinceIso(days)])
    .map(mapHealthMetric)
}

export function latestHealthMetric(type: HealthMetric['type']): HealthMetric | null {
  const row = db.get<HealthMetricRow>('SELECT * FROM health_metrics WHERE type = ? ORDER BY ts DESC, id DESC LIMIT 1', [type])
  return row ? mapHealthMetric(row) : null
}
