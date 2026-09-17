import { Minus, Plus, SkipForward } from 'lucide-react'
import { TAB_BAR_HEIGHT } from '../../components'
import { fmtClock } from './helpers'
import type { RestTimer } from './useRestTimer'

export interface RestTimerBarProps {
  timer: RestTimer
  /** Whether the tab bar is visible under the bar (default true). */
  aboveTabs?: boolean
}

const ADJUST = 'press inline-flex items-center justify-center gap-0.5 h-11 min-w-[52px] px-2 rounded-xl bg-surface-2 text-app text-sm font-semibold tnum'

/** Sticky rest countdown on the bottom edge while a rest is running; hidden when idle. Time comes from timestamps. */
export function RestTimerBar({ timer, aboveTabs = true }: RestTimerBarProps) {
  if (!timer.running) return null
  const pct = timer.total > 0 ? Math.max(0, Math.min(100, (timer.remaining / timer.total) * 100)) : 0
  return (
    <div
      data-pillar="train"
      className="fixed inset-x-0 z-30 pointer-events-none"
      style={{ bottom: aboveTabs ? `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))` : 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto w-full max-w-[430px] px-4 pb-3">
        <div className="pointer-events-auto glass shadow-float anim-rise rounded-[1.25rem] border border-line-strong overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1 pl-1" role="timer" aria-label={`Rest, ${fmtClock(timer.remaining)} remaining`}>
              <div className="eyebrow text-pillar">Rest</div>
              <div className="num text-4xl text-app mt-0.5">{fmtClock(timer.remaining)}</div>
            </div>
            <button type="button" className={ADJUST} onClick={() => timer.extend(-15)} aria-label="Remove 15 seconds of rest">
              <Minus size={14} aria-hidden />15
            </button>
            <button type="button" className={ADJUST} onClick={() => timer.extend(15)} aria-label="Add 15 seconds of rest">
              <Plus size={14} aria-hidden />15
            </button>
            <button
              type="button"
              className="press inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold"
              onClick={timer.skip}
            >
              <SkipForward size={16} aria-hidden />Skip
            </button>
          </div>
          <div className="h-1 bg-surface-2" aria-hidden>
            <div className="h-full bg-pillar transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
