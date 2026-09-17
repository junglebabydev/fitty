import { useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'
import { TONE_STROKE, TONE_SVG_FILL, type Tone } from './tones'
import { sparklineGeometry } from './util'

export interface SparklineProps {
  points: number[]
  /** Horizontal dashed reference line (e.g. goal weight, kcal target). */
  target?: number
  height?: number
  /** Fixed width in px; when omitted the SVG fills its container. */
  width?: number
  /** `accent` (default) strokes with the current pillar hue. */
  tone?: Tone
  /** Scope the stroke to a specific pillar instead of the surrounding one. */
  pillar?: Pillar
  /** Highlight the most recent point with a dot (default true). */
  showLast?: boolean
  /** Soft area fill under the line. */
  fill?: boolean
  className?: string
  /** Accessible description, e.g. "Weight, last 30 days". */
  label?: string
}

/** Pure SVG polyline. Measures its container so strokes and dots stay crisp. */
export function Sparkline({
  points,
  target,
  height = 48,
  width,
  tone = 'accent',
  pillar,
  showLast = true,
  fill = false,
  className,
  label,
}: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<number>(width ?? 120)

  useLayoutEffect(() => {
    if (width !== undefined) return
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setMeasured(w)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  const w = width ?? measured
  const geo = sparklineGeometry(points, w, height, target)
  const last = geo.coords[geo.coords.length - 1]
  const empty = geo.coords.length === 0

  const areaPath =
    fill && geo.coords.length > 1
      ? `M${geo.coords[0].x},${height} ` +
        geo.coords.map((c) => `L${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ') +
        ` L${geo.coords[geo.coords.length - 1].x.toFixed(2)},${height} Z`
      : null

  return (
    <div ref={ref} data-pillar={pillar} className={cx(width === undefined ? 'w-full' : undefined, className)} style={{ height }}>
      <svg
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={label ?? 'Trend'}
        className="block overflow-visible"
      >
        {empty ? (
          <line x1={0} y1={height / 2} x2={w} y2={height / 2} className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />
        ) : (
          <>
            {geo.targetY !== null && (
              <line
                x1={0}
                y1={geo.targetY}
                x2={w}
                y2={geo.targetY}
                className="stroke-muted"
                strokeWidth={1}
                strokeDasharray="4 5"
              />
            )}
            {areaPath && <path d={areaPath} className={cx('opacity-10', TONE_SVG_FILL[tone])} />}
            {geo.coords.length > 1 ? (
              <polyline
                points={geo.points}
                fill="none"
                className={TONE_STROKE[tone]}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {showLast && last && (
              <circle cx={last.x} cy={last.y} r={3.5} className={TONE_SVG_FILL[tone]} stroke="var(--c-surface)" strokeWidth={2} />
            )}
          </>
        )}
      </svg>
    </div>
  )
}
