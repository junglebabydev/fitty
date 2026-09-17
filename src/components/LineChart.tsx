import type { CSSProperties } from 'react'
import type { Pillar } from './pillars'

export interface LineChartPoint {
  x: string
  y: number | null
}

export interface LineChartProps {
  points: LineChartPoint[]
  height?: number
  /** Dashed horizontal goal line with a label. */
  target?: number
  /** Shaded personal baseline range [low, high]. */
  band?: [number, number]
  /** Smoothed series aligned with `points`. When given, raw points become faint dots and this is the bold line. */
  average?: (number | null)[]
  pillar?: Pillar
  yFormat?: (n: number) => string
  ariaLabel: string
  showDots?: boolean
}

const W = 360
const PAD = { l: 10, r: 48, t: 18, b: 24 }

const isNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const defaultFormat = (n: number) => String(Math.round(n * 10) / 10)

/** Text halo so labels stay legible where they cross a line. */
const HALO: CSSProperties = { paintOrder: 'stroke', stroke: 'var(--c-surface)', strokeWidth: 4, strokeLinejoin: 'round' }

/** Builds a path with a gap wherever the series is null. */
function gappedPath(ys: (number | null)[], xOf: (i: number) => number, yOf: (v: number) => number): string {
  let d = ''
  let pen = false
  ys.forEach((v, i) => {
    if (!isNum(v)) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `
    pen = true
  })
  return d.trim()
}

/** Indexes of finite points with no finite neighbour: a line cannot show them, so they need a dot. */
function isolated(ys: (number | null)[]): number[] {
  const out: number[] = []
  ys.forEach((v, i) => {
    if (isNum(v) && !isNum(ys[i - 1]) && !isNum(ys[i + 1])) out.push(i)
  })
  return out
}

/**
 * Trend chart. Pure SVG, scales with its container. Put the interpreted headline
 * sentence ("Down 0.6 kg in 30 days") above it in the screen.
 */
export function LineChart({
  points,
  height = 180,
  target,
  band,
  average,
  pillar,
  yFormat = defaultFormat,
  ariaLabel,
  showDots,
}: LineChartProps) {
  const H = height
  const raw = points.map((p) => (isNum(p.y) ? p.y : null))
  const avg = average ? points.map((_, i) => (isNum(average[i]) ? (average[i] as number) : null)) : null
  const finiteCount = raw.filter(isNum).length

  if (finiteCount < 2) {
    const mid = H / 2
    return (
      <div data-pillar={pillar} className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${ariaLabel}. Not enough data yet.`} className="block h-auto w-full">
          <path
            d={`M${PAD.l},${mid + 18} C${W * 0.25},${mid - 26} ${W * 0.4},${mid + 30} ${W * 0.58},${mid - 4} S${W * 0.85},${mid - 30} ${W - PAD.l},${mid - 12}`}
            fill="none"
            className="stroke-line-strong"
            strokeWidth={2}
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <text x={W / 2} y={mid + 4} textAnchor="middle" className="fill-muted" fontSize={13} fontWeight={500} style={HALO}>
            Not enough data yet
          </text>
          <text x={W / 2} y={mid + 22} textAnchor="middle" className="fill-faint" fontSize={11} style={HALO}>
            {finiteCount} logged · the trend appears after 2
          </text>
        </svg>
      </div>
    )
  }

  // ---- scales ----
  const domain: number[] = [...raw.filter(isNum), ...(avg ? avg.filter(isNum) : [])]
  if (band) domain.push(band[0], band[1])
  // A far-away goal would flatten the trend, so it only joins the scale when it is
  // near the data. Otherwise the line is pinned to the edge and labelled with an arrow.
  let targetPinned: 'above' | 'below' | null = null
  if (isNum(target)) {
    const dLo = Math.min(...domain)
    const dHi = Math.max(...domain)
    const reach = Math.max(dHi - dLo, Math.abs(dHi) * 0.01, 1e-6) * 1.5
    if (target < dLo - reach) targetPinned = 'below'
    else if (target > dHi + reach) targetPinned = 'above'
    else domain.push(target)
  }
  let lo = Math.min(...domain)
  let hi = Math.max(...domain)
  if (hi - lo < 1e-9) {
    const bump = Math.abs(hi) * 0.02 || 1
    lo -= bump
    hi += bump
  }
  const padY = (hi - lo) * 0.12
  lo -= padY
  hi += padY

  const n = points.length
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const xOf = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const yOf = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * innerH

  const main = avg ?? raw
  const dots = showDots ?? (avg !== null || n <= 16)

  // ---- annotations ----
  let minI = -1
  let maxI = -1
  raw.forEach((v, i) => {
    if (!isNum(v)) return
    if (minI === -1 || v < (raw[minI] as number)) minI = i
    if (maxI === -1 || v > (raw[maxI] as number)) maxI = i
  })
  let lastI = -1
  for (let i = main.length - 1; i >= 0; i--) {
    if (isNum(main[i])) {
      lastI = i
      break
    }
  }
  const lastV = lastI >= 0 ? (main[lastI] as number) : null
  const lastRawI = raw.reduce<number>((acc, v, i) => (isNum(v) ? i : acc), -1)

  const anchorFor = (i: number): 'start' | 'middle' | 'end' => {
    const x = xOf(i)
    if (x < PAD.l + 24) return 'start'
    if (x > W - PAD.r - 24) return 'end'
    return 'middle'
  }

  const targetY = !isNum(target) ? null : targetPinned === 'below' ? H - PAD.b : targetPinned === 'above' ? PAD.t - 8 : yOf(target)
  const targetLabelY = targetY === null ? 0 : targetY < PAD.t + 14 ? targetY + 13 : targetY - 5
  const targetArrow = targetPinned === 'below' ? ' ↓' : targetPinned === 'above' ? ' ↑' : ''

  // x-axis: first, middle (when there is room) and last.
  const tickIdx = n >= 5 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1]

  return (
    <div data-pillar={pillar} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block h-auto w-full overflow-visible">
        {/* baseline */}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-line" strokeWidth={1} />

        {band && (
          <>
            <rect
              x={PAD.l}
              width={innerW}
              y={yOf(Math.max(band[0], band[1]))}
              height={Math.max(1, Math.abs(yOf(band[0]) - yOf(band[1])))}
              rx={4}
              className="fill-pillar"
              opacity={0.1}
            />
            <text x={PAD.l + 4} y={yOf(Math.max(band[0], band[1])) + 11} className="fill-muted" fontSize={10} fontWeight={600} letterSpacing="0.08em">
              USUAL RANGE
            </text>
          </>
        )}

        {targetY !== null && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={targetY} y2={targetY} className="stroke-muted" strokeWidth={1.25} strokeDasharray="4 5" />
            <text x={W - PAD.r - 2} y={targetLabelY} textAnchor="end" className="fill-muted" fontSize={10} fontWeight={600} letterSpacing="0.08em" style={HALO}>
              TARGET {yFormat(target as number)}
              {targetArrow}
            </text>
          </>
        )}

        {/* raw readings */}
        {avg !== null
          ? dots &&
            raw.map((v, i) => (isNum(v) ? <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.4} className="fill-pillar" opacity={0.38} /> : null))
          : null}

        {/* main line */}
        <path
          d={gappedPath(main, xOf, yOf)}
          fill="none"
          className="stroke-pillar anim-draw"
          strokeWidth={2.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
          style={{ '--dash-from': 1 } as CSSProperties}
        />
        {avg === null && dots
          ? raw.map((v, i) => (isNum(v) ? <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.6} className="fill-pillar" /> : null))
          : isolated(main).map((i) => <circle key={i} cx={xOf(i)} cy={yOf(main[i] as number)} r={2.6} className="fill-pillar" />)}

        {/* min / max of the raw readings */}
        {maxI >= 0 && maxI !== lastRawI && (
          <text x={xOf(maxI)} y={yOf(raw[maxI] as number) - 8} textAnchor={anchorFor(maxI)} className="fill-muted" fontSize={11} fontWeight={500} style={HALO}>
            {yFormat(raw[maxI] as number)}
          </text>
        )}
        {minI >= 0 && minI !== maxI && minI !== lastRawI && (
          <text x={xOf(minI)} y={yOf(raw[minI] as number) + 15} textAnchor={anchorFor(minI)} className="fill-muted" fontSize={11} fontWeight={500} style={HALO}>
            {yFormat(raw[minI] as number)}
          </text>
        )}

        {/* last value, labelled in the right margin */}
        {lastV !== null && (
          <>
            <circle cx={xOf(lastI)} cy={yOf(lastV)} r={5} className="fill-pillar" stroke="var(--c-surface)" strokeWidth={2.5} />
            <text x={xOf(lastI) + 9} y={yOf(lastV) + 5} className="num fill-pillar" fontSize={16} style={HALO}>
              {yFormat(lastV)}
            </text>
          </>
        )}

        {tickIdx.map((i, k) => (
          <text
            key={i}
            x={xOf(i)}
            y={H - 7}
            textAnchor={k === 0 ? 'start' : k === tickIdx.length - 1 ? 'end' : 'middle'}
            className="fill-muted"
            fontSize={11}
          >
            {points[i].x}
          </text>
        ))}
      </svg>
    </div>
  )
}
