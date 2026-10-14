// Today (FEATURES.blueprint): the BFT week as a strip (data in src/data/programs/bft.ts), the day's class with two ways
// to do it, and "More workouts" to pick from: the other BFT classes and the other series' start-now picks. Tapping a
// class opens its intro with a picture of every move (screens/WorkoutIntro.tsx). Start goes straight into the player
// with no questions (features/blueprint/start.ts); "Do it with Coach" runs the same session as a chat
// (screens/CoachWorkout.tsx). Tap another day to see its class, or do it today.
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Settings } from 'lucide-react'
import type { ProgramId } from '../domain/programs'
import { IconButton, Screen } from '../components'
import { expandSessions } from '../engine'
import { useQuery } from '../hooks'
import { cx, dayName, fmtDate, todayStr } from '../lib/util'
import { startNowPicks } from '../features/programs'
import { blueprintProgram, blueprintRows, blueprintSession } from '../features/blueprint/session'
import { startToday } from '../features/blueprint/start'
import { KindArt, LATE_KINDS, OTHER_ART, StartButtons, WorkoutArt, type StartMode } from '../features/blueprint/ui'
import { KIND_META, dayKey, dayKind, doneOn, keyKind, rowForDate, sessionExerciseIds, weekDates, type DayKind } from '../features/blueprint/week'

export default function BlueprintScreen() {
  const navigate = useNavigate()
  const today = todayStr()
  const [picked, setPicked] = useState(today)
  const week = weekDates(today)
  const key = dayKey(picked)
  const kind = dayKind(picked)

  const rows = useQuery(() => blueprintRows(today), [today])
  const session = useQuery(() => blueprintSession(key), [key, today])
  const more = useQuery(() => moreWorkouts(dayKey(today)), [today])

  // This session on its own day, or done on today instead ("Do it today").
  const row = rowForDate(rows, picked, key) ?? (picked !== today ? rowForDate(rows, today, key) : null)
  const open = (id: number, mode: StartMode) => navigate(mode === 'coach' ? `/coach/workout/${id}` : `/train/session/${id}`)
  const go = (mode: StartMode) => open(row && row.status !== 'planned' ? row.id : startToday(key, today), mode)

  return (
    <Screen
      pillar="today"
      large
      eyebrow={`${dayName(today, false)} · ${fmtDate(today)}`}
      title="Today"
      right={<IconButton icon={<Settings size={22} />} label="Settings" onClick={() => navigate('/settings')} />}
    >
      <div className="flex flex-col gap-6 pb-4">
        <WeekStrip dates={week} today={today} picked={picked} rows={rows} onPick={setPicked} />

        {session && (
          <DayCard
            kind={kind}
            to={`/workout/${blueprintProgram().id}/${key}`}
            when={picked === today ? 'Today' : dayName(picked, false)}
            name={session.name}
            minutes={session.minutes}
            moves={sessionExerciseIds(session).length}
            button={<StartButtons status={row?.status ?? null} later={picked !== today} onGo={go} />}
            note={LATE_KINDS.includes(kind) ? 'Finish at least 4 hours before bed.' : null}
          />
        )}

        <section aria-labelledby="more-workouts">
          <h3 id="more-workouts" className="eyebrow m-0 mb-2 px-1 text-muted">More workouts</h3>
          <ul className="grid grid-cols-2 gap-2.5">
            {more.map((w) => (
              <li key={`${w.programId}:${w.key}`} className="min-w-0">
                <Link to={`/workout/${w.programId}/${w.key}`} className="press flex h-full flex-col overflow-hidden rounded-[1.25rem] bg-surface">
                  {w.kind ? <KindArt kind={w.kind} small className="h-20 w-full" /> : <WorkoutArt label={w.series} color={OTHER_ART} small className="h-20 w-full" />}
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-tight text-app">{w.name}</span>
                    <span className="mt-auto text-[13px] font-medium text-muted"><span className="num text-xl text-app">{w.minutes}</span> min</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  )
}

// --- more workouts ---------------------------------------------------------------------------------------------

interface MoreWorkout { programId: ProgramId; key: string; name: string; minutes: number; kind: DayKind | null; series: string }

/** The week's other classes, Monday first, then the other ready series' start-now picks. */
function moreWorkouts(todayKey: string): MoreWorkout[] {
  const week = blueprintProgram()
  const classes = expandSessions(week)
    .filter((s) => s.week === 1 && s.key !== todayKey)
    .map((s) => ({ programId: week.id, key: s.key, name: s.name, minutes: s.minutes, kind: keyKind(s.key), series: week.title }))
  const others = startNowPicks()
    .filter((p) => p.program.id !== week.id)
    .map((p) => ({ programId: p.program.id, key: p.pick.sessionKey, name: p.pick.name, minutes: p.session.minutes, kind: null, series: p.program.title }))
  return [...classes, ...others]
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

/** The day's class: tap the top to see its moves; the buttons start it. */
function DayCard({ kind, to, when, name, minutes, moves, button, note }: {
  kind: DayKind; to: string; when: string; name: string; minutes: number; moves: number; button: ReactNode; note: string | null
}) {
  const meta = KIND_META[kind]
  return (
    <article className="overflow-hidden rounded-[1.25rem] bg-surface">
      <Link to={to} className="press block" aria-label={`${name}: see the moves`}>
        <KindArt kind={kind} className="h-44 w-full" />
        <div className="px-4 pt-4">
          <div className="eyebrow flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
            {when} · {meta.label}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <h2 className="m-0 text-[24px] font-semibold leading-tight text-app">{name}</h2>
            <ChevronRight size={20} className="shrink-0 text-faint" aria-hidden />
          </div>
          <div className="mt-1.5 flex items-baseline gap-4 text-sm font-medium text-muted">
            <span><span className="num text-3xl text-app">{minutes}</span> min</span>
            <span><span className="num text-3xl text-app">{moves}</span> {moves === 1 ? 'move' : 'moves'}</span>
          </div>
        </div>
      </Link>
      <div className="p-4">
        {button}
        {note && <p className="m-0 mt-2.5 text-center text-[13px] text-muted">{note}</p>}
      </div>
    </article>
  )
}
