import type { Pillar } from './pillars'

export interface BarChartBar {
  label: string
  value: number | null
  /** Per-bar goal, drawn as a tick across the bar. */
  target?: number
  highlight?: boolean
}

export interface BarChartProps {
  bars: BarChartBar[]
  height?: number
  pillar?: Pillar
  yFormat?: (n: number) => string
  ariaLabel: string
}

const W = 360
const PAD = { l: 6, r: 6, t: 22, b: 24 }
const GHOST = [0.45, 0.7, 0.35, 0.8, 0.55, 0.65, 0.4]

const isNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const defaultFormat = (n: number) => String(Math.round(n))

/** Categorical bars (days, weeks, pillars). Values are labelled directly; the highlighted bar is solid. */
export function BarChart({ bars, height = 160, pillar, yFormat = defaultFormat, ariaLabel }: BarChartProps) {
  const H = height
  const n = Math.max(1, bars.length)
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const slot = innerW / n
  const bw = Math.min(34, slot * 0.62)
  const base = H - PAD.b
  const empty = bars.every((b) => !isNum(b.value))

  if (empty) {
    const count = bars.length || GHOST.length
    const gSlot = innerW / count
    const gw = Math.min(34, gSlot * 0.62)
    return (
      <div data-pillar={pillar} className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${ariaLabel}. No data yet.`} className="block h-auto w-full">
          {Array.from({ length: count }, (_, i) => {
            const h = innerH * GHOST[i % GHOST.length]
            return (
              <rect
                key={i}
                x={PAD.l + gSlot * i + (gSlot - gw) / 2}
                y={base - h}
                width={gw}
                height={h}
                rx={Math.min(6, gw / 2)}
                fill="none"
                className="stroke-line-strong"
                strokeDasharray="3 4"
              />
            )
          })}
          <text
            x={W / 2}
            y={PAD.t + innerH / 2}
            textAnchor="middle"
            className="fill-muted"
            fontSize={13}
            fontWeight={500}
            style={{ paintOrder: 'stroke', stroke: 'var(--c-surface)', strokeWidth: 5, strokeLinejoin: 'round' }}
          >
            No data yet
          </text>
        </svg>
      </div>
    )
  }

  const tops: number[] = []
  bars.forEach((b) => {
    if (isNum(b.value)) tops.push(b.value)
    if (isNum(b.target)) tops.push(b.target)
  })
  const max = Math.max(...tops, 1e-9)
  const hOf = (v: number) => Math.max(0, (v / max) * innerH)
  const anyHighlight = bars.some((b) => b.highlight)
  const labelAll = bars.length <= 8

  return (
    <div data-pillar={pillar} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block h-auto w-full">
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="stroke-line" strokeWidth={1} />
        {bars.map((b, i) => {
          const x = PAD.l + slot * i + (slot - bw) / 2
          const cxMid = x + bw / 2
          const solid = b.highlight || !anyHighlight
          const has = isNum(b.value)
          const h = has ? Math.max(3, hOf(b.value as number)) : 0
          const rx = Math.min(6, bw / 2, h / 2 || 0)
          return (
            <g key={`${b.label}-${i}`}>
              {has ? (
                <rect x={x} y={base - h} width={bw} height={h} rx={rx} className="fill-pillar" opacity={solid ? 1 : 0.38} />
              ) : (
                <line x1={x + 2} x2={x + bw - 2} y1={base - 3} y2={base - 3} className="stroke-line-strong" strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
              )}
              {isNum(b.target) && (
                <line
                  x1={x - 3}
                  x2={x + bw + 3}
                  y1={base - hOf(b.target)}
                  y2={base - hOf(b.target)}
                  stroke="var(--c-fg)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.75}
                />
              )}
              {has && (labelAll || b.highlight) && (
                <text
                  x={cxMid}
                  y={base - Math.max(h, isNum(b.target) ? hOf(b.target) : 0) - 6}
                  textAnchor="middle"
                  className={b.highlight ? 'num fill-pillar' : 'num fill-muted'}
                  fontSize={b.highlight ? 15 : 13}
                >
                  {yFormat(b.value as number)}
                </text>
              )}
              <text
                x={cxMid}
                y={H - 7}
                textAnchor="middle"
                className={b.highlight ? 'fill-accent' : 'fill-muted'}
                fontSize={11}
                fontWeight={b.highlight ? 700 : 500}
              >
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
