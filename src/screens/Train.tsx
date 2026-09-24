import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, ChevronRight, Play, RefreshCw, Sparkles, StretchHorizontal, Zap } from 'lucide-react'
import type { WorkoutSession } from '../domain/types'
import { Button, Illustration, Screen } from '../components'
import { useQuery } from '../hooks'
import { PLAN_FOCUSES, estimateSessionMinutes, type PlanFocus } from '../engine'
import { useAIStatus } from '../features/ai/config'
import { cx, dayName, fmtDate, startOfWeek, todayStr } from '../lib/util'
import { SESSION_TYPE_META, exerciseMap, libraryExercises, missedSessions, sessionStatusInfo, weekSessions } from '../features/workout'
import { PlanSheet } from '../features/workout/PlanSheet'
import { MuscleSummary } from '../features/workout/PlanVisuals'
import { RoutineDetailSheet, RoutinesRow } from '../features/workout/RoutineSheets'
import { listRoutines, type Routine } from '../features/workout/routines'
import { LibraryView, WeekPlanView } from '../features/workout/WeekPlan'

const rise = (i: number) => ({ '--i': i }) as CSSProperties
const STATUS_RANK: Record<WorkoutSession['status'], number> = { in_progress: 0, planned: 1, completed: 2, skipped: 3 }

/** Train: today's session · one Plan button · routines · this week. The full week, mobility and the library are one tap away. */
export default function TrainScreen() {
  const [params] = useSearchParams()
  const view = params.get('view')
  if (view === 'week') return <WeekPlanView />
  if (view === 'library') return <LibraryView />
  return <TrainRoot />
}

function TrainRoot() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const ai = useAIStatus()
  const today = todayStr()
  const weekStart = startOfWeek(today)

  const sessions = useQuery(() => weekSessions(weekStart), [weekStart])
  const library = useQuery(libraryExercises, [])
  const byId = useMemo(() => exerciseMap(library), [library])
  const [routineTick, setRoutineTick] = useState(0)
  const routines = useQuery(listRoutines, [routineTick])

  const [planOpen, setPlanOpen] = useState(false)
  const [planInit, setPlanInit] = useState<{ minutes?: number; focus?: PlanFocus }>({})
  const [routine, setRoutine] = useState<Routine | null>(null)

  // /train?plan=1&minutes=30&focus=upper opens the planner prefilled (Today, Coach and the composer link here).
  useEffect(() => {
    if (params.get('plan') !== '1') return
    const minutes = Number(params.get('minutes'))
    const focus = params.get('focus') as PlanFocus | null
    setPlanInit({ minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined, focus: focus && PLAN_FOCUSES.includes(focus) ? focus : undefined })
    setPlanOpen(true)
    setParams({}, { replace: true })
  }, [params, setParams])

  // Hero: what is actionable today, else the next thing coming up.
  const todays = sessions.filter((s) => s.scheduledDate === today && s.status !== 'skipped').sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0] ?? null
  const live = sessions.find((s) => s.status === 'in_progress') ?? null
  const upcoming = sessions.filter((s) => s.status === 'planned' && s.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null
  const hero = live ?? todays ?? upcoming
  const missed = missedSessions(sessions, today).length

  // This week: the next three that still matter (today onwards first, then anything waiting to be rescheduled).
  const weekList = useMemo(() => {
    const open = sessions.filter((s) => s.id !== hero?.id && s.status !== 'skipped')
    const ahead = open.filter((s) => s.scheduledDate >= today)
    const behind = open.filter((s) => s.scheduledDate < today).reverse()
    return [...ahead, ...behind].slice(0, 3)
  }, [sessions, hero?.id, today])

  const occupied = useMemo(() => new Set(sessions.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate)), [sessions])
  const openPlanner = () => { setPlanInit({}); setPlanOpen(true) }

  return (
    <Screen pillar="train" large title="Train" eyebrow={`Week of ${fmtDate(weekStart)}`}>
      <div className="flex flex-col gap-3 pb-8">
        {/* 1 · today's session */}
        <section className="anim-rise rounded-[1.25rem] border border-pillar-line bg-surface p-4" style={rise(0)} aria-label="Today's session">
          {hero ? (
            <>
              <MuscleSummary exerciseIds={hero.exercises.map((e) => e.exerciseId)} byId={byId} size={112}>
                <div className="eyebrow text-pillar">{hero.status === 'in_progress' ? 'In progress' : hero.status === 'completed' ? 'Done today' : hero.scheduledDate === today ? 'Today' : `Next · ${dayName(hero.scheduledDate)}`}</div>
                <h2 className="display text-[1.7rem] leading-[1.05] text-app mt-1.5 line-clamp-2">{hero.name.replace(/\s*\(.*\)$/, '')}</h2>
                <div className="mt-2 flex items-baseline gap-3 text-muted text-sm font-medium">
                  <span><span className="num text-3xl text-app">{hero.status === 'completed' && hero.durationMin != null ? hero.durationMin : estimateSessionMinutes(hero.exercises)}</span> min</span>
                  <span><span className="num text-3xl text-app">{hero.exercises.length}</span> moves</span>
                </div>
              </MuscleSummary>
              <Button
                variant={hero.status === 'completed' ? 'secondary' : 'primary'}
                size="lg"
                full
                className="mt-4"
                icon={hero.status === 'completed' ? <ChevronRight size={18} /> : <Play size={18} />}
                onClick={() => navigate(`/train/session/${hero.id}`)}
              >
                {hero.status === 'in_progress' ? 'Resume' : hero.status === 'completed' ? 'Summary' : hero.scheduledDate === today ? 'Start' : 'Preview'}
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="shrink-0 text-muted"><Illustration name="dumbbell" size={96} /></div>
              <div className="min-w-0 flex-1">
                <div className="eyebrow text-pillar">Today</div>
                <p className="voice text-xl text-app mt-1.5 leading-snug">Nothing planned. Build one below.</p>
              </div>
            </div>
          )}
        </section>

        {/* 2 · one way to plan something new */}
        <div className="anim-rise" style={rise(1)}>
          <Button variant="secondary" size="lg" full icon={ai.connected ? <Sparkles size={18} /> : <Zap size={18} />} onClick={openPlanner}>
            {ai.connected ? 'Plan with AI' : 'Plan a workout'}
          </Button>
        </div>

        {/* 3 · routines */}
        <section className="anim-rise" style={rise(3)} aria-labelledby="train-routines">
          <h2 id="train-routines" className="eyebrow text-muted px-1 mb-2 mt-2">Routines</h2>
          <RoutinesRow routines={routines} byId={byId} onOpen={setRoutine} />
        </section>

        {/* 4 · this week */}
        <section className="anim-rise" style={rise(4)} aria-labelledby="train-week">
          <div className="flex items-center justify-between px-1 mt-2 mb-1">
            <h2 id="train-week" className="eyebrow text-muted">This week</h2>
            <Link to="/train?view=week" className="press min-h-11 inline-flex items-center gap-1 text-sm font-semibold text-app">
              {missed > 0 ? <><RefreshCw size={14} className="text-pillar" aria-hidden />{missed} to move</> : 'See all'}<ChevronRight size={15} className="text-faint" aria-hidden />
            </Link>
          </div>
          {weekList.length > 0 && (
            <ul className="rounded-[1.25rem] border border-line bg-surface divide-y divide-line overflow-hidden">
              {weekList.map((s) => {
                const status = sessionStatusInfo(s, today)
                const StatusIcon = status.icon
                const TypeIcon = SESSION_TYPE_META[s.type].icon
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => navigate(`/train/session/${s.id}`)} className="w-full min-h-[56px] px-3.5 py-1.5 flex items-center gap-3 text-left active:bg-surface-2">
                      <span className={cx('h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0', s.status === 'completed' ? 'bg-pillar text-accent-fg' : 'bg-surface-2 text-muted')} aria-hidden><TypeIcon size={18} /></span>
                      <span className="min-w-0 flex-1 font-semibold text-[15px] leading-tight truncate">{s.name.replace(/\s*\(.*\)$/, '')}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted shrink-0">
                        <StatusIcon size={12} strokeWidth={2.5} aria-hidden />{s.status === 'planned' && s.scheduledDate > today ? dayName(s.scheduledDate) : status.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <QuietLink to="/train/mobility" icon={<StretchHorizontal size={16} />} label="Mobility" />
            <QuietLink to="/train?view=library" icon={<BookOpen size={16} />} label="Library" />
          </div>
        </section>
      </div>

      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} initialMinutes={planInit.minutes} initialFocus={planInit.focus} onSaved={() => setRoutineTick((n) => n + 1)} />
      <RoutineDetailSheet routine={routine} onClose={() => setRoutine(null)} byId={byId} occupied={occupied} onChanged={() => setRoutineTick((n) => n + 1)} />
    </Screen>
  )
}

function QuietLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="press h-11 rounded-xl border border-line bg-surface text-sm font-semibold text-app inline-flex items-center justify-center gap-1.5">
      <span className="text-muted" aria-hidden>{icon}</span>{label}
    </Link>
  )
}
