import { WifiOff } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'
import { cx } from '../lib/util'

export interface OfflineBannerProps {
  className?: string
}

/** Thin banner shown only while offline. Carries the top safe-area inset so the tint reaches the status bar only while visible. Logging keeps working; AI features pause. */
export function OfflineBanner({ className }: OfflineBannerProps) {
  const online = useOnline()
  if (online) return null
  return (
    <div
      className={cx('flex items-center gap-2 border-b border-warn/30 bg-warn/15 px-4 pb-2 text-[13px] font-medium text-app', className)}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      role="status"
    >
      <WifiOff size={15} className="shrink-0 text-warn" aria-hidden />
      <span>Offline — logging works, AI photo and coach chat are paused.</span>
    </div>
  )
}
