// Presentation helpers shared by Today, Check-in and Sleep. No data access, no writes.
import type { CSSProperties, ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Minus, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Readiness } from '../../domain/types'
import { cx, fmtDuration } from '../../lib/util'

/** Readiness is a decision, so it is always a word + an icon + a status colour (never colour alone). */
export const READINESS_UI: Record<Readiness, { word: string; sentence: string; Icon: LucideIcon; text: string; soft: string; line: string }> = {
  GREEN: { word: 'Ready', sentence: 'Ready to train as planned.', Icon: CircleCheck, text: 'text-ok', soft: 'bg-ok/10', line: 'border-ok/30' },
  AMBER: { word: 'Modify', sentence: 'Train, with adjustments.', Icon: TriangleAlert, text: 'text-warn', soft: 'bg-warn/10', line: 'border-warn/30' },
  RED: { word: 'Recover', sentence: 'Protect and recover today.', Icon: CircleAlert, text: 'text-stop', soft: 'bg-stop/10', line: 'border-stop/30' },
}

export const GATE_UI = { OK: READINESS_UI.GREEN, AMBER: READINESS_UI.AMBER, RED: READINESS_UI.RED } as const

export function greeting(hour: number): string {
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** One staggered entrance per screen: wrap each top-level block, counting `i` upwards. */
export function Rise({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={cx('anim-rise', className)} style={{ '--i': i } as CSSProperties}>
      {children}
    </div>
  )
}

const DURATION_SIZE = { md: 'text-4xl', lg: 'text-5xl', xl: 'text-7xl' } as const

/** "6h 10m" with condensed numerals and small muted units. */
export function Duration({ min, size = 'lg', className }: { min: number; size?: keyof typeof DURATION_SIZE; className?: string }) {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  return (
    <span className={cx('inline-flex items-baseline gap-1 whitespace-nowrap', className)} aria-label={fmtDuration(total)}>
      <span className={cx('num', DURATION_SIZE[size])} aria-hidden>{h}</span>
      <span className="text-sm font-medium text-muted mr-1" aria-hidden>h</span>
      <span className={cx('num', DURATION_SIZE[size])} aria-hidden>{String(m).padStart(2, '0')}</span>
      <span className="text-sm font-medium text-muted" aria-hidden>m</span>
    </span>
  )
}

export type DeltaDir = 'up' | 'down' | 'flat'

/** Last night against a personal average; ±15 min counts as "on average". */
export function sleepDelta(lastMin: number, avgMin: number | null): { dir: DeltaDir; text: string } | null {
  if (avgMin == null) return null
  const diff = lastMin - avgMin
  if (diff <= -15) return { dir: 'down', text: `${fmtDuration(-diff)} below your 7-day average` }
  if (diff >= 15) return { dir: 'up', text: `${fmtDuration(diff)} above your 7-day average` }
  return { dir: 'flat', text: 'On your 7-day average' }
}

const DELTA_ICON: Record<DeltaDir, LucideIcon> = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }

/** Direction is carried by the arrow and the words, so the line stays neutral in colour. */
export function DeltaLine({ dir, children, className }: { dir: DeltaDir; children: ReactNode; className?: string }) {
  const Icon = DELTA_ICON[dir]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm text-muted', className)}>
      <Icon size={16} className="shrink-0 text-pillar" aria-hidden />
      <span>{children}</span>
    </span>
  )
}

/** Bulleted advice / reasons list used in sheets and result panels. */
export function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cx('flex flex-col gap-2', className)}>
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[15px] leading-snug">
          <span className="mt-[9px] h-1 w-1 rounded-full bg-muted shrink-0" aria-hidden />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  )
}
