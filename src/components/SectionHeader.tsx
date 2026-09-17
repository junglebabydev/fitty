import type { ReactNode } from 'react'
import { cx } from '../lib/util'

export interface SectionHeaderProps {
  title: ReactNode
  /** Right-aligned element, typically a ghost button or link. */
  action?: ReactNode
  /** Optional secondary line under the title. */
  sub?: ReactNode
  className?: string
}

/** Section kicker in the `eyebrow` style. Sections sit `gap-6` apart; the header adds the rest. */
export function SectionHeader({ title, action, sub, className }: SectionHeaderProps) {
  return (
    <div className={cx('flex min-h-8 items-end justify-between gap-3 pb-2.5 pt-6', className)}>
      <div className="min-w-0">
        <h2 className="eyebrow m-0 truncate text-muted">{title}</h2>
        {sub !== undefined && <p className="m-0 mt-1 text-[13px] leading-snug text-muted">{sub}</p>}
      </div>
      {action !== undefined && <div className="shrink-0 text-sm font-medium text-app">{action}</div>}
    </div>
  )
}
