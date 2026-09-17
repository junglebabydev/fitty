import { Minus, Plus } from 'lucide-react'
import { cx } from '../lib/util'
import { clampTo, stepDecimals } from './util'

export interface StepperProps {
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  /** Custom formatter for the value text. */
  format?: (n: number) => string
  label?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

/** +/- control with a centred value. Holds the number, never free text. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  format,
  label,
  size = 'md',
  disabled = false,
  className,
}: StepperProps) {
  const decimals = stepDecimals(step)
  const set = (n: number) => {
    const next = clampTo(Number(n.toFixed(decimals)), min, max)
    if (next !== value) onChange(next)
  }
  const canDec = !disabled && (min === undefined || value > min)
  const canInc = !disabled && (max === undefined || value < max)
  const text = format ? format(value) : value.toFixed(decimals)
  const btn = cx(
    'press inline-flex items-center justify-center shrink-0 rounded-full bg-surface-3 text-app',
    'disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100',
    // sm is drawn at 40px with a 44px hit area; md is a full 44px.
    size === 'sm' ? 'relative h-10 w-10 after:absolute after:-inset-0.5 after:content-[""]' : 'h-11 w-11',
  )

  return (
    <div className={cx('inline-flex items-center gap-1 p-1 rounded-full bg-surface-2 border border-line', className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={!canDec} aria-label={`Decrease ${label ?? ''}`.trim()}>
        <Minus size={20} strokeWidth={2.25} aria-hidden />
      </button>
      <div
        className={cx('num text-center text-app whitespace-nowrap', size === 'sm' ? 'min-w-12 text-xl' : 'min-w-16 text-2xl')}
        aria-live="polite"
      >
        {text}
        {unit && <span className="font-sans text-xs font-medium tracking-normal text-muted ml-1">{unit}</span>}
      </div>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={!canInc} aria-label={`Increase ${label ?? ''}`.trim()}>
        <Plus size={20} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  )
}
