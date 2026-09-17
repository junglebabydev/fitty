// Export / storage helpers for the Data screen.
import { exportJson, exportSqlite } from '../../db/repositories'
import { todayStr } from '../../lib/util'
import { KEYS } from './keys'

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export interface StorageEstimate {
  usageBytes: number | null
  quotaBytes: number | null
  persisted: boolean | null
}

/** navigator.storage.estimate() when available; null when the API is missing (older Safari, insecure context). */
export async function storageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') return null
  try {
    const est = await navigator.storage.estimate()
    let persisted: boolean | null = null
    if (typeof navigator.storage.persisted === 'function') {
      try {
        persisted = await navigator.storage.persisted()
      } catch {
        persisted = null
      }
    }
    return {
      usageBytes: typeof est.usage === 'number' ? est.usage : null,
      quotaBytes: typeof est.quota === 'number' ? est.quota : null,
      persisted,
    }
  } catch {
    return null
  }
}

export function exportFilename(ext: 'json' | 'db', today: string = todayStr()): string {
  return `coach-${today}.${ext}`
}

export const REDACTED_SETTING_KEYS: string[] = [KEYS.aiApiKey]

/**
 * JSON export of every table. The AI API key is redacted (it is a secret, not
 * personal health data); the SQLite export is byte-exact and does include it.
 */
export function buildJsonExport(): string {
  const raw = exportJson()
  let tables: Record<string, unknown[]>
  try {
    tables = JSON.parse(raw) as Record<string, unknown[]>
  } catch {
    return raw
  }
  const settings = tables.settings
  if (Array.isArray(settings)) {
    tables.settings = settings.map((row) => {
      const r = row as { key?: unknown; value?: unknown }
      if (typeof r.key === 'string' && REDACTED_SETTING_KEYS.includes(r.key)) return { ...r, value: JSON.stringify('[redacted]') }
      return row
    })
  }
  return JSON.stringify(
    { app: 'coach', exportedAt: new Date().toISOString(), redacted: REDACTED_SETTING_KEYS.map((k) => `settings.${k}`), tables },
    null,
    2,
  )
}

export function buildSqliteBlob(): Blob {
  const bytes = exportSqlite()
  // Copy into a plain ArrayBuffer so the Blob constructor accepts it under every lib.dom typing.
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Blob([buf], { type: 'application/x-sqlite3' })
}

export type DownloadOutcome = 'downloaded' | 'shared' | 'failed'

/**
 * Hands a file to the user. Prefers the classic anchor download; falls back to
 * the Web Share sheet (iOS home-screen apps often ignore `download`).
 */
export async function downloadBlob(filename: string, blob: Blob): Promise<DownloadOutcome> {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    /* fall through to share */
  }
  try {
    const file = new File([blob], filename, { type: blob.type })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    }
  } catch {
    /* user cancelled or share unsupported */
  }
  return 'failed'
}

/** Friendly names for the raw table names returned by tableCounts(). */
export const TABLE_LABELS: Record<string, string> = {
  settings: 'Settings',
  user_profile: 'Profile',
  goals: 'Goals',
  condition_flags: 'Condition flags',
  symptom_checks: 'Symptom checks',
  exercises: 'Exercise library',
  workout_sessions: 'Workout sessions',
  exercise_sets: 'Logged sets',
  cardio_sessions: 'Cardio sessions',
  mobility_sessions: 'Mobility sessions',
  body_metrics: 'Body metrics',
  progress_photos: 'Progress photos',
  meals: 'Meals',
  food_items: 'Food items',
  nutrition_targets: 'Nutrition targets',
  sleep_records: 'Sleep records',
  health_metrics: 'Health metrics',
  daily_checkins: 'Daily check-ins',
  coach_decisions: 'Coach decisions',
  coach_messages: 'Coach messages',
  voice_commands: 'Voice commands',
  privacy_ledger: 'Privacy ledger',
}

/** Display order: personal data first, reference/system tables last. */
export const TABLE_ORDER: string[] = [
  'body_metrics', 'sleep_records', 'health_metrics', 'daily_checkins', 'symptom_checks',
  'workout_sessions', 'exercise_sets', 'cardio_sessions', 'mobility_sessions',
  'meals', 'food_items', 'nutrition_targets', 'progress_photos',
  'coach_decisions', 'coach_messages', 'voice_commands', 'privacy_ledger',
  'goals', 'condition_flags', 'user_profile', 'settings', 'exercises',
]

export function tableLabel(name: string): string {
  return TABLE_LABELS[name] ?? name.replace(/_/g, ' ')
}

export function sortTables(counts: Record<string, number>): { name: string; label: string; count: number }[] {
  const names = Object.keys(counts)
  const rank = (n: string) => {
    const i = TABLE_ORDER.indexOf(n)
    return i === -1 ? TABLE_ORDER.length : i
  }
  names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return names.map((name) => ({ name, label: tableLabel(name), count: counts[name] ?? 0 }))
}
