import { db } from '../database'

// Known keys: 'ai.provider' ('mock'|'anthropic'), 'ai.apiKey', 'ai.model', 'ai.sendMealPhotos' (bool),
// 'privacy.keepMealPhotos' (bool), 'privacy.voiceRetentionDays' (number),
// 'health.permissions' (Record<string,'granted'|'denied'|'undetermined'>), 'health.writeWorkouts',
// 'health.writeBodyMass', 'reminders.morning', 'reminders.evening', 'units', 'coach.style',
// 'onboarding.skippedAt' (ISO string; intake skipped from the welcome screen).
// Values are stored as JSON text.

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (!row) return fallback
  try {
    const v: unknown = JSON.parse(row.value)
    return v === null || v === undefined ? fallback : (v as T)
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown): void {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value ?? null)])
}

export function deleteSetting(key: string): void {
  db.run('DELETE FROM settings WHERE key = ?', [key])
}
