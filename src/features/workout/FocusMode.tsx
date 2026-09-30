// Focus Mode (docs/PRD_FOCUS_MODE.md): one movement at a time. The movement fills a white stage; a dark panel
// holds one huge number (target reps, or the timed-set / rest countdown), set n / total, elapsed and time left,
// a segment per exercise, quiet Prev / Next, and one full-width primary button. Pain is a quiet one-tap text
// button; everything else lives behind ···. Logging goes through useSetLogger, so rows match the list view exactly.
// Rendered by WorkoutScreen, which owns the gate, rest timer, pain, substitute and finish handlers.
import { useEffect, useState, type TouchEvent } from 'react'
import { ArrowLeftRight, Bandage, Check, ChevronLeft, ChevronRight, Ellipsis, Flag, List, Play, Settings2, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { Exercise, ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import type { GateResult } from '../../engine'
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
  /** 0-based index of this exercise, and one entry per exercise for the segmented progress bar. */
  index: number
  segments: { done: number; planned: number; stopped: boolean }[]
  /** Name of the exercise after this one, or null on the last. */
  nextName: string | null
  /** Browse to the previous / next exercise without logging (null = nothing that way). */
  onPrev: (() => void) | null
  onNext: (() => void) | null
  progress: { logged: number; total: number }
  elapsed: string
  remaining: string
  timer: RestTimer
  /** Today's symptom gate: shown only when it changed something (not OK). */
  gate: Pick<GateResult, 'overall' | 'advice'>
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
  const [gateOpen, setGateOpen] = useState(false)
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

  const station = p.index + 1
  const main = resting ? fmtClock(p.timer.remaining) : timedEndAt != null ? fmtClock(timedLeft) : timed ? `${duration ?? p.planned.repMin}` : `${reps ?? p.planned.repMin}`
  const mainUnit = resting ? 'rest' : timedEndAt != null ? `of ${duration ?? p.planned.repMin} s` : timed ? 'seconds' : `reps${loadable && load != null ? ` · ${fmtLoad(load)}` : ''}`
  const primaryLabel = resting ? 'Skip rest' : timed ? (timedEndAt != null ? 'Done early' : `Start ${duration ?? p.planned.repMin} s`) : 'Done set'

  // Swipe down on the stage goes back to the list (PRD §4). Only the stage listens, so sheets never trigger it.
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const onStageTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0]
    if (touchStart && t) {
      const dy = t.clientY - touchStart.y
      if (dy > 80 && Math.abs(t.clientX - touchStart.x) < dy / 2) p.onList()
    }
    setTouchStart(null)
  }
  const left = p.remaining.endsWith('min') ? `${p.remaining} left` : p.remaining

  return (
    <div data-pillar="train" className="fixed inset-0 z-[35] flex flex-col bg-media text-media-fg" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col min-h-0">
        {/* Top bar: list · menu. Nothing else. */}
        <div className="flex h-12 shrink-0 items-center justify-between px-2">
          <IconButton icon={<List size={22} />} label="Show the list view" onClick={p.onList} className="text-media-fg" />
          <IconButton icon={<Ellipsis size={22} />} label="Exercise options" onClick={() => setMenuOpen(true)} className="text-media-fg" />
        </div>

        {/* Stage: the movement */}
        <div
          className={cx('relative flex-1 min-h-0 px-4 transition-opacity', resting && 'opacity-50')}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) setTouchStart({ x: t.clientX, y: t.clientY }) }}
          onTouchEnd={onStageTouchEnd}
        >
          <ExerciseVisual exercise={p.exercise} size="hero" className="h-full! w-full aspect-auto! border-0! bg-transparent!" />
        </div>
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow opacity-60">{resting ? 'Up next' : `${station} of ${p.segments.length}`}</div>
            {/* Pain stays one tap away (DESIGN §11 invariant). */}
            <button type="button" onClick={p.onPain} aria-label="Report pain or an issue" className="press -mr-2 inline-flex h-11 items-center gap-1.5 px-2 text-[15px] font-medium opacity-60">
              <Bandage size={16} aria-hidden />Pain
            </button>
          </div>
          <h1 className="display text-[1.75rem] leading-[1.1] line-clamp-2">{p.exercise.name}</h1>
        </div>

        {/* Dark data panel: one big number, the set, the clock, one button */}
        <div className="shrink-0 rounded-t-[1.75rem] bg-panel px-5 pt-5 text-panel-fg" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          <div className="flex items-end justify-between gap-3">
            <button
              type="button"
              onClick={() => { if (!resting && timedEndAt == null) setAdjustOpen(true) }}
              className="press min-w-0 text-left"
              aria-label={resting ? `Rest ${main}` : `${main} ${mainUnit}. Adjust`}
            >
              <div className="num whitespace-nowrap text-[4.5rem] leading-none" role={resting || timedEndAt != null ? 'timer' : undefined}>{main}</div>
              <div className="mt-1 truncate text-[15px] opacity-60">{mainUnit}</div>
            </button>
            <div className="shrink-0 pb-6 text-right" aria-label={`Set ${setNo} of ${p.planned.sets}`}>
              <div className="num whitespace-nowrap text-4xl leading-none">{setNo}<span className="text-xl opacity-50"> / {p.planned.sets}</span></div>
            </div>
          </div>

          {resting && (
            <div className="-ml-2 mt-1 flex gap-1">
              <button type="button" onClick={() => p.timer.extend(-15)} aria-label="Remove 15 seconds of rest" className="press h-11 px-2 text-[15px] font-medium opacity-60">−15 s</button>
              <button type="button" onClick={() => p.timer.extend(15)} aria-label="Add 15 seconds of rest" className="press h-11 px-2 text-[15px] font-medium opacity-60">+15 s</button>
            </div>
          )}

          {/* One segment per exercise, filling set by set */}
          <div className="mt-4 flex gap-1" role="progressbar" aria-label="Sets done" aria-valuemin={0} aria-valuemax={p.progress.total} aria-valuenow={p.progress.logged}>
            {p.segments.map((seg, i) => (
              <div key={i} className={cx('h-1 flex-1 overflow-hidden rounded-full bg-panel-fg/15', i === p.index && 'ring-1 ring-panel-fg/50')}>
                <div className="h-full rounded-full bg-pillar" style={{ width: `${seg.stopped ? 100 : Math.min(100, (seg.done / Math.max(1, seg.planned)) * 100)}%`, opacity: seg.stopped ? 0.35 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 whitespace-nowrap text-[15px] opacity-60">
            <span className="tnum" role="timer" aria-label={`Elapsed ${p.elapsed}`}>{p.elapsed}</span>
            <span className="tnum">{left}</span>
          </div>

          {/* Quiet browse: previous · what's next · next */}
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={p.onPrev ?? undefined} disabled={!p.onPrev} aria-label="Previous exercise" className="press -ml-3 flex h-11 w-11 shrink-0 items-center justify-center opacity-60 disabled:opacity-20">
              <ChevronLeft size={22} aria-hidden />
            </button>
            <div className="min-w-0 flex-1 truncate text-center text-[15px] opacity-60">{p.nextName ? `Next: ${p.nextName}` : 'Last exercise'}</div>
            <button type="button" onClick={p.onNext ?? undefined} disabled={!p.onNext} aria-label="Next exercise" className="press -mr-3 flex h-11 w-11 shrink-0 items-center justify-center opacity-60 disabled:opacity-20">
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={resting ? p.timer.skip : primary}
            disabled={!resting && !canLog && timedEndAt == null}
            className="press mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-pillar text-[17px] font-semibold text-accent-fg disabled:opacity-40"
          >
            {!resting && (timed && timedEndAt == null ? <Play size={20} aria-hidden /> : <Check size={20} aria-hidden />)}
            {primaryLabel}
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={p.exercise.name}>
        <div className="-mx-4 flex flex-col">
          {p.gate.overall !== 'OK' && (
            <ListRow
              icon={p.gate.overall === 'RED' ? <ShieldAlert size={18} className="text-stop" /> : <TriangleAlert size={18} className="text-warn" />}
              title={p.gate.overall === 'RED' ? 'Protect it today' : 'Modified for today'}
              onClick={() => { setMenuOpen(false); setGateOpen(true) }}
            />
          )}
          <ListRow icon={<Bandage size={18} />} title="Pain / Issue" onClick={() => { setMenuOpen(false); p.onPain() }} />
          <ListRow icon={<ArrowLeftRight size={18} />} title="Substitute" onClick={() => { setMenuOpen(false); p.onSubstitute() }} />
          <ListRow icon={<Settings2 size={18} />} title="Session options" subtitle="Shorten or skip" onClick={() => { setMenuOpen(false); p.onOptions() }} />
          <ListRow icon={<Flag size={18} />} title="Finish session" onClick={() => { setMenuOpen(false); p.onFinish() }} />
        </div>
      </Sheet>

      <Sheet open={gateOpen} onClose={() => setGateOpen(false)} title={p.gate.overall === 'RED' ? 'Protect it today' : 'Modified for today'}>
        <ul className="flex flex-col gap-2 pt-1 text-[15px] leading-snug">
          {p.gate.advice.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
        {p.gate.overall === 'RED' && (
          <p className="mt-3 text-sm text-muted leading-snug">Provocative exercises were swapped or removed. This is not a diagnosis — pain above 5/10 or red-flag symptoms that persist warrant a clinical assessment.</p>
        )}
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
      <Button variant="primary" size="lg" full className="mt-2 max-w-sm" icon={<Check size={20} />} onClick={onFinish}>Finish session</Button>
      <Button variant="ghost" onClick={onList}>Review in the list</Button>
    </div>
  )
}
