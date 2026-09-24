import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight, Bandage, Check, ChevronDown, ChevronRight, ChevronUp, Equal, Keyboard, Mic, MicOff, Play, Plus, ShieldAlert, Square,
  TrendingDown, TrendingUp, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import type { Exercise, ExerciseSet, PlannedExercise, WorkoutSession } from '../../domain/types'
import { Button, ExerciseVisual, IconButton, TextInput, useToast } from '../../components'
import { formatNumberInput, parseNumberInput } from '../../components/util'
import { deleteSet } from '../../db/repositories'
import type { ProgressionAction } from '../../engine'
import { cx } from '../../lib/util'
import { fmtSec, summarizeSets } from './helpers'
import { useSetLogger, type LoggedSet } from './useSetLogger'
import { useVoiceSet } from './useVoiceSet'

export type { LivePR } from './useSetLogger'

export interface ExerciseCardProps {
  session: WorkoutSession
  index: number
  planned: PlannedExercise
  exercise: Exercise
  /** Sets logged for this exercise in this session, in log order. */
  sets: ExerciseSet[]
  library: Exercise[]
  /** True after a red-flag report: no more sets can be logged. */
  stopped: boolean
  /** The next logged set gets a pain flag (pain reported before any set was logged). */
  painNext: boolean
  onLogged(set: LoggedSet): void
  onSubstitute(): void
  onPain(): void
}

type ChipKind = ProgressionAction | 'reduced'

const CHIP_META: Record<ChipKind, { label: string; icon: LucideIcon }> = {
  start: { label: 'Start', icon: Play },
  hold: { label: 'Hold', icon: Equal },
  increase: { label: 'Go up', icon: TrendingUp },
  deload: { label: 'Deload', icon: TrendingDown },
  reduced: { label: 'Reduced', icon: ShieldAlert },
}

const RIR_CHIPS = [0, 1, 2, 3, 4]

// SET | PREVIOUS | KG | REPS | RIR | ✓ — fits a 375 px screen with 44 px inputs and check.
const GRID = 'grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.25rem_1.5rem_2.75rem] items-center gap-2'

function fmtKgBare(kg: number | null): string {
  if (kg == null) return 'BW'
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1)
}

/** "26 × 10" / "45 s" — last session's matching set for the PREVIOUS column. */
function previousText(s: ExerciseSet | undefined, timed: boolean): string {
  if (!s) return '—'
  if (timed) return s.durationSec != null ? fmtSec(s.durationSec) : s.reps != null ? `${s.reps} reps` : '—'
  return `${fmtKgBare(s.loadKg)} × ${s.reps ?? '—'}`
}

export function ExerciseCard({ session, index, planned, exercise, sets, library, stopped, painNext, onLogged, onSubstitute, onPain }: ExerciseCardProps) {
  const toast = useToast()
  const logger = useSetLogger({ session, planned, exercise, sets, stopped, painNext })
  const { timed, loadable, history, effective, painHere, reduced, painSub, load, setLoad, reps, setReps, duration, setDuration, rir, setRir, canLog } = logger

  const done = sets.length >= planned.sets
  const [collapsed, setCollapsed] = useState(false)
  const [extra, setExtra] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [textMode, setTextMode] = useState(false)
  const [text, setText] = useState('')
  const [poppedId, setPoppedId] = useState<number | null>(null)
  const pendingVoice = useRef<number>(0)

  // Auto-collapse once the planned sets are in; expand again when a set is removed.
  useEffect(() => { setCollapsed(done); if (!done) setExtra(false) }, [done])

  const voice = useVoiceSet({
    exercises: library,
    onParsed: (r) => {
      if (r.exerciseId && r.exerciseId !== exercise.id) setHint(`Heard "${r.exerciseName}" — filled in here for ${exercise.name}.`)
      else setHint(r.preview)
      if (r.loadKg != null) setLoad(r.loadKg)
      if (r.reps != null) setReps(r.reps)
      if (r.durationSec != null) setDuration(r.durationSec)
      if (r.rir != null) setRir(Math.max(0, Math.min(5, r.rir)))
      pendingVoice.current = r.voiceCommandId
      if (r.painFlag) setHint((h) => `${h ?? ''} Pain mentioned — use Pain / Issue to record it.`.trim())
      setTextMode(false)
      if (done) setExtra(true)
    },
    onOther: (cmd) => setHint(cmd.intent === 'unknown' ? cmd.preview : `That sounded like "${cmd.preview}" — use the main mic for it.`),
  })

  useEffect(() => {
    if (voice.error && /type the set|not available|secure/.test(voice.error)) setTextMode(true)
  }, [voice.error])

  const log = () => {
    const logged = logger.log({ voiceCommandId: pendingVoice.current || undefined })
    if (!logged) return
    pendingVoice.current = 0
    setHint(null)
    setPoppedId(logged.id)
    onLogged(logged)
  }

  const remove = (s: ExerciseSet) => {
    deleteSet(s.id)
    toast.show('Set removed', 'info')
  }

  const copyPrevious = (p: ExerciseSet) => {
    if (loadable && p.loadKg != null) setLoad(p.loadKg)
    if (timed) { if (p.durationSec != null) setDuration(p.durationSec) } else if (p.reps != null) setReps(p.reps)
    if (!timed && p.rir != null) setRir(p.rir)
  }

  const targetLoad = effective.nextLoadKg ?? planned.loadKg
  const painHold = painHere || painSub
  const chipKind: ChipKind = reduced ? 'reduced' : effective.action
  const chip = CHIP_META[chipKind]
  const ChipIcon = chip.icon
  const chipCls = chipKind === 'increase'
    ? 'bg-pillar-soft text-pillar border-pillar-line'
    : chipKind === 'deload' || chipKind === 'reduced' || (chipKind === 'hold' && painHold)
      ? 'bg-warn/10 text-warn border-warn/30'
      : 'bg-surface-2 text-muted border-line'
  const subFrom = planned.substitutedFrom ? library.find((e) => e.id === planned.substitutedFrom)?.name ?? planned.substitutedFrom : null

  const showActive = !stopped && (!done || extra)
  const ghostCount = stopped ? 0 : Math.max(0, planned.sets - sets.length - 1)
  const activeNo = sets.length + 1

  return (
    <section
      className={cx(
        'rounded-[1.25rem] border px-3 py-3',
        stopped ? 'bg-stop/5 border-stop/40' : done ? 'bg-surface border-pillar-line' : 'bg-surface border-line',
      )}
      aria-label={exercise.name}
    >
      {/* Header: visual (thumb when collapsed), name → detail, sets done, collapse */}
      <div className="flex items-center gap-2.5">
        {collapsed ? (
          <ExerciseVisual exercise={exercise} size="thumb" />
        ) : (
          <span className="num text-2xl text-pillar w-6 text-center shrink-0" aria-hidden>{index + 1}</span>
        )}
        <Link to={`/train/exercise/${exercise.id}`} className="press min-w-0 flex-1 min-h-11 inline-flex items-center gap-1 text-app">
          <span className="font-semibold text-[17px] leading-tight line-clamp-2">{exercise.name}</span>
          <ChevronRight size={16} className="text-faint shrink-0" aria-hidden />
        </Link>
        {stopped ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-stop/10 text-stop text-xs font-semibold shrink-0"><Square size={12} aria-hidden />Stopped</span>
        ) : (
          <span className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold tnum shrink-0', done ? 'bg-pillar-soft text-pillar' : 'bg-surface-2 text-muted')}>
            {done && <Check size={12} strokeWidth={3} aria-hidden />}
            {sets.length}/{planned.sets}<span className="sr-only"> sets{done ? ' — done' : ''}</span>
          </span>
        )}
        <IconButton
          icon={collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          label={collapsed ? `Expand ${exercise.name}` : `Collapse ${exercise.name}`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted -mr-1"
        />
      </div>

      {/* Active card leads with the visual. */}
      {!collapsed && (
        <div className="relative mt-1.5 mb-1">
          <ExerciseVisual exercise={exercise} size="card" className="max-h-[168px]" />
        </div>
      )}

      {subFrom && (
        <div className="pl-1 text-xs text-warn flex items-start gap-1 leading-snug">
          <ArrowLeftRight size={12} className="shrink-0 mt-0.5" aria-hidden />
          <span>Replaces {subFrom}{planned.substitutionReason ? ` — ${planned.substitutionReason}` : ''}</span>
        </div>
      )}

      {/* Target line + progression chip; tap to show or hide the reason */}
      <button
        type="button"
        aria-expanded={reasonOpen}
        aria-label={`Target and progression: ${chip.label}. ${reasonOpen ? 'Hide' : 'Show'} the reason`}
        onClick={() => setReasonOpen((v) => !v)}
        className="w-full min-h-11 pl-1 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-left"
      >
        <span className="flex items-baseline gap-1 whitespace-nowrap">
          <span className="num text-2xl text-app">{planned.sets} × {effective.repMin}–{effective.repMax}</span>
          {timed && <span className="text-sm font-medium text-muted">s</span>}
          {loadable && targetLoad != null && (
            <>
              <span className="text-sm font-medium text-muted px-0.5">@</span>
              <span className="num text-2xl text-app">{fmtKgBare(targetLoad)}</span>
              <span className="text-sm font-medium text-muted">kg</span>
            </>
          )}
        </span>
        <span className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-semibold', chipCls)}>
          <ChipIcon size={13} strokeWidth={2.5} aria-hidden />{chip.label}
        </span>
      </button>
      {/* The reason sits behind the chip tap; a pain-driven hold always shows it. */}
      {(reasonOpen || painHold || reduced) && !collapsed && <p className="pl-1 -mt-0.5 text-[13px] text-muted leading-snug">{effective.reason}</p>}
      {collapsed && sets.length > 0 && <p className="pl-1 text-[13px] text-muted tnum truncate">Logged: {summarizeSets(sets, timed)}</p>}

      {!collapsed && (
        <div className="mt-3 flex flex-col gap-1.5">
          {/* Set table */}
          {(sets.length > 0 || showActive) && (
            <div className={cx(GRID, 'px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint')} aria-hidden>
              <span className="text-center">Set</span>
              <span>Previous</span>
              <span className="text-center">Kg</span>
              <span className="text-center">{timed ? 'Sec' : 'Reps'}</span>
              <span className="text-center">RIR</span>
              <span className="flex justify-center"><Check size={12} strokeWidth={3} /></span>
            </div>
          )}

          {sets.map((s, i) => (
            <div key={s.id} className={cx(GRID, 'rounded-xl bg-pillar-soft px-1 py-1', poppedId === s.id && 'anim-pop')}>
              <span className="num text-lg text-pillar text-center">{i + 1}</span>
              {s.painFlag ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn min-w-0"><TriangleAlert size={13} className="shrink-0" aria-hidden /><span className="truncate">Pain flagged</span></span>
              ) : (
                <span className="text-[13px] text-muted tnum truncate">{previousText(history.last[i], timed)}</span>
              )}
              <span className="num text-xl text-app text-center">{loadable ? fmtKgBare(s.loadKg) : 'BW'}</span>
              <span className="num text-xl text-app text-center">{timed ? s.durationSec ?? '—' : s.reps ?? '—'}</span>
              <span className="num text-lg text-muted text-center">{s.rir ?? '—'}</span>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Set ${i + 1} logged. Tap to undo`}
                className="press h-11 w-11 rounded-xl bg-pillar text-accent-fg inline-flex items-center justify-center"
              >
                <Check size={22} strokeWidth={3} aria-hidden />
              </button>
            </div>
          ))}

          {showActive && (
            <>
              <div className={cx(GRID, 'px-1 py-1')}>
                <span className="num text-lg text-app text-center">{activeNo}</span>
                {history.last[sets.length] ? (
                  <button
                    type="button"
                    onClick={() => copyPrevious(history.last[sets.length])}
                    aria-label={`Previous: ${previousText(history.last[sets.length], timed)}. Tap to copy`}
                    className="press h-11 min-w-0 text-left text-[13px] text-muted tnum truncate"
                  >
                    {previousText(history.last[sets.length], timed)}
                  </button>
                ) : (
                  <span className="text-[13px] text-faint">—</span>
                )}
                {loadable ? (
                  <CellInput value={load} onChange={setLoad} label={`Set ${activeNo} load in kilograms`} />
                ) : (
                  <span className="text-sm font-medium text-muted text-center">BW</span>
                )}
                {timed ? (
                  <CellInput value={duration} onChange={setDuration} label={`Set ${activeNo} time in seconds`} placeholder={String(effective.repMin)} />
                ) : (
                  <CellInput value={reps} onChange={setReps} label={`Set ${activeNo} reps`} placeholder={String(effective.repMin)} />
                )}
                <span className="num text-lg text-app text-center">{timed ? '—' : rir}</span>
                <button
                  type="button"
                  onClick={log}
                  disabled={!canLog}
                  aria-label={`Log set ${activeNo}`}
                  className="press h-11 w-11 rounded-xl border border-line-strong bg-surface-3 text-app inline-flex items-center justify-center disabled:opacity-40"
                >
                  <Check size={22} strokeWidth={3} aria-hidden />
                </button>
              </div>

              {!timed && (
                <div className="flex items-center gap-2 pl-1" role="group" aria-label="Reps in reserve">
                  <span className="w-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint text-center" aria-hidden>RIR</span>
                  {RIR_CHIPS.map((n) => {
                    const selected = n === 4 ? rir >= 4 : rir === n
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${n === 4 ? '4 or more' : n} reps in reserve`}
                        onClick={() => setRir(n)}
                        className={cx(
                          'press flex-1 h-11 rounded-xl border num text-lg',
                          selected ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-muted border-line',
                        )}
                      >
                        {n === 4 ? '4+' : n}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {Array.from({ length: ghostCount }, (_, k) => {
            const no = sets.length + 2 + k
            return (
              <div key={`ghost-${no}`} className={cx(GRID, 'px-1 min-h-11')}>
                <span className="num text-lg text-faint text-center">{no}</span>
                <span className="text-[13px] text-faint tnum truncate">{previousText(history.last[no - 1], timed)}</span>
                <span className="num text-lg text-faint text-center">{loadable ? (targetLoad != null ? fmtKgBare(targetLoad) : '—') : 'BW'}</span>
                <span className="num text-lg text-faint text-center">{effective.repMin}–{effective.repMax}</span>
                <span className="num text-lg text-faint text-center">—</span>
                <span className="mx-auto h-6 w-6 rounded-lg border border-dashed border-line-strong" aria-hidden />
              </div>
            )
          })}

          {!stopped && done && !extra && (
            <button type="button" onClick={() => setExtra(true)} className="press h-11 rounded-xl border border-dashed border-line-strong text-sm font-semibold text-muted inline-flex items-center justify-center gap-1.5">
              <Plus size={16} aria-hidden />Add a set
            </button>
          )}

          {stopped && (
            <div className="flex items-start gap-2 text-[13px] text-stop leading-snug">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" aria-hidden />
              <span>Stopped after your report — no more sets here today. Work around it; get persistent symptoms assessed.</span>
            </div>
          )}

          {painNext && !stopped && (
            <div className="text-xs text-warn flex items-center gap-1.5">
              <TriangleAlert size={13} aria-hidden /> The next set will carry a pain flag.
            </div>
          )}

          {!stopped && (voice.listening || voice.interim || hint || voice.error) && (
            <div className={cx('text-[13px] rounded-xl px-3 py-2 leading-snug', voice.error && !textMode ? 'bg-stop/10 text-stop' : 'bg-pillar-soft text-app')} aria-live="polite">
              {voice.listening ? (voice.interim ? `“${voice.interim}”` : 'Listening… say e.g. “26 kilos for ten, RIR two”') : hint ?? voice.error}
            </div>
          )}

          {!stopped && textMode && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); if (text.trim()) { voice.submitText(text); setText('') } }}
            >
              <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 26 kg for 10 RIR 2" aria-label="Type the set" icon={<Keyboard size={16} />} />
              <Button type="submit" variant="secondary">Fill</Button>
            </form>
          )}
        </div>
      )}

      {/* Safety actions stay on every card, in every state. */}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onSubstitute} className="press flex-1 min-w-0 h-11 rounded-xl border border-line-strong text-app text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <ArrowLeftRight size={16} aria-hidden />Substitute
        </button>
        <button type="button" onClick={onPain} className="press flex-1 min-w-0 h-11 rounded-xl border border-warn/40 bg-warn/10 text-warn text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <Bandage size={16} aria-hidden />Pain / Issue
        </button>
        {!stopped && !collapsed && (
          <IconButton
            icon={voice.listening ? <MicOff size={18} /> : <Mic size={18} />}
            label={voice.listening ? 'Stop listening' : `Log a ${exercise.name} set by voice`}
            variant={voice.listening ? 'primary' : 'surface'}
            onClick={() => (voice.listening ? voice.stop() : voice.available ? voice.start() : setTextMode((v) => !v))}
          />
        )}
      </div>
    </section>
  )
}

// --- compact numeric cell ---------------------------------------------------------------------

/** 44 px numeric cell that keeps "27." editable while typing (same parsing as NumberInput). */
function CellInput({ value, onChange, label, placeholder }: { value: number | null; onChange(n: number | null): void; label: string; placeholder?: string }) {
  const [text, setText] = useState(() => formatNumberInput(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (editing) return
    setText((prev) => (parseNumberInput(prev) === value ? prev : formatNumberInput(value)))
  }, [value, editing])

  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      autoComplete="off"
      enterKeyHint="done"
      aria-label={label}
      value={text}
      placeholder={placeholder ?? '—'}
      onFocus={(e) => { setEditing(true); e.currentTarget.select() }}
      onBlur={() => { setEditing(false); setText(formatNumberInput(parseNumberInput(text))) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onChange={(e) => {
        setText(e.target.value)
        const parsed = parseNumberInput(e.target.value)
        if (parsed !== value) onChange(parsed)
      }}
      className="w-full min-w-0 h-11 rounded-xl border border-line-strong bg-surface-2 text-center num text-xl text-app focus:border-pillar-line focus:outline-none"
    />
  )
}
