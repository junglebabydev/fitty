// The programme cover (docs/PRD_TRAINING_PROGRAMS.md §4.2): the programme's own shape, one bar per week, drawn from
// its data. No images: inline bars in theme tokens. Needs a `data-pillar` ancestor for the hue.
import { useMemo } from 'react'
import type { Block, Program } from '../../domain/programs'
import { expandSessions } from '../../engine'
import { cx } from '../../lib/util'

export interface WeekBar {
  week: number
  /** Working sets, or work minutes for interval and steady series. */
  value: number
  /** 0.2–1, normalised across the programme's weeks. */
  height: number
  /** First week of a later stage (Postpartum): drawn after a small gap, the gate. */
  stageStart: boolean
}

const FLOOR = 0.2

const timed = (b: Block) => b.shape === 'intervals' || b.shape === 'steady'

function workMinutes(b: Block): number {
  if (b.shape === 'intervals') return (b.rounds * b.work.seconds) / 60
  if (b.shape === 'steady') return b.minutes
  if (b.shape === 'circuit') return (b.rounds * b.stations.reduce((n, s) => n + (s.seconds ?? 0), 0)) / 60
  return 0
}

function workSets(b: Block): number {
  if (b.shape === 'sets') return b.sets
  if (b.shape === 'circuit') return b.rounds * b.stations.length
  return 0
}

/**
 * One bar per programme week on the standard path. Set-based series count working sets; series made mostly of
 * intervals and steady blocks count work minutes. Warm-ups, cool-downs and rests are left out. Heights run from
 * 0.2 (the lightest week) to 1 (the heaviest), so the shape shows even when weeks differ a little.
 */
export function weekShape(p: Program): WeekBar[] {
  const sessions = expandSessions(p)
  const work = sessions.flatMap((s) => s.blocks.filter((b) => !b.role))
  const byTime = work.filter(timed).length > work.length / 2
  const values = Array.from({ length: p.weeks }, (_, i) =>
    sessions
      .filter((s) => s.week === i + 1)
      .flatMap((s) => s.blocks.filter((b) => !b.role))
      .reduce((n, b) => n + (byTime ? workMinutes(b) : workSets(b)), 0),
  )
  const min = Math.min(...values)
  const max = Math.max(...values)
  const stageStarts = new Set((p.stages ?? []).map((s) => s.weeks[0]).filter((w) => w > 1))
  return values.map((value, i) => ({
    week: i + 1,
    value,
    height: max === min ? (max > 0 ? 1 : FLOOR) : FLOOR + ((1 - FLOOR) * (value - min)) / (max - min),
    stageStart: stageStarts.has(i + 1),
  }))
}

export interface ProgramCoverProps {
  program: Program
  /** card: the enrolled card (56 px). tile: gallery tiles and Start now cards (40 px). */
  size?: 'card' | 'tile'
  /** The enrolment's week: earlier weeks solid, this one outlined, later ones faded. Omit for a plain cover. */
  currentWeek?: number
  className?: string
}

export function ProgramCover({ program, size = 'card', currentWeek, className }: ProgramCoverProps) {
  const bars = useMemo(() => weekShape(program), [program])
  const card = size === 'card'
  return (
    <div aria-hidden className={cx('flex items-end', card ? 'h-14 gap-1.5' : 'h-10 gap-[3px]', className)}>
      {bars.map((b) => {
        const current = currentWeek === b.week
        const future = currentWeek != null && b.week > currentWeek
        return (
          <span
            key={b.week}
            className={cx(
              'flex h-full min-w-0 flex-1 flex-col',
              b.stageStart && (card ? 'ml-2' : 'ml-1'),
              current && 'rounded-lg border-2 border-pillar p-0.5',
              future && 'opacity-35',
            )}
          >
            <span className={cx('flex flex-1 flex-col justify-end overflow-hidden bg-surface-2', card ? 'rounded' : 'rounded-[2px]')}>
              <span className="block bg-pillar" style={{ height: `${Math.round(b.height * 100)}%` }} />
            </span>
          </span>
        )
      })}
    </div>
  )
}
