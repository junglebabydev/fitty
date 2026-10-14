// Pieces shared by Today (screens/Blueprint.tsx) and a workout's intro (screens/WorkoutIntro.tsx): the class art and the
// Start buttons.
import { Check, MessageSquare, Play } from 'lucide-react'
import type { WorkoutSession } from '../../domain/types'
import { Button } from '../../components'
import { cx } from '../../lib/util'
import { KIND_META, type DayKind } from './week'

/** Hard classes that end with a bedtime note. */
export const LATE_KINDS: DayKind[] = ['hiit', 'summit']

/** Other series' workouts: one deep neutral, so white type reads on it in both themes. */
export const OTHER_ART = '#3a3a3c'

/** A workout's name, big and white on its colour, as the studio screens show it. `small` for a tile. */
export function WorkoutArt({ label, color, small, className }: { label: string; color: string; small?: boolean; className?: string }) {
  // A long series name ("Bodyweight Anywhere") steps down a size so its longest word fits at 375 px.
  const size = small ? 'text-[22px]' : label.length > 9 ? 'text-[40px]' : 'text-[56px]'
  return (
    <span aria-hidden className={cx('flex items-center justify-center overflow-hidden px-3', className)} style={{ background: color }}>
      <span className={cx('text-center font-display font-black uppercase italic leading-none tracking-tight text-white', size)}>
        {label}
      </span>
    </span>
  )
}

export function KindArt({ kind, small, className }: { kind: DayKind; small?: boolean; className?: string }) {
  const meta = KIND_META[kind]
  return <WorkoutArt label={meta.label} color={meta.color} small={small} className={className} />
}

export type StartMode = 'player' | 'coach'

/**
 * Start (or Resume, or the summary once done) and "Do it with Coach", for today's row of a workout. `later` is a day
 * other than today in the week strip: its Start reads "Do it today".
 */
export function StartButtons({ status, later, onGo }: { status: WorkoutSession['status'] | null; later?: boolean; onGo: (mode: StartMode) => void }) {
  if (status === 'completed') {
    return <Button variant="secondary" size="lg" full icon={<Check size={18} />} onClick={() => onGo('player')}>Done · See summary</Button>
  }
  return (
    <div className="flex flex-col gap-2">
      {status === 'in_progress'
        ? <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={() => onGo('player')}>Resume</Button>
        : later
          ? <Button variant="secondary" size="lg" full onClick={() => onGo('player')}>Do it today</Button>
          : <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={() => onGo('player')}>Start</Button>}
      <Button variant="secondary" size="lg" full icon={<MessageSquare size={18} />} onClick={() => onGo('coach')}>
        {status === 'in_progress' ? 'Continue with Coach' : 'Do it with Coach'}
      </Button>
    </div>
  )
}
