import type { ReactNode } from 'react'
import { ShieldOff, Settings } from 'lucide-react'
import { cx } from '../lib/util'
import { Button } from './Button'

export interface PermissionDeniedProps {
  /** What was denied, e.g. "Apple Health sleep", "Camera", "Microphone". */
  what: string
  /** Plain-language reason the app wants it. */
  why: ReactNode
  onOpenSettings?: () => void
  /** Secondary action, e.g. "Enter manually". */
  fallback?: ReactNode
  className?: string
}

export function PermissionDenied({ what, why, onOpenSettings, fallback, className }: PermissionDeniedProps) {
  return (
    <div className={cx('flex gap-3 rounded-[1.25rem] border border-line bg-surface p-4', className)} role="status">
      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden>
        <ShieldOff size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold leading-tight text-app">{what} access is off</div>
        <p className="m-0 mt-1 text-sm leading-snug text-muted">{why}</p>
        {(onOpenSettings || fallback) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onOpenSettings && (
              <Button size="sm" variant="secondary" icon={<Settings size={15} />} onClick={onOpenSettings}>
                Open Settings
              </Button>
            )}
            {fallback}
          </div>
        )}
      </div>
    </div>
  )
}
