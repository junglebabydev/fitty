import { useId, type CSSProperties } from 'react'
import { cx } from '../lib/util'
import type { Tone } from './tones'

export interface SliderProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  /** Field label shown above the track. */
  label?: string
  /** End-cap labels, e.g. ['No pain', 'Worst'] . Defaults to numeric min/max. */
  labels?: [string, string]
  /** Colour of the filled track. `auto` tints by value (green → amber → red), for pain scales. */
  tone?: Tone | 'auto'
  /** Text shown next to the value, e.g. "/10". */
  suffix?: string
  disabled?: boolean
  className?: string
}

// Token colours, so the track follows the theme. `accent` follows the current pillar.
const TONE_COLOR: Record<Tone, string> = {
  default: 'var(--pillar)',
  accent: 'var(--pillar)',
  neutral: 'var(--c-faint)',
  green: 'var(--c-ok)',
  amber: 'var(--c-warn)',
  red: 'var(--c-stop)',
}

function autoTone(value: number, min: number, max: number): Tone {
  const t = max > min ? (value - min) / (max - min) : 0
  if (t <= 0.25) return 'green'
  if (t <= 0.55) return 'amber'
  return 'red'
}

/** 0–10 scale for pain / energy / soreness. Big thumb, tick marks, value readout. */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  labels,
  tone = 'accent',
  suffix,
  disabled = false,
  className,
}: SliderProps) {
  const id = useId()
  const resolvedTone: Tone = tone === 'auto' ? autoTone(value, min, max) : tone
  const pctValue = max > min ? ((value - min) / (max - min)) * 100 : 0
  const style = {
    '--slider-pct': `${pctValue}%`,
    '--slider-color': TONE_COLOR[resolvedTone],
  } as CSSProperties

  const ticks: number[] = []
  if (step >= 1 && (max - min) / step <= 20) {
    for (let v = min; v <= max; v += step) ticks.push(v)
  }

  return (
    <div className={cx('flex flex-col', disabled && 'opacity-50', className)}>
      <div className="flex items-baseline justify-between mb-1">
        {label !== undefined ? (
          <label htmlFor={id} className="text-[15px] font-medium text-app">{label}</label>
        ) : (
          <span />
        )}
        <span className="num text-3xl text-app">
          {value}
          {suffix && <span className="font-sans text-sm font-medium tracking-normal text-muted ml-1">{suffix}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        style={style}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ticks.length > 0 && (
        <div className="flex justify-between px-[14px] -mt-1" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className={cx('w-px', t === value ? 'h-1.5 bg-accent' : 'h-1 bg-line-strong')} />
          ))}
        </div>
      )}
      <div className="flex justify-between text-xs text-muted mt-1.5" aria-hidden>
        <span>{labels ? labels[0] : min}</span>
        <span>{labels ? labels[1] : max}</span>
      </div>
    </div>
  )
}
