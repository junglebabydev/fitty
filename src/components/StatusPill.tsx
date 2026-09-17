import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import { TONE_PILL, type Tone } from './tones'

export interface StatusPillProps {
  tone: Tone
  children: ReactNode
  icon?: ReactNode
  /** Show a leading colour dot instead of an icon. */
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const DOT: Record<Tone, string> = {
  default: 'bg-accent',
  neutral: 'bg-faint',
  green: 'bg-ok',
  amber: 'bg-warn',
  red: 'bg-stop',
  accent: 'bg-accent',
}

export function StatusPill({ tone, children, icon, dot = false, size = 'md', className }: StatusPillProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 font-semibold tracking-wide rounded-full whitespace-nowrap',
        size === 'sm' ? 'text-xs px-2 h-[22px]' : 'text-xs px-2.5 h-[26px]',
        TONE_PILL[tone],
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full shrink-0', DOT[tone])} aria-hidden />}
      {icon && <span className="inline-flex shrink-0" aria-hidden>{icon}</span>}
      {children}
    </span>
  )
}
