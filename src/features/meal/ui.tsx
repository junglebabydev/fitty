// Shared Eat-area UI pieces (Eat, MealReview, FoodSearch): portion chips, macro
// read-outs, the confidence pill, result rows and the 7-day intake strip.
// Presentation only — all maths lives in ./draft.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { Macros } from '../../domain/types'
import { FoodGlyph, INPUT_BASE, NumberInput, fmtInt } from '../../components'
import { cx, dayName, fmtDate } from '../../lib/util'
import {
  MEAL_TYPES, MEAL_TYPE_LABELS, PORTION_FACTORS, confidenceBand, fmtG, portionFactor, type MealType,
} from './draft'

const round1 = (n: number) => Math.round(n * 10) / 10

// --- portions --------------------------------------------------------------------

/** 0.5× / 1× / 1.5× / 2× chips, relative to `baseG`. */
export function PortionChips({ name, baseG, grams, onChange, className }: {
  /** Food name, for the accessible labels. */
  name: string
  baseG: number
  grams: number | null
  onChange: (grams: number) => void
  className?: string
}) {
  const active = grams == null ? null : portionFactor(baseG, grams)
  const usable = baseG > 0
  return (
    <div className={cx('grid grid-cols-4 gap-1.5', className)} role="group" aria-label={`${name || 'Food'} portion`}>
      {PORTION_FACTORS.map((f) => {
        const on = active === f
        return (
          <button
            key={f}
            type="button"
            disabled={!usable}
            aria-pressed={on}
            aria-label={`${f} times, ${fmtG(baseG * f)}`}
            onClick={() => onChange(round1(baseG * f))}
            className={cx(
              'press h-11 rounded-xl border num text-[19px] disabled:opacity-40',
              on ? 'bg-pillar-soft border-pillar-line text-app' : 'bg-surface-2 border-transparent text-muted',
            )}
          >
            {f}×
          </button>
        )
      })}
    </div>
  )
}

/** Portion chips beside a grams field (quantity sheet). */
export function PortionControl({ name, baseG, grams, onChange, autoFocus }: {
  name: string
  baseG: number
  grams: number | null
  onChange: (grams: number | null) => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid grid-cols-[minmax(0,2.6fr)_minmax(96px,1fr)] gap-1.5 items-center">
      <PortionChips name={name} baseG={baseG} grams={grams} onChange={onChange} />
      <NumberInput value={grams} onChange={onChange} unit="g" min={0} step={10} autoFocus={autoFocus} aria-label={`${name || 'Food'} grams`} />
    </div>
  )
}

// --- hero rings ------------------------------------------------------------------

const RING_R = 44
const RING_C = 2 * Math.PI * RING_R

/**
 * One hero ring with a huge numeral inside. `tone` is a text colour class
 * (the arc uses currentColor). Going past the target keeps the hue: the ring
 * stays full and the remaining view shows "+N".
 */
export function MacroRing({ label, unit, value, target, mode, tone }: {
  label: string
  unit: string
  value: number
  target: number
  mode: 'consumed' | 'remaining'
  tone: string
}) {
  const diff = Math.round(target - value)
  const over = target > 0 && diff < 0
  const frac = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0
  const dash = RING_C * frac
  const hero = mode === 'remaining' ? (over ? `+${fmtInt(-diff)}` : fmtInt(Math.max(0, diff))) : fmtInt(value)
  const caption = mode === 'remaining' ? `${unit} ${over ? 'over' : 'left'}` : `of ${fmtInt(target)} ${unit}`
  return (
    <div className={cx('relative w-full max-w-[160px] aspect-square mx-auto', tone)}>
      <svg viewBox="0 0 100 100" className="block w-full h-full" aria-hidden>
        <circle cx="50" cy="50" r={RING_R} fill="none" stroke="currentColor" strokeWidth="7" opacity="0.14" />
        {frac > 0 && (
          <circle
            cx="50" cy="50" r={RING_R} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${dash} ${RING_C}`}
            transform="rotate(-90 50 50)"
            className="anim-draw"
            style={{ '--dash-from': dash, transition: 'stroke-dasharray 600ms var(--ease-out-soft)' } as CSSProperties}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="eyebrow">{label}</span>
        <span className="num text-5xl mt-1 text-app">{hero}</span>
        <span className="text-[12px] font-medium text-muted mt-1">{caption}</span>
      </div>
    </div>
  )
}

/** Meal thumbnail: the photo when there is one, otherwise a FoodGlyph tile. */
export function MealThumb({ photo, name, size = 64 }: { photo: string | null; name: string; size?: number }) {
  if (!photo) return <FoodGlyph name={name} size={size} />
  return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-2xl object-cover border border-line" style={{ width: size, height: size }} />
}

// --- macros ----------------------------------------------------------------------

/** kcal + protein as the two numerals that matter; carbs and fat stay small. */
export function MacroReadout({ m, size = 'md', className }: { m: Macros; size?: 'md' | 'lg'; className?: string }) {
  const big = size === 'lg' ? 'text-4xl' : 'text-[26px]'
  return (
    <div className={cx('flex items-end gap-4', className)} aria-live="polite">
      <div className="flex items-baseline gap-1">
        <span className={cx('num', big)}>{fmtInt(m.kcal)}</span>
        <span className="text-sm font-medium text-muted">kcal</span>
      </div>
      <div className="flex items-baseline gap-1 text-protein">
        <span className={cx('num', big)}>{fmtInt(m.proteinG)}</span>
        <span className="text-sm font-semibold">g protein</span>
      </div>
      <div className="ml-auto tnum text-[13px] text-muted pb-0.5 whitespace-nowrap">
        C {fmtInt(m.carbsG)} · F {fmtInt(m.fatG)} g
      </div>
    </div>
  )
}

// --- confidence ------------------------------------------------------------------

/** Labelled pill: signal bars + word. Tapping it shows why the estimate is uncertain. */
export function ConfidencePill({ confidence, reason, prefix }: { confidence: number | null; reason?: string | null; prefix?: string }) {
  const [open, setOpen] = useState(false)
  const band = confidenceBand(confidence)
  if (!band) return null
  const why = reason?.trim() || null
  const label = `${prefix ? `${prefix} ` : ''}${band.word}`
  const inner = (
    <>
      <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx('w-[3px] rounded-[1px]', n <= band.level ? 'bg-accent' : 'bg-line-strong')} style={{ height: 4 + n * 3 }} />
        ))}
      </span>
      <span>{label}</span>
      <span className="tnum text-faint">{band.pct}%</span>
    </>
  )
  const pill = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-[13px] font-medium text-muted'
  if (!why) return <span className={cx(pill, 'h-7')} aria-label={`Confidence ${band.word}, ${band.pct}%`}>{inner}</span>
  return (
    <div>
      {/* 28px pill inside a 44px hit area */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Confidence ${band.word}, ${band.pct}%. ${open ? 'Hide' : 'Show'} the reason`}
        className="press inline-flex items-center h-11 -my-2"
      >
        <span className={cx(pill, 'h-7 underline decoration-dotted underline-offset-4 decoration-line-strong')}>{inner}</span>
      </button>
      {open && <p className="text-[13px] leading-snug text-muted mt-1">{why}</p>}
    </div>
  )
}

// --- rows ------------------------------------------------------------------------

/** Result row: FoodGlyph, name + serving, then kcal and protein as aligned numerals. */
export function FoodRow({ name, detail, kcal, proteinG, glyph, onClick, actionLabel }: {
  name: string
  detail?: ReactNode
  kcal: number
  proteinG: number
  /** Text the glyph is chosen from (defaults to `name`). */
  glyph?: string
  onClick: () => void
  /** Verb for the accessible name, e.g. "Log" or "Add". */
  actionLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${actionLabel} ${name}, ${fmtInt(kcal)} kcal, ${fmtG(proteinG)} protein`}
      className="w-full min-h-[64px] flex items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2 transition-colors"
    >
      <FoodGlyph name={glyph ?? name} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium leading-tight line-clamp-2">{name}</span>
        {detail && <span className="block text-[13px] text-muted mt-0.5 truncate">{detail}</span>}
      </span>
      <span className="shrink-0 w-11 text-right">
        <span className="block num text-[20px]">{fmtInt(kcal)}</span>
        <span className="block text-[12px] text-muted leading-tight">kcal</span>
      </span>
      <span className="shrink-0 w-12 text-right text-protein">
        <span className="block"><span className="num text-[20px]">{fmtInt(proteinG)}</span><span className="text-[12px] font-medium ml-0.5">g</span></span>
        <span className="block text-[12px] font-medium leading-tight">protein</span>
      </span>
      <Plus size={18} className="shrink-0 text-faint" aria-hidden />
    </button>
  )
}

/** Hairline list container with inset dividers between children. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-[1.25rem] border border-line bg-surface overflow-hidden divide-y divide-line', className)}>
      {children}
    </div>
  )
}

/** `eyebrow` section label with an optional quiet note on the right. */
export function SectionLabel({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 px-1 mb-2', className)}>
      <h2 className="eyebrow text-muted">{children}</h2>
      {note && <span className="text-[12px] text-faint text-right">{note}</span>}
    </div>
  )
}

// --- meal type -------------------------------------------------------------------

/** Unobtrusive meal-type selector; the value is pre-filled from the time of day. */
export function MealTypeSelect({ id, value, onChange }: { id: string; value: MealType; onChange: (v: MealType) => void }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as MealType)}
        className={cx(INPUT_BASE, 'h-12 appearance-none pr-10')}
      >
        {MEAL_TYPES.map((t) => <option key={t} value={t}>{MEAL_TYPE_LABELS[t]}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden />
    </div>
  )
}

// --- 7-day intake strip ------------------------------------------------------------

export interface IntakeDay { date: string; kcal: number; proteinG: number; logged: boolean }

const BAR_H = 28
/** Bars are scaled so the target sits at 80% of the height, leaving headroom above it. */
const HEADROOM = 1.25
const barPx = (value: number, target: number) => (target > 0 ? Math.min(1, value / (target * HEADROOM)) * BAR_H : 0)

/** Average of the logged days, for the Info sheet. */
export function intakeAverage(days: IntakeDay[]): { kcal: number; proteinG: number; logged: number } {
  const logged = days.filter((d) => d.logged)
  const n = logged.length
  return {
    kcal: n ? logged.reduce((s, d) => s + d.kcal, 0) / n : 0,
    proteinG: n ? logged.reduce((s, d) => s + d.proteinG, 0) / n : 0,
    logged: n,
  }
}

/**
 * Compact 7-day strip (56 px): a wide neutral kcal bar and a slim protein bar
 * per day against one dashed target line. Today is boxed; the selected day is
 * filled. Going past the target keeps the same colours ("+N" is in the label).
 */
export function IntakeStrip({ days, kcalTarget, proteinTarget, today, selected, onSelect, notes }: {
  days: IntakeDay[]
  kcalTarget: number
  proteinTarget: number
  today: string
  selected: string
  onSelect: (date: string) => void
  /** Optional per-date note (e.g. "fasting day") for the accessible label. */
  notes?: Record<string, string>
}) {
  return (
    <section aria-label="Intake over these 7 days, kcal and protein bars against the target line" className="relative">
      <div className="absolute inset-x-1 border-t border-dashed border-line-strong pointer-events-none" style={{ top: 1 + 5 + BAR_H * (1 - 1 / HEADROOM) }} aria-hidden />
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const isToday = d.date === today
          const isSel = d.date === selected
          const future = d.date > today
          const over = Math.round(d.kcal - kcalTarget)
          const note = notes?.[d.date]
          const label = `${dayName(d.date)} ${fmtDate(d.date)}${isToday ? ', today' : ''}: ${
            d.logged
              ? `${fmtInt(d.kcal)} kcal${over > 0 ? ` (+${fmtInt(over)})` : ''}, ${fmtInt(d.proteinG)} g protein`
              : note ?? (future ? 'upcoming' : 'nothing logged')
          }`
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelect(d.date)}
              aria-label={label}
              aria-pressed={isSel}
              aria-current={isToday ? 'date' : undefined}
              className={cx(
                'press h-14 flex flex-col items-center justify-between rounded-xl border pt-[5px] pb-1.5',
                isSel ? 'bg-pillar-soft border-pillar-line' : isToday ? 'border-line-strong' : 'border-transparent',
              )}
            >
              <span className="flex items-end justify-center gap-[3px]" style={{ height: BAR_H }}>
                {d.logged ? (
                  <>
                    <span className="w-[11px] rounded-t-[3px] bg-accent/75" style={{ height: Math.max(2, barPx(d.kcal, kcalTarget)) }} />
                    <span className="w-[4px] rounded-t-[2px] bg-protein" style={{ height: Math.max(2, barPx(d.proteinG, proteinTarget)) }} />
                  </>
                ) : (
                  <span className="w-[18px] h-[2px] rounded-full bg-line-strong" />
                )}
              </span>
              <span className={cx('text-[12px] leading-none', isToday || isSel ? 'font-semibold text-app' : 'text-muted')}>
                {dayName(d.date).slice(0, 2)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
