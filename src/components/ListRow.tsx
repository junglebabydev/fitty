import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cx } from '../lib/util'

export interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-aligned content (a value, a pill, a switch). */
  right?: ReactNode
  onClick?: () => void
  /** Route path — renders a react-router Link instead of a button. */
  to?: string
  icon?: ReactNode
  /** Force a chevron on/off; defaults to on for tappable rows without `right`. */
  chevron?: boolean
  disabled?: boolean
  className?: string
}

/** List row: 56px minimum, icon slot, title/subtitle, right slot, chevron. */
export function ListRow({ title, subtitle, right, onClick, to, icon, chevron, disabled = false, className }: ListRowProps) {
  const tappable = !disabled && (typeof onClick === 'function' || typeof to === 'string')
  const showChevron = chevron ?? (tappable && right === undefined)

  const inner = (
    <>
      {icon !== undefined && (
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-surface-2 text-muted shrink-0" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-medium leading-tight truncate">{title}</span>
        {subtitle !== undefined && <span className="block text-[13px] text-muted mt-1 leading-snug">{subtitle}</span>}
      </span>
      {right !== undefined && <span className="shrink-0 text-[15px] text-muted tnum inline-flex items-center">{right}</span>}
      {showChevron && <ChevronRight size={18} className="shrink-0 text-faint -mr-1" aria-hidden />}
    </>
  )

  const cls = cx(
    'flex items-center gap-3 w-full min-h-14 px-4 py-2.5 text-app',
    tappable && 'active:bg-surface-2 transition-colors duration-150 select-none',
    // Inset focus ring: rows usually sit inside an overflow-hidden flush card.
    tappable && 'focus-visible:bg-surface-2 focus-visible:-outline-offset-2',
    disabled && 'opacity-50',
    className,
  )

  if (to !== undefined && !disabled) {
    return (
      <Link to={to} className={cls} onClick={onClick}>
        {inner}
      </Link>
    )
  }
  if (onClick && !disabled) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}
