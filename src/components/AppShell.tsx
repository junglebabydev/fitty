import type { ReactNode } from 'react'
import { OfflineBanner } from './OfflineBanner'
import { TAB_BAR_HEIGHT, TabBar } from './TabBar'

export interface AppShellProps {
  children: ReactNode
  /** Hide the bottom tab bar (onboarding, full-screen workout logger). */
  hideTabs?: boolean
  /** Omit the offline banner (if the host renders its own). */
  hideOfflineBanner?: boolean
}

/**
 * Centred 430px phone column with safe-area handling, the offline banner and
 * the floating TabBar. Film grain comes from `body::before`. Content gets
 * bottom padding so nothing ends up under the bar; on wider viewports the
 * column is framed by hairlines.
 */
export function AppShell({ children, hideTabs = false, hideOfflineBanner = false }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-app text-app">
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col border-line min-[431px]:border-x"
        style={
          hideTabs
            ? { paddingBottom: 'env(safe-area-inset-bottom, 0px)' }
            : { paddingBottom: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }
        }
      >
        {/* In flow (not sticky) so a Screen's sticky glass header can own the top edge. */}
        {!hideOfflineBanner && <OfflineBanner />}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
      {!hideTabs && <TabBar />}
    </div>
  )
}
