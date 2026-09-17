// Big 0–10 scale for the check-in: tiny eyebrow label, huge numeral, a plain word for the
// value, and the shared `.slider` range input (44px tap target, styled in index.css).
import { useId, type CSSProperties } from 'react'
import { cx } from '../../lib/util'

export interface ScaleSliderProps {
  label: string
  value: number
  onChange: (n: number) => void
  /** Word for the current value, so the number is never the only signal. */
  describe: (n: number) => string
  /** End-cap labels under the track. */
  ends: [string, string]
  /** `status` tints by pain thresholds (≤2 ok, 3–5 caution, >5 stop); `plain` stays monochrome. */
  tone?: 'plain' | 'status'
  size?: 'md' | 'lg'
  className?: string
}

function statusColor(n: number): string {
  if (n <= 2) return 'var(--c-ok)'
  if (n <= 5) return 'var(--c-warn)'
  return 'var(--c-stop)'
}

export function ScaleSlider({ label, value, onChange, describe, ends, tone = 'plain', size = 'lg', className }: ScaleSliderProps) {
  const id = useId()
  const style = {
    '--slider-pct': `${value * 10}%`,
    '--slider-color': tone === 'status' ? statusColor(value) : 'var(--c-fg)',
  } as CSSProperties
  const word = describe(value)

  return (
    <div className={cx('flex flex-col', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="eyebrow text-muted block">{label}</label>
          <div className={cx('mt-1 font-medium leading-tight', size === 'lg' ? 'text-lg' : 'text-base')}>{word}</div>
        </div>
        <div className="flex items-baseline gap-1 shrink-0" aria-hidden>
          <span className={cx('num', size === 'lg' ? 'text-6xl' : 'text-5xl')}>{value}</span>
          <span className="text-sm font-medium text-muted">/10</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        className="slider mt-2"
        min={0}
        max={10}
        step={1}
        value={value}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-valuetext={`${value} out of 10, ${word}`}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-muted" aria-hidden>
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}

const band = (n: number, steps: [number, string][], last: string): string => {
  for (const [max, word] of steps) if (n <= max) return word
  return last
}

export const describeEnergy = (n: number) => band(n, [[2, 'Flat'], [4, 'Low'], [6, 'Steady'], [8, 'Good']], 'Full')
export const describeSoreness = (n: number) => band(n, [[0, 'None'], [2, 'Light'], [4, 'Noticeable'], [6, 'Heavy']], 'Very sore')
export const describeStress = (n: number) => band(n, [[1, 'Calm'], [3, 'Easy'], [5, 'Moderate'], [7, 'High']], 'Very high')
export const describePain = (n: number) => band(n, [[0, 'No pain'], [2, 'Mild'], [5, 'Moderate'], [7, 'Strong']], 'Severe')
