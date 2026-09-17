import type { ReactNode } from 'react'
import { cx } from '../lib/util'

export interface SegmentedOption<T> {
  value: T
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export interface SegmentedProps<T> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  /** Stretch to the container width (default true). */
  full?: boolean
  className?: string
  /** Accessible group name. */
  label?: string
}

/** Pill-track segmented control with a raised bone-text thumb. Generic over the option value type. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  full = true,
  className,
  label,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'inline-flex p-1 rounded-full bg-surface-2 border border-line gap-0.5',
        full && 'w-full',
        className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => {
              if (!selected) onChange(o.value)
            }}
            className={cx(
              'relative flex-1 inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
              'transition-[background-color,color] duration-200 select-none',
              // 44px hit area even though the thumb is shorter.
              'after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""]',
              size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3 text-sm',
              selected ? 'bg-surface-3 text-app' : 'text-muted active:text-app',
              o.disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {o.icon && <span className="inline-flex" aria-hidden>{o.icon}</span>}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
