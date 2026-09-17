import { AlertTriangle, CheckCircle2, OctagonAlert, type LucideIcon } from 'lucide-react'
import type { Readiness } from '../domain/types'
import { cx } from '../lib/util'
import { READINESS_TONE, TONE_PILL, TONE_SURFACE, TONE_TEXT } from './tones'

export interface ReadinessBadgeProps {
  state: Readiness
  reasons?: string[]
  /** Small inline pill (for headers and list rows) instead of the full block. */
  compact?: boolean
  className?: string
}

/** The decision word. Status colour never stands alone: it always ships with this word and an icon. */
const WORD: Record<Readiness, string> = { GREEN: 'Ready', AMBER: 'Modify', RED: 'Recover' }
const HEADLINE: Record<Readiness, string> = {
  GREEN: 'Ready to train',
  AMBER: 'Train, but modify',
  RED: 'Protect and recover',
}
const ICON: Record<Readiness, LucideIcon> = {
  GREEN: CheckCircle2,
  AMBER: AlertTriangle,
  RED: OctagonAlert,
}

/** Readiness as icon + word, with the textual reasons behind it. */
export function ReadinessBadge({ state, reasons = [], compact = false, className }: ReadinessBadgeProps) {
  const tone = READINESS_TONE[state]
  const Icon = ICON[state]

  if (compact) {
    return (
      <span
        className={cx('inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2 pr-2.5 text-xs font-semibold tracking-wide', TONE_PILL[tone], className)}
        aria-label={`Readiness: ${WORD[state]}`}
      >
        <Icon size={14} strokeWidth={2.4} aria-hidden />
        {WORD[state]}
      </span>
    )
  }

  return (
    <div className={cx('rounded-[1.25rem] border p-4', TONE_SURFACE[tone], className)} role="status">
      <div className="flex items-center gap-3">
        <span className={cx('inline-flex shrink-0', TONE_TEXT[tone])}>
          <Icon size={30} strokeWidth={2.1} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className={cx('display text-3xl', TONE_TEXT[tone])}>{WORD[state]}</div>
          <div className="mt-0.5 text-sm font-medium leading-tight text-app">{HEADLINE[state]}</div>
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="m-0 mt-3.5 flex list-none flex-col gap-1.5 border-t border-line p-0 pt-3">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-snug text-app">
              <span className="mt-[9px] h-px w-2.5 shrink-0 bg-muted" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
