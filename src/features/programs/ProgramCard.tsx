// Train root, enrolled (docs/PRD_TRAINING_PROGRAMS.md §4.1 block 1): the programme, its shape, today's session,
// this week as pills, and one button.
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Play } from 'lucide-react'
import type { Enrollment, Program } from '../../domain/programs'
import { parseProgramKey } from '../../domain/programs'
import type { WorkoutSession } from '../../domain/types'
import { Button } from '../../components'
import { estimateSessionMinutes, expandSessions, windowDates, windowIndex } from '../../engine'
import { addDays, cx, dayName } from '../../lib/util'
import { ProgramCover } from './ProgramCover'

const STATUS_RANK: Record<WorkoutSession['status'], number> = { in_progress: 0, planned: 1, completed: 2, skipped: 3 }

export type PillState = 'done' | 'today' | 'coming' | 'past'
export interface WeekPill { id: number; date: string; state: PillState }

function byDate(rows: WorkoutSession[]): WorkoutSession[] {
  return [...rows].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.id - b.id)
}

/** The window's programme sessions in date order: done, today (or in progress), coming, or past (missed or skipped). */
export function weekPills(rows: WorkoutSession[], today: string): WeekPill[] {
  return byDate(rows).map((s) => ({
    id: s.id,
    date: s.scheduledDate,
    state: s.status === 'completed' ? 'done'
      : s.status === 'in_progress' || (s.scheduledDate === today && s.status !== 'skipped') ? 'today'
        : s.scheduledDate > today && s.status === 'planned' ? 'coming'
          : 'past',
  }))
}

/** What the card leads with: the session in progress, else today's, else the next planned one. Null when the week is done. */
export function pickHero(rows: WorkoutSession[], today: string): WorkoutSession | null {
  const live = rows.find((s) => s.status === 'in_progress')
  const todays = rows.filter((s) => s.scheduledDate === today && s.status !== 'skipped').sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])[0]
  const upcoming = byDate(rows.filter((s) => s.status === 'planned' && s.scheduledDate > today))[0]
  return live ?? todays ?? upcoming ?? null
}

const rise = (i: number) => ({ '--i': i }) as CSSProperties

export interface ProgramCardProps {
  program: Program
  enrollment: Enrollment
  /** This window's rows of the programme. */
  rows: WorkoutSession[]
  today: string
  onOpenSession(id: number): void
}

export function ProgramCard({ program, enrollment, rows, today, onOpenSession }: ProgramCardProps) {
  const hero = pickHero(rows, today)
  const pills = weekPills(rows, today)
  const ordered = byDate(rows)

  let body = null
  if (hero) {
    const key = parseProgramKey(hero.templateKey)?.sessionKey
    const planned = key ? (expandSessions(program).find((s) => s.key === key) ?? program.sessions.find((s) => s.key === key)) : undefined
    const minutes = hero.status === 'completed' && hero.durationMin != null ? hero.durationMin : planned?.minutes ?? estimateSessionMinutes(hero.exercises)
    const working = hero.exercises.filter((e) => !e.role)
    const second = hero.type === 'strength'
      ? { n: working.reduce((n, e) => n + e.sets, 0), label: 'sets' }
      : working.length > 1 ? { n: working.length, label: 'exercises' } : null
    const onDay = hero.status === 'in_progress' || hero.scheduledDate === today
    const eyebrow = onDay
      ? `${hero.status === 'in_progress' ? 'In progress' : 'Today'} · Session ${ordered.findIndex((s) => s.id === hero.id) + 1} of ${ordered.length}`
      : `Next · ${dayName(hero.scheduledDate)}`
    body = (
      <>
        <div>
          <div className="eyebrow text-muted">{eyebrow}</div>
          <h2 className="display mt-1.5 line-clamp-2 text-[1.7rem] leading-[1.05] text-app">{hero.name.replace(/\s*\(.*\)$/, '')}</h2>
          <div className="mt-2 flex items-baseline gap-4 text-sm font-medium text-muted">
            <span><span className="num text-3xl text-app">{minutes}</span> min</span>
            {second && second.n > 0 && <span><span className="num text-3xl text-app">{second.n}</span> {second.label}</span>}
          </div>
        </div>
        {pills.length > 0 && <Pills pills={pills} today={today} />}
        <Button
          variant={hero.status === 'completed' ? 'secondary' : 'primary'}
          size="lg"
          full
          icon={hero.status === 'completed' ? <ChevronRight size={18} /> : <Play size={18} />}
          onClick={() => onOpenSession(hero.id)}
        >
          {hero.status === 'in_progress' ? 'Resume' : hero.status === 'completed' ? 'Summary' : onDay ? 'Start' : 'Preview'}
        </Button>
      </>
    )
  } else if (rows.length > 0) {
    const k = windowIndex(enrollment.startDate, today)
    const next = k >= 0 ? addDays(windowDates(enrollment.startDate, k)[6], 1) : null
    body = (
      <>
        {next && <p className="voice text-xl leading-snug text-app">Week done. The next one starts {dayName(next, false)}.</p>}
        <Pills pills={pills} today={today} />
      </>
    )
  }

  return (
    <section className="anim-rise flex flex-col gap-4 rounded-[1.25rem] border border-pillar-line bg-surface p-4" style={rise(0)} aria-label={program.title}>
      <Link to={`/train/program/${program.id}`} className="press -my-2 inline-flex min-h-11 items-center gap-1 self-start">
        <span className="eyebrow text-pillar">{program.title} · Week {enrollment.week} of {program.weeks}</span>
        <ChevronRight size={16} className="text-faint" aria-hidden />
      </Link>
      <ProgramCover program={program} currentWeek={enrollment.week} />
      {body}
    </section>
  )
}

const PILL: Record<PillState, string> = {
  done: 'bg-pillar-soft text-pillar',
  today: 'border-[1.5px] border-pillar text-pillar',
  coming: 'bg-surface-2 text-muted',
  past: 'bg-surface-2 text-faint',
}

function Pills({ pills, today }: { pills: WeekPill[]; today: string }) {
  return (
    <ul aria-label="This week" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pills.length}, minmax(0, 1fr))` }}>
      {pills.map((p) => {
        const day = p.date === today ? 'Today' : dayName(p.date)
        return (
          <li
            key={p.id}
            className={cx('inline-flex h-[34px] items-center justify-center gap-1 rounded-[10px] text-[13px] font-semibold', PILL[p.state])}
            aria-label={`${day}, ${p.state === 'done' ? 'done' : p.state === 'past' ? 'not done' : p.state === 'today' ? 'today' : 'coming'}`}
          >
            {p.state === 'done' && <Check size={12} strokeWidth={3} aria-hidden />}
            {day}
          </li>
        )
      })}
    </ul>
  )
}
