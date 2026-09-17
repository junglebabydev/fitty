import { cx } from '../lib/util'

export interface RangeTabsProps<T> {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}

/** Compact range switcher for charts (W / M / 3M, 14 / 30 / 90). */
export function RangeTabs<T extends string | number>({ options, value, onChange }: RangeTabsProps<T>) {
  return (
    <div role="radiogroup" aria-label="Range" className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5 hairline">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) onChange(o.value)
            }}
            className={cx(
              // 36px pill with an invisible 44px hit area.
              'relative h-9 min-w-11 px-3 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap press',
              'after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
              selected ? 'bg-surface-3 text-app' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
