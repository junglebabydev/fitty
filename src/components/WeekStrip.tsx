import { Check, Minus, Moon } from 'lucide-react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export type WeekStripState = 'done' | 'planned' | 'missed' | 'rest' | 'today'

export interface WeekStripDay {
  date: string
  label: string
  /** 0..1 fill of the day's bar. */
  value: number
  state?: WeekStripState
}

export interface WeekStripProps {
  days: WeekStripDay[]
  pillar?: Pillar
  onSelect?: (date: string) => void
  selected?: string
}

const STATE_WORD: Record<WeekStripState, string> = {
  done: 'done',
  planned: 'planned',
  missed: 'not done',
  rest: 'rest day',
  today: 'today',
}

function Glyph({ state, full }: { state?: WeekStripState; full: boolean }) {
  if (state === 'done' || (state === 'today' && full)) return <Check size={13} strokeWidth={3} className="text-pillar" aria-hidden />
  if (state === 'missed') return <Minus size={13} strokeWidth={2.5} className="text-faint" aria-hidden />
  if (state === 'rest') return <Moon size={12} strokeWidth={2.25} className="text-faint" aria-hidden />
  if (state === 'today') return <span className="h-1.5 w-1.5 rounded-full bg-pillar" aria-hidden />
  if (state === 'planned') return <span className="h-1.5 w-1.5 rounded-full border border-line-strong" aria-hidden />
  return <span className="h-1.5 w-1.5" aria-hidden />
}

/** Seven-day context strip: a mini bar per day, a state glyph under it, today boxed. */
export function WeekStrip({ days, pillar, onSelect, selected }: WeekStripProps) {
  return (
    <ul data-pillar={pillar} className="m-0 grid w-full list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, days.length)}, minmax(0, 1fr))` }}>
      {days.map((d) => {
        const v = Number.isFinite(d.value) ? Math.max(0, Math.min(1, d.value)) : 0
        const isToday = d.state === 'today'
        const isSelected = selected === d.date
        const name = `${d.label} ${d.date}${d.state ? `, ${STATE_WORD[d.state]}` : ''}, ${Math.round(v * 100)}%`
        const inner = (
          <>
            <span className={cx('eyebrow text-[0.625rem]', isToday || isSelected ? 'text-app' : 'text-muted')}>{d.label}</span>
            <span className="relative flex h-9 w-2 items-end overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span
                className={cx('w-full rounded-full bg-pillar transition-[height] duration-500', d.state === 'missed' && 'opacity-40')}
                style={{ height: `${v * 100}%` }}
              />
            </span>
            <span className="flex h-3.5 items-center justify-center">
              <Glyph state={d.state} full={v >= 1} />
            </span>
          </>
        )
        const cls = cx(
          'flex w-full min-h-[76px] flex-col items-center justify-between gap-1.5 rounded-xl border px-0.5 py-2',
          isSelected ? 'border-pillar-line bg-pillar-soft' : isToday ? 'border-line-strong bg-surface-2' : 'border-transparent',
        )
        return (
          <li key={d.date} className="min-w-0">
            {onSelect ? (
              <button type="button" onClick={() => onSelect(d.date)} aria-label={name} aria-pressed={isSelected} className={cx(cls, 'press')}>
                {inner}
              </button>
            ) : (
              <div role="img" aria-label={name} className={cls}>
                {inner}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
