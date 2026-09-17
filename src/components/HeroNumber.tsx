import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export interface HeroNumberProps {
  value: string | number
  unit?: string
  label?: string
  sub?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  pillar?: Pillar
  align?: 'left' | 'center'
}

const SIZE: Record<NonNullable<HeroNumberProps['size']>, string> = {
  md: 'text-5xl',
  lg: 'text-6xl',
  xl: 'text-7xl',
}

/** One huge condensed numeral with a tiny tracked label. The signature of every data block. */
export function HeroNumber({ value, unit, label, sub, size = 'lg', pillar, align = 'left' }: HeroNumberProps) {
  const centred = align === 'center'
  return (
    <div data-pillar={pillar} className={cx('min-w-0', centred && 'text-center')}>
      {label !== undefined && <div className={cx('eyebrow mb-1.5', pillar ? 'text-pillar' : 'text-muted')}>{label}</div>}
      <div className={cx('flex items-baseline gap-1.5 whitespace-nowrap', centred && 'justify-center')}>
        <span className={cx('num text-app', SIZE[size])}>{value}</span>
        {unit !== undefined && <span className="text-sm font-medium text-muted">{unit}</span>}
      </div>
      {sub !== undefined && <div className="mt-1.5 text-sm text-muted leading-snug">{sub}</div>}
    </div>
  )
}
