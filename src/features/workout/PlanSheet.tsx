import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookmarkPlus, Play, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import type { Exercise } from '../../domain/types'
import { AIBadge, Button, Chip, Sheet, Skeleton, TextInput, useToast } from '../../components'
import { createSession } from '../../db/repositories'
import { PLAN_MINUTES, planMinutes, planToSession, type PlanFocus } from '../../engine'
import { todayStr } from '../../lib/util'
import { useAIStatus } from '../ai/config'
import { planWorkout, plannerLibrary, type PlanResult } from '../ai/planner'
import { todaysGate } from './gate'
import { exerciseMap } from './helpers'
import { ExerciseGrid, MuscleSummary } from './PlanVisuals'
import { saveRoutineFromPlan } from './routines'
import { SubstituteSheet } from './SubstituteSheet'

export const FOCUS_OPTIONS: { value: PlanFocus; label: string }[] = [
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'full', label: 'Full body' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'mobility', label: 'Mobility' },
]

export interface PlanSheetProps {
  open: boolean
  onClose(): void
  initialMinutes?: number
  initialFocus?: PlanFocus
  onSaved?(): void
}

type Step = 'form' | 'loading' | 'result'

/** Plan with AI: time + focus (+ note) → validated draft → visual preview → Start now / Save as routine / Regenerate. */
export function PlanSheet({ open, onClose, initialMinutes, initialFocus, onSaved }: PlanSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const ai = useAIStatus()
  const [step, setStep] = useState<Step>('form')
  const [minutes, setMinutes] = useState(30)
  const [focus, setFocus] = useState<PlanFocus>('full')
  const [note, setNote] = useState('')
  const [result, setResult] = useState<PlanResult | null>(null)
  const [swapIndex, setSwapIndex] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const runId = useRef(0)

  const library = useMemo<Exercise[]>(() => (open ? plannerLibrary() : []), [open])
  const byId = useMemo(() => exerciseMap(library), [library])
  const gate = useMemo(() => todaysGate(), [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { runId.current++; return }
    setStep('form'); setResult(null); setSaved(false); setNote('')
    setMinutes(initialMinutes && PLAN_MINUTES.includes(initialMinutes) ? initialMinutes : 30)
    setFocus(initialFocus ?? 'full')
  }, [open, initialMinutes, initialFocus])

  const generate = async () => {
    const id = ++runId.current
    setStep('loading'); setSaved(false)
    const r = await planWorkout({ minutes, focus, note })
    if (id !== runId.current) return // closed or regenerated meanwhile
    setResult(r)
    setStep('result')
  }

  const startNow = () => {
    if (!result) return
    const sessionId = createSession(planToSession(result.plan, todayStr()))
    onClose()
    // The session opens on its symptom check before anything can be logged.
    navigate(`/train/session/${sessionId}`)
  }

  const save = () => {
    if (!result || saved) return
    saveRoutineFromPlan(result.plan, result.source)
    setSaved(true)
    onSaved?.()
    toast.show('Saved to routines', 'success')
  }

  const applySwap = (sub: Exercise, reason: string) => {
    if (!result || swapIndex == null) return
    const exercises = result.plan.exercises.map((e, i) => (i === swapIndex ? { ...e, exerciseId: sub.id, note: undefined, substitutedFrom: e.substitutedFrom ?? e.exerciseId, substitutionReason: e.substitutionReason ?? reason } : e))
    setResult({ ...result, plan: { ...result.plan, exercises, minutes: planMinutes(exercises, library) } })
    setSwapIndex(null)
    setSaved(false)
  }

  const plan = result?.plan ?? null
  const totalSets = plan ? plan.exercises.reduce((n, e) => n + e.sets, 0) : 0
  const safetyLine = result ? [
    result.substituted.length ? `Swapped ${result.substituted.join(', ')}` : '',
    result.dropped.length ? `left out ${result.dropped.join(', ')}` : '',
  ].filter(Boolean).join(' · ') : ''
  const swapExercise = swapIndex != null && plan ? byId.get(plan.exercises[swapIndex]?.exerciseId) ?? null : null

  const footer = step === 'form' ? (
    <Button variant="primary" size="lg" full icon={<Sparkles size={18} />} onClick={generate}>Generate</Button>
  ) : step === 'result' ? (
    <div className="flex flex-col gap-2">
      <Button variant="primary" size="lg" full icon={<Play size={18} />} onClick={startNow}>Start now</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<BookmarkPlus size={16} />} onClick={save} disabled={saved}>{saved ? 'Saved' : 'Save as routine'}</Button>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={generate}>Regenerate</Button>
      </div>
    </div>
  ) : undefined

  return (
    <>
      <Sheet open={open} onClose={onClose} title={ai.connected ? 'Plan with AI' : 'Quick plan'} footer={footer} maxHeightVh={94}>
        <div data-pillar="train">
          {step === 'form' && (
            <div className="flex flex-col gap-5">
              <div>
                <div className="eyebrow text-muted mb-2" id="plan-minutes">Time</div>
                <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="plan-minutes">
                  {PLAN_MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={minutes === m}
                      aria-label={`${m} minutes`}
                      onClick={() => setMinutes(m)}
                      className={`press h-16 rounded-2xl border flex flex-col items-center justify-center ${minutes === m ? 'bg-pillar-soft border-pillar-line text-pillar' : 'bg-surface-2 border-line text-app'}`}
                    >
                      <span className="num text-3xl leading-none">{m}</span>
                      <span className="eyebrow mt-1 opacity-80">min</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow text-muted mb-2" id="plan-focus">Focus</div>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="plan-focus">
                  {FOCUS_OPTIONS.map((f) => (
                    <Chip key={f.value} selected={focus === f.value} check onClick={() => setFocus(f.value)} className="h-11">{f.label}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <label className="eyebrow text-muted mb-2 block" htmlFor="plan-note">Anything else? (optional)</label>
                <TextInput id="plan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gym is busy, machines only" maxLength={160} enterKeyHint="done" />
              </div>
              {!ai.connected && (
                <Link to="/settings#ai" className="text-[13px] text-muted underline underline-offset-4 min-h-11 inline-flex items-center">Connect AI for tailored plans</Link>
              )}
            </div>
          )}

          {step === 'loading' && (
            <div role="status" aria-label="Building your plan" className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-[132px] w-[120px] rounded-2xl" />
                <div className="flex-1 flex flex-col gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-32" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface-2 p-2">
                    <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
                    <Skeleton className="h-4 w-3/4 mt-2.5" />
                    <Skeleton className="h-5 w-1/2 mt-2 mb-1" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'result' && plan && result && (
            <div className="flex flex-col gap-4">
              <MuscleSummary exerciseIds={plan.exercises.map((e) => e.exerciseId)} byId={byId}>
                {result.source === 'ai' ? <AIBadge label="AI draft" /> : <span className="eyebrow text-muted">Built on this phone</span>}
                <div className="display text-2xl text-app mt-1 leading-tight">{plan.name}</div>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span><span className="num text-4xl text-app">{plan.minutes}</span><span className="text-sm font-medium text-muted ml-1">min</span></span>
                  <span><span className="num text-4xl text-app">{totalSets}</span><span className="text-sm font-medium text-muted ml-1">sets</span></span>
                </div>
              </MuscleSummary>
              {plan.rationale && <p className="voice text-lg text-app leading-snug">{plan.rationale}</p>}
              <ExerciseGrid rows={plan.exercises} byId={byId} onSwap={setSwapIndex} />
              {safetyLine && (
                <p className="flex items-start gap-1.5 text-[13px] text-muted leading-snug">
                  <ShieldCheck size={15} className="shrink-0 mt-0.5 text-ok" aria-hidden />
                  <span>Adjusted for today: {safetyLine}.</span>
                </p>
              )}
              {result.source === 'local' && !ai.connected && (
                <Link to="/settings#ai" className="text-[13px] text-muted underline underline-offset-4 min-h-11 inline-flex items-center">Connect AI for tailored plans</Link>
              )}
            </div>
          )}
        </div>
      </Sheet>

      <SubstituteSheet
        open={swapIndex != null}
        onClose={() => setSwapIndex(null)}
        exercise={swapExercise}
        gate={gate}
        library={library}
        inSessionIds={plan ? plan.exercises.map((e) => e.exerciseId) : []}
        initialReason="Preference"
        onPick={applySwap}
      />
    </>
  )
}
