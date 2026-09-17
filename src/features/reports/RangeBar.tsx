// Value-on-range bar: a horizontal track with the PRINTED reference band shaded and a dot at the value.
// Meaning is never colour alone: the flag is an icon shape plus a word, and the numbers are always printed.
import { ArrowDown, ArrowUp, Check, Minus } from 'lucide-react'
import type { ReportFlag, ReportMarker } from '../../domain/types'
import { cx } from '../../lib/util'
import { FLAG_LABEL, rangeBarGeometry, rangeText, valueLabel } from './markers'

const FLAG_ICON = { low: ArrowDown, high: ArrowUp, normal: Check, unknown: Minus } as const

/** Icon (shape carries the meaning) + optional word. Out-of-range reads stronger by weight, not by an alarm colour. */
export function FlagMark({ flag, label, size = 14, className }: { flag: ReportFlag; label?: string; size?: number; className?: string }) {
  const Icon = FLAG_ICON[flag]
  const out = flag === 'low' || flag === 'high'
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1', out ? 'font-semibold text-app' : flag === 'normal' ? 'text-muted' : 'text-faint', className)}>
      <span
        aria-hidden
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-full',
          out ? 'bg-accent text-accent-fg' : 'border border-line-strong',
        )}
        style={{ width: size + 4, height: size + 4 }}
      >
        <Icon size={size - 3} strokeWidth={3} />
      </span>
      {label !== undefined && <span className="truncate">{label}</span>}
    </span>
  )
}

export interface RangeBarProps {
  marker: ReportMarker
  className?: string
}

export function RangeBar({ marker, className }: RangeBarProps) {
  const geo = rangeBarGeometry(marker)
  const range = rangeText(marker)
  const shown = marker.value !== null ? String(Math.round(marker.value * 1000) / 1000) : marker.valueText || '—'
  const aria = `${marker.name}: ${valueLabel(marker)}. ${FLAG_LABEL[marker.flag]}${range ? `, printed range ${range}${marker.unit ? ' ' + marker.unit : ''}` : ''}.`

  return (
    <div role="img" aria-label={aria} className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] text-app">{marker.name}</span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="num text-2xl leading-none text-app">{shown}</span>
          {marker.unit && <span className="text-sm font-medium text-muted">{marker.unit}</span>}
        </span>
      </div>

      {geo ? (
        <div className="relative h-4" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[3px] border-x-2 border-pillar-line bg-pillar-soft"
            style={{ left: `${geo.bandStart * 100}%`, width: `${Math.max(2, (geo.bandEnd - geo.bandStart) * 100)}%` }}
          />
          {geo.dot !== null && (
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
              style={{ left: `${geo.dot * 100}%` }}
            />
          )}
        </div>
      ) : (
        <div className="h-1.5 rounded-full border border-dashed border-line-strong" aria-hidden />
      )}

      <div className="flex items-center justify-between gap-3 text-xs">
        <FlagMark flag={marker.flag} label={FLAG_LABEL[marker.flag]} />
        {range && <span className="tnum shrink-0 text-muted">Printed range {range}</span>}
      </div>
    </div>
  )
}
