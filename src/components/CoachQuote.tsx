import type { ReactNode } from 'react'
import { cx } from '../lib/util'

export interface CoachQuoteProps {
  /** What the coach says. Rendered in the serif `voice`. */
  children: ReactNode
  /** The facts behind the statement, shown as small labelled chips. */
  evidence?: { label: string; value: string }[]
  actions?: ReactNode
  compact?: boolean
}

/** The coach's voice: serif italic beside a thin bone rule, with its evidence underneath. */
export function CoachQuote({ children, evidence, actions, compact = false }: CoachQuoteProps) {
  return (
    <figure className={cx('m-0 border-l border-accent/60', compact ? 'pl-3.5' : 'pl-4')}>
      <figcaption className="eyebrow text-muted">Coach</figcaption>
      <blockquote className={cx('voice m-0 text-app text-pretty', compact ? 'mt-1.5 text-lg' : 'mt-2 text-[1.375rem]')}>
        {children}
      </blockquote>
      {evidence !== undefined && evidence.length > 0 && (
        <dl className={cx('m-0 flex flex-wrap gap-1.5', compact ? 'mt-2.5' : 'mt-3.5')} aria-label="Evidence">
          {evidence.map((e) => (
            <div key={`${e.label}:${e.value}`} className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1">
              <dt className="eyebrow text-[0.625rem] text-muted">{e.label}</dt>
              <dd className="num m-0 text-[15px] leading-none text-app">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions !== undefined && <div className={cx('flex flex-wrap items-center gap-2', compact ? 'mt-3' : 'mt-4')}>{actions}</div>}
    </figure>
  )
}
