import { Camera, Mic } from 'lucide-react'
import { cx } from '../lib/util'
import { TAB_BAR_HEIGHT } from './TabBar'

export interface QuickActionsProps {
  onCamera?: () => void
  onMic?: () => void
  /** Shift up when the tab bar is hidden (default assumes it is visible). */
  aboveTabs?: boolean
  /** Highlight the mic while listening. */
  listening?: boolean
  className?: string
}

/** Compact vertical glass capsule (camera, mic), bottom-right, just above the tab bar. */
export function QuickActions({ onCamera, onMic, aboveTabs = true, listening = false, className }: QuickActionsProps) {
  if (!onCamera && !onMic) return null
  const bottom = aboveTabs
    ? `calc(${TAB_BAR_HEIGHT + 4}px + env(safe-area-inset-bottom, 0px))`
    : 'calc(16px + env(safe-area-inset-bottom, 0px))'

  const base = 'press pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full'

  return (
    <div
      className={cx('pointer-events-none fixed left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2', className)}
      style={{ bottom }}
      role="group"
      aria-label="Quick actions"
    >
      <div className="glass shadow-float pointer-events-auto absolute bottom-0 right-3 flex flex-col items-center gap-1 rounded-full border border-line-strong p-1">
        {onCamera && (
          <button type="button" onClick={onCamera} aria-label="Log a meal with the camera" className={cx(base, 'text-app active:bg-surface-3')}>
            <Camera size={22} aria-hidden />
          </button>
        )}
        {onMic && (
          <button
            type="button"
            onClick={onMic}
            aria-label={listening ? 'Stop listening' : 'Voice command'}
            aria-pressed={listening}
            className={cx(base, listening ? 'anim-pulse-soft bg-stop text-accent-fg' : 'bg-accent text-accent-fg')}
          >
            <Mic size={22} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
