import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import { TONE_TEXT, type Tone } from './tones'

export interface StatProps {
  label: ReactNode
  value: ReactNode
  /** Small line under the value (e.g. "7-day avg 84.2 kg"). */
  sub?: ReactNode
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'center'
  className?: string
}

const VALUE_SIZE: Record<NonNullable<StatProps['size']>, string> = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-5xl',
}

export function Stat({ label, value, sub, tone = 'default', size = 'md', align = 'left', className }: StatProps) {
  return (
    <div className={cx('min-w-0', align === 'center' && 'text-center', className)}>
      <div className="eyebrow truncate text-muted">{label}</div>
      <div className={cx('num mt-1.5 truncate', VALUE_SIZE[size], TONE_TEXT[tone])}>{value}</div>
      {sub !== undefined && <div className="mt-1.5 text-[13px] leading-snug text-muted">{sub}</div>}
    </div>
  )
}
