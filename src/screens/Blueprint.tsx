// Today on the Blueprint week (FEATURES.blueprint; data in src/data/programs/blueprint.ts): the week as a strip, the
// day's session with a drawing of every move, and two ways to do it. Start runs it in Focus Mode the same way "Start
// now" does (the series' safety questions once, then the symptom gate); "Do it with Coach" runs the same session as a
// chat (screens/CoachWorkout.tsx). Tap another day to see it, or do it today.
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, Check, ChevronRight, Dumbbell, HeartPulse, MessageSquare, PersonStanding, Play, Settings, StretchHorizontal, Wind, type LucideIcon } from 'lucide-react'
import type { Block } from '../domain/programs'
import type { Exercise } from '../domain/types'
import { Button, ExerciseVisual, IconButton, Screen } from '../components'
import { exerciseMedia } from '../data/exerciseMedia'
import { getConditionFlags } from '../db/repositories'
import { useQuery } from '../hooks'
import { cx, dayName, fmtDate, todayStr } from '../lib/util'
import { SafetyCheckSheet, previewSafety } from '../features/programs'
import { exerciseMap, libraryExercises } from '../features/workout/helpers'
import { noImpactChosen, screenAnswersFor } from '../features/workout/program'
import { blueprintProgram, blueprintRows, blueprintSession, ensureTodayRow } from '../features/blueprint/session'
import {
  KIND_META, blockLine, dayKey, dayKind, doneOn, rowForDate, sections, sessionExerciseIds, stationLine, weekDates, type DayKind,
} from '../features/blueprint/week'

type Mode = 'player' | 'coach'

export default function BlueprintScreen() {
  const navigate = useNavigate()
  const today = todayStr()
  const [picked, setPicked] = useState(today)
  // The safety questions are asked once, before the first start of either kind.
  const [checkFor, setCheckFor] = useState<Mode | null>(null)
  const program = blueprintProgram()
  const week = weekDates(today)
  const key = dayKey(picked)
  const kind = dayKind(picked)

  const rows = useQuery(() => blueprintRows(today), [today])
  const data = useQuery(() => {
    const session = blueprintSession(key)
    if (!session) return null
    const flags = getConditionFlags().map((f) => f.region)
    return {
      session,
      byId: exerciseMap(libraryExercises()),
      safety: previewSafety(program, screenAnswersFor(program.id), flags, noImpactChosen(), today),
    }
  }, [key, today])

  // This session on its own day, or done on today instead ("Do it today").
  const row = rowForDate(rows, picked, key) ?? (picked !== today ? rowForDate(rows, today, key) : null)
  const open = (id: number, mode: Mode) => navigate(mode === 'coach' ? `/coach/workout/${id}` : `/train/session/${id}`)
  const go = (mode: Mode) => {
    if (row && row.status !== 'planned') return open(row.id, mode)
    if (data?.safety.state === 'ready') return open(ensureTodayRow(key, today), mode)
    setCheckFor(mode)
  }

  const button = row?.status === 'completed'
    ? <Button variant="secondary" size="lg" full icon={<Check size={18} />} onClick={() => go('player')}>Done · See summary</Button>
    : (
      <div className="flex flex-col gap-2">
        {row?.status === 'in_progress'
          ? <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={() => go('player')}>Resume</Button>
          : picked === today
            ? <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={() => go('player')}>Start</Button>
            : <Button variant="secondary" size="lg" full onClick={() => go('player')}>Do it today</Button>}
        <Button variant="secondary" size="lg" full icon={<MessageSquare size={18} />} onClick={() => go('coach')}>
          {row?.status === 'in_progress' ? 'Continue with Coach' : 'Do it with Coach'}
        </Button>
      </div>
    )

  return (
    <Screen
      pillar="today"
      large
      eyebrow={`${dayName(today, false)} · ${fmtDate(today)}`}
      title="Blueprint"
      subtitle={<span className="text-[15px] text-muted">Bryan Johnson's week</span>}
      right={<IconButton icon={<Settings size={22} />} label="Settings" onClick={() => navigate('/settings')} />}
    >
      <div className="flex flex-col gap-6 pb-4">
        <WeekStrip dates={week} today={today} picked={picked} rows={rows} onPick={setPicked} />

        {data && (
          <DayCard
            kind={kind}
            when={picked === today ? 'Today' : dayName(picked, false)}
            name={data.session.name}
            minutes={data.session.minutes}
            moves={sessionExerciseIds(data.session).length}
            button={button}
            note={kind === 'hiit' ? 'Finish at least 4 hours before bed.' : null}
          />
        )}

        {data && sections(data.session).map((sec, i) => (
          <section key={`${sec.title}-${i}`} aria-label={sec.title || undefined}>
            {sec.title && (
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h3 className="eyebrow m-0 text-muted">{sec.title}</h3>
                {sec.meta && <span className="text-[13px] font-medium text-faint">{sec.meta}</span>}
              </div>
            )}
            <ul className="divide-y divide-line overflow-hidden rounded-[1.25rem] bg-surface">
              {sec.blocks.flatMap(moveRows).map((m, j) => {
                const ex = data.byId.get(m.id)
                return ex ? <MoveRow key={`${m.id}-${j}`} exercise={ex} line={m.line} /> : null
              })}
            </ul>
          </section>
        ))}
      </div>

      <SafetyCheckSheet
        open={checkFor !== null}
        program={program}
        mode="workout"
        onClose={() => setCheckFor(null)}
        onDone={() => { const mode = checkFor ?? 'player'; setCheckFor(null); open(ensureTodayRow(key, today), mode) }}
      />
    </Screen>
  )
}

// --- week strip ------------------------------------------------------------------------------------------------

type Row = ReturnType<typeof blueprintRows>[number]

function WeekStrip({ dates, today, picked, rows, onPick }: { dates: string[]; today: string; picked: string; rows: Row[]; onPick: (d: string) => void }) {
  return (
    <ol className="-mx-1 grid grid-cols-7" aria-label="This week">
      {dates.map((d) => {
        const meta = KIND_META[dayKind(d)]
        const done = doneOn(rows, d)
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={d === picked}
              aria-label={`${dayName(d, false)}: ${meta.label}${done ? ', done' : ''}`}
              className="press flex w-full flex-col items-center gap-1.5 py-1"
            >
              <span className={cx('text-[12px] font-semibold', d === today ? 'text-app' : 'text-faint')}>{dayName(d).slice(0, 1)}</span>
              <span
                className={cx('flex h-9 w-9 items-center justify-center rounded-full', d === picked && 'outline-2 outline-offset-2 outline-accent')}
                style={{ background: done ? meta.color : `color-mix(in srgb, ${meta.color} 16%, transparent)` }}
              >
                {done
                  ? <Check size={17} strokeWidth={3} className="text-white" aria-hidden />
                  : <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// --- day card --------------------------------------------------------------------------------------------------

/** The day type's drawing, white on its colour. */
function KindArt({ kind, className }: { kind: DayKind; className?: string }) {
  const meta = KIND_META[kind]
  return (
    <span aria-hidden className={cx('flex items-center justify-center overflow-hidden', className)} style={{ background: meta.color }}>
      {/* Offline before the drawing was ever cached: the colour alone, not a broken-image icon. */}
      <img src={meta.art} alt="" draggable={false} decoding="async" className="h-[86%] w-auto object-contain" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
    </span>
  )
}

function DayCard({ kind, when, name, minutes, moves, button, note }: {
  kind: DayKind; when: string; name: string; minutes: number; moves: number; button: ReactNode; note: string | null
}) {
  const meta = KIND_META[kind]
  return (
    <article className="overflow-hidden rounded-[1.25rem] bg-surface">
      <KindArt kind={kind} className="h-44 w-full" />
      <div className="p-4">
        <div className="eyebrow flex items-center gap-1.5 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
          {when} · {meta.label}
        </div>
        <h2 className="m-0 mt-1 text-[24px] font-semibold leading-tight text-app">{name}</h2>
        <div className="mt-1.5 flex items-baseline gap-4 text-sm font-medium text-muted">
          <span><span className="num text-3xl text-app">{minutes}</span> min</span>
          <span><span className="num text-3xl text-app">{moves}</span> {moves === 1 ? 'move' : 'moves'}</span>
        </div>
        <div className="mt-4">{button}</div>
        {note && <p className="m-0 mt-2.5 text-center text-[13px] text-muted">{note}</p>}
      </div>
    </article>
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
  const hasPicture = !!(m.art || m.animation || m.images.length)
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
