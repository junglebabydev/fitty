import type { CSSProperties } from 'react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'
import { fmtInt } from './util'

export interface ArcGaugeProps {
  value: number
  max: number
  size?: number
  label?: string
  sub?: string
  pillar?: Pillar
  /** Status colouring (readiness / safety only). Overrides the pillar hue. */
  tone?: 'green' | 'amber' | 'red'
}

const TONE_STROKE: Record<NonNullable<ArcGaugeProps['tone']>, string> = {
  green: 'stroke-ok',
  amber: 'stroke-warn',
  red: 'stroke-stop',
}

const SWEEP = 0.75 // 270°

/** Single 270° gauge with the numeral in the middle and the label in the opening below. */
export function ArcGauge({ value, max, size = 148, label, sub, pillar, tone }: ArcGaugeProps) {
  const safe = Number.isFinite(value) ? value : 0
  const frac = max > 0 ? Math.max(0, Math.min(1, safe / max)) : 0
  const stroke = Math.max(6, Math.round(size * 0.07))
  const c = size / 2
  const r = c - stroke / 2 - 1
  const circ = 2 * Math.PI * r
  const arc = circ * SWEEP
  const dash = arc * frac
  const strokeCls = tone ? TONE_STROKE[tone] : 'stroke-pillar'
  const numCls = size >= 140 ? 'text-5xl' : size >= 104 ? 'text-4xl' : 'text-2xl'

  return (
    <div data-pillar={pillar} className="inline-flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label ?? 'Gauge'}: ${fmtInt(safe)} of ${fmtInt(max)}`}
          className="block"
        >
          <g transform={`rotate(135 ${c} ${c})`}>
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circ}`}
              className={strokeCls}
              opacity={0.14}
            />
            {dash > 0 && (
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circ}`}
                className={cx(strokeCls, 'anim-draw')}
                style={{ '--dash-from': dash, transition: 'stroke-dasharray 600ms var(--ease-out-soft)' } as CSSProperties}
              />
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={cx('num text-app', numCls)}>{fmtInt(safe)}</span>
          {label !== undefined && <span className="eyebrow mt-1 max-w-[70%] truncate text-muted">{label}</span>}
        </div>
      </div>
      {sub !== undefined && <p className="-mt-1 max-w-[22ch] text-center text-[13px] leading-snug text-muted">{sub}</p>}
    </div>
  )
}
