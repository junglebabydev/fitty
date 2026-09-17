import { cx } from '../lib/util'

export interface DividerProps {
  /** Indent from the left so the hairline starts at the row text. */
  inset?: boolean
  className?: string
}

export function Divider({ inset = false, className }: DividerProps) {
  return <hr className={cx('border-0 border-t border-line my-0', inset && 'ml-4', className)} aria-hidden />
}
