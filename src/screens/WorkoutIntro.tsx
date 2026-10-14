// A workout's intro, opened from Today (today's class, or one of "More workouts"): its art and length, Start, then every
// move with a picture. Start goes straight in (features/blueprint/start.ts); "Do it with Coach" runs the same session as
// a chat (screens/CoachWorkout.tsx). Any programme's session: the BFT classes and the other series' start-now picks.
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Activity, ChevronRight, Dumbbell, HeartPulse, PersonStanding, StretchHorizontal, Wind, type LucideIcon } from 'lucide-react'
import type { Block } from '../domain/programs'
import type { Exercise } from '../domain/types'
import { EmptyState, ExerciseVisual, Screen } from '../components'
import { exerciseMedia } from '../data/exerciseMedia'
import { getProgram } from '../data/programs'
import { getSessions } from '../db/repositories'
import { useQuery } from '../hooks'
import { todayStr } from '../lib/util'
import { exerciseMap, libraryExercises } from '../features/workout/helpers'
import { programSession } from '../features/blueprint/session'
import { startToday } from '../features/blueprint/start'
import { KindArt, LATE_KINDS, OTHER_ART, StartButtons, WorkoutArt, type StartMode } from '../features/blueprint/ui'
import { WEEK_PROGRAM_ID, blockLine, keyKind, rowForDate, sections, sessionExerciseIds, stationLine } from '../features/blueprint/week'

export default function WorkoutIntroScreen() {
  const { programId = '', key = '' } = useParams()
  const navigate = useNavigate()
  const today = todayStr()
  const program = getProgram(programId)
  const week = programId === WEEK_PROGRAM_ID

  const data = useQuery(() => {
    const session = program ? programSession(program.id, key) : null
    if (!program || !session) return null
    return { session, byId: exerciseMap(libraryExercises()), row: rowForDate(getSessions(today, today), today, key, program.id) }
  }, [programId, key, today])

  if (!program || !data) {
    return (
      <Screen pillar="today" title="Workout" back="/" backLabel="Today">
        <EmptyState title="Workout not found" body="It may have been renamed. Pick another from Today." compact />
      </Screen>
    )
  }

  const { session, byId, row } = data
  const name = program.standalone.find((s) => s.sessionKey === key)?.name ?? session.name
  const moves = sessionExerciseIds(session).length
  const open = (id: number, mode: StartMode) => navigate(mode === 'coach' ? `/coach/workout/${id}` : `/train/session/${id}`)
  const go = (mode: StartMode) => open(row && row.status !== 'planned' ? row.id : startToday(key, today, program.id), mode)

  return (
    <Screen pillar="today" title={name} back="/" backLabel="Today">
      <div className="flex flex-col gap-6 pb-4">
        <article className="overflow-hidden rounded-[1.25rem] bg-surface">
          {week ? <KindArt kind={keyKind(key)} className="h-44 w-full" /> : <WorkoutArt label={program.title} color={OTHER_ART} className="h-44 w-full" />}
          <div className="p-4">
            <div className="eyebrow text-muted">{week ? 'BFT' : program.title}</div>
            <h2 className="m-0 mt-1 text-[24px] font-semibold leading-tight text-app">{name}</h2>
            <div className="mt-1.5 flex items-baseline gap-4 text-sm font-medium text-muted">
              <span><span className="num text-3xl text-app">{session.minutes}</span> min</span>
              <span><span className="num text-3xl text-app">{moves}</span> {moves === 1 ? 'move' : 'moves'}</span>
            </div>
            <div className="mt-4"><StartButtons status={row?.status ?? null} onGo={go} /></div>
            {week && LATE_KINDS.includes(keyKind(key)) && <p className="m-0 mt-2.5 text-center text-[13px] text-muted">Finish at least 4 hours before bed.</p>}
          </div>
        </article>

        {sections(session).map((sec, i) => (
          <section key={`${sec.title}-${i}`} aria-label={sec.title || undefined}>
            {sec.title && (
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="eyebrow m-0 text-muted">{sec.title}</h3>
                {sec.meta && <span className="text-[13px] font-medium text-faint">{sec.meta}</span>}
              </div>
            )}
            <ul className="divide-y divide-line overflow-hidden rounded-[1.25rem] bg-surface">
              {sec.blocks.flatMap(moveRows).map((m, j) => {
                const ex = byId.get(m.id)
                return ex ? <MoveRow key={`${m.id}-${j}`} exercise={ex} line={m.line} /> : null
              })}
            </ul>
          </section>
        ))}
      </div>
    </Screen>
  )
}

// --- moves -----------------------------------------------------------------------------------------------------

function moveRows(b: Block): { id: string; line: string }[] {
  if (b.shape === 'circuit') return b.stations.map((s) => ({ id: s.exerciseId, line: stationLine(s) }))
  const line = blockLine(b)
  if (b.shape === 'steady') return [{ id: b.exerciseId, line: `${line} · ${b.effort}` }]
  if (b.shape === 'intervals') return [{ id: b.work.exerciseId, line }]
  return [{ id: b.exerciseId, line }]
}

/** For moves with no drawing (tree pose, cobra, meditation …): an icon for the kind of move, never another move's picture. */
const PATTERN_ICON: Record<string, LucideIcon> = { mobility: StretchHorizontal, balance: PersonStanding, breathing: Wind, cardio: HeartPulse, core: Activity }

function MoveRow({ exercise, line }: { exercise: Exercise; line: string }) {
  const m = exerciseMedia(exercise.id)
  const hasPicture = !!(m.photo || m.art || m.animation || m.images.length)
  const Icon = PATTERN_ICON[exercise.pattern] ?? Dumbbell
  return (
    <li>
      <Link to={`/train/exercise/${exercise.id}`} className="press flex min-h-[72px] items-center gap-3 px-3 py-2 active:bg-surface-2">
        {hasPicture ? <ExerciseVisual exercise={exercise} size="thumb" /> : (
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-muted">
            <Icon size={24} strokeWidth={1.75} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-app">{exercise.name}</span>
          <span className="line-clamp-2 text-[13px] leading-snug text-muted">{line}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
      </Link>
    </li>
  )
}
