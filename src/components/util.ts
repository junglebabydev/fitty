// Pure helpers used by the UI kit. No React / DOM imports so they are unit-testable.

/**
 * Parses free-form numeric input ("83,4", " 12.5 ", "8.") into a number.
 * Returns null for empty or non-numeric text.
 */
export function parseNumberInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (s === '' || s === '-' || s === '.' || s === '-.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Formats a number for display in an input: trims float noise, keeps user precision. */
export function formatNumberInput(n: number | null, maxDecimals = 2): string {
  if (n === null || !Number.isFinite(n)) return ''
  const rounded = Number(n.toFixed(maxDecimals))
  return String(rounded)
}

/** Percent 0–100 of value against max; safe for max <= 0. */
export function pct(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

export interface SparklineGeometry {
  /** Pixel coordinates for each finite input point, in order. */
  coords: { x: number; y: number }[]
  /** SVG polyline points attribute string. */
  points: string
  /** y pixel of the target line, or null when no target given. */
  targetY: number | null
  min: number
  max: number
}

/**
 * Maps a series onto a width×height box with vertical padding. Non-finite
 * values are skipped. The y-range always includes `target` so the line is
 * visible even when all points sit above or below it.
 */
export function sparklineGeometry(
  values: number[],
  width: number,
  height: number,
  target?: number,
  pad = 4,
): SparklineGeometry {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) {
    return { coords: [], points: '', targetY: null, min: 0, max: 0 }
  }
  let min = Math.min(...finite)
  let max = Math.max(...finite)
  if (target !== undefined && Number.isFinite(target)) {
    min = Math.min(min, target)
    max = Math.max(max, target)
  }
  if (max - min < 1e-9) {
    // Flat series: give it a little headroom so it draws mid-height.
    const bump = Math.abs(max) * 0.02 || 1
    min -= bump
    max += bump
  }
  const innerH = Math.max(1, height - pad * 2)
  const n = finite.length
  const stepX = n > 1 ? width / (n - 1) : 0
  const yOf = (v: number) => pad + (1 - (v - min) / (max - min)) * innerH
  const coords = finite.map((v, i) => ({
    x: n > 1 ? i * stepX : width / 2,
    y: yOf(v),
  }))
  const points = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')
  const targetY = target !== undefined && Number.isFinite(target) ? yOf(target) : null
  return { coords, points, targetY, min, max }
}

/** Formats an integer with thousands separators (2050 → "2,050"). */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '–'
  return Math.round(n).toLocaleString('en-SG')
}

/** Clamp helper for slider/stepper ranges. */
export function clampTo(n: number, min?: number, max?: number): number {
  let v = n
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}

/** True when n sits inside the optional [min, max] bounds (inclusive). */
export function inRange(n: number, min?: number, max?: number): boolean {
  if (min !== undefined && n < min) return false
  if (max !== undefined && n > max) return false
  return true
}

/** Number of decimals implied by a step (0.5 → 1, 0.25 → 2, 1 → 0). */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}
