// Workout preview (docs/PRD_TRAINING_PROGRAMS.md §4.9): a programme session to do today, with its series'
// description, why it works and sources first. The series' safety check must be answered and current before
// "Do today"; the session then opens on the symptom gate like any other.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Play, ShieldCheck } from 'lucide-react'
import type { PathId, Program, ProgramId, ScreenAnswers } from '../../domain/programs'
import type { Region } from '../../domain/types'
import { Button, Sheet } from '../../components'
import { getProgram } from '../../data/programs'
import { getConditionFlags } from '../../db/repositories'
import { isScreenCurrent, screenResult, sessionOnPath, toPlannedExercises, effectivePaths } from '../../engine'
import { useQuery } from '../../hooks'
import { dateOf, fmtDate, todayStr } from '../../lib/util'
import { exerciseMap, libraryExercises } from '../workout/helpers'
import { setsLine } from '../workout/PlanVisuals'
import { currentEnrollment, noImpactChosen, screenAnswersFor, startStandaloneWorkout } from '../workout/program'
import { SafetyCheckSheet } from './SafetyCheckSheet'
import { standaloneSession } from './StartNowRow'

export type PreviewSafety =
  | { state: 'soon' }
  | { state: 'ask'; count: number }
  | { state: 'ready'; path: PathId; answeredOn: string }
  | { state: 'wait'; copy: string }
  | { state: 'suggest'; programId: ProgramId }

/**
 * What the preview offers. Preview series: "Coming soon". No current answers, or a question added since: ask. A saved
 * answer that means wait, or points to another series: say so, no start. Otherwise ready, on the answers' path.
 */
export function previewSafety(p: Program, saved: ScreenAnswers | undefined, flags: Region[], noImpact: boolean, today: string): PreviewSafety {
  if (p.status !== 'ready') return { state: 'soon' }
  if (!saved || !isScreenCurrent(p, saved, today)) return { state: 'ask', count: p.screen.length }
  const r = screenResult(p, saved.answers, flags, noImpact)
  if (r.unanswered.length > 0) return { state: 'ask', count: p.screen.length }
  if (r.kind === 'wait') return { state: 'wait', copy: r.waitCopy ?? '' }
  if (r.kind === 'suggest' && r.suggest) return { state: 'suggest', programId: r.suggest }
  return { state: 'ready', path: r.path, answeredOn: saved.answeredAt.length > 10 ? dateOf(saved.answeredAt) : saved.answeredAt }
}

export interface WorkoutPreviewSheetProps {
  open: boolean
  program: Program | null
  sessionKey: string | null
  onClose(): void
}

export function WorkoutPreviewSheet({ open, program, sessionKey, onClose }: WorkoutPreviewSheetProps) {
  const navigate = useNavigate()
  const today = todayStr()
  const [checkOpen, setCheckOpen] = useState(false)
  // Fallback only: the safety sheet saves its answers, which refreshes `data` below.
  const [answeredPath, setAnsweredPath] = useState<PathId | null>(null)
  useEffect(() => { setCheckOpen(false); setAnsweredPath(null) }, [program, sessionKey])

  // The list is built exactly as startStandaloneWorkout builds the session, so what you see is what Do today creates.
  const data = useQuery(() => {
    if (!program || !sessionKey) return null
    const base = standaloneSession(program, sessionKey)
    if (!base) return null
    const saved = screenAnswersFor(program.id)
    const flags = getConditionFlags().map((f) => f.region)
    const noImpact = noImpactChosen()
    const library = libraryExercises()
    const path = screenResult(program, saved?.answers ?? {}, flags, noImpact).path
    const enrollment = currentEnrollment()
    const rungs = enrollment && enrollment.programId === program.id ? enrollment.rungs : undefined
    const rows = toPlannedExercises(program, sessionOnPath(program, base, effectivePaths(program, path, flags, noImpact), library, rungs)).filter((e) => !e.role)
    return { base, rows, byId: exerciseMap(library), safety: previewSafety(program, saved, flags, noImpact, today) }
  }, [program, sessionKey, today])

  if (!program) return null
  const name = program.standalone.find((s) => s.sessionKey === sessionKey)?.name ?? data?.base.name ?? 'Workout'
  const safety: PreviewSafety | undefined = data?.safety.state === 'ask' && answeredPath ? { state: 'ready', path: answeredPath, answeredOn: today } : data?.safety
  const intro = `/train/program/${program.id}`

  const doToday = () => {
    if (!sessionKey || safety?.state !== 'ready') return
    const id = startStandaloneWorkout(program.id, sessionKey, todayStr())
    onClose()
    navigate(`/train/session/${id}`) // opens on the symptom gate
  }

  let footer = null
  if (safety?.state === 'ready') {
    const label = safety.path !== 'standard' ? program.paths[safety.path]?.label : undefined
    footer = (
      <FooterLine
        line={<><ShieldCheck size={16} className="mt-0.5 shrink-0 text-pillar" aria-hidden /><span>Safety questions answered on {fmtDate(safety.answeredOn)}.{label ? ` ${label}.` : ''}</span></>}
        button={<Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={doToday}>Do today</Button>}
      />
    )
  } else if (safety?.state === 'ask') {
    footer = (
      <FooterLine
        line={<span>Before your first {program.title} workout: {safety.count} quick safety questions. Answer once and they cover every workout in the series.</span>}
        button={<Button variant="primary" size="lg" full onClick={() => setCheckOpen(true)}>Answer {safety.count} quick questions</Button>}
      />
    )
  } else if (safety?.state === 'wait' || safety?.state === 'suggest') {
    const other = safety.state === 'suggest' ? getProgram(safety.programId) : null
    footer = (
      <FooterLine
        line={<span>{safety.state === 'wait' ? safety.copy : `Your answers point to ${other?.title ?? 'another programme'} instead.`}</span>}
        button={<Button variant="secondary" size="lg" full onClick={() => setCheckOpen(true)}>Something has changed</Button>}
      />
    )
  } else if (safety?.state === 'soon') {
    footer = <p className="m-0 py-2 text-center text-sm font-medium text-muted">Coming soon</p>
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={name} footer={footer ?? undefined} maxHeightVh={94}>
        {data && (
          <div data-pillar="train" className="flex flex-col gap-5">
            <div>
              <div className="eyebrow text-pillar">From {program.title}</div>
              <div className="mt-1.5 flex items-baseline gap-4 text-sm font-medium text-muted">
                <span><span className="num text-4xl text-app">{data.base.minutes}</span> min</span>
                {data.rows.length > 0 && <span><span className="num text-4xl text-app">{data.rows.length}</span> {data.rows.length === 1 ? 'exercise' : 'exercises'}</span>}
              </div>
            </div>

            <p className="m-0 text-[15px] leading-snug text-app">{program.description}</p>

            <section aria-labelledby="wp-why">
              <h3 id="wp-why" className="eyebrow m-0 mb-2 text-muted">Why it works</h3>
              <ul className="flex flex-col gap-2.5">
                {program.why.map((w) => (
                  <li key={w.text} className="flex gap-2.5 text-[15px] leading-snug text-app">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pillar" aria-hidden />
                    <span>
                      {w.text}{' '}
                      <Link
                        to={`${intro}#sources`}
                        onClick={onClose}
                        aria-label={`Source ${w.source}`}
                        className="press relative inline-flex h-5 min-w-[22px] after:absolute after:-inset-3 after:content-[''] items-center justify-center rounded-md bg-surface-2 px-1.5 align-[1px] text-xs font-bold text-muted"
                      >
                        {w.source}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                to={intro}
                onClick={onClose}
                className="press mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-app"
              >
                Full intro and all {program.sources.length} sources<ChevronRight size={15} className="text-faint" aria-hidden />
              </Link>
            </section>

            {data.rows.length > 0 && (
              <section aria-labelledby="wp-ex">
                <h3 id="wp-ex" className="eyebrow m-0 mb-1 text-muted">Exercises</h3>
                <ul className="divide-y divide-line">
                  {data.rows.map((r, i) => {
                    const ex = data.byId.get(r.exerciseId)
                    return (
                      <li key={`${r.exerciseId}-${i}`}>
                        <Link
                          to={`/train/exercise/${r.exerciseId}`}
                          onClick={onClose}
                          className="press flex min-h-11 items-baseline justify-between gap-3 py-2.5 text-[15px]"
                        >
                          <span className="min-w-0 text-app">{ex?.name ?? r.exerciseId}</span>
                          <span className="shrink-0 text-muted tnum">{setsLine(r, ex)}{r.perSide ? ' a side' : ''}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </Sheet>
      <SafetyCheckSheet
        open={checkOpen}
        program={program}
        mode="workout"
        onClose={() => setCheckOpen(false)}
        onDone={(result) => { setAnsweredPath(result.path); setCheckOpen(false) }}
      />
    </>
  )
}

function FooterLine({ line, button }: { line: ReactNode; button: ReactNode }) {
  return (
    <div data-pillar="train" className="flex flex-col gap-3">
      <p className="m-0 flex gap-2 text-sm leading-snug text-muted">{line}</p>
      {button}
    </div>
  )
}
