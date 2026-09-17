import type { Readiness } from '../domain/types'

/** Semantic colour tones shared by Card, StatusPill, Chip, Stat, ProgressBar. */
export type Tone = 'default' | 'green' | 'amber' | 'red' | 'accent' | 'neutral'

export const READINESS_TONE: Record<Readiness, Tone> = {
  GREEN: 'green',
  AMBER: 'amber',
  RED: 'red',
}

/*
 * Every tone resolves to a design token (--c-ok / --c-warn / --c-stop, accent,
 * pillar), so the classes follow <html data-theme> on their own and need no
 * `dark:` overrides. Status tones are for readiness and safety only and must
 * always be paired with an icon or a word.
 */

/** Surface + border classes for tinted containers (cards). */
export const TONE_SURFACE: Record<Tone, string> = {
  default: 'bg-surface border-line',
  neutral: 'bg-surface border-line',
  green: 'bg-ok/10 border-ok/30',
  amber: 'bg-warn/10 border-warn/30',
  red: 'bg-stop/10 border-stop/30',
  accent: 'bg-accent-soft border-line-strong',
}

/** Text colour for a tone (headline numbers, icons). */
export const TONE_TEXT: Record<Tone, string> = {
  default: 'text-app',
  neutral: 'text-muted',
  green: 'text-ok',
  amber: 'text-warn',
  red: 'text-stop',
  accent: 'text-accent',
}

/** Compact pill classes: soft background + strong text. */
export const TONE_PILL: Record<Tone, string> = {
  default: 'bg-surface-2 text-app',
  neutral: 'bg-surface-2 text-muted',
  green: 'bg-ok/15 text-ok',
  amber: 'bg-warn/15 text-warn',
  red: 'bg-stop/15 text-stop',
  accent: 'bg-accent-soft text-accent',
}

/** Solid fill classes (progress bars, dots). `accent` follows the current pillar (bone when none is set). */
export const TONE_FILL: Record<Tone, string> = {
  default: 'bg-pillar',
  neutral: 'bg-faint',
  green: 'bg-ok',
  amber: 'bg-warn',
  red: 'bg-stop',
  accent: 'bg-pillar',
}

/** SVG fill classes matching TONE_STROKE (dots, area fills). */
export const TONE_SVG_FILL: Record<Tone, string> = {
  default: 'fill-pillar',
  neutral: 'fill-faint',
  green: 'fill-ok',
  amber: 'fill-warn',
  red: 'fill-stop',
  accent: 'fill-pillar',
}

/** Stroke colour classes for SVG lines. */
export const TONE_STROKE: Record<Tone, string> = {
  default: 'stroke-pillar',
  neutral: 'stroke-faint',
  green: 'stroke-ok',
  amber: 'stroke-warn',
  red: 'stroke-stop',
  accent: 'stroke-pillar',
}
