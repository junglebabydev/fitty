// Programme intro (/train/program/:id, docs/PRD_TRAINING_PROGRAMS.md §4.3): the shape, the promise, why it works with
// sources, the plan, what you need and the stop signs, then one action. External links are allowed here only.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, Dumbbell, ExternalLink, LifeBuoy } from 'lucide-react'
import type { Program } from '../domain/programs'
import { Button, EmptyState, Screen, Sheet, TAB_BAR_HEIGHT, useToast } from '../components'
import { getConditionFlags } from '../db/repositories'
import { getProgram } from '../data/programs'
import { screenResult } from '../engine'
import { useQuery } from '../hooks'
import { cx, todayStr } from '../lib/util'
import { useSetupGate } from '../features/onboarding/SetupGate'
import { SupportSheet } from '../features/mind/SupportSheet'
import { ProgramCover } from '../features/programs/ProgramCover'
import { SafetyCheckSheet } from '../features/programs/SafetyCheckSheet'
import { pathReason, planWeeks, rangeText, stopSignLines } from '../features/programs/intro'
import { currentEnrollment, leaveProgram, noImpactChosen, screenAnswersFor } from '../features/workout/program'

const rise = (i: number) => ({ className: 'anim-rise', style: { '--i': i } as CSSProperties })

export default function ProgramIntroScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const program = getProgram(id)
  if (!program) {
    return (
      <Screen back="/train" backLabel="Train" pillar="train">
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            icon={<Dumbbell size={26} />}
            title="Programme not found"
            body="It may have been renamed or removed."
            action={<Button onClick={() => navigate('/train', { replace: true })}>Back to Train</Button>}
          />
        </div>
      </Screen>
    )
  }
  // Keyed: moving from one intro to another (the safety check's suggestion) starts fresh.
  return <Intro key={program.id} program={program} />
}

function Intro({ program }: { program: Program }) {
  const navigate = useNavigate()
  const toast = useToast()
  const setup = useSetupGate()
  const enrollment = useQuery(currentEnrollment, [])
  const flags = useQuery(() => getConditionFlags().map((f) => f.region), [])
  const noImpact = useQuery(noImpactChosen, [])
  const saved = useQuery(() => screenAnswersFor(program.id), [program.id])

  const [checkOpen, setCheckOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [signsOpen, setSignsOpen] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const active = enrollment && enrollment.status === 'active' ? enrollment : null
  const onThis = active?.programId === program.id ? active : null
  const other = active && !onThis ? getProgram(active.programId) : null

  const answers = saved?.answers ?? {}
  const path = onThis?.path ?? screenResult(program, answers, flags, noImpact).path
  const reason = pathReason(program, path, answers, flags, noImpact)
  const weeks = planWeeks(program)
  const [week, setWeek] = useState(onThis?.week ?? 1)
  const shown = weeks.find((w) => w.week === week)
  const signs = stopSignLines(program)

  const start = () => {
    if (!setup.require('workout')) return
    if (other) setSwitchOpen(true)
    else setCheckOpen(true)
  }

  const leave = () => {
    leaveProgram(todayStr())
    setLeaveOpen(false)
    toast.show(`You left ${program.title}`)
  }

  const scrollToSource = (n: number) => {
    const el = document.getElementById(`source-${n}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.querySelector('a')?.focus({ preventScroll: true })
  }

  const chip = (n: number) => <SourceChip key={n} n={n} onClick={() => scrollToSource(n)} />

  return (
    <Screen back="/train" backLabel="Train" pillar="train">
      <div className="flex flex-col gap-7 pb-32 pt-1">
        <div {...rise(0)}>
          <div className="rounded-[1.25rem] border border-line bg-surface p-4">
            <ProgramCover program={program} size="card" currentWeek={onThis?.week} className="h-24!" />
          </div>
        </div>

        <header className={cx('flex flex-col gap-2', rise(1).className)} style={rise(1).style}>
          <p className="eyebrow m-0 text-pillar">Programme</p>
          <h1 className="display m-0 text-5xl text-app text-balance">{program.title}</h1>
          <p className="voice m-0 text-[1.3rem] text-app text-pretty">{program.promise}</p>
        </header>

        <dl className={cx('m-0 grid grid-cols-3 gap-2', rise(2).className)} style={rise(2).style}>
          <Num value={String(program.weeks)} unit="weeks" />
          <Num value={String(program.sessionsPerWeek)} unit="a week" />
          <Num value={rangeText(program.minutes)} unit="min" />
        </dl>

        <p className="m-0 text-base leading-relaxed text-app text-pretty">{program.description}</p>

        {program.cues.support && (
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="press -my-2 inline-flex min-h-11 items-center gap-2 self-start rounded-xl text-left text-[15px] font-semibold text-pillar"
          >
            <LifeBuoy size={18} className="shrink-0" aria-hidden />
            <span>{program.cues.support}</span>
          </button>
        )}

        {reason && (
          <section aria-label="Your path" className="flex flex-col gap-1 rounded-[1.25rem] bg-pillar-soft px-4 py-3.5">
            <span className="eyebrow text-pillar">Your path · {program.paths[path]?.label}</span>
            <p className="m-0 text-[15px] leading-snug text-app">{reason}</p>
          </section>
        )}

        <Section title="Why it works">
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {program.why.map((w) => (
              <li key={w.text} className="flex gap-2.5 text-base leading-snug text-app">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-pillar" aria-hidden />
                <span>{w.text}{chip(w.source)}</span>
              </li>
            ))}
          </ul>
          {program.honestLine && (
            <p className="m-0 text-sm leading-snug text-muted">
              Honestly: {program.honestLine.text}{program.honestLine.sources.map(chip)}
            </p>
          )}
        </Section>

        <Section title="The plan">
          <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
            <div role="group" aria-label="Weeks" className="flex gap-1.5">
              {weeks.map((w) => {
                const on = w.week === week
                const done = onThis != null && w.week < onThis.week
                return (
                  <button
                    key={w.week}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Week ${w.week}`}
                    onClick={() => setWeek(w.week)}
                    className={cx(
                      'press num h-11 min-w-11 flex-1 rounded-xl border text-[15px]',
                      on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-app active:bg-surface-2',
                      done && !on && 'text-muted',
                    )}
                  >
                    W{w.week}
                  </button>
                )
              })}
            </div>
          </div>
          {shown && (
            <ul className="m-0 list-none rounded-[1.25rem] border border-line bg-surface px-4 py-1">
              {shown.sessions.map((s, i) => (
                <li key={s.key} className={cx('flex items-baseline justify-between gap-3 py-3', i > 0 && 'border-t border-line')}>
                  <span className="min-w-0 text-[15px] text-app">{s.name}</span>
                  <span className="shrink-0 text-sm text-muted"><span className="num text-base text-app">{s.minutes}</span> min</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="What you need">
          <p className="m-0 text-base leading-relaxed text-app">{program.needs}</p>
          <p className="m-0 text-sm leading-snug text-muted">{program.timePerWeek}</p>
        </Section>

        {signs.length > 0 && (
          <section className="rounded-[1.25rem] border border-line bg-surface">
            <button
              type="button"
              aria-expanded={signsOpen}
              aria-controls="stop-signs"
              onClick={() => setSignsOpen((o) => !o)}
              className="press flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold text-app"
            >
              Stop signs
              <ChevronDown size={18} aria-hidden className={cx('shrink-0 text-muted transition-transform', signsOpen && 'rotate-180')} />
            </button>
            {signsOpen && (
              <ul id="stop-signs" className="m-0 list-none px-4 pb-2">
                {signs.map((s) => (
                  <li key={s.sign} className="flex flex-col gap-0.5 border-t border-line py-3">
                    <span className="text-[15px] leading-snug text-app">{s.sign}</span>
                    {s.advice && <span className="text-sm leading-snug text-muted">{s.advice}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="sources" className="flex flex-col gap-3">
          <h2 id="sources" className="eyebrow m-0 scroll-mt-20 text-muted">Sources</h2>
          <ol className="m-0 list-none rounded-[1.25rem] border border-line bg-surface px-4 py-1">
            {program.sources.map((s, i) => (
              <li key={s.n} id={`source-${s.n}`} className={cx('scroll-mt-20', i > 0 && 'border-t border-line')}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 rounded-lg py-3 text-sm leading-snug text-app"
                >
                  <span className="num mt-px inline-flex h-5 min-w-[1.4rem] shrink-0 items-center justify-center rounded-md bg-surface-2 px-1 text-xs text-muted">{s.n}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {s.kind === 'retraction' && <span className="eyebrow mb-0.5 block text-warn">Retracted</span>}
                    {s.citation}
                  </span>
                  <ExternalLink size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <BottomBar>
        {program.status !== 'ready' && !onThis ? (
          <div className="glass flex h-14 items-center justify-center rounded-full border border-line shadow-float">
            <span className="text-[15px] font-medium text-muted">Coming soon</span>
          </div>
        ) : onThis ? (
          <div className="glass flex items-center gap-3 rounded-[1.5rem] border border-line py-2 pl-4 pr-2 shadow-float">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="m-0 truncate text-[15px] font-semibold text-app">You're on this programme</p>
              <p className="m-0 text-sm text-muted">Week {onThis.week} of {program.weeks}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setLeaveOpen(true)}>Leave programme</Button>
          </div>
        ) : (
          <Button full size="lg" className="shadow-float" onClick={start}>Start programme</Button>
        )}
      </BottomBar>

      <SafetyCheckSheet open={checkOpen} program={program} mode="enrol" onClose={() => setCheckOpen(false)} />

      <Sheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="Switch programmes?"
        footer={
          <div className="flex flex-col gap-2">
            <Button full size="lg" onClick={() => { setSwitchOpen(false); setCheckOpen(true) }}>Switch</Button>
            <Button full variant="ghost" onClick={() => setSwitchOpen(false)}>Cancel</Button>
          </div>
        }
      >
        <p className="m-0 py-1 text-[15px] leading-snug text-app text-pretty">Switch from {other?.title}? Your history stays.</p>
      </Sheet>

      <Sheet
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave programme?"
        footer={
          <div className="flex flex-col gap-2">
            <Button full size="lg" variant="danger" onClick={leave}>Leave programme</Button>
            <Button full variant="ghost" onClick={() => setLeaveOpen(false)}>Stay on it</Button>
          </div>
        }
      >
        <p className="m-0 py-1 text-[15px] leading-snug text-app text-pretty">
          Your history stays. The sessions it planned from today on are removed.
        </p>
      </Sheet>

      {program.cues.support && <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />}
      {setup.sheet}
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow m-0 text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Num({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[13px] font-medium text-muted">{unit}</dt>
      <dd className="num m-0 text-4xl text-app">{value}</dd>
    </div>
  )
}

/** Inline source number; scrolls to the numbered source below. The overlay keeps a 44 px hit area. */
function SourceChip({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Source ${n}`}
      className="press relative ml-1 inline-flex h-5 min-w-[1.4rem] items-center justify-center rounded-md bg-surface-2 px-1 align-[1px] text-xs font-bold text-muted after:absolute after:-inset-3 after:content-['']"
    >
      {n}
    </button>
  )
}

/** One action, floating just above the tab bar. */
function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-pillar="train"
      className="pointer-events-none fixed left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-4"
      style={{ bottom: `calc(${TAB_BAR_HEIGHT + 4}px + env(safe-area-inset-bottom, 0px))` }}
    >
      <div className="pointer-events-auto">{children}</div>
    </div>
  )
}
