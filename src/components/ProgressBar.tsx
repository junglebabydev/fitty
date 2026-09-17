import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'
import { TONE_FILL, type Tone } from './tones'
import { pct } from './util'

export interface ProgressBarProps {
  value: number
  max: number
  /** `accent` (default) fills with the current pillar hue. */
  tone?: Tone
  /** Optional caption row above the bar: label on the left, value text on the right. */
  label?: ReactNode
  /** Right-aligned caption text (defaults to nothing). */
  valueText?: ReactNode
  height?: 'sm' | 'md' | 'lg'
  /** When true and value > max, the bar turns amber to show the overshoot. Do not use for nutrition. */
  warnOver?: boolean
  className?: string
  /** Scope the fill to a specific pillar instead of the surrounding one. */
  pillar?: Pillar
}

const H: Record<NonNullable<ProgressBarProps['height']>, string> = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' }

export function ProgressBar({
  value,
  max,
  tone = 'accent',
  label,
  valueText,
  height = 'md',
  warnOver = false,
  className,
  pillar,
}: ProgressBarProps) {
  const p = pct(value, max)
  const over = warnOver && max > 0 && value > max
  const fillTone: Tone = over ? 'amber' : tone
  return (
    <div data-pillar={pillar} className={cx('w-full', className)}>
      {(label !== undefined || valueText !== undefined) && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="eyebrow truncate text-muted">{label}</span>
          {valueText !== undefined && <span className="num shrink-0 text-base text-app">{valueText}</span>}
        </div>
      )}
      <div
        className={cx('w-full overflow-hidden rounded-full bg-surface-3', H[height])}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max > 0 ? max : undefined}
        aria-valuenow={Number.isFinite(value) ? value : undefined}
      >
        <div
          className={cx('h-full rounded-full transition-[width] duration-500 ease-out', TONE_FILL[fillTone])}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}
