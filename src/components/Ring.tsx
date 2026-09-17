import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export interface RingProps {
  value: number
  /** Defaults to 1, so `value` is a 0..1 fraction unless `max` is given. */
  max?: number
  size?: number
  stroke?: number
  pillar?: Pillar
  trackOpacity?: number
  /** Rendered in the centre (a numeral, an icon). */
  children?: ReactNode
  ariaLabel: string
}

/** Single progress ring. Draws once on mount; later value changes ease. */
export function Ring({ value, max = 1, size = 96, stroke = 9, pillar, trackOpacity = 0.14, children, ariaLabel }: RingProps) {
  const frac = max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(1, value / max)) : 0
  const r = (size - stroke) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const dash = circ * frac

  return (
    <div
      data-pillar={pillar}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className="block">
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-pillar" opacity={trackOpacity} />
        {frac > 0 && (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
            className={cx('stroke-pillar anim-draw')}
            style={{ '--dash-from': dash, transition: 'stroke-dasharray 600ms var(--ease-out-soft)' } as CSSProperties}
          />
        )}
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      )}
    </div>
  )
}
