import { useEffect, useState } from 'react'
import { Activity, Bike, Cable, Cog, Dumbbell, Footprints, PersonStanding, StretchHorizontal, Waves, type LucideIcon } from 'lucide-react'
import type { Exercise } from '../domain/types'
import { exerciseMedia } from '../data/exerciseMedia'
import { cx } from '../lib/util'
import { MuscleMap } from './MuscleMap'

export interface ExerciseVisualProps {
  exercise: Exercise
  /** thumb 56 × 56 · card 16:10 · hero full-width 4:3 */
  size?: 'thumb' | 'card' | 'hero'
  className?: string
}

const EQUIPMENT_ICON: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  machine: Cog,
  cable: Cable,
  bodyweight: PersonStanding,
  band: StretchHorizontal,
  bike: Bike,
  treadmill: Footprints,
  elliptical: Activity,
  pool: Waves,
}

const FRAME: Record<NonNullable<ExerciseVisualProps['size']>, string> = {
  thumb: 'h-14 w-14 shrink-0 rounded-2xl',
  card: 'aspect-[16/10] w-full rounded-2xl',
  hero: 'aspect-[4/3] w-full rounded-2xl',
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/** Photo when the exercise has a verified one; otherwise (or on load error) a tinted MuscleMap tile. */
export function ExerciseVisual({ exercise, size = 'card', className }: ExerciseVisualProps) {
  const { images } = exerciseMedia(exercise.id)
  const [failed, setFailed] = useState(false)
  const [frame, setFrame] = useState(0)
  const reduced = usePrefersReducedMotion()

  // A new exercise gets a fresh chance to load its photo.
  useEffect(() => { setFailed(false); setFrame(0) }, [exercise.id])

  const showPhoto = images.length > 0 && !failed
  const crossfade = showPhoto && size === 'hero' && images.length > 1 && !reduced

  useEffect(() => {
    if (!crossfade) { setFrame(0); return }
    const t = window.setInterval(() => setFrame((f) => (f + 1) % 2), 1600)
    return () => window.clearInterval(t)
  }, [crossfade])

  const map = (h: number, view: 'both' | 'front' | 'back' = 'both') => (
    <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={h} view={view} ariaLabel="" />
  )

  if (showPhoto) {
    const shown = size === 'hero' ? images.slice(0, 2) : images.slice(0, 1)
    return (
      <div
        role="img"
        aria-label={exercise.name}
        className={cx('relative isolate overflow-hidden border border-line bg-surface-2', FRAME[size], className)}
      >
        {shown.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: i === 0 ? 1 : frame === 1 ? 1 : 0, transition: crossfade ? 'opacity 700ms ease-in-out' : undefined }}
          />
        ))}
        {size !== 'thumb' && (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" />
            <div aria-hidden className="glass absolute bottom-2 right-2 rounded-xl border border-line p-1.5">
              {map(size === 'hero' ? 56 : 36)}
            </div>
          </>
        )}
      </div>
    )
  }

  const Icon = EQUIPMENT_ICON[exercise.equipment] ?? Dumbbell
  return (
    <div
      role="img"
      aria-label={exercise.name}
      className={cx('relative flex items-center justify-center overflow-hidden border border-pillar-line bg-pillar-soft', FRAME[size], className)}
    >
      {size !== 'thumb' && (
        <span aria-hidden className="absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-pillar">
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      {/* The figure scales with the tile: the SVG's own size is only a fallback for the CSS height. */}
      <span aria-hidden className="flex h-[82%] items-center justify-center [&>svg]:h-full [&>svg]:w-auto">
        {map(size === 'thumb' ? 46 : 160, size === 'thumb' ? pickThumbView(exercise) : 'both')}
      </span>
    </div>
  )
}

const BACK_HINTS = /back|lat|trap|rear|glute|hamstring|tricep|calves|calf/

/** A thumb only fits one figure: show the side that carries the primary muscles. */
function pickThumbView(exercise: Exercise): 'front' | 'back' {
  const first = (exercise.primaryMuscles[0] ?? '').toLowerCase()
  return BACK_HINTS.test(first) ? 'back' : 'front'
}
