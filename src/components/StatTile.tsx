import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export interface StatTileProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  icon?: LucideIcon
  pillar?: Pillar
  trend?: 'up' | 'down' | 'flat'
  onClick?: () => void
}

const TREND: Record<NonNullable<StatTileProps['trend']>, { icon: LucideIcon; word: string }> = {
  up: { icon: ArrowUpRight, word: 'Trending up' },
  down: { icon: ArrowDownRight, word: 'Trending down' },
  flat: { icon: Minus, word: 'Holding steady' },
}

/** Small metric tile for 2- and 3-column grids. Trend is neutral: up is not always good. */
export function StatTile({ label, value, unit, sub, icon: Icon, pillar, trend, onClick }: StatTileProps) {
  const t = trend ? TREND[trend] : null
  const TrendIcon = t?.icon

  const inner = (
    <>
      <span className={cx('eyebrow flex items-center gap-1.5', pillar ? 'text-pillar' : 'text-muted')}>
        {Icon && <Icon size={13} strokeWidth={2.25} aria-hidden />}
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-2 flex items-baseline gap-1 whitespace-nowrap">
        <span className="num text-4xl text-app">{value}</span>
        {unit !== undefined && <span className="text-sm font-medium text-muted">{unit}</span>}
      </span>
      {(sub !== undefined || TrendIcon) && (
        <span className="mt-1.5 flex items-center gap-1 text-xs text-muted leading-snug">
          {TrendIcon && <TrendIcon size={14} className="shrink-0 text-app" aria-hidden />}
          {t && <span className="sr-only">{t.word}.</span>}
          {sub !== undefined && <span className="truncate">{sub}</span>}
        </span>
      )}
    </>
  )

  const cls = 'flex min-w-0 flex-col rounded-[1.25rem] border border-line bg-surface p-3.5 text-left'

  if (onClick) {
    return (
      <button type="button" data-pillar={pillar} onClick={onClick} className={cx(cls, 'press w-full active:bg-surface-2')}>
        {inner}
      </button>
    )
  }
  return (
    <div data-pillar={pillar} className={cls}>
      {inner}
    </div>
  )
}
