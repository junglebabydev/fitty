import type { ReactNode } from 'react'
import { cx } from '../lib/util'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
  /** Tighter spacing for use inside a card. */
  compact?: boolean
  className?: string
}

/** A sentence in the coach's `voice` plus one action. The icon is optional and stays quiet. */
export function EmptyState({ icon, title, body, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-6 text-center', compact ? 'py-6' : 'py-14', className)}>
      {icon !== undefined && (
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-pillar-line bg-pillar-soft text-pillar" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className={cx('voice m-0 max-w-[24ch] text-balance text-app', compact ? 'text-lg' : 'text-xl')}>{title}</h3>
      {body !== undefined && <p className="m-0 mt-2 max-w-[32ch] text-sm leading-snug text-muted">{body}</p>}
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  )
}
