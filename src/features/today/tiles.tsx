// Today's 2 × 2 pillar tiles (DESIGN §10.1): one visual + one number or one short line each,
// ≤ 8 words, the whole tile is the tap target. Display only — no data access, no writes.
import type { ReactNode } from 'react'
import type { Exercise } from '../../domain/types'
import { ExerciseVisual, PILLARS, Ring, type PillarKey } from '../../components'
import { fmtDuration } from '../../lib/util'
import { MoodOrb } from '../mind/MoodOrb'

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-SG')

function Tile({ pillar, onClick, ariaLabel, children }: { pillar: PillarKey; onClick: () => void; ariaLabel: string; children: ReactNode }) {
  const meta = PILLARS[pillar]
  const Icon = meta.icon
  return (
    <button
      type="button"
      data-pillar={pillar}
      onClick={onClick}
      aria-label={ariaLabel}
      className="press flex min-h-[124px] min-w-0 flex-col justify-between gap-3 rounded-[1.25rem] border border-line bg-surface p-3.5 text-left active:bg-surface-2"
    >
      <span className="eyebrow flex items-center gap-1.5 text-pillar">
        <Icon size={14} strokeWidth={2.25} aria-hidden />
        {meta.label}
      </span>
      <span className="flex min-w-0 items-center gap-3">{children}</span>
    </button>
  )
}

/** Condensed numeral with a small muted unit. */
function Num({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="num text-[1.75rem] leading-none">{value}</span>
      <span className="text-xs font-medium text-muted">{unit}</span>
    </span>
  )
}

const LINE = 'block truncate text-[13px] leading-tight text-muted'

export function TrainTile({ name, minutes, when, exercise, onClick }: {
  /** Next session, or null on a free day. */
  name: string | null
  minutes: number | null
  /** "Thu" when the next session is not today. */
  when: string | null
  exercise: Exercise | null
  onClick: () => void
}) {
  if (!name) {
    return (
      <Tile pillar="train" onClick={onClick} ariaLabel="Train: nothing scheduled. Open the plan">
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-tight">Free day</span>
          <span className={LINE}>Open the plan</span>
        </span>
      </Tile>
    )
  }
  return (
    <Tile pillar="train" onClick={onClick} ariaLabel={`Train: ${name}${when ? `, ${when}` : ''}${minutes ? `, about ${minutes} minutes` : ''}. Open`}>
      {exercise && <ExerciseVisual exercise={exercise} size="thumb" />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{name}</span>
        <span className={LINE}>{[when, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ')}</span>
      </span>
    </Tile>
  )
}

export function EatTile({ proteinG, proteinTarget, kcal, kcalTarget, onClick }: {
  proteinG: number; proteinTarget: number; kcal: number; kcalTarget: number; onClick: () => void
}) {
  const left = Math.round(kcalTarget - kcal)
  // Nutrition never turns red: over target keeps the hue and shows +N.
  const kcalText = left >= 0 ? fmtInt(left) : `+${fmtInt(-left)}`
  return (
    <Tile
      pillar="eat"
      onClick={onClick}
      ariaLabel={`Eat: ${Math.round(proteinG)} of ${Math.round(proteinTarget)} grams protein, ${left >= 0 ? `${fmtInt(left)} kcal left` : `${fmtInt(-left)} kcal over target`}. Open`}
    >
      <Ring value={proteinG} max={proteinTarget} size={56} stroke={6} pillar="eat" ariaLabel={`Protein ${Math.round(proteinG)} of ${Math.round(proteinTarget)} g`}>
        <span className="num text-lg leading-none">{Math.round(proteinG)}</span>
        <span className="text-[10px] font-medium leading-none text-muted">g P</span>
      </Ring>
      <span className="min-w-0">
        <Num value={kcalText} unit="kcal" />
        <span className={LINE}>{left >= 0 ? 'left today' : 'over target'}</span>
      </span>
    </Tile>
  )
}

export function RestTile({ lastMin, avgMin, onClick }: { lastMin: number | null; avgMin: number | null; onClick: () => void }) {
  if (lastMin == null) {
    return (
      <Tile pillar="rest" onClick={onClick} ariaLabel="Rest: no record for last night. Log sleep">
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-tight">Log sleep</span>
          <span className={LINE}>No record last night</span>
        </span>
      </Tile>
    )
  }
  const h = Math.floor(lastMin / 60)
  const m = Math.round(lastMin % 60)
  const scale = Math.max(lastMin, avgMin ?? 0, 480) * 1.05
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  return (
    <Tile pillar="rest" onClick={onClick} ariaLabel={`Rest: ${fmtDuration(lastMin)} last night${avgMin != null ? `, 7-day average ${fmtDuration(avgMin)}` : ''}. Open`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="num text-[1.75rem] leading-none">{h}</span>
          <span className="mr-1 text-xs font-medium text-muted">h</span>
          <span className="num text-[1.75rem] leading-none">{String(m).padStart(2, '0')}</span>
          <span className="text-xs font-medium text-muted">m</span>
        </span>
        {/* Tiny bar: last night's fill against a tick at the 7-day average. */}
        <span className="relative mt-2.5 block h-1.5 w-full rounded-full bg-pillar-soft" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full bg-pillar" style={{ width: pct(lastMin) }} />
          {avgMin != null && <span className="absolute -inset-y-1 w-0.5 rounded-full" style={{ left: pct(avgMin), backgroundColor: 'var(--c-fg)' }} />}
        </span>
        <span className={`${LINE} mt-1.5`}>{avgMin != null ? `avg ${fmtDuration(avgMin)}` : 'last night'}</span>
      </span>
    </Tile>
  )
}

export function MindTile({ valence, word, onClick }: { valence: number | null; word: string | null; onClick: () => void }) {
  return (
    <Tile pillar="mind" onClick={onClick} ariaLabel={word ? `Mind: ${word} today. Open` : 'Mind: no check-in yet. Check in'}>
      <span className="shrink-0" aria-hidden><MoodOrb valence={valence} size={44} /></span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{word ?? 'Check in'}</span>
        <span className={LINE}>{word ? 'today' : '20 seconds'}</span>
      </span>
    </Tile>
  )
}
