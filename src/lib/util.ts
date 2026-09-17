// Shared helpers. Dates as 'YYYY-MM-DD' local calendar strings; timestamps as ISO.

export function nowIso(): string { return new Date().toISOString() }

export function toDateStr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string { return toDateStr(new Date()) }

export function dateOf(ts: string): string { return toDateStr(new Date(ts)) }

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr); d.setDate(d.getDate() + n); return toDateStr(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

/** Monday-start week. */
export function startOfWeek(dateStr: string): string {
  const d = parseDate(dateStr); const dow = (d.getDay() + 6) % 7
  return addDays(dateStr, -dow)
}

export function dayName(dateStr: string, short = true): string {
  return parseDate(dateStr).toLocaleDateString('en-SG', { weekday: short ? 'short' : 'long' })
}

export function fmtDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

export function fmtTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function fmtKg(kg: number, digits = 1): string { return `${kg.toFixed(digits)} kg` }

export function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)) }

export function round(n: number, step = 1): number { return Math.round(n / step) * step }

export function uid(): string { return Math.random().toString(36).slice(2, 10) }

export function cx(...parts: Array<string | false | null | undefined>): string { return parts.filter(Boolean).join(' ') }

export function isoAt(dateStr: string, hh: number, mm = 0): string {
  const d = parseDate(dateStr); d.setHours(hh, mm, 0, 0); return d.toISOString()
}

export function hourNow(): number { return new Date().getHours() }
