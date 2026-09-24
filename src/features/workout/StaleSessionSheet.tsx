// Shown over a workout that was started and never finished (see stale.ts): wrap it up with what was
// logged, mark it skipped (logged sets stay in history), or keep going.
import { Check, SkipForward } from 'lucide-react'
import type { WorkoutSession } from '../../domain/types'
import { Button, Sheet } from '../../components'
import { dayName, fmtTime, todayStr, toDateStr } from '../../lib/util'

export interface StaleSessionSheetProps {
  open: boolean
  session: WorkoutSession
  setCount: number
  /** Null when nothing was logged: there is nothing to finish with. */
  wrapUp: { durationMin: number } | null
  busy: boolean
  onFinish(): void
  onSkip(): void
  onKeepGoing(): void
}

/** "Started today at 8:05 am" / "Started Tue at 6:40 pm". */
export function startedLabel(startedAt: string | null): string {
  if (!startedAt) return 'Started earlier'
  const d = new Date(startedAt)
  const day = toDateStr(d) === todayStr() ? 'today' : dayName(toDateStr(d))
  return `Started ${day} at ${fmtTime(startedAt)}`
}

export function StaleSessionSheet({ open, session, setCount, wrapUp, busy, onFinish, onSkip, onKeepGoing }: StaleSessionSheetProps) {
  return (
    <Sheet open={open} onClose={onKeepGoing} title="This workout is still open">
      <div className="flex flex-col gap-3 pt-1">
        <p className="text-[15px] leading-snug text-muted">
          {startedLabel(session.startedAt)} · {setCount} {setCount === 1 ? 'set' : 'sets'} logged.
        </p>
        {wrapUp && (
          <Button variant="primary" size="lg" full icon={<Check size={18} />} loading={busy} onClick={onFinish}>
            Finish with what you logged
          </Button>
        )}
        {wrapUp && (
          <p className="-mt-1 text-center text-[13px] text-muted">Saves {setCount} {setCount === 1 ? 'set' : 'sets'} · {wrapUp.durationMin} min, ending at your last set.</p>
        )}
        <Button variant="secondary" size="lg" full icon={<SkipForward size={18} />} disabled={busy} onClick={onSkip}>
          Mark as skipped
        </Button>
        <p className="-mt-1 text-center text-[13px] text-muted">{setCount ? 'Sets you logged stay in your history.' : 'Nothing was logged.'}</p>
        <Button variant="ghost" full disabled={busy} onClick={onKeepGoing}>Keep going</Button>
      </div>
    </Sheet>
  )
}
