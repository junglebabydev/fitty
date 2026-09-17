import { cx } from '../lib/util'

export interface SkeletonProps {
  /** Size it with utilities, e.g. `h-10 w-32` or `h-40 w-full rounded-[1.25rem]`. */
  className?: string
}

/** Shimmering placeholder block. Decorative: wrap groups in an element with role="status". */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cx('skeleton', className)} aria-hidden />
}
