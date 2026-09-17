import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../lib/util'
import { PILLARS, PILLAR_KEYS, type PillarKey } from './pillars'

export interface PillarDialItem {
  key: PillarKey
  label: string
  /** 0..1 */
  value: number
  caption: string
  onClick?: () => void
}

export interface PillarDialProps {
  pillars: PillarDialItem[]
  /** Rendered in the middle of the dial (readiness word + icon). */
  center: ReactNode
  size?: number
  /** Hide the 4-chip legend when the screen renders its own pillar tiles (the SVG keeps its aria summary). */
  hideLegend?: boolean
}

const SWEEP = 0.75 // 270°

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

/**
 * The Today hero: four concentric 270° arcs (outer → inner Train, Eat, Rest, Mind)
 * around the readiness decision, with a tappable legend below so hue is never the
 * only signal.
 */
export function PillarDial({ pillars, center, size = 280, hideLegend = false }: PillarDialProps) {
  const byKey = new Map(pillars.map((p) => [p.key, p]))
  const ordered = PILLAR_KEYS.map((k) => byKey.get(k)).filter((p): p is PillarDialItem => p !== undefined)

  const stroke = Math.round(size * 0.046)
  const gap = Math.round(size * 0.026)
  const c = size / 2
  const innerR = c - 2 - stroke / 2 - (PILLAR_KEYS.length - 1) * (stroke + gap)
  const centerBox = Math.max(0, (innerR - stroke / 2) * 2 - 12)

  const summary = ordered.map((p) => `${p.label} ${Math.round(clamp01(p.value) * 100)}%`).join(', ')

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="relative w-full" style={{ maxWidth: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label={`Pillars: ${summary}`} className="block h-auto w-full">
          {PILLAR_KEYS.map((key, i) => {
            const item = byKey.get(key)
            const r = c - 2 - stroke / 2 - i * (stroke + gap)
            const circ = 2 * Math.PI * r
            const arc = circ * SWEEP
            const dash = arc * clamp01(item?.value ?? 0)
            const meta = PILLARS[key]
            return (
              <g key={key} transform={`rotate(135 ${c} ${c})`}>
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${arc} ${circ}`}
                  className={meta.stroke}
                  opacity={0.13}
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
                    className={cx(meta.stroke, 'anim-draw')}
                    style={{ '--i': i, '--dash-from': dash, transition: 'stroke-dasharray 600ms var(--ease-out-soft)' } as CSSProperties}
                  />
                )}
              </g>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-auto flex flex-col items-center justify-center text-center"
            style={{ width: `${(centerBox / size) * 100}%` }}
          >
            {center}
          </div>
        </div>
      </div>

      {!hideLegend && <ul className="grid w-full grid-cols-2 gap-2">
        {ordered.map((p, i) => {
          const meta = PILLARS[p.key]
          const Icon = meta.icon
          const pctText = `${Math.round(clamp01(p.value) * 100)}%`
          const inner = (
            <>
              <span className="flex w-full items-center gap-1.5">
                <Icon size={15} strokeWidth={2.25} className={cx('shrink-0', meta.text)} aria-hidden />
                <span className={cx('eyebrow min-w-0 flex-1 truncate text-left', meta.text)}>{p.label}</span>
                <span className="num text-xl text-app">{pctText}</span>
              </span>
              <span className="mt-1.5 line-clamp-2 w-full text-left text-[13px] leading-tight text-muted">{p.caption}</span>
            </>
          )
          const cls = 'flex min-h-[60px] w-full flex-col justify-center rounded-2xl border border-line bg-surface px-3 py-2.5'
          return (
            <li key={p.key} className="anim-rise min-w-0" style={{ '--i': i + 2 } as CSSProperties}>
              {p.onClick ? (
                <button type="button" onClick={p.onClick} className={cx(cls, 'press active:bg-surface-2')}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          )
        })}
      </ul>}
    </div>
  )
}
