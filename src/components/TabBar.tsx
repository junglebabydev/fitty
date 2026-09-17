import { NavLink } from 'react-router-dom'
import { Brain, Dumbbell, MessageSquare, Sun, Utensils, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export interface TabItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (used for `/`). */
  end?: boolean
  /** Hue shown while the tab is active. */
  pillar?: Pillar
}

export const TABS: TabItem[] = [
  { to: '/', label: 'Today', icon: Sun, end: true, pillar: 'today' },
  { to: '/train', label: 'Train', icon: Dumbbell, pillar: 'train' },
  { to: '/eat', label: 'Eat', icon: Utensils, pillar: 'eat' },
  { to: '/mind', label: 'Mind', icon: Brain, pillar: 'mind' },
  { to: '/coach', label: 'Coach', icon: MessageSquare, pillar: 'coach' },
]

const PILL_HEIGHT = 60
const PILL_INSET = 12

/**
 * Space the floating bar occupies above the bottom edge, excluding the safe-area
 * inset, in px (pill + inset + 8px of air). Position sticky/floating chrome at
 * `calc(TAB_BAR_HEIGHT px + env(safe-area-inset-bottom))` to sit just above it.
 */
export const TAB_BAR_HEIGHT = PILL_HEIGHT + PILL_INSET + 8

/** Floating glass pill. The active tab opens up to show its label in its own pillar hue. */
export function TabBar({ className }: { className?: string }) {
  return (
    <nav
      className={cx('fixed left-1/2 z-30 -translate-x-1/2', className)}
      style={{
        width: `calc(min(100vw, 430px) - ${PILL_INSET * 2}px)`,
        // Sits 12px off the edge, or just above the home indicator when there is one.
        bottom: `max(${PILL_INSET}px, calc(env(safe-area-inset-bottom, 0px) - 10px))`,
      }}
      aria-label="Primary"
    >
      <div
        className="glass shadow-float flex items-center gap-0.5 rounded-full border border-line-strong p-1.5"
        style={{ height: PILL_HEIGHT }}
      >
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              data-pillar={t.pillar}
              aria-label={t.label}
              className={({ isActive }) =>
                cx(
                  'flex h-12 min-w-12 items-center justify-center gap-2 rounded-full select-none',
                  'transition-[flex-grow,background-color,color,transform] duration-300 active:scale-[0.96]',
                  isActive ? 'grow-[2.2] bg-pillar-soft text-pillar' : 'grow text-muted active:text-app',
                )
              }
              style={{ flexBasis: 0 }}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                  {isActive && <span className="text-[13px] font-semibold leading-none tracking-wide">{t.label}</span>}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
