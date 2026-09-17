// Small db-dependent helpers shared by repositories.
import { db, type SqlValue } from '../database'
import { toSql } from './mappers'

/** Domain field -> SQLite column name, one entry per updatable field. */
export type ColumnMap<T> = Record<keyof T, string>

/** UPDATE <table> SET ... WHERE id = ? for every defined key of `patch` present in `columns`. No-op when nothing to set. */
export function updateById<T extends object>(table: string, columns: ColumnMap<T>, id: number, patch: Partial<T>): void {
  const sets: string[] = []
  const vals: SqlValue[] = []
  for (const key of Object.keys(columns) as (keyof T)[]) {
    const v = patch[key]
    if (v === undefined) continue
    sets.push(`${columns[key]} = ?`)
    vals.push(toSql(v))
  }
  if (!sets.length) return
  vals.push(id)
  db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, vals)
}

/** Rows affected by the most recent INSERT/UPDATE/DELETE. */
export function changes(): number {
  return db.get<{ n: number }>('SELECT changes() AS n')?.n ?? 0
}
