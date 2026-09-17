// Building blocks of the intake conversation: big option cards, chip clouds, a large numeral stepper and a 0–10 scale.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { Chip } from '../../components'
import { clamp, cx } from '../../lib/util'

export interface CardOption<T extends string | number> {
  value: T
  label: string
  sub?: string
  icon?: ReactNode
}

/** Single choice as big tappable cards. `onPick` fires on every tap (the caller auto-advances). */
export function OptionCards<T extends string | number>({ label, options, value, onPick, columns = 1 }: { label: string; options: CardOption<T>[]; value: T | null; onPick: (v: T) => void; columns?: 1 | 2 }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('grid gap-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.value)}
            style={{ '--i': i } as CSSProperties}
            className={cx(
              'press anim-rise relative flex text-left rounded-[1.25rem] border min-h-[68px] px-4 py-3.5',
              columns === 2 ? 'flex-col items-start gap-3' : 'items-center gap-4',
              on ? 'bg-pillar-soft border-pillar-line' : 'bg-surface border-line active:bg-surface-2',
            )}
          >
            {o.icon && (
              <span className={cx('inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-full border', on ? 'border-pillar-line text-pillar' : 'border-line bg-surface-2 text-muted')} aria-hidden>
                {o.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cx('block font-semibold leading-tight', o.icon ? 'text-[17px]' : 'num text-4xl')}>{o.label}</span>
              {o.sub && <span className="block text-[14px] text-muted leading-snug mt-0.5">{o.sub}</span>}
            </span>
            <span
              className={cx(
                'inline-flex items-center justify-center h-6 w-6 rounded-full border shrink-0',
                columns === 2 && 'absolute top-3.5 right-3.5',
                on ? 'bg-pillar border-transparent text-accent-fg' : 'border-line-strong',
              )}
              aria-hidden
            >
              {on && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface CloudOption {
  value: string
  label: string
  icon?: ReactNode
}

/** Multi-select chips, 44px tall, check mark when on. */
export function ChipCloud({ label, options, selected, onToggle }: { label: string; options: CloudOption[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {options.map((o) => (
        <Chip key={o.value} selected={selected.includes(o.value)} onClick={() => onToggle(o.value)} icon={o.icon} check className="h-12! px-4! text-[15px]!">
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

export function toggleValue(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

/** Repeats `fn` while the button is held (after a short delay). */
function useHold(fn: () => void) {
  const ref = useRef(fn)
  ref.current = fn
  const timers = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({})
  const stop = () => {
    clearTimeout(timers.current.t)
    clearInterval(timers.current.i)
  }
  useEffect(() => stop, [])
  return {
    onPointerDown: () => {
      stop()
      timers.current.t = setTimeout(() => {
        timers.current.i = setInterval(() => ref.current(), 70)
      }, 380)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  }
}

/**
 * One large numeral with − / + on either side. The numeral is a real input, so it can be typed;
 * holding a button repeats. `fallback` is where − / + start from when nothing is set yet.
 */
export function BigStepper({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  fallback,
  decimals = 0,
  hint,
}: {
  label: string
  value: number | null
  onChange: (n: number | null) => void
  unit: string
  step?: number
  min: number
  max: number
  fallback: number
  decimals?: number
  hint?: ReactNode
}) {
  const id = useId()
  const fmt = (n: number | null) => (n == null ? '' : n.toFixed(decimals))
  const [text, setText] = useState(fmt(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals])

  const bump = (dir: 1 | -1) => {
    const base = value ?? fallback - dir * step
    const next = clamp(Math.round((base + dir * step) / step) * step, min, max)
    onChange(Number(next.toFixed(decimals)))
  }
  const holdDown = useHold(() => bump(-1))
  const holdUp = useHold(() => bump(1))

  const ROUND = 'press inline-flex items-center justify-center h-14 w-14 shrink-0 rounded-full border border-line-strong bg-surface text-app active:bg-surface-2'

  return (
    <div className="flex flex-col items-center">
      <label htmlFor={id} className="eyebrow text-pillar">
        {label}
      </label>
      <div className="flex items-center justify-between gap-3 w-full mt-4">
        <button type="button" className={ROUND} aria-label={`Lower ${label.toLowerCase()}`} onClick={() => bump(-1)} {...holdDown}>
          <Minus size={24} aria-hidden />
        </button>
        <div className="flex items-baseline justify-center gap-1.5 min-w-0 border-b-2 border-line-strong focus-within:border-pillar pb-1">
          <input
            id={id}
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            value={text}
            placeholder={fmt(fallback)}
            onFocus={(e) => {
              focused.current = true
              e.currentTarget.select()
            }}
            onChange={(e) => {
              const raw = e.currentTarget.value.replace(',', '.').replace(/[^0-9.]/g, '')
              setText(raw)
              const n = parseFloat(raw)
              onChange(raw === '' || !Number.isFinite(n) ? null : n)
            }}
            onBlur={() => {
              focused.current = false
              const next = value == null ? null : Number(clamp(value, min, max).toFixed(decimals))
              if (next !== value) onChange(next)
              setText(fmt(next))
            }}
            style={{ width: `${Math.max(2, (text || fmt(fallback)).length) + 0.3}ch` }}
            className="num text-7xl min-w-0 max-w-[5.5ch] bg-transparent text-center text-app outline-none placeholder:text-faint placeholder:opacity-50"
          />
          <span className="text-muted text-lg font-medium">{unit}</span>
        </div>
        <button type="button" className={ROUND} aria-label={`Raise ${label.toLowerCase()}`} onClick={() => bump(1)} {...holdUp}>
          <Plus size={24} aria-hidden />
        </button>
      </div>
      {hint && <p className="text-[14px] text-muted text-center leading-snug mt-4 text-pretty">{hint}</p>}
    </div>
  )
}

/** 0–10 scale: big numeral + the word for it, slider underneath. */
export function Scale10({ label, value, onChange, ends, describe }: { label: string; value: number | null; onChange: (n: number) => void; ends: [string, string]; describe: (n: number) => string }) {
  const v = value ?? 5
  return (
    <div className="flex flex-col items-center">
      <p className="eyebrow text-pillar">{label}</p>
      <p className="mt-3 flex items-baseline gap-1.5" aria-hidden>
        <span className={cx('num text-7xl', value == null && 'text-faint opacity-50')}>{v}</span>
        <span className="text-muted text-lg font-medium">/ 10</span>
      </p>
      <p className="text-[15px] text-muted h-6" aria-live="polite">
        {value == null ? 'Slide to answer' : describe(v)}
      </p>
      <input
        type="range"
        className="slider w-full mt-5"
        aria-label={label}
        aria-valuetext={value == null ? 'Not answered' : `${v} of 10, ${describe(v)}`}
        min={0}
        max={10}
        step={1}
        value={v}
        style={{ '--slider-pct': `${value == null ? 0 : v * 10}%`, '--slider-color': 'var(--pillar)' } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => value == null && onChange(v)}
      />
      <div className="flex justify-between w-full text-[13px] text-muted mt-2" aria-hidden>
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}

/** Small supporting line under an answer area. Keep it short: the step budget is 40 words. */
export function Hint({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[14px] text-muted leading-snug">
      {icon && (
        <span className="shrink-0 mt-0.5 inline-flex" aria-hidden>
          {icon}
        </span>
      )}
      <span>{children}</span>
    </p>
  )
}
