// "Before you start" (docs/PRD_TRAINING_PROGRAMS.md §4.4): every screen question as a Yes/No pair, a live outcome,
// then enrol (mode 'enrol') or hand the path back to a start-now workout (mode 'workout'). Answers stay on the device.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LifeBuoy } from 'lucide-react'
import type { PathId, Program, ScreenQuestion } from '../../domain/programs'
import { Button, Sheet, useToast } from '../../components'
import { getConditionFlags, getSessions, getSetsForSession } from '../../db/repositories'
import { getProgram } from '../../data/programs'
import { screenResult } from '../../engine'
import { useQuery } from '../../hooks'
import { addDays, cx, startOfWeek, todayStr } from '../../lib/util'
import { SupportSheet } from '../mind/SupportSheet'
import {
  currentEnrollment, enrollInProgram, leaveProgram, noImpactChosen, saveScreenAnswers, setNoImpact,
} from '../workout/program'
import { countWord, flagNote, offersNoRun, outcomeLines, pathReason, tierWeekRows } from './intro'

export interface SafetyCheckSheetProps {
  open: boolean
  program: Program
  /** 'enrol' starts the programme; 'workout' answers for a start-now workout and calls `onDone`. */
  mode: 'enrol' | 'workout'
  onClose: () => void
  onDone?: (r: { path: PathId }) => void
}

export function SafetyCheckSheet({ open, program, mode, onClose, onDone }: SafetyCheckSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const flags = useQuery(() => getConditionFlags().map((f) => f.region), [])
  const noImpact = useQuery(noImpactChosen, [])
  // Only the user's own taps: profile flags pre-answer their questions inside screenResult, and are never stored.
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [replaceCount, setReplaceCount] = useState<number | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)

  // Re-ask from blank every time the sheet opens.
  useEffect(() => {
    if (!open) return
    setAnswers({})
    setReplaceCount(null)
  }, [open])

  const result = useMemo(() => screenResult(program, answers, flags, noImpact), [program, answers, flags, noImpact])
  const ready = result.kind === 'start' && result.unanswered.length === 0
  const suggested = result.kind === 'suggest' && result.suggest ? getProgram(result.suggest) : null
  const pathLabel = program.paths[result.path]?.label ?? 'Standard'
  const canStart = mode === 'workout' || program.status === 'ready'
  // What the path means; when no question chose it (the no-impact choice, a flag), say why it changed.
  const outcome = outcomeLines(program, answers, flags, result)
  const why = outcome.length ? null : pathReason(program, result.path, answers, flags, noImpact)
  const startLines = why ? [why] : outcome

  const enrol = (replaceTierWeek: boolean) => {
    const today = todayStr()
    try {
      const prev = currentEnrollment()
      if (prev && prev.status === 'active' && prev.programId !== program.id) leaveProgram(today)
      enrollInProgram(program.id, result.path, today, { replaceTierWeek })
    } catch (e) {
      console.error('[enrol]', e)
      toast.show("Couldn't start the programme. Try again.", 'error')
      return
    }
    onClose()
    navigate('/train')
  }

  const go = () => {
    if (result.kind === 'suggest' && suggested) {
      onClose()
      navigate(`/train/program/${suggested.id}`)
      return
    }
    if (!ready || !canStart) return
    saveScreenAnswers(program.id, answers)
    if (mode === 'workout') { onDone?.({ path: result.path }); return }
    const today = todayStr()
    const rows = tierWeekRows(getSessions(today, addDays(startOfWeek(today), 6)), today)
      .filter((s) => getSetsForSession(s.id).length === 0)
    if (rows.length) { setReplaceCount(rows.length); return }
    enrol(false)
  }

  const primaryLabel =
    result.kind === 'wait' ? "Locked until you're cleared"
      : suggested ? `See ${suggested.title}`
        : !canStart ? 'Coming soon'
          : mode === 'workout' ? 'Continue'
            : 'Start week 1'

  const replacing = replaceCount !== null
  const footer = replacing ? (
    <div className="flex flex-col gap-2">
      <Button full size="lg" onClick={() => enrol(true)}>Replace</Button>
      <Button full variant="ghost" onClick={() => enrol(false)}>Keep both</Button>
    </div>
  ) : (
    <div data-pillar="train" className="flex flex-col gap-1">
      <Button full size="lg" disabled={!(suggested || (ready && canStart))} onClick={go}>{primaryLabel}</Button>
      {offersNoRun(program, result, noImpact) && ready && (
        <button
          type="button"
          onClick={() => setNoImpact(true)}
          className="press h-11 rounded-full text-[15px] font-semibold text-muted active:bg-surface-2"
        >
          I'd rather not run
        </button>
      )}
    </div>
  )

  return (
    <>
      <Sheet open={open} onClose={onClose} title={replacing ? "Replace this week's gym plan?" : 'Before you start'} footer={footer}>
        {replacing ? (
          <p className="m-0 py-1 text-[15px] leading-snug text-app text-pretty">
            You have {replaceCount === 1 ? 'one planned session' : `${replaceCount} planned sessions`} left this week.
            Replace {replaceCount === 1 ? 'it' : 'them'} with {program.title}, or keep both.
          </p>
        ) : (
          <div data-pillar="train" className="flex flex-col pb-2">
            <p className="m-0 text-[15px] leading-snug text-muted">
              {countWord(program.screen.length)} quick questions. Your answers stay on this phone.
            </p>
            {program.cues.support && (
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="press -mx-1 mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-1 text-left text-[15px] font-semibold text-pillar active:bg-surface-2"
              >
                <LifeBuoy size={18} className="shrink-0" aria-hidden />
                <span>{program.cues.support}</span>
              </button>
            )}

            <div className="mt-2">
              {program.screen.map((q, i) => (
                <Question
                  key={q.id}
                  q={q}
                  first={i === 0}
                  profile={flagNote(q.fromFlags, flags)}
                  value={answers[q.id]}
                  onAnswer={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                />
              ))}
            </div>

            <Outcome
              kind={result.kind}
              ready={ready}
              title={pathLabel === 'Standard' ? 'Standard path' : pathLabel}
              waitCopy={result.waitCopy}
              suggestTitle={suggested?.title}
              suggestCopy={program.screen.find((q) => q.onYes === `suggest:${result.suggest}` && answers[q.id])?.yesCopy}
              lines={ready ? startLines : []}
            />
          </div>
        )}
      </Sheet>
      {program.cues.support && <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />}
    </>
  )
}

function Question({ q, first, profile, value, onAnswer }: { q: ScreenQuestion; first: boolean; profile: string; value: boolean | undefined; onAnswer: (v: boolean) => void }) {
  // A standing flag answers this one: shown as Yes, fixed, and never stored.
  const fixed = profile !== ''
  const yes = fixed || value === true
  const no = !fixed && value === false
  const option = (on: boolean) => cx(
    'press h-11 rounded-xl border text-[15px] font-semibold',
    on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-app text-app active:bg-surface-2',
    fixed && 'cursor-default active:scale-100',
  )
  return (
    <div role="group" aria-label={q.text} className={cx('flex flex-col gap-2.5 py-3.5', !first && 'border-t border-line')}>
      <p className="m-0 text-base leading-snug text-app text-pretty">{q.text}</p>
      {fixed && <p className="m-0 text-[13px] font-semibold text-pillar">From your profile: {profile}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={yes} aria-disabled={fixed || undefined} onClick={() => { if (!fixed) onAnswer(true) }} className={option(yes)}>Yes</button>
        <button type="button" aria-pressed={no} aria-disabled={fixed || undefined} onClick={() => { if (!fixed) onAnswer(false) }} className={option(no)}>No</button>
      </div>
    </div>
  )
}

function Outcome({ kind, ready, title, waitCopy, suggestTitle, suggestCopy, lines }: {
  kind: 'start' | 'wait' | 'suggest'
  ready: boolean
  title: string
  waitCopy?: string
  suggestTitle?: string
  suggestCopy?: string
  lines: string[]
}) {
  const card = 'mt-3 flex flex-col gap-1.5 rounded-[1.25rem] px-4 py-3.5'
  if (kind === 'wait') {
    return (
      <div role="status" className={cx(card, 'bg-warn/10')}>
        <span className="eyebrow text-warn">Get cleared first</span>
        <p className="m-0 text-[15px] leading-snug text-app">{waitCopy}</p>
      </div>
    )
  }
  if (kind === 'suggest' && suggestTitle) {
    return (
      <div role="status" className={cx(card, 'bg-pillar-soft')}>
        <span className="eyebrow text-pillar">A better fit first</span>
        <p className="m-0 text-[15px] leading-snug text-app">
          <span className="font-semibold">{suggestTitle}</span>{suggestCopy ? `. ${suggestCopy}` : ' comes first.'}
        </p>
      </div>
    )
  }
  if (!ready) {
    return (
      <div role="status" className={cx(card, 'bg-surface-2')}>
        <p className="m-0 text-[15px] leading-snug text-muted">Answer every question to see your path.</p>
      </div>
    )
  }
  return (
    <div role="status" className={cx(card, 'bg-pillar-soft')}>
      <span className="eyebrow text-pillar">{title}</span>
      {lines.map((l) => <p key={l} className="m-0 text-[15px] leading-snug text-app">{l}</p>)}
    </div>
  )
}
