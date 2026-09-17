import type { ReactNode } from 'react'
import { cx } from '../lib/util'
import { fmtInt } from './util'

export interface MacroRowProps {
  kcal: number
  kcalTarget: number
  protein: number
  proteinTarget: number
  carbs: number
  fat: number
  carbsTarget?: number
  fatTarget?: number
  /** Optional element under the row (e.g. "Edit targets" link). */
  footer?: ReactNode
  className?: string
  /** Which number is the hero: what has been eaten (default) or what is left. */
  mode?: 'consumed' | 'remaining'
}

interface HeroProps {
  label: string
  unit: string
  value: number
  target: number
  mode: 'consumed' | 'remaining'
  /** Literal classes: numeral/eyebrow colour and bar fill. */
  text: string
  fill: string
}

/**
 * One hero block. Going over target never changes the hue: the bar stays full,
 * a tick marks where the target sits and the text reads `+N`.
 */
function MacroHero({ label, unit, value, target, mode, text, fill }: HeroProps) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0
  const diff = Math.round(target - v) // > 0 left, < 0 over
  const over = target > 0 && diff < 0
  const fillPct = target > 0 ? Math.min(100, (v / Math.max(target, v)) * 100) : 0
  const tickPct = over ? (target / v) * 100 : null

  const hero = mode === 'remaining' ? (over ? `+${fmtInt(-diff)}` : fmtInt(Math.max(0, diff))) : fmtInt(v)
  const eyebrow = mode === 'remaining' ? (over ? `${label} over` : `${label} left`) : label
  const caption =
    mode === 'remaining'
      ? `${fmtInt(v)} of ${fmtInt(target)} ${unit}`
      : over
        ? `+${fmtInt(-diff)} · of ${fmtInt(target)} ${unit}`
        : diff === 0
          ? `of ${fmtInt(target)} ${unit} · on target`
          : `of ${fmtInt(target)} ${unit} · ${fmtInt(diff)} left`

  return (
    <div className="min-w-0">
      <div className={cx('eyebrow truncate', text)}>{eyebrow}</div>
      <div className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap">
        <span className={cx('num text-5xl', text)}>{hero}</span>
        <span className="text-sm font-medium text-muted">{unit}</span>
      </div>
      <div
        className="relative mt-3 h-1.5 rounded-full bg-surface-3"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target > 0 ? target : undefined}
        aria-valuenow={v}
        aria-valuetext={`${fmtInt(v)} of ${fmtInt(target)} ${unit}`}
      >
        <div className={cx('h-full rounded-full transition-[width] duration-500 ease-out', fill)} style={{ width: `${fillPct}%` }} />
        {tickPct !== null && (
          <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-app ring-1 ring-line-strong" style={{ left: `${tickPct}%` }} aria-hidden />
        )}
      </div>
      <div className="tnum mt-2 truncate text-[13px] text-muted">{caption}</div>
    </div>
  )
}

function Minor({ label, value, target, text }: { label: string; value: number; target?: number; text: string }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cx('eyebrow', text)}>{label}</span>
      <span className="num text-xl text-app">{fmtInt(value)}</span>
      <span className="tnum text-[13px] text-muted">{target !== undefined ? `/ ${fmtInt(target)} g` : 'g'}</span>
    </div>
  )
}

/**
 * Calories and protein as two equal hero blocks (huge numeral + thin bar);
 * carbs and fat as small numerals. Calories stay neutral bone, protein carries
 * its macro hue. Adherence-neutral: nothing turns red or amber.
 */
export function MacroRow({
  kcal,
  kcalTarget,
  protein,
  proteinTarget,
  carbs,
  fat,
  carbsTarget,
  fatTarget,
  footer,
  className,
  mode = 'consumed',
}: MacroRowProps) {
  return (
    <div className={cx('w-full', className)}>
      <div className="grid grid-cols-2 gap-5">
        <MacroHero label="Calories" unit="kcal" value={kcal} target={kcalTarget} mode={mode} text="text-app" fill="bg-accent" />
        <MacroHero label="Protein" unit="g" value={protein} target={proteinTarget} mode={mode} text="text-protein" fill="bg-protein" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3">
        <Minor label="Carbs" value={carbs} target={carbsTarget} text="text-carbs" />
        <Minor label="Fat" value={fat} target={fatTarget} text="text-fat" />
        {footer !== undefined && <span className="ml-auto text-[13px]">{footer}</span>}
      </div>
    </div>
  )
}
