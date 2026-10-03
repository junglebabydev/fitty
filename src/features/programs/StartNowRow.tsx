// "Start now" (docs/PRD_TRAINING_PROGRAMS.md §4.9): workouts you can do today without joining anything. First the
// standalone picks of ready programmes, then the built-in and saved routines.
import type { Program, ProgramSession, StandalonePick } from '../../domain/programs'
import { PROGRAM_LIST } from '../../data/programs'
import { expandSessions, sessionTypeForFocus } from '../../engine'
import { SESSION_TYPE_META } from '../workout/helpers'
import type { Routine } from '../workout/routines'
import { ProgramCover } from './ProgramCover'

/** A programme session by key, including sessions only a path reaches (e.g. HIIT 'w3d2-li'). Same lookup as startStandaloneWorkout. */
export function standaloneSession(p: Program, sessionKey: string): ProgramSession | null {
  return expandSessions(p).find((s) => s.key === sessionKey) ?? p.sessions.find((s) => s.key === sessionKey) ?? null
}

export interface StartNowPick { program: Program; pick: StandalonePick; session: ProgramSession }

/** Standalone picks of ready programmes, in gallery order. Preview series and picks that resolve to no session are left out. */
export function startNowPicks(programs: Program[] = PROGRAM_LIST): StartNowPick[] {
  return programs
    .filter((p) => p.status === 'ready')
    .flatMap((program) => program.standalone.flatMap((pick) => {
      const session = standaloneSession(program, pick.sessionKey)
      return session ? [{ program, pick, session }] : []
    }))
}

export interface StartNowRowProps {
  routines: Routine[]
  onOpenWorkout(program: Program, sessionKey: string): void
  onOpenRoutine(r: Routine): void
}

const CARD = 'press flex h-full w-[148px] flex-col gap-2 rounded-[1.25rem] border border-line bg-surface p-3 text-left'

export function StartNowRow({ routines, onOpenWorkout, onOpenRoutine }: StartNowRowProps) {
  const picks = startNowPicks()
  return (
    <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4" aria-label="Start now">
      {picks.map(({ program, pick, session }) => (
        <li key={`${program.id}:${pick.sessionKey}`} className="shrink-0 snap-start">
          <button type="button" className={CARD} onClick={() => onOpenWorkout(program, pick.sessionKey)} aria-label={`${pick.name}, ${session.minutes} minutes, from ${program.title}`}>
            <ProgramCover program={program} size="tile" />
            <CardText eyebrow={SESSION_TYPE_META[session.type].label} name={pick.name} minutes={session.minutes} />
          </button>
        </li>
      ))}
      {routines.map((r) => {
        const meta = SESSION_TYPE_META[sessionTypeForFocus(r.focus)]
        const Icon = meta.icon
        return (
          <li key={r.id} className="shrink-0 snap-start">
            <button type="button" className={CARD} onClick={() => onOpenRoutine(r)} aria-label={`${r.name}, ${r.minutes} minutes`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted" aria-hidden><Icon size={18} /></span>
              <CardText eyebrow={meta.label} name={r.name} minutes={r.minutes} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function CardText({ eyebrow, name, minutes }: { eyebrow: string; name: string; minutes: number }) {
  return (
    <>
      <span className="eyebrow text-muted">{eyebrow}</span>
      <span className="-mt-1 line-clamp-2 text-[15px] font-semibold leading-tight text-app">{name}</span>
      <span className="mt-auto text-[13px] font-medium text-muted"><span className="num text-xl text-app">{minutes}</span> min</span>
    </>
  )
}
