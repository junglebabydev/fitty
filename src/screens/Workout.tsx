import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Dumbbell, Ellipsis, Layers, Play, Scissors, ShieldAlert, ShieldCheck,
  SkipForward, TriangleAlert, Trophy, Weight,
} from 'lucide-react'
import type { Exercise, ExerciseSet, PlannedExercise, Readiness, Region, WorkoutSession } from '../domain/types'
import {
  Button, Card, Celebrate, EmptyState, ExerciseVisual, IconButton, ListRow, ReadinessBadge, Screen, Sheet, StatTile, useToast,
} from '../components'
import { useNow, useQuery } from '../hooks'
import { getSession, getSetsForSession, getSymptomChecks, lastSetsForExercise, previousSetsForExercise, updateSession, updateSet } from '../db/repositories'
import { TIMED_IDS, estimateSessionMinutes, shortenedVersion, type GateResult } from '../engine'
import { acquireWakeLock } from '../native'
import { todayReadiness } from '../features/coach/facts'
import { cx, dayName, fmtDate, fmtTime, todayStr } from '../lib/util'
import {
  ExerciseCard, FinishSheet, PainSheet, RestTimerBar, SubstituteSheet, SymptomGateSheet,
  REGION_LABELS, SESSION_TYPE_META, computeDurationMin, evaluateProgressionWithPain, exerciseMap, fmtClock, fmtLoad, fmtSec, fmtVolume,
  finishSession, libraryExercises, readSessionFlag, reapplyGate, reducePlannedLoad, rirSummary, sessionPRs, sessionStatusInfo, sessionVolumeKg,
  setsByExercise, skipSession, startSessionWithGate, substituteExercise, summarizeSets, todaysGate, todaysRegionState, writeSessionFlag,
  type GateEntry, type GateOutcome, type LivePR, type PainOutcome, type SymptomChange,
} from '../features/workout'
import { useRestTimer } from '../features/workout/useRestTimer'
import { MuscleSummary } from '../features/workout/PlanVisuals'

function safeReadiness(): Readiness | null {
  try { return todayReadiness().state } catch { return null }
}

/** "12:05" under an hour, then "1:02:05". Always derived from the start timestamp. */
function fmtElapsed(sec: number): string {
  if (sec < 3600) return fmtClock(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

function whenLabel(date: string, today: string): string {
  return date === today ? 'Today' : `${dayName(date)} ${fmtDate(date)}`
}

/** Guided workout logger (PRD §7.2, §8): symptom gate → in-progress logging → finish; read-only when done. */
export default function WorkoutScreen() {
  const { id } = useParams()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const today = todayStr()
  const now = useNow(1000)

  const session = useQuery(() => (Number.isFinite(sessionId) ? getSession(sessionId) : null), [sessionId])
  const library = useQuery(libraryExercises, [])
  const byId = useMemo(() => exerciseMap(library), [library])
  const sets = useQuery(() => (session ? getSetsForSession(session.id) : []), [session?.id])
  const setsFor = useMemo(() => setsByExercise(sets), [sets])
  const gate = useQuery(() => todaysGate(today), [today])
  const regionState = useQuery(() => todaysRegionState(today), [today])

  // --- local UI state ------------------------------------------------------------
  const [gateBusy, setGateBusy] = useState(false)
  // null = not yet decided: the gate auto-opens for sessions due today or missed, not for future dates.
  const [gateHidden, setGateHidden] = useState<boolean | null>(null)
  const [gateOutcome, setGateOutcome] = useState<GateOutcome | null>(null)
  const [subIndex, setSubIndex] = useState<number | null>(null)
  const [subReason, setSubReason] = useState<string | undefined>(undefined)
  const [painIndex, setPainIndex] = useState<number | null>(null)
  const [finishOpen, setFinishOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [pr, setPr] = useState<LivePR | null>(null)
  // Pain reported before any set was logged: the next set carries the flag. Kept per session like `stopped`.
  const painNextKey = `workout-painnext-${sessionId}`
  const [painNext, setPainNextState] = useState<Record<string, boolean>>(() => readSessionFlag<Record<string, boolean>>(painNextKey, {}))
  const setPainNext = useCallback((exerciseId: string, on: boolean) => {
    setPainNextState((prev) => {
      const next = { ...prev, [exerciseId]: on }
      writeSessionFlag(painNextKey, next)
      return next
    })
  }, [painNextKey])
  const stoppedKey = `workout-stopped-${sessionId}`
  const [stopped, setStopped] = useState<string[]>(() => readSessionFlag<string[]>(stoppedKey, []))
  const timer = useRestTimer()

  const inProgress = session?.status === 'in_progress'

  // Keep the screen awake while logging.
  useEffect(() => {
    if (!inProgress) return
    let release: (() => void) | null = null
    let cancelled = false
    acquireWakeLock().then((r) => { if (cancelled) r(); else release = r }).catch(() => {})
    return () => { cancelled = true; release?.() }
  }, [inProgress])

  // Voice "swap X" arrives as ?substitute=<exerciseId>.
  const handledParam = useRef(false)
  useEffect(() => {
    const target = params.get('substitute')
    if (!target) { handledParam.current = false; return }
    if (!session || !inProgress || handledParam.current) return
    handledParam.current = true
    const idx = session.exercises.findIndex((e) => e.exerciseId === target)
    if (idx >= 0) { setSubReason('Voice request'); setSubIndex(idx) }
    else toast.show('That exercise is not in this session.', 'info')
    setParams({}, { replace: true })
  }, [params, session, inProgress, setParams, toast])

  const markStopped = useCallback((exerciseId: string) => {
    setStopped((prev) => {
      const next = prev.includes(exerciseId) ? prev : [...prev, exerciseId]
      writeSessionFlag(stoppedKey, next)
      return next
    })
  }, [stoppedKey])

  // --- gate -----------------------------------------------------------------------
  const startWithGate = (entries: GateEntry[]) => {
    if (!session) return
    setGateBusy(true)
    try {
      const outcome = startSessionWithGate(session, entries, library, null)
      const readiness = safeReadiness()
      if (readiness) updateSession(session.id, { readiness })
      if (outcome.changes.length || outcome.gate.overall !== 'OK' || outcome.blocked.length) setGateOutcome(outcome)
      else toast.show('Gate clear — run the plan as written.', 'success')
    } finally {
      setGateBusy(false)
    }
  }

  // --- substitution ------------------------------------------------------------------
  const applySubstitute = (sub: Exercise, reason: string) => {
    if (!session || subIndex == null) return
    const current = session.exercises[subIndex]
    substituteExercise(session, subIndex, sub, reason)
    const from = byId.get(current.exerciseId)?.name ?? current.exerciseId
    toast.show(`${from} → ${sub.name}`, 'success')
    setSubIndex(null)
    setSubReason(undefined)
  }

  // --- pain / issue --------------------------------------------------------------------
  const onPainOutcome = (o: PainOutcome) => {
    if (!session || painIndex == null) return
    const planned = session.exercises[painIndex]
    const exerciseId = planned.exerciseId
    const logged = setsFor.get(exerciseId) ?? []
    const last = logged[logged.length - 1]
    if (last) updateSet(last.id, { painFlag: true })
    else setPainNext(exerciseId, true)

    const outcome = reapplyGate(session, library)
    const swappedHere = outcome.exercises[painIndex]?.exerciseId !== exerciseId
    if (outcome.changes.length) toast.show(outcome.changes.join(' · '), 'info')

    setPainIndex(null)
    if (o.level === 'red' || o.action === 'stop') {
      markStopped(exerciseId)
      return
    }
    if (o.action === 'substitute') {
      if (swappedHere) return
      setSubReason(`${REGION_LABELS[o.check.region]} pain ${o.check.painScore}/10`)
      setSubIndex(painIndex)
    } else if (o.action === 'reduce_load') {
      if (swappedHere) return
      const currentLoad = last?.loadKg ?? planned.loadKg ?? null
      const next = reducePlannedLoad(session, painIndex, currentLoad)
      toast.show(next != null ? `Load reduced to ${fmtLoad(next)} — keep the range pain-free.` : 'No load to reduce — shorten the range instead.', 'info')
    }
  }

  // --- finish ------------------------------------------------------------------------------
  const todaysRegions = useMemo(() => {
    const out: { region: Region; prePain: number }[] = []
    for (const [region, v] of Object.entries(regionState) as [Region, { painScore: number }][]) {
      if (v && (v.painScore > 0)) out.push({ region, prePain: v.painScore })
    }
    return out
  }, [regionState])

  const doFinish = async (input: { rpe: number | null; durationMin: number; notes: string; symptomChanges: SymptomChange[]; writeToHealth: boolean }) => {
    if (!session) return
    setFinishing(true)
    try {
      const result = await finishSession({ session, sets, ...input })
      setFinishOpen(false)
      timer.skip()
      if (result.healthMessage) toast.show(result.healthMessage, result.healthWritten === false ? 'error' : 'info')
      else toast.show('Session complete.', 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not finish the session.', 'error')
    } finally {
      setFinishing(false)
    }
  }

  const applyShortened = () => {
    if (!session) return
    const short = shortenedVersion(session.exercises)
    const keep = session.exercises.filter((e) => (setsFor.get(e.exerciseId)?.length ?? 0) > 0 && !short.some((s) => s.exerciseId === e.exerciseId))
    const next: PlannedExercise[] = [...keep, ...short]
    updateSession(session.id, { exercises: next })
    setMoreOpen(false)
    toast.show(`Shortened to ${next.length} exercises, 2 sets each.`, 'success')
  }

  const doSkip = () => {
    if (!session) return
    skipSession(session, 'from the workout screen')
    setMoreOpen(false)
    navigate('/train')
  }

  // --- render ---------------------------------------------------------------------------
  if (!Number.isFinite(sessionId) || !session) {
    return (
      <Screen pillar="train" title="Workout" back="/train" backLabel="Train">
        <EmptyState
          icon={<CircleAlert size={28} />}
          title="Session not found"
          body="It may have been removed from the plan."
          action={<Button variant="primary" onClick={() => navigate('/train')}>Back to Train</Button>}
        />
      </Screen>
    )
  }

  if (session.status === 'completed') {
    return <CompletedView session={session} sets={sets} library={library} today={today} />
  }

  if (session.status === 'skipped') {
    return (
      <Screen pillar="train" title={session.name} back="/train" backLabel="Train" eyebrow={whenLabel(session.scheduledDate, today)}>
        <EmptyState
          icon={<SkipForward size={28} />}
          title="Skipped"
          body={session.notes || 'This session was skipped. It can come back whenever you want it.'}
          action={
            <div className="flex flex-col gap-2 items-center">
              <Button variant="primary" icon={<Play size={18} />} onClick={() => updateSession(session.id, { status: 'planned', scheduledDate: today })}>Bring it back today</Button>
              <Button variant="ghost" onClick={() => navigate('/train')}>Back to Train</Button>
            </div>
          }
        />
      </Screen>
    )
  }

  const subExercise = subIndex != null && session.exercises[subIndex] ? byId.get(session.exercises[subIndex].exerciseId) ?? null : null
  const painExercise = painIndex != null && session.exercises[painIndex] ? byId.get(session.exercises[painIndex].exerciseId) ?? null : null
  const elapsedSec = session.startedAt ? Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000)) : 0
  const plannedTotal = session.exercises.reduce((n, e) => n + e.sets, 0)
  const future = session.scheduledDate > today
  const typeMeta = SESSION_TYPE_META[session.type]
  const TypeIcon = typeMeta.icon
  const progressPct = plannedTotal > 0 ? Math.min(100, Math.round((sets.length / plannedTotal) * 100)) : 0

  const sheets = (
    <>
      <SymptomGateSheet
        open={session.status === 'planned' && gateOutcome === null && !(gateHidden ?? future)}
        sessionName={session.type === 'strength' ? 'session' : typeMeta.label.toLowerCase()}
        initial={regionState}
        onStart={startWithGate}
        onDismiss={() => navigate('/train')}
        onClose={() => setGateHidden(true)}
        starting={gateBusy}
      />

      <GateResultSheet
        outcome={gateOutcome}
        onClose={() => setGateOutcome(null)}
        onSkip={() => { skipSession(session, 'symptom gate RED'); setGateOutcome(null); navigate('/train') }}
      />
    </>
  )

  // --- planned: preview + Start (the symptom gate always comes first) ------------------------
  if (!inProgress) {
    return (
      <Screen pillar="train" title={session.name} back="/train" backLabel="Train" eyebrow={`${typeMeta.label} · ${whenLabel(session.scheduledDate, today)}`}>
        <div className="flex flex-col gap-3 pb-10">
          <Card pillar="train" className="anim-rise">
            <MuscleSummary exerciseIds={session.exercises.map((e) => e.exerciseId)} byId={byId}>
              <div className="eyebrow text-pillar">{future ? `Scheduled for ${dayName(session.scheduledDate, false)}` : 'Ready when you are'}</div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="num text-6xl text-app">~{estimateSessionMinutes(session.exercises)}</span>
                <span className="text-sm font-medium text-muted">min</span>
              </div>
              <div className="mt-1 text-sm text-muted"><span className="num text-2xl text-app">{session.exercises.length}</span> moves · <span className="num text-2xl text-app">{plannedTotal}</span> sets</div>
            </MuscleSummary>
            <Button variant="primary" size="lg" full className="mt-4" icon={<Play size={20} />} onClick={() => setGateHidden(false)}>
              {future ? 'Start early' : 'Start'}
            </Button>
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] text-muted leading-snug">
              <ShieldCheck size={15} className="shrink-0 text-ok" aria-hidden />
              <span>A quick symptom check comes first.</span>
            </p>
          </Card>
          <PlannedPreview session={session} byId={byId} />
        </div>
        {sheets}
      </Screen>
    )
  }

  // --- in progress: sticky glass header, set tables, sticky rest bar -------------------------
  const gateWord = gate.overall === 'OK' ? 'Gate clear' : gate.overall === 'RED' ? 'Protecting today' : 'Modified today'
  const GateIcon = gate.overall === 'OK' ? ShieldCheck : gate.overall === 'RED' ? ShieldAlert : TriangleAlert
  const gateCls = gate.overall === 'OK' ? 'bg-ok/10 text-ok' : gate.overall === 'RED' ? 'bg-stop/10 text-stop' : 'bg-warn/10 text-warn'

  return (
    <Screen pillar="train" padded={false}>
      {/* Cancels the wrapper's top inset so the bar owns the safe area while stuck. */}
      <header
        className="sticky top-0 z-30 glass border-b border-line"
        style={{ marginTop: 'calc(env(safe-area-inset-top, 0px) * -1)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-1 pl-1 pr-3 h-14">
          <IconButton icon={<ChevronLeft size={24} />} label="Back to Train" onClick={() => navigate('/train')} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-pillar flex items-center gap-1"><TypeIcon size={12} aria-hidden /><span className="truncate">{typeMeta.label}</span></div>
            <h1 className="text-[15px] font-semibold leading-tight truncate">{session.name}</h1>
          </div>
          <div className="num text-3xl text-app px-1" role="timer" aria-label={`Elapsed ${fmtElapsed(elapsedSec)}`}>{fmtElapsed(elapsedSec)}</div>
          <IconButton icon={<Ellipsis size={20} />} label="Session options" onClick={() => setMoreOpen(true)} className="text-muted" />
          <button type="button" onClick={() => setFinishOpen(true)} className="press ml-1 h-11 px-4 rounded-xl bg-accent text-accent-fg text-[15px] font-semibold">
            Finish
          </button>
        </div>
        <div className="flex items-center gap-2.5 px-4 pb-2">
          <div
            className="h-1.5 flex-1 rounded-full bg-surface-3 overflow-hidden"
            role="progressbar"
            aria-label="Sets done"
            aria-valuemin={0}
            aria-valuemax={plannedTotal}
            aria-valuenow={Math.min(sets.length, plannedTotal)}
          >
            <div className="h-full rounded-full bg-pillar transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted tnum whitespace-nowrap"><span className="num text-base text-app">{sets.length}</span> / {plannedTotal} sets</span>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-44">
        <div className="flex items-center gap-2 flex-wrap">
          {session.readiness && <ReadinessBadge state={session.readiness} compact />}
          <span className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold', gateCls)}>
            <GateIcon size={13} aria-hidden />{gateWord}
          </span>
        </div>

        {gate.overall !== 'OK' && (
          <div className={cx('rounded-[1.25rem] border p-4 flex items-start gap-3', gate.overall === 'RED' ? 'border-stop/40 bg-stop/5' : 'border-warn/40 bg-warn/5')}>
            <GateIcon size={20} className={cx('shrink-0 mt-0.5', gate.overall === 'RED' ? 'text-stop' : 'text-warn')} aria-hidden />
            <div className="text-sm leading-snug">
              <div className="font-semibold text-app">{gate.overall === 'RED' ? 'Protect it today' : 'Modified for today'}</div>
              <ul className="mt-1 flex flex-col gap-1 text-muted">
                {gate.advice.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
              {gate.overall === 'RED' && (
                <p className="mt-2 text-muted">Provocative exercises were swapped or removed. This is not a diagnosis — pain above 5/10 or red-flag symptoms that persist warrant a clinical assessment.</p>
              )}
            </div>
          </div>
        )}

        {session.exercises.length === 0 ? (
          <EmptyState title="Nothing safe to run today" body="Every exercise in this session was blocked by the gate. Try a mobility block or mark the session skipped." compact
            action={<Button variant="secondary" onClick={() => navigate('/train/mobility')}>Open mobility</Button>} />
        ) : (
          session.exercises.map((planned, index) => {
            const ex = byId.get(planned.exerciseId)
            if (!ex) {
              return (
                <Card key={`${planned.exerciseId}-${index}`} title={planned.exerciseId} subtitle="Unknown exercise — not in the library">
                  <Button variant="secondary" icon={<ArrowLeftRight size={16} />} onClick={() => { setSubReason('Unknown exercise'); setSubIndex(index) }}>Replace</Button>
                </Card>
              )
            }
            return (
              <div key={`${planned.exerciseId}-${index}`} className="anim-rise" style={{ '--i': Math.min(index, 6) } as CSSProperties}>
                <ExerciseCard
                  session={session}
                  index={index}
                  planned={planned}
                  exercise={ex}
                  sets={setsFor.get(planned.exerciseId) ?? []}
                  library={library}
                  stopped={stopped.includes(planned.exerciseId)}
                  painNext={!!painNext[planned.exerciseId]}
                  onLogged={(s) => {
                    setPainNext(planned.exerciseId, false)
                    if (s.restSec > 0) timer.start(s.restSec)
                    if (s.pr) setPr(s.pr)
                  }}
                  onSubstitute={() => { setSubReason(undefined); setSubIndex(index) }}
                  onPain={() => setPainIndex(index)}
                />
              </div>
            )
          })
        )}

        <Button variant="secondary" size="lg" full icon={<Check size={20} />} onClick={() => setFinishOpen(true)} className="mt-2">
          Finish session
        </Button>
      </div>

      {/* /train/session/:id hides the tab bar, so the rest bar sits on the bottom edge. */}
      <RestTimerBar timer={timer} aboveTabs={false} />

      <Celebrate
        show={pr !== null}
        title="New personal best"
        body={pr ? `${pr.exerciseName} · ${pr.detail}` : undefined}
        onDone={() => setPr(null)}
        pillar="train"
      />

      {sheets}

      <SubstituteSheet
        open={subIndex != null}
        onClose={() => { setSubIndex(null); setSubReason(undefined) }}
        exercise={subExercise}
        gate={gate}
        library={library}
        inSessionIds={session.exercises.map((e) => e.exerciseId)}
        initialReason={subReason}
        onPick={applySubstitute}
      />

      <PainSheet
        open={painIndex != null}
        onClose={() => setPainIndex(null)}
        exercise={painExercise}
        sessionId={session.id}
        onOutcome={onPainOutcome}
      />

      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        session={session}
        regions={todaysRegions}
        defaultDurationMin={computeDurationMin(session, now)}
        setCount={sets.length}
        volumeKg={sessionVolumeKg(sets)}
        prCount={finishOpen ? sessionPRs(session, sets, library).length : 0}
        finishing={finishing}
        onFinish={doFinish}
      />

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Session options">
        <div className="flex flex-col -mx-4">
          <ListRow
            icon={<Scissors size={18} />}
            title="Shortened version (25–35 min)"
            subtitle="Keep the first four compounds, two sets each"
            onClick={applyShortened}
          />
          <ListRow
            icon={<SkipForward size={18} />}
            title="Mark session skipped"
            subtitle="Logged sets stay in history"
            onClick={doSkip}
          />
        </div>
      </Sheet>
    </Screen>
  )
}

// --- planned preview ----------------------------------------------------------------------

const ACTION_WORD: Record<string, string> = { increase: 'Go up', deload: 'Deload', hold: 'Hold', start: 'Start' }

/** Read-only view of a planned session: current targets plus last-session performance (PRD §8). */
function PlannedPreview({ session, byId }: { session: WorkoutSession; byId: Map<string, Exercise> }) {
  const navigate = useNavigate()
  const rows = useQuery(() => session.exercises.map((planned, index) => {
    const ex = byId.get(planned.exerciseId)
    const timed = !!ex && (ex.timed || TIMED_IDS.has(ex.id))
    const last = ex ? lastSetsForExercise(ex.id, session.id) : []
    const p = ex ? evaluateProgressionWithPain(planned, ex, last, previousSetsForExercise(ex.id, session.id)) : null
    return {
      key: `${planned.exerciseId}-${index}`,
      id: ex?.id ?? null,
      ex: ex ?? null,
      name: ex?.name ?? planned.exerciseId,
      sets: planned.sets,
      repMin: p?.repMin ?? planned.repMin,
      repMax: p?.repMax ?? planned.repMax,
      timed,
      target: p?.nextLoadKg ?? planned.loadKg,
      action: p?.action ?? null,
      last,
    }
  }), [session.id, session.exercises, byId])
  if (!rows.length) return null
  return (
    <Card flush eyebrow="The plan" className="anim-rise">
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center">
            <button
              type="button"
              disabled={!r.id}
              onClick={() => r.id && navigate(`/train/exercise/${r.id}`)}
              className="flex-1 min-w-0 min-h-[72px] pl-3 pr-1 py-2 flex items-center gap-3 text-left active:bg-surface-2"
            >
              {r.ex ? <ExerciseVisual exercise={r.ex} size="thumb" /> : <span className="num text-xl text-pillar w-5 text-center shrink-0" aria-hidden>{i + 1}</span>}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[15px] leading-tight truncate">{r.name}</span>
                <span className="block text-[13px] text-muted tnum truncate mt-0.5">
                  {r.last.length ? `Last: ${summarizeSets(r.last, r.timed)}${rirSummary(r.last) ? ` · ${rirSummary(r.last)}` : ''}` : 'No history yet'}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block num text-xl text-app">{r.sets} × {r.repMin}–{r.repMax}{r.timed ? ' s' : ''}</span>
                <span className="block text-xs text-muted tnum">
                  {r.target != null ? fmtLoad(r.target) : ''}{r.target != null && r.action && r.last.length ? ' · ' : ''}{r.action && r.last.length ? ACTION_WORD[r.action] : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// --- gate result --------------------------------------------------------------------------

function GateResultSheet({ outcome, onClose, onSkip }: { outcome: GateOutcome | null; onClose(): void; onSkip(): void }) {
  const red = outcome?.gate.overall === 'RED'
  return (
    <Sheet
      open={outcome !== null}
      onClose={onClose}
      title={red ? 'Protect it today' : outcome?.changes.length ? 'Adjusted for today' : 'Heads up'}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" full onClick={onClose} icon={<Play size={18} />}>
            {red ? 'Continue with safe exercises' : 'Start logging'}
          </Button>
          {red && <Button variant="ghost" full onClick={onSkip}>Skip today's session</Button>}
        </div>
      }
    >
      {outcome && <GateSummary gate={outcome.gate} changes={outcome.changes} blocked={outcome.blocked} />}
    </Sheet>
  )
}

function GateSummary({ gate, changes, blocked }: { gate: GateResult; changes: string[]; blocked: { name: string; reasons: string[] }[] }) {
  const flagged = gate.regions.filter((r) => r.level !== 'OK')
  return (
    <div className="flex flex-col gap-4">
      {flagged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flagged.map((r) => (
            <span key={r.region} className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold', r.level === 'RED' ? 'bg-stop/10 text-stop' : 'bg-warn/10 text-warn')}>
              {r.level === 'RED' ? <ShieldAlert size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}
              {REGION_LABELS[r.region]} · {r.level === 'RED' ? 'protect' : 'modify'}
            </span>
          ))}
        </div>
      )}
      {gate.advice.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[15px] leading-snug">
          {gate.advice.map((a, i) => <li key={i} className="flex gap-2"><span className="text-faint" aria-hidden>—</span><span>{a}</span></li>)}
        </ul>
      )}
      {changes.length > 0 && (
        <div>
          <div className="eyebrow text-muted mb-2">Substitutions made</div>
          <ul className="flex flex-col gap-2">
            {changes.map((c, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5">
                <ArrowLeftRight size={16} className="text-pillar shrink-0 mt-0.5" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocked.length > 0 && (
        <div>
          <div className="eyebrow text-muted mb-2">Still blocked</div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {blocked.map((b) => <li key={b.name}><span className="text-app font-medium">{b.name}</span> — {b.reasons.join('; ')}</li>)}
          </ul>
        </div>
      )}
      {gate.overall === 'RED' && (
        <div className="rounded-xl border border-stop/40 bg-stop/5 px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-stop shrink-0 mt-0.5" aria-hidden />
          <span>Stop anything that provokes the area today. Pain above 5/10 or red-flag symptoms that persist warrant an appropriate clinical assessment — this app does not diagnose.</span>
        </div>
      )}
      {gate.overall === 'OK' && changes.length === 0 && <div className="text-[15px] text-muted">Nothing flagged — the plan runs as written.</div>}
    </div>
  )
}

// --- completed summary -----------------------------------------------------------------------

function CompletedView({ session, sets, library, today }: { session: WorkoutSession; sets: ExerciseSet[]; library: Exercise[]; today: string }) {
  const navigate = useNavigate()
  const byId = useMemo(() => exerciseMap(library), [library])
  const grouped = useMemo(() => setsByExercise(sets), [sets])
  const prs = useMemo(() => sessionPRs(session, sets, library), [session, sets, library])
  const symptoms = useQuery(() => getSymptomChecks(120).filter((s) => s.sessionId === session.id).sort((a, b) => a.ts.localeCompare(b.ts)), [session.id])
  const status = sessionStatusInfo(session, today)

  // Exercises in plan order, then any logged exercise no longer in the plan (swapped mid-session).
  const rows: { id: string; planned: PlannedExercise | null; sets: ExerciseSet[] }[] = []
  const seen = new Set<string>()
  for (const p of session.exercises) { rows.push({ id: p.exerciseId, planned: p, sets: grouped.get(p.exerciseId) ?? [] }); seen.add(p.exerciseId) }
  for (const [exId, list] of grouped) if (!seen.has(exId)) rows.push({ id: exId, planned: null, sets: list })

  const painCount = sets.filter((s) => s.painFlag).length
  const volume = sessionVolumeKg(sets)

  return (
    <Screen
      pillar="train"
      title={session.name}
      back="/train"
      backLabel="Train"
      eyebrow={`${status.label} · ${dayName(session.scheduledDate)} ${fmtDate(session.scheduledDate)}${session.completedAt ? ` · ${fmtTime(session.completedAt)}` : ''}`}
    >
      <div className="flex flex-col gap-3 pb-10">
        <div className="grid grid-cols-2 gap-3 anim-rise">
          <StatTile label="Volume" value={volume > 0 ? fmtVolume(volume) : '—'} unit={volume > 0 ? 'kg' : undefined} icon={Weight} pillar="train" />
          <StatTile label="Duration" value={session.durationMin != null ? session.durationMin : '—'} unit={session.durationMin != null ? 'min' : undefined} icon={Clock3} />
          <StatTile label="Sets" value={sets.length} icon={Layers} />
          <StatTile label="Personal bests" value={prs.length} icon={Trophy} />
        </div>

        <Card className="anim-rise">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow text-muted">Session effort</div>
              <div className="mt-1.5 flex items-baseline gap-1"><span className="num text-4xl text-app">{session.sessionRpe ?? '—'}</span>{session.sessionRpe != null && <span className="text-sm font-medium text-muted">/ 10 RPE</span>}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow text-muted mb-1.5">Readiness that day</div>
              {session.readiness ? <ReadinessBadge state={session.readiness} compact /> : <span className="text-sm text-muted">Not recorded</span>}
            </div>
          </div>
        </Card>

        {prs.length > 0 && (
          <Card pillar="train" eyebrow="Personal bests" action={<Trophy size={18} className="text-pillar" aria-hidden />} className="anim-rise">
            <ul className="flex flex-col gap-2 text-[15px]">
              {prs.map((p) => (
                <li key={p.exerciseId} className="flex items-baseline justify-between gap-2">
                  <span className="font-medium min-w-0 truncate">{p.exerciseName}</span>
                  <span className="text-right tnum text-[13px] shrink-0">
                    {p.timed
                      ? `${p.durationSec != null ? fmtSec(p.durationSec) : `${p.reps} reps`}`
                      : p.loadKg != null ? `${fmtLoad(p.loadKg)} × ${p.reps} · e1RM ${p.value.toFixed(1)} kg` : `${p.reps} reps`}
                    {p.previousBest != null && <span className="text-muted"> (was {p.timed ? fmtSec(Math.round(p.previousBest)) : `${p.previousBest.toFixed(1)} kg`})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card flush eyebrow="Exercises" subtitle={painCount ? `${painCount} set${painCount === 1 ? '' : 's'} flagged for pain` : undefined} className="anim-rise">
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const ex = byId.get(r.id)
              const timed = ex ? ex.timed : false
              const subFrom = r.planned?.substitutedFrom ? byId.get(r.planned.substitutedFrom)?.name ?? r.planned.substitutedFrom : null
              return (
                <li key={r.id}>
                  <button type="button" className="w-full min-h-[56px] px-4 py-2.5 flex items-center gap-3 text-left active:bg-surface-2" onClick={() => navigate(`/train/exercise/${r.id}`)}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-[15px] truncate">{ex?.name ?? r.id}</span>
                        <span className="text-xs text-muted tnum shrink-0">{r.sets.length}{r.planned ? `/${r.planned.sets}` : ''} sets</span>
                      </span>
                      <span className={cx('block text-[13px] tnum mt-0.5', r.sets.length ? 'text-app' : 'text-muted')}>
                        {r.sets.length ? summarizeSets(r.sets, timed) : 'Not logged'}
                        {rirSummary(r.sets) ? <span className="text-muted"> · {rirSummary(r.sets)}</span> : null}
                      </span>
                      {r.sets.some((s) => s.painFlag) && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-warn"><TriangleAlert size={12} aria-hidden />Pain flagged</span>
                      )}
                      {subFrom && <span className="mt-0.5 flex items-start gap-1 text-xs text-muted"><ArrowLeftRight size={12} className="shrink-0 mt-0.5" aria-hidden />Replaced {subFrom}{r.planned?.substitutionReason ? ` — ${r.planned.substitutionReason}` : ''}</span>}
                    </span>
                    <ChevronRight size={16} className="text-faint shrink-0" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        {symptoms.length > 0 && (
          <Card eyebrow="Symptoms reported">
            <ul className="flex flex-col gap-1.5 text-sm">
              {symptoms.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-2">
                  <span><span className="font-medium">{REGION_LABELS[s.region]}</span> <span className="text-muted">· {s.context.replace('_', '-')}</span></span>
                  <span><span className="num text-lg">{s.painScore}</span><span className="text-muted text-xs"> / 10</span></span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {session.notes && (
          <Card eyebrow="Notes"><p className="text-[15px] whitespace-pre-wrap leading-snug">{session.notes}</p></Card>
        )}

        <Button variant="secondary" full icon={<Dumbbell size={16} />} onClick={() => navigate('/train')} className="mt-2">Back to Train</Button>
      </div>
    </Screen>
  )
}
