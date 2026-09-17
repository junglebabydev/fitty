import type { KeyboardEvent, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'
import { TONE_SURFACE, type Tone } from './tones'

export type CardTone = 'default' | 'green' | 'amber' | 'red' | 'accent'

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Right-aligned element in the header row (a pill, a small button, a link). */
  action?: ReactNode
  tone?: CardTone
  /** Makes the whole card tappable (renders a chevron unless `action` is given). */
  onClick?: () => void
  children?: ReactNode
  className?: string
  /** Remove inner padding — for lists or media that go edge to edge. */
  flush?: boolean
  /** Scopes the card to a pillar: tints the border and eyebrow, and every `*-pillar` utility inside. */
  pillar?: Pillar
  /** Tiny tracked kicker above the title. */
  eyebrow?: string
}

/** Hairline surface. Structure comes from the border, never from a shadow. */
export function Card({
  title,
  subtitle,
  action,
  tone = 'default',
  onClick,
  children,
  className,
  flush = false,
  pillar,
  eyebrow,
}: CardProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || action !== undefined || eyebrow !== undefined
  const interactive = typeof onClick === 'function'
  const tinted = pillar !== undefined && tone === 'default'

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      data-pillar={pillar}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      className={cx(
        'rounded-[1.25rem] border',
        tinted ? 'bg-surface border-pillar-line' : TONE_SURFACE[tone as Tone],
        flush ? 'overflow-hidden' : 'p-4',
        interactive && 'press cursor-pointer select-none active:bg-surface-2',
        className,
      )}
    >
      {hasHeader && (
        <div className={cx('flex items-start justify-between gap-3', flush && 'px-4 pt-4', children ? 'mb-3' : undefined)}>
          <div className="min-w-0">
            {eyebrow !== undefined && (
              <div className={cx('eyebrow', pillar ? 'text-pillar' : 'text-muted', (title !== undefined || subtitle !== undefined) && 'mb-1.5')}>
                {eyebrow}
              </div>
            )}
            {title !== undefined && <div className="truncate text-[17px] font-semibold leading-tight text-app">{title}</div>}
            {subtitle !== undefined && <div className="mt-1 text-sm leading-snug text-muted">{subtitle}</div>}
          </div>
          {action !== undefined ? (
            <div className="flex shrink-0 items-center">{action}</div>
          ) : interactive ? (
            <ChevronRight size={18} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          ) : null}
        </div>
      )}
      {children}
    </div>
  )
}
