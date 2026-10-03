// Programme tiles in two columns (docs/PRD_TRAINING_PROGRAMS.md §4.2): the cover, the title, weeks and sessions a
// week. Preview series say "Coming soon". A tile opens the intro.
import { Link } from 'react-router-dom'
import type { Program, ProgramId } from '../../domain/programs'
import { PROGRAM_LIST } from '../../data/programs'
import { ProgramCover } from './ProgramCover'

export function programMeta(p: Program): string {
  return `${p.weeks} weeks · ${p.stages?.length ? 'in stages' : `${p.sessionsPerWeek} a week`}`
}

export interface ProgramGalleryProps {
  programs?: Program[]
  /** The active enrolment, so its tile shows where you are. */
  active?: { programId: ProgramId; week: number } | null
}

export function ProgramGallery({ programs = PROGRAM_LIST, active }: ProgramGalleryProps) {
  return (
    <ul className="grid grid-cols-2 gap-2.5" aria-label="Programmes">
      {programs.map((p) => {
        const mine = active?.programId === p.id
        return (
          <li key={p.id} className="min-w-0">
            <Link
              to={`/train/program/${p.id}`}
              className="press flex h-full min-h-[152px] flex-col gap-2.5 rounded-[1.25rem] border border-line bg-surface p-3.5"
            >
              <ProgramCover program={p} size="tile" currentWeek={mine ? active?.week : undefined} />
              <span className="mt-auto text-[16px] font-semibold leading-tight text-app">{p.title}</span>
              <span className="-mt-1.5 text-[13px] leading-snug text-muted">
                {mine ? `Week ${active?.week} of ${p.weeks}` : programMeta(p)}
                {p.status === 'preview' && <span className="block text-faint">Coming soon</span>}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
