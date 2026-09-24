// Focus Mode (docs/PRD_FOCUS_MODE.md): the BFT-style workout screen. One movement at a time, full screen:
// the animation, set n of total, the target, a countdown for timed moves and rests, elapsed and remaining
// time, and one big button. Logging goes through useSetLogger, so rows match the list view exactly.
// Rendered by WorkoutScreen, which owns the gate, rest timer, pain, substitute and finish handlers.
import { useEffect, useState } from 'react'
import { ArrowLeftRight, Bandage, Check, Ellipsis, Flag, List, Play, Settings2 } from 'lucide-react'
import type { Exercise, ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import { Button, ExerciseVisual, Field, IconButton, ListRow, NumberInput, Sheet } from '../../components'
import { cx } from '../../lib/util'
import { fmtClock, fmtLoad } from './helpers'
import type { RestTimer } from './useRestTimer'
import { useSetLogger, type LoggedSet } from './useSetLogger'

export interface FocusModeProps {
  session: WorkoutSession
  planned: PlannedExercise
  exercise: Exercise
  sets: ExerciseSet[]
  stopped: boolean
  painNext: boolean
  /** 1-based position of this exercise and the session's exercise count. */
  position: { n: number; total: number }
  progress: { logged: number; total: number }
  elapsed: string
  remaining: string
  timer: RestTimer
  onLogged(set: LoggedSet): void
  onList(): void
  onPain(): void
  onSubstitute(): void
  onOptions(): void
  onFinish(): void
}

function useCountdown(endAt: number | null, onZero: () => void): number {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (endAt == null) { setLeft(0); return }
    let fired = false
    const tick = () => {
      const s = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setLeft(s)
      if (s <= 0 && !fired) { fired = true; onZero() }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
    // onZero is read once per countdown; a new endAt starts a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt])
  return left
}

export function FocusMode(p: FocusModeProps) {
  const logger = useSetLogger({ session: p.session, planned: p.planned, exercise: p.exercise, sets: p.sets, stopped: p.stopped, painNext: p.painNext })
  const { timed, loadable, reps, setReps, load, setLoad, duration, setDuration, canLog } = logger
  const [menuOpen, setMenuOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [timedEndAt, setTimedEndAt] = useState<number | null>(null)
  const [timedStartAt, setTimedStartAt] = useState<number | null>(null)

  const commit = (override?: { durationSec?: number }) => {
    const logged = logger.log({ override })
    setTimedEndAt(null)
    setTimedStartAt(null)
    if (logged) p.onLogged(logged)
  }
  const timedLeft = useCountdown(timedEndAt, () => commit({ durationSec: duration ?? undefined }))

  const resting = p.timer.running
  const setNo = Math.min(p.sets.length + 1, p.planned.sets)
  const pct = p.progress.total > 0 ? Math.min(100, Math.round((p.progress.logged / p.progress.total) * 100)) : 0
  const target = timed
    ? `${duration ?? p.planned.repMin} s`
    : `${reps ?? p.planned.repMin} reps${loadable && load != null ? ` · ${fmtLoad(load)}` : ''}`

  const primary = () => {
    if (timed) {
      if (timedEndAt != null) {
        // Done early: log the seconds actually held.
        const held = timedStartAt != null ? Math.max(1, Math.round((Date.now() - timedStartAt) / 1000)) : duration ?? undefined
        commit({ durationSec: held })
        return
      }
      const sec = duration ?? p.planned.repMin
      setTimedStartAt(Date.now())
      setTimedEndAt(Date.now() + sec * 1000)
      return
    }
    commit()
  }

  return (
    <div
      data-pillar="train"
      className="fixed inset-0 z-[35] flex flex-col bg-app"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col px-4 pb-4 min-h-0">
        {/* Top: list · progress · menu */}
        <div className="flex h-14 items-center gap-2">
          <IconButton icon={<List size={22} />} label="Show the list view" onClick={p.onList} className="-ml-2" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Sets done" aria-valuemin={0} aria-valuemax={p.progress.total} aria-valuenow={p.progress.logged}>
            <div className="h-full rounded-full bg-pillar transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted tnum whitespace-nowrap">{p.progress.logged} / {p.progress.total}</span>
          <IconButton icon={<Ellipsis size={22} />} label="Exercise options" onClick={() => setMenuOpen(true)} className="-mr-2 text-muted" />
        </div>

        {/* Clocks */}
        <div className="flex items-baseline justify-between text-[13px] text-muted">
          <span role="timer" aria-label={`Elapsed ${p.elapsed}`}><span className="num text-xl text-app">{p.elapsed}</span> elapsed</span>
          <span>{p.remaining}</span>
        </div>

        {/* Stage: during a rest it already shows the upcoming movement, dimmed. */}
        <div className={cx('mt-3 transition-opacity', resting && 'opacity-40')}>
          <ExerciseVisual exercise={p.exercise} size="hero" className="aspect-square! max-h-[44dvh]" />
        </div>

        <div className="mt-3">
          <div className="eyebrow text-pillar">{resting ? 'Up next' : `Exercise ${p.position.n} of ${p.position.total}`}</div>
          <h1 className="display mt-1 text-[1.9rem] leading-[1.05] text-app line-clamp-2">{p.exercise.name}</h1>
        </div>

        {/* Numbers */}
        <div className="mt-auto pt-3">
          {resting ? (
            <div className="text-center">
              <div className="eyebrow text-muted">Rest</div>
              <div className="num text-[5.5rem] leading-none text-app" role="timer" aria-label={`Rest ${fmtClock(p.timer.remaining)}`}>{fmtClock(p.timer.remaining)}</div>
              <div className="mt-3 flex justify-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => p.timer.extend(-15)}>−15 s</Button>
                <Button variant="secondary" size="sm" onClick={() => p.timer.extend(15)}>+15 s</Button>
                <Button variant="secondary" size="sm" onClick={p.timer.skip}>Skip</Button>
              </div>
              <p className="mt-3 text-sm text-muted">Next: set {setNo} of {p.planned.sets} · {target}</p>
            </div>
          ) : timedEndAt != null ? (
            <div className="text-center">
              <div className="eyebrow text-muted">Set {setNo} of {p.planned.sets}</div>
              <div className="num text-[5.5rem] leading-none text-app" role="timer" aria-label={`${timedLeft} seconds left`}>{fmtClock(timedLeft)}</div>
              <div className="mt-1 text-sm text-muted">of {duration ?? p.planned.repMin} s</div>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow text-muted">Set</div>
                <div className="num text-[4.5rem] leading-none text-app">{setNo}<span className="text-3xl text-muted"> / {p.planned.sets}</span></div>
              </div>
              <button type="button" onClick={() => setAdjustOpen(true)} className="press min-h-14 rounded-2xl px-3 text-right" aria-label={`Target ${target}. Adjust`}>
                <div className="eyebrow text-muted">Target</div>
                <div className="num text-3xl text-app">{target}</div>
              </button>
            </div>
          )}

          {!resting && (
            <Button
              variant="primary"
              size="lg"
              full
              className="mt-4 h-16 text-[18px]"
              icon={timed && timedEndAt == null ? <Play size={20} /> : <Check size={20} />}
              onClick={primary}
              disabled={!canLog && timedEndAt == null}
            >
              {timed ? (timedEndAt != null ? 'Done early' : `Start ${duration ?? p.planned.repMin} s`) : 'Done set'}
            </Button>
          )}
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={p.exercise.name}>
        <div className="-mx-4 flex flex-col">
          <ListRow icon={<Bandage size={18} />} title="Pain / Issue" subtitle="Log it; the plan adapts" onClick={() => { setMenuOpen(false); p.onPain() }} />
          <ListRow icon={<ArrowLeftRight size={18} />} title="Substitute" subtitle="Swap for a safer or free alternative" onClick={() => { setMenuOpen(false); p.onSubstitute() }} />
          <ListRow icon={<Settings2 size={18} />} title="Session options" subtitle="Shorten or skip the session" onClick={() => { setMenuOpen(false); p.onOptions() }} />
          <ListRow icon={<Flag size={18} />} title="Finish session" onClick={() => { setMenuOpen(false); p.onFinish() }} />
        </div>
      </Sheet>

      <Sheet open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust this set" footer={<Button full onClick={() => setAdjustOpen(false)}>Done</Button>}>
        <div className="flex flex-col gap-4 pt-1">
          {timed ? (
            <Field label="Seconds" htmlFor="focus-seconds"><NumberInput id="focus-seconds" value={duration} onChange={setDuration} unit="s" min={5} max={3600} step={5} /></Field>
          ) : (
            <Field label="Reps" htmlFor="focus-reps"><NumberInput id="focus-reps" value={reps} onChange={setReps} unit="reps" min={1} max={100} step={1} /></Field>
          )}
          {loadable && <Field label="Load" htmlFor="focus-load"><NumberInput id="focus-load" value={load} onChange={setLoad} unit="kg" min={0} max={500} step={2.5} /></Field>}
        </div>
      </Sheet>
    </div>
  )
}

/** Shown when every planned set is logged (or the rest were stopped). */
export function FocusDone({ onFinish, onList }: { onFinish(): void; onList(): void }) {
  return (
    <div data-pillar="train" className="fixed inset-0 z-[35] flex flex-col items-center justify-center gap-4 bg-app px-6 text-center">
      <div className="display text-[2.2rem] leading-tight text-app">All sets done</div>
      <p className="text-muted">Nice work. Wrap it up to save the session.</p>
      <Button variant="primary" size="lg" full className="max-w-sm" icon={<Check size={20} />} onClick={onFinish}>Finish session</Button>
      <Button variant="ghost" onClick={onList}>Review in the list</Button>
    </div>
  )
}
