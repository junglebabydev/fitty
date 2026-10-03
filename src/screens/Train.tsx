import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, ChevronRight, LayoutGrid, Play } from 'lucide-react'
import type { WorkoutSession } from '../domain/types'
import { parseProgramKey, type Program } from '../domain/programs'
import { Button, Screen } from '../components'
import { getSessions } from '../db/repositories'
import { useQuery } from '../hooks'
import { PLAN_FOCUSES, estimateSessionMinutes, windowDates, windowIndex, type PlanFocus } from '../engine'
import { useSetupGate } from '../features/onboarding/SetupGate'
import { dayName, fmtDate, startOfWeek, todayStr } from '../lib/util'
import { exerciseMap, libraryExercises, weekSessions } from '../features/workout'
import { PlanSheet } from '../features/workout/PlanSheet'
import { MuscleSummary } from '../features/workout/PlanVisuals'
import { activeProgram, ensureProgramWeek } from '../features/workout/program'
import { RoutineDetailSheet } from '../features/workout/RoutineSheets'
import { listRoutines, type Routine } from '../features/workout/routines'
import { LibraryView, WeekPlanView } from '../features/workout/WeekPlan'
import { ProgramCard, ProgramGallery, StartNowRow, WorkoutPreviewSheet } from '../features/programs'
import { COMPOSER_CLEARANCE, Composer } from '../features/composer'

const rise = (i: number) => ({ '--i': i }) as CSSProperties
const STATUS_RANK: Record<WorkoutSession['status'], number> = { in_progress: 0, planned: 1, completed: 2, skipped: 3 }

/**
 * Train (docs/PRD_TRAINING_PROGRAMS.md §4.1, §4.2). Enrolled: the programme card, Start now, two quiet links.
 * Not enrolled: today's session when one is planned, the programmes, Start now. The week, the programme gallery
 * and the library are views of this route.
 */
export default function TrainScreen() {
  const [params] = useSearchParams()
  const view = params.get('view')
  if (view === 'week') return <WeekPlanView />
  if (view === 'library') return <LibraryView />
  if (view === 'programs') return <ProgramsView />
  return <TrainRoot />
}

function ProgramsView() {
  const active = useQuery(activeProgram, [])
  return (
    <Screen pillar="train" title="Programmes" back="/train" backLabel="Train">
      <div className="pb-8">
        <ProgramGallery active={active ? { programId: active.program.id, week: active.enrollment.week } : null} />
      </div>
    </Screen>
  )
}

function TrainRoot() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // Planning and starting a session both need the intake (features/onboarding/setup.ts).
  const setup = useSetupGate()
  const today = todayStr()
  const weekStart = startOfWeek(today)

  // Close elapsed programme weeks and write this one when it has no rows (idempotent).
  useEffect(() => {
    try {
      ensureProgramWeek(today)
    } catch (e) {
      console.warn('ensureProgramWeek failed', e)
    }
  }, [today])

  // The active programme and this window's rows of it. Re-read on every write, so a finished programme drops out.
  const enrolled = useQuery(() => {
    const active = activeProgram()
    if (!active) return null
    const k = windowIndex(active.enrollment.startDate, today)
    if (k < 0) return { ...active, rows: [] as WorkoutSession[] }
    const dates = windowDates(active.enrollment.startDate, k)
    const rows = getSessions(dates[0], dates[6]).filter((s) => {
      const key = parseProgramKey(s.templateKey)
      return !!key && !key.standalone && key.programId === active.program.id
    })
    return { ...active, rows }
  }, [today])

  const sessions = useQuery(() => weekSessions(weekStart), [weekStart])
  const library = useQuery(libraryExercises, [])
  const byId = useMemo(() => exerciseMap(library), [library])
  const [routineTick, setRoutineTick] = useState(0)
  const routines = useQuery(listRoutines, [routineTick])

  const [planOpen, setPlanOpen] = useState(false)
  const [planInit, setPlanInit] = useState<{ minutes?: number; focus?: PlanFocus }>({})
  const [routine, setRoutine] = useState<Routine | null>(null)
  // The preview keeps its last workout while it animates out.
  const [preview, setPreview] = useState<{ program: Program; sessionKey: string } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // /train?plan=1&minutes=30&focus=upper opens the planner prefilled (Today, Coach and the composer link here).
  useEffect(() => {
    if (params.get('plan') !== '1') return
    const minutes = Number(params.get('minutes'))
    const focus = params.get('focus') as PlanFocus | null
    setParams({}, { replace: true })
    if (!setup.require('workout')) return // unfinished intake: the gate sheet explains instead
    setPlanInit({ minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined, focus: focus && PLAN_FOCUSES.includes(focus) ? focus : undefined })
    setPlanOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams])

  // Hero (not enrolled): what is actionable today, else the next thing coming up.
  const todays = sessions.filter((s) => s.scheduledDate === today && s.status !== 'skipped').sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0] ?? null
  const live = sessions.find((s) => s.status === 'in_progress') ?? null
  const upcoming = sessions.filter((s) => s.status === 'planned' && s.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null
  const hero = live ?? todays ?? upcoming

  const occupied = useMemo(() => new Set(sessions.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate)), [sessions])
  const openSession = (id: number) => { if (setup.require('workout')) navigate(`/train/session/${id}`) }
  const openRoutine = (r: Routine) => { if (setup.require('workout')) setRoutine(r) }
  const openWorkout = (program: Program, sessionKey: string) => {
    if (!setup.require('workout')) return
    setPreview({ program, sessionKey })
    setPreviewOpen(true)
  }

  const startNow = (i: number) => (
    <section className="anim-rise" style={rise(i)} aria-labelledby="train-start-now">
      <h2 id="train-start-now" className="eyebrow text-muted px-1 mb-2 mt-2">Start now</h2>
      <StartNowRow routines={routines} onOpenWorkout={openWorkout} onOpenRoutine={openRoutine} />
    </section>
  )

  return (
    <Screen pillar="train" large title="Train" eyebrow={`Week of ${fmtDate(weekStart)}`}>
      {/* Bottom padding keeps the last block clear of the fixed Composer. */}
      <div className="flex flex-col gap-3" style={{ paddingBottom: COMPOSER_CLEARANCE }}>
        {enrolled ? (
          <>
            {/* 1 · the programme */}
            <ProgramCard program={enrolled.program} enrollment={enrolled.enrollment} rows={enrolled.rows} today={today} onOpenSession={openSession} />
            {/* 2 · start now */}
            {startNow(1)}
            {/* 3 · quiet links */}
            <div className="anim-rise mt-2 grid grid-cols-2 gap-2" style={rise(2)}>
              <QuietLink to="/train?view=programs" icon={<LayoutGrid size={16} />} label="Programmes" />
              <QuietLink to="/train?view=library" icon={<BookOpen size={16} />} label="Exercises" />
            </div>
          </>
        ) : (
          <>
            {/* 1 · today's session, when one is planned */}
            {hero && (
              <section className="anim-rise rounded-[1.25rem] border border-pillar-line bg-surface p-4" style={rise(0)} aria-label="Today's session">
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
                  onClick={() => openSession(hero.id)}
                >
                  {hero.status === 'in_progress' ? 'Resume' : hero.status === 'completed' ? 'Summary' : hero.scheduledDate === today ? 'Start' : 'Preview'}
                </Button>
              </section>
            )}
            {/* 2 · programmes */}
            <section className="anim-rise" style={rise(1)} aria-labelledby="train-programmes">
              <h2 id="train-programmes" className="eyebrow text-muted px-1 mb-2 mt-2">Programmes</h2>
              <ProgramGallery />
            </section>
            {/* 3 · start now */}
            {startNow(2)}
            <div className="anim-rise mt-2 grid" style={rise(3)}>
              <QuietLink to="/train?view=library" icon={<BookOpen size={16} />} label="Exercises" />
            </div>
          </>
        )}
      </div>

      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} initialMinutes={planInit.minutes} initialFocus={planInit.focus} onSaved={() => setRoutineTick((n) => n + 1)} />
      <RoutineDetailSheet routine={routine} onClose={() => setRoutine(null)} byId={byId} occupied={occupied} onChanged={() => setRoutineTick((n) => n + 1)} />
      <WorkoutPreviewSheet open={previewOpen} program={preview?.program ?? null} sessionKey={preview?.sessionKey ?? null} onClose={() => setPreviewOpen(false)} />
      {setup.sheet}

      <Composer context="train" placeholder="Ask, or start a programme" />
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
