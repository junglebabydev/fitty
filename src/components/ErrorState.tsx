import type { ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { cx } from '../lib/util'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: ReactNode
  body?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  /** Fill the viewport (boot failure) instead of the container. */
  fullScreen?: boolean
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  onRetry,
  retryLabel = 'Try again',
  fullScreen = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center px-6 text-center',
        fullScreen ? 'min-h-dvh justify-center bg-app' : 'py-14',
        className,
      )}
      role="alert"
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-stop/30 bg-stop/10 text-stop" aria-hidden>
        <TriangleAlert size={22} />
      </div>
      <h3 className="m-0 text-lg font-semibold leading-tight text-app">{title}</h3>
      {body !== undefined && <p className="m-0 mt-2 max-w-[34ch] break-words text-sm leading-snug text-muted">{body}</p>}
      {onRetry && (
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={onRetry} className="mt-5">
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
