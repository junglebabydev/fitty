import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Play, Trash2 } from 'lucide-react'
import type { Exercise } from '../../domain/types'
import { AIBadge, Button, MuscleMap, Sheet, useToast } from '../../components'
import { dayName, todayStr } from '../../lib/util'
import { DayPicker } from './PlanSheets'
import { ExerciseGrid, MuscleSummary } from './PlanVisuals'
import { deleteRoutine, musclesOf, sessionFromRoutine, type Routine } from './routines'

/** Horizontally scrolling gallery of routine cards: muscle map, name, minutes, exercise count. */
export function RoutinesRow({ routines, byId, onOpen }: { routines: Routine[]; byId: Map<string, Exercise>; onOpen(r: Routine): void }) {
  return (
    <ul className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 scroll-px-4 snap-x" aria-label="Routines">
      {routines.map((r) => {
        const m = musclesOf(r.exercises.map((e) => e.exerciseId), byId)
        return (
          <li key={r.id} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => onOpen(r)}
              aria-label={`${r.name}, ${r.minutes} minutes, ${r.exercises.length} exercises`}
              className="press w-[136px] h-full text-left rounded-[1.25rem] border border-line bg-surface p-3 flex flex-col"
            >
              <span className="h-[86px] rounded-xl bg-surface-2 flex items-center justify-center" aria-hidden>
                <MuscleMap primary={m.primary} secondary={m.secondary} size={74} pillar="train" ariaLabel="" />
              </span>
              <span className="mt-2.5 font-semibold text-[14px] leading-tight truncate text-app">{r.name}</span>
              <span className="mt-1 flex items-baseline justify-between text-muted text-xs font-medium">
                <span><span className="num text-xl text-app">{r.minutes}</span> min</span>
                <span><span className="num text-xl text-app">{r.exercises.length}</span> moves</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export interface RoutineDetailSheetProps {
  routine: Routine | null
  onClose(): void
  byId: Map<string, Exercise>
  /** Dates that already hold a session (dotted in the day picker). */
  occupied: Set<string>
  onChanged(): void
}

/** Routine detail: what it trains, the visual exercise list, then Do today / Add to week / delete (saved routines only). */
export function RoutineDetailSheet({ routine, onClose, byId, occupied, onChanged }: RoutineDetailSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayStr()
  const [picking, setPicking] = useState(false)
  const [date, setDate] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Keep the last routine around so the sheet can animate out with its content.
  const [shown, setShown] = useState<Routine | null>(routine)
  useEffect(() => { if (routine) { setShown(routine); setPicking(false); setDate(null); setConfirmDelete(false) } }, [routine])

  const r = routine ?? shown
  const totalSets = useMemo(() => (r ? r.exercises.reduce((n, e) => n + e.sets, 0) : 0), [r])

  const doToday = () => {
    if (!r) return
    const id = sessionFromRoutine(r, today)
    onChanged()
    onClose()
    navigate(`/train/session/${id}`) // opens on the symptom check
  }

  const addToWeek = () => {
    if (!r || !date) return
    sessionFromRoutine(r, date)
    onChanged()
    onClose()
    toast.show(`Added for ${date === today ? 'today' : dayName(date, false)}`, 'success')
  }

  const remove = () => {
    if (!r) return
    deleteRoutine(r.id)
    onChanged()
    onClose()
    toast.show('Routine deleted', 'info')
  }

  const footer = !r ? undefined : confirmDelete ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
      <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove}>Delete routine</Button>
    </div>
  ) : picking ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" onClick={() => setPicking(false)}>Back</Button>
      <Button variant="primary" disabled={!date} icon={<CalendarPlus size={16} />} onClick={addToWeek}>Add</Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={doToday}>Do today</Button>
      <div className={r.source === 'builtin' ? 'grid' : 'grid grid-cols-[1fr_auto] gap-2'}>
        <Button variant="secondary" icon={<CalendarPlus size={16} />} onClick={() => setPicking(true)}>Add to week</Button>
        {r.source !== 'builtin' && (
          <Button variant="ghost" icon={<Trash2 size={16} />} aria-label={`Delete ${r.name}`} onClick={() => setConfirmDelete(true)}>Delete</Button>
        )}
      </div>
    </div>
  )

  return (
    <Sheet open={routine !== null} onClose={onClose} title={r?.name ?? 'Routine'} footer={footer} maxHeightVh={94}>
      {r && (
        <div data-pillar="train" className="flex flex-col gap-4">
          <MuscleSummary exerciseIds={r.exercises.map((e) => e.exerciseId)} byId={byId}>
            {r.source === 'ai' ? <AIBadge label="AI routine" /> : <span className="eyebrow text-muted">{r.source === 'builtin' ? 'Built in' : 'Saved'}</span>}
            <div className="mt-1.5 flex items-baseline gap-3">
              <span><span className="num text-4xl text-app">{r.minutes}</span><span className="text-sm font-medium text-muted ml-1">min</span></span>
              <span><span className="num text-4xl text-app">{totalSets}</span><span className="text-sm font-medium text-muted ml-1">sets</span></span>
            </div>
          </MuscleSummary>
          {picking ? (
            <div>
              <div className="eyebrow text-muted mb-1.5">Day</div>
              <DayPicker from={today} value={date} onChange={setDate} today={today} occupied={occupied} />
            </div>
          ) : confirmDelete ? (
            <p className="text-[15px] text-muted leading-snug">Delete this saved routine? Sessions already created from it stay in your plan and history.</p>
          ) : (
            <ExerciseGrid rows={r.exercises} byId={byId} />
          )}
        </div>
      )}
    </Sheet>
  )
}
