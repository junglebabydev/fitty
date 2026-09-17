import { cx } from '../lib/util'
import { Skeleton } from './Skeleton'

export interface LoadingStateProps {
  label?: string
  /** Fill the viewport (boot screen) instead of the container. */
  fullScreen?: boolean
  className?: string
}

/** Skeleton placeholder shaped like a screen (hero + cards), never a lone spinner. */
export function LoadingState({ label = 'Loading…', fullScreen = false, className }: LoadingStateProps) {
  return (
    <div
      className={cx(
        'flex w-full flex-col gap-3',
        fullScreen ? 'mx-auto min-h-dvh max-w-[430px] bg-app px-4 pt-safe' : 'py-4',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {fullScreen && (
        <div className="flex flex-col gap-2 pb-2 pt-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
        </div>
      )}
      <Skeleton className={cx('w-full rounded-[1.25rem]', fullScreen ? 'h-56' : 'h-24')} />
      {fullScreen ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-[1.25rem]" />
            <Skeleton className="h-24 rounded-[1.25rem]" />
          </div>
          <Skeleton className="h-32 w-full rounded-[1.25rem]" />
        </>
      ) : (
        <>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </>
      )}
      <p className="eyebrow anim-pulse-soft m-0 pt-1 text-center text-muted">{label}</p>
    </div>
  )
}
