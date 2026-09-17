// Visual building blocks shared by the AI plan preview, routine sheets and the session preview.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, PlayCircle } from 'lucide-react'
import type { Exercise } from '../../domain/types'
import { ExerciseVisual, MuscleMap } from '../../components'
import { exerciseMedia } from '../../data/exerciseMedia'
import { TIMED_IDS } from '../../engine'
import { cx } from '../../lib/util'
import { fmtSec } from './helpers'
import { musclesOf } from './routines'

export interface VisualRow {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  note?: string
}

/** "3 × 8–12" or "2 × 30–45 s". */
export function setsLine(row: VisualRow, ex: Exercise | undefined): string {
  const timed = !!ex && (ex.timed || TIMED_IDS.has(ex.id))
  if (timed) return `${row.sets} × ${row.repMax >= 120 ? fmtSec(row.repMax) : `${row.repMin}–${row.repMax} s`}`
  return `${row.sets} × ${row.repMin === row.repMax ? row.repMin : `${row.repMin}–${row.repMax}`}`
}

/** External form demo (YouTube search). Opens in a new tab and never passes the opener. */
export function DemoLink({ exercise, className, label = 'Demo' }: { exercise: Exercise; className?: string; label?: string }) {
  return (
    <a
      href={exerciseMedia(exercise.id).demoUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch a ${exercise.name} demo (opens in a new tab)`}
      className={cx('press inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-sm font-semibold text-pillar', className)}
    >
      <PlayCircle size={16} aria-hidden />{label}
    </a>
  )
}

/** Two-column grid of exercise cards: visual, name, sets × reps, Demo and (optionally) a swap button. */
export function ExerciseGrid({ rows, byId, onSwap }: { rows: VisualRow[]; byId: Map<string, Exercise>; onSwap?: (index: number) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {rows.map((r, i) => {
        const ex = byId.get(r.exerciseId)
        if (!ex) return null
        return (
          <li key={`${r.exerciseId}-${i}`} className="rounded-2xl border border-line bg-surface-2 p-2 flex flex-col min-w-0">
            <Link to={`/train/exercise/${ex.id}`} aria-label={`${ex.name} details`} className="press block">
              <ExerciseVisual exercise={ex} size="card" />
              <span className="block mt-2 px-1 font-semibold text-[14px] leading-tight line-clamp-2 min-h-[2.2em] text-app">{ex.name}</span>
            </Link>
            <span className="px-1 mt-0.5 num text-xl text-app">{setsLine(r, ex)}</span>
            <div className="mt-auto pt-1 flex items-center justify-between">
              <DemoLink exercise={ex} className="-ml-2" />
              {onSwap && (
                <button type="button" onClick={() => onSwap(i)} aria-label={`Swap ${ex.name}`} className="press h-11 w-11 -mr-1 rounded-xl inline-flex items-center justify-center text-muted">
                  <ArrowLeftRight size={17} aria-hidden />
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Muscle map of everything a list of exercises trains, with a slot beside it for the numbers. */
export function MuscleSummary({ exerciseIds, byId, size = 132, children }: { exerciseIds: string[]; byId: Map<string, Exercise>; size?: number; children?: ReactNode }) {
  const m = musclesOf(exerciseIds, byId)
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <MuscleMap primary={m.primary} secondary={m.secondary} size={size} pillar="train" ariaLabel={m.primary.length ? `Trains ${m.primary.join(', ')}` : 'Muscles trained'} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
