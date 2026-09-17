import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Check, Plus, RefreshCw, SkipForward, Trash2 } from 'lucide-react'
import type { WorkoutSession } from '../../domain/types'
import { Button, Sheet } from '../../components'
import { SESSION_TEMPLATES, estimateSessionMinutes, type ReflowMove } from '../../engine'
import { addDays, cx, dayName, fmtDate } from '../../lib/util'
import { SESSION_TYPE_META } from './helpers'

// --- shared day picker ------------------------------------------------------------

export interface DayPickerProps {
  from: string
  days?: number
  value: string | null
  onChange(date: string): void
  today: string
  /** Dates that already hold a session (shown with a dot, still selectable). */
  occupied?: Set<string>
}

export function DayPicker({ from, days = 14, value, onChange, today, occupied }: DayPickerProps) {
  const list = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days])
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 py-1">
      {list.map((d) => {
        const selected = value === d
        const busy = occupied?.has(d)
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={cx(
              'press shrink-0 w-[60px] rounded-xl border px-1 py-2 flex flex-col items-center gap-1',
              selected ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 border-line text-app',
            )}
            aria-pressed={selected}
            aria-label={`${d === today ? 'Today' : dayName(d, false)} ${fmtDate(d)}${busy ? ', already has a session' : ''}`}
          >
            <span className={cx('eyebrow', selected ? 'opacity-90' : 'text-muted')}>{d === today ? 'Today' : dayName(d)}</span>
            <span className="num text-2xl">{fmtDate(d).split(' ')[0]}</span>
            <span className={cx('h-1.5 w-1.5 rounded-full', busy ? (selected ? 'bg-accent-fg/80' : 'bg-pillar') : 'bg-transparent')} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

// --- add session ------------------------------------------------------------------

export interface AddSessionSheetProps {
  open: boolean
  onClose(): void
  today: string
  weekSessions: WorkoutSession[]
  onAdd(templateKey: string, date: string): void
}

export function AddSessionSheet({ open, onClose, today, weekSessions, onAdd }: AddSessionSheetProps) {
  const [key, setKey] = useState<string>('upper_a')
  const [date, setDate] = useState<string | null>(today)
  useEffect(() => { if (open) { setKey('upper_a'); setDate(today) } }, [open, today])
  const occupied = useMemo(() => new Set(weekSessions.filter((s) => s.status !== 'skipped').map((s) => s.scheduledDate)), [weekSessions])
  const templates = Object.values(SESSION_TEMPLATES)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a session"
      footer={
        <Button variant="primary" size="lg" full disabled={!date} icon={<Plus size={20} />} onClick={() => { if (date) onAdd(key, date) }}>
          Add {SESSION_TEMPLATES[key]?.name ?? 'session'}
        </Button>
      }
    >
      <div className="eyebrow text-muted mb-2">Session</div>
      <ul data-pillar="train" className="flex flex-col gap-2 mb-5">
        {templates.map((t) => {
          const selected = key === t.key
          const meta = SESSION_TYPE_META[t.type]
          const Icon = meta.icon
          return (
            <li key={t.key}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => setKey(t.key)}
                className={cx(
                  'press w-full min-h-[60px] text-left rounded-xl border px-3 py-2.5 flex items-center gap-3',
                  selected ? 'border-pillar-line bg-pillar-soft' : 'border-line bg-surface-2',
                )}
              >
                <span className={cx('h-9 w-9 rounded-lg inline-flex items-center justify-center shrink-0', selected ? 'bg-pillar text-accent-fg' : 'bg-surface-3 text-muted')} aria-hidden><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[15px] truncate">{t.name}</span>
                  <span className="block text-[13px] text-muted">{meta.label} · ~{estimateSessionMinutes(t.exercises)} min · {t.exercises.length} exercises</span>
                </span>
                {selected && <Check size={18} strokeWidth={3} className="text-pillar shrink-0" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="eyebrow text-muted mb-1.5">Day</div>
      <div data-pillar="train"><DayPicker from={today} value={date} onChange={setDate} today={today} occupied={occupied} /></div>
    </Sheet>
  )
}

// --- move (date sheet) / remove ---------------------------------------------------

export interface RescheduleSheetProps {
  open: boolean
  onClose(): void
  session: WorkoutSession | null
  today: string
  weekSessions: WorkoutSession[]
  onMove(id: number, date: string): void
  onRemove(id: number): void
}

/** Move: pick a new day. Removing from the plan needs a second tap. */
export function RescheduleSheet({ open, onClose, session, today, weekSessions, onMove, onRemove }: RescheduleSheetProps) {
  const [date, setDate] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  useEffect(() => { if (open) { setDate(session?.scheduledDate ?? null); setConfirmRemove(false) } }, [open, session])
  const occupied = useMemo(
    () => new Set(weekSessions.filter((s) => s.status !== 'skipped' && s.id !== session?.id).map((s) => s.scheduledDate)),
    [weekSessions, session],
  )
  const changed = !!session && !!date && date !== session.scheduledDate

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session ? `Move ${session.name}` : 'Move session'}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" full disabled={!changed} icon={<CalendarDays size={20} />} onClick={() => { if (session && date) onMove(session.id, date) }}>
            {changed && date ? `Move to ${date === today ? 'today' : `${dayName(date)} ${fmtDate(date)}`}` : 'Pick a new day'}
          </Button>
          <Button
            variant={confirmRemove ? 'danger' : 'ghost'}
            full
            icon={<Trash2 size={16} />}
            onClick={() => { if (!session) return; if (confirmRemove) onRemove(session.id); else setConfirmRemove(true) }}
          >
            {confirmRemove ? 'Tap again to remove it from the plan' : 'Remove from plan'}
          </Button>
        </div>
      }
    >
      {session && (
        <div data-pillar="train">
          <p className="text-sm text-muted mb-3">
            {SESSION_TYPE_META[session.type].label} · currently {session.scheduledDate === today ? 'today' : `${dayName(session.scheduledDate)} ${fmtDate(session.scheduledDate)}`}
          </p>
          <div className="eyebrow text-muted mb-1.5">New day</div>
          <DayPicker from={today} value={date} onChange={setDate} today={today} occupied={occupied} />
          <p className="text-[13px] text-muted mt-3 leading-snug">A dot marks days that already hold a session. Moving keeps the session and its targets exactly as they are.</p>
        </div>
      )}
    </Sheet>
  )
}

// --- skip ---------------------------------------------------------------------------

export interface SkipSheetProps {
  open: boolean
  onClose(): void
  session: WorkoutSession | null
  onSkip(id: number): void
  /** Offer the date sheet instead. */
  onMoveInstead(): void
}

/** Skip is its own decision, separate from Move — and never framed as a failure. */
export function SkipSheet({ open, onClose, session, onSkip, onMoveInstead }: SkipSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={session ? `Skip ${session.name}?` : 'Skip session?'}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" full icon={<SkipForward size={20} />} onClick={() => { if (session) onSkip(session.id) }}>Skip this session</Button>
          <Button variant="secondary" full icon={<CalendarDays size={16} />} onClick={onMoveInstead}>Move it to another day instead</Button>
        </div>
      }
    >
      <p className="voice text-xl text-app">Skipping a session isn't a failure of discipline.</p>
      <p className="text-sm text-muted mt-2 leading-snug">
        It stays in your history marked as skipped, the rest of the week holds, and you can bring it back any time by opening it.
      </p>
    </Sheet>
  )
}

// --- reflow preview ------------------------------------------------------------------

export interface ReflowSheetProps {
  open: boolean
  onClose(): void
  moves: ReflowMove[]
  onApply(): void
}

export function ReflowSheet({ open, onClose, moves, onApply }: ReflowSheetProps) {
  const moved = moves.filter((m) => !m.drop)
  const dropped = moves.filter((m) => m.drop)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reflow the week"
      footer={
        <Button variant="primary" size="lg" full icon={<RefreshCw size={20} />} onClick={onApply} disabled={!moves.length}>
          Apply {moves.length} {moves.length === 1 ? 'change' : 'changes'}
        </Button>
      }
    >
      <div data-pillar="train">
        <p className="voice text-xl text-app">Missed sessions are rescheduled, not judged.</p>
        <p className="text-sm text-muted mt-2 mb-4 leading-snug">
          They move forward into free days, one per day. The three strength sessions are protected first; stretch items drop if the week runs out.
        </p>
        {moves.length === 0 ? (
          <div className="text-[15px] text-muted py-6 text-center">Nothing to move.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {moved.map((m) => (
              <li key={m.id} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5">
                <ArrowRight size={16} className="text-pillar shrink-0 mt-0.5" aria-hidden />
                <span>{m.note}</span>
              </li>
            ))}
            {dropped.map((m) => (
              <li key={m.id} className="rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5 text-muted">
                <SkipForward size={16} className="shrink-0 mt-0.5" aria-hidden />
                <span>{m.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
