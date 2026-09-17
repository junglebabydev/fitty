import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronRight, CircleCheck, Clock3, Pause, Play, ShieldCheck, SkipForward, Undo2 } from 'lucide-react'
import type { MobilitySession } from '../domain/types'
import { Button, Card, Chip, Illustration, ListRow, MuscleMap, Screen, useToast } from '../components'
import { useQuery } from '../hooks'
import { addMobilitySession, getMobilitySessions } from '../db/repositories'
import { MOBILITY_ROUTINES, getMobilityRoutine, routinesFor, type MobilityContext, type MobilityRegion, type MobilityRoutine } from '../data'
import { acquireWakeLock } from '../native'
import { addDays, cx, dateOf, fmtDate, fmtTime, nowIso, todayStr } from '../lib/util'
import { fmtClock } from '../features/workout'

type ContextFilter = 'any' | MobilityContext

const REGIONS: { value: MobilityRegion; label: string }[] = [
  { value: 'hips', label: 'Hips' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'back', label: 'Back' },
  { value: 'neck', label: 'Neck' },
  { value: 'general', label: 'General' },
]

/** Mobility regions → muscle names the MuscleMap understands. */
const REGION_MUSCLES: Record<MobilityRegion, string[]> = {
  hips: ['glutes', 'hip flexors'],
  hamstrings: ['hamstrings'],
  shoulders: ['shoulders', 'rear delts'],
  back: ['mid back', 'lower back'],
  neck: ['neck'],
  general: [],
}

function routineMuscles(r: MobilityRoutine): string[] {
  return [...new Set(r.regions.flatMap((x) => REGION_MUSCLES[x]))]
}

const CONTEXTS: { value: ContextFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'pre_upper', label: 'Before upper' },
  { value: 'pre_lower', label: 'Before lower' },
  { value: 'post', label: 'After training' },
  { value: 'recovery', label: 'Recovery' },
]

/** Mobility (PRD §8): routines filtered by region/context, step-through timer, completion history. */
export default function MobilityScreen() {
  const [params, setParams] = useSearchParams()
  const routineId = params.get('routine')
  const routine = routineId ? getMobilityRoutine(routineId) : null

  if (routine) return <RoutineView routine={routine} onBack={() => setParams({}, { replace: true })} />
  return <RoutineList onOpen={(id) => setParams({ routine: id })} />
}

// --- list -----------------------------------------------------------------------------------

function RoutineList({ onOpen }: { onOpen(id: string): void }) {
  const [regions, setRegions] = useState<MobilityRegion[]>([])
  const [context, setContext] = useState<ContextFilter>('any')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const history = useQuery(() => getMobilitySessions(60), [])

  const routines = useMemo<MobilityRoutine[]>(() => {
    if (context !== 'any') return routinesFor(context, regions.length ? regions : undefined)
    const wanted = regions.length ? regions : null
    const list = MOBILITY_ROUTINES.filter((r) => !wanted || r.regions.some((x) => wanted.includes(x)))
    if (!wanted) return list.slice().sort((a, b) => a.durationMin - b.durationMin)
    const overlap = (r: MobilityRoutine) => r.regions.filter((x) => wanted.includes(x)).length
    return list.slice().sort((a, b) => overlap(b) - overlap(a) || a.durationMin - b.durationMin)
  }, [regions, context])

  const lastDone = useMemo(() => {
    const m = new Map<string, MobilitySession>()
    for (const h of history) if (!m.has(h.routineId)) m.set(h.routineId, h)
    return m
  }, [history])

  const toggleRegion = (r: MobilityRegion) => setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  const today = todayStr()
  const doneThisWeek = history.filter((h) => h.completed && dateOf(h.ts) >= addDays(today, -6)).length

  return (
    <Screen pillar="train" title="Mobility" back="/train" backLabel="Train" eyebrow={doneThisWeek ? `${doneThisWeek} completed in the last 7 days` : 'Short guided routines'}>
      <div className="flex flex-col gap-3 pb-32">
        {/* Filters: where (multi), then when (single) */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="Body regions">
          {REGIONS.map((r) => (
            <Chip key={r.value} selected={regions.includes(r.value)} check onClick={() => toggleRegion(r.value)} className="h-11 shrink-0">{r.label}</Chip>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="When">
          {CONTEXTS.map((c) => (
            <Chip key={c.value} selected={context === c.value} tone="neutral" onClick={() => setContext(c.value)} className="h-11 shrink-0">{c.label}</Chip>
          ))}
        </div>

        {routines.length === 0 ? (
          <Card>
            <p className="voice text-xl text-app">No routine matches those filters.</p>
            <Button variant="secondary" className="mt-3" onClick={() => { setRegions([]); setContext('any') }}>Clear filters</Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {routines.map((r, i) => {
              const last = lastDone.get(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="press anim-rise w-full text-left rounded-[1.25rem] border border-line bg-surface p-4 flex items-center gap-4"
                  style={{ '--i': Math.min(i, 8) } as CSSProperties}
                >
                  <span className="h-[92px] w-[84px] shrink-0 rounded-xl bg-surface-2 flex items-center justify-center text-muted" aria-hidden>
                    {routineMuscles(r).length ? <MuscleMap primary={routineMuscles(r)} size={80} pillar="train" ariaLabel="" /> : <Illustration name="breath" size={64} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[16px] leading-tight">{r.name}</span>
                    <span className="mt-1 flex items-baseline gap-3 text-muted text-xs font-medium">
                      <span><span className="num text-3xl text-app">{r.durationMin}</span> min</span>
                      <span><span className="num text-3xl text-app">{r.movements.length}</span> moves</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5 mt-2">
                      {r.regions.map((x) => <span key={x} className="inline-flex items-center h-6 px-2 rounded-full bg-pillar-soft text-pillar text-[11px] font-semibold capitalize">{x}</span>)}
                    </span>
                    {last && <span className="block text-xs text-muted mt-1.5">Last done {dateOf(last.ts) === today ? 'today' : fmtDate(dateOf(last.ts))}</span>}
                  </span>
                  <ChevronRight size={18} className="text-faint shrink-0" aria-hidden />
                </button>
              )
            })}
          </div>
        )}

        <div className="pt-4 px-1">
          <h2 className="display text-2xl text-app">History</h2>
          {history.length > 0 && <p className="text-[13px] text-muted mt-0.5">{history.length} in the last 60 days</p>}
        </div>
        {history.length === 0 ? (
          <Card><div className="flex items-center gap-4 text-muted"><Illustration name="breath" size={72} /><p className="voice text-lg text-app">Nothing logged yet.</p></div></Card>
        ) : (
          <Card flush>
            <ul className="divide-y divide-line">
              {history.slice(0, showAllHistory ? 20 : 3).map((h) => {
                const r = getMobilityRoutine(h.routineId)
                return (
                  <li key={h.id}>
                    <ListRow
                      icon={h.completed ? <CircleCheck size={18} className="text-pillar" /> : <Clock3 size={18} />}
                      title={r?.name ?? h.routineId}
                      subtitle={`${fmtDate(dateOf(h.ts))} · ${fmtTime(h.ts)} · ${h.movements.length}${r ? `/${r.movements.length}` : ''} movements`}
                      right={<span className="text-xs font-semibold">{h.completed ? 'Done' : 'Partial'}</span>}
                      onClick={r ? () => onOpen(r.id) : undefined}
                    />
                  </li>
                )
              })}
            </ul>
            {history.length > 3 && !showAllHistory && (
              <button type="button" className="w-full min-h-11 py-2.5 text-sm text-app font-semibold flex items-center justify-center gap-1 border-t border-line active:bg-surface-2" onClick={() => setShowAllHistory(true)}>
                See all <ChevronRight size={14} aria-hidden />
              </button>
            )}
          </Card>
        )}
      </div>
    </Screen>
  )
}

// --- routine detail + step-through timer -------------------------------------------------------

type Phase = 'idle' | 'running' | 'paused' | 'done'

function RoutineView({ routine, onBack }: { routine: MobilityRoutine; onBack(): void }) {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('idle')
  const [step, setStep] = useState(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const endAt = useRef<number | null>(null)
  const pausedLeft = useRef<number | null>(null)
  const recorded = useRef(false)

  const current = routine.movements[step]
  const total = routine.movements.length

  // Wake lock while running.
  useEffect(() => {
    if (phase !== 'running') return
    let release: (() => void) | null = null
    let cancelled = false
    acquireWakeLock().then((r) => { if (cancelled) r(); else release = r }).catch(() => {})
    return () => { cancelled = true; release?.() }
  }, [phase])

  // Countdown for timed movements.
  useEffect(() => {
    if (phase !== 'running' || !current?.durationSec) return
    if (endAt.current == null) endAt.current = Date.now() + (pausedLeft.current ?? current.durationSec) * 1000
    pausedLeft.current = null
    const tick = () => {
      const left = Math.max(0, Math.ceil(((endAt.current ?? 0) - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        try { navigator.vibrate?.(150) } catch { /* unsupported */ }
        advance()
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step])

  const start = () => {
    recorded.current = false
    setCompletedSteps([])
    setStep(0)
    endAt.current = null
    pausedLeft.current = null
    setRemaining(routine.movements[0]?.durationSec ?? null)
    setPhase('running')
  }

  const advance = () => {
    const name = routine.movements[step]?.name
    setCompletedSteps((prev) => (name && !prev.includes(name) ? [...prev, name] : prev))
    endAt.current = null
    pausedLeft.current = null
    if (step + 1 >= total) {
      setPhase('done')
      setRemaining(null)
      return
    }
    setStep(step + 1)
    setRemaining(routine.movements[step + 1]?.durationSec ?? null)
  }

  const skip = () => {
    endAt.current = null
    pausedLeft.current = null
    if (step + 1 >= total) { setPhase('done'); setRemaining(null); return }
    setStep(step + 1)
    setRemaining(routine.movements[step + 1]?.durationSec ?? null)
  }

  const back = () => {
    if (step === 0) return
    endAt.current = null
    pausedLeft.current = null
    setStep(step - 1)
    setRemaining(routine.movements[step - 1]?.durationSec ?? null)
  }

  const pause = () => {
    if (current?.durationSec && endAt.current != null) pausedLeft.current = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))
    endAt.current = null
    setPhase('paused')
  }

  const resume = () => setPhase('running')

  const finishEarly = () => {
    endAt.current = null
    setPhase('done')
    setRemaining(null)
  }

  // Record once when done.
  useEffect(() => {
    if (phase !== 'done' || recorded.current) return
    recorded.current = true
    const done = completedSteps.length >= total
    addMobilitySession({ routineId: routine.id, ts: nowIso(), movements: completedSteps, completed: done })
    toast.show(done ? `${routine.name} complete` : `${routine.name} saved (${completedSteps.length}/${total})`, done ? 'success' : 'info')
  }, [phase, completedSteps, total, routine.id, routine.name, toast])

  const active = phase === 'running' || phase === 'paused'

  const nextUp = routine.movements[step + 1]

  return (
    <Screen pillar="train" title={routine.name} back="/train/mobility" backLabel="Mobility" eyebrow={`${routine.durationMin} min · ${routine.regions.join(', ')}`}>
      <div className="flex flex-col gap-3 pb-32">
        {/* Focused player */}
        {active && current && (
          <section className="rounded-[1.25rem] border border-pillar-line bg-surface px-4 pt-4 pb-5 anim-rise" aria-label={`Movement ${step + 1} of ${total}: ${current.name}`}>
            <div className="flex items-center gap-1.5" role="img" aria-label={`Movement ${step + 1} of ${total}`}>
              {routine.movements.map((m, i) => (
                <span key={m.name} className={cx('h-1.5 flex-1 rounded-full', i < step ? 'bg-pillar' : i === step ? 'bg-pillar anim-pulse-soft' : 'bg-surface-3')} />
              ))}
            </div>
            <div className="eyebrow text-pillar mt-4">Movement {step + 1} of {total}{phase === 'paused' ? ' · paused' : ''}</div>
            <h2 className="display text-3xl text-app mt-1.5">{current.name}</h2>

            <div className="my-6 text-center" role="timer" aria-live="off">
              {current.durationSec ? (
                <span className="num text-[7rem] text-app">{fmtClock(remaining ?? current.durationSec)}</span>
              ) : (
                <span className="inline-flex items-baseline gap-2"><span className="num text-[7rem] text-app">{current.reps}</span><span className="text-base font-medium text-muted">reps</span></span>
              )}
            </div>

            <p className="voice text-xl text-app text-center text-balance">{current.cue}</p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button type="button" onClick={back} disabled={step === 0} aria-label="Previous movement" className="press h-14 w-14 rounded-full border border-line-strong inline-flex items-center justify-center text-app disabled:opacity-35">
                <Undo2 size={20} aria-hidden />
              </button>
              {!current.durationSec ? (
                <button type="button" onClick={advance} className="press h-16 flex-1 max-w-[180px] rounded-full bg-accent text-accent-fg text-[17px] font-semibold inline-flex items-center justify-center gap-2">
                  <Check size={20} strokeWidth={3} aria-hidden />Done · next
                </button>
              ) : phase === 'running' ? (
                <button type="button" onClick={pause} className="press h-16 flex-1 max-w-[180px] rounded-full bg-accent text-accent-fg text-[17px] font-semibold inline-flex items-center justify-center gap-2">
                  <Pause size={20} aria-hidden />Pause
                </button>
              ) : (
                <button type="button" onClick={resume} className="press h-16 flex-1 max-w-[180px] rounded-full bg-accent text-accent-fg text-[17px] font-semibold inline-flex items-center justify-center gap-2">
                  <Play size={20} aria-hidden />Resume
                </button>
              )}
              <button type="button" onClick={skip} aria-label="Skip this movement" className="press h-14 w-14 rounded-full border border-line-strong inline-flex items-center justify-center text-app">
                <SkipForward size={20} aria-hidden />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 text-[13px] text-muted">
              <span className="min-w-0 truncate">{nextUp ? `Up next: ${nextUp.name}` : 'Last movement'}</span>
              <button type="button" onClick={finishEarly} className="press shrink-0 h-11 px-3 -mr-3 rounded-xl font-semibold text-app">Finish early</button>
            </div>
          </section>
        )}

        {phase === 'done' && (
          <Card pillar="train" className="anim-pop">
            <div className="flex items-center gap-3">
              <CircleCheck size={28} className="text-pillar shrink-0" aria-hidden />
              <div>
                <div className="font-semibold text-[17px] leading-tight">{completedSteps.length >= total ? 'Routine complete' : `Saved — ${completedSteps.length} of ${total} movements`}</div>
                <div className="text-[13px] text-muted mt-0.5">Logged to your mobility history.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={start} icon={<Play size={16} />}>Again</Button>
              <Button variant="primary" onClick={onBack} icon={<ChevronRight size={16} />}>All routines</Button>
            </div>
          </Card>
        )}

        {phase === 'idle' && (
          <Card pillar="train" className="anim-rise">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow text-pillar">Guided routine</div>
                <div className="mt-2 flex items-baseline gap-1.5"><span className="num text-6xl text-app">{routine.durationMin}</span><span className="text-sm font-medium text-muted">min · {total} movements</span></div>
              </div>
            </div>
            <Button variant="primary" size="lg" full className="mt-4" icon={<Play size={20} />} onClick={start}>Start routine</Button>
          </Card>
        )}

        <div className="rounded-[1.25rem] border border-line bg-surface px-4 py-3 flex items-start gap-2.5 text-sm leading-snug">
          <ShieldCheck size={17} className="text-ok shrink-0 mt-0.5" aria-hidden />
          <span className="text-muted"><span className="text-app font-medium">Keep it gentle. </span>{routine.safetyNote}</span>
        </div>

        {!active && (
          <Card flush eyebrow="Movements">
            <ul className="divide-y divide-line">
              {routine.movements.map((m, i) => {
                const done = completedSteps.includes(m.name)
                return (
                  <li key={m.name} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className={cx('mt-0.5 h-6 w-6 rounded-full inline-flex items-center justify-center shrink-0', done ? 'bg-pillar text-accent-fg' : 'bg-surface-2 text-muted')}>
                        {done ? <Check size={13} strokeWidth={3} aria-label="Done" /> : <span className="num text-sm">{i + 1}</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-[15px]">{m.name}</span>
                          <span className="shrink-0 text-muted text-xs"><span className="num text-base text-app">{m.durationSec ?? m.reps}</span> {m.durationSec ? 's' : 'reps'}</span>
                        </div>
                        <div className="text-[13px] text-muted leading-snug mt-0.5">{m.cue}</div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </Screen>
  )
}
