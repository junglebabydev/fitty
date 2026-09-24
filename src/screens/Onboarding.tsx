// Onboarding = an intake conversation (DESIGN §10.3): one question per screen in the coach's voice,
// big tap targets, a slim progress bar, pillar hue per section, and an AI-written Starting point at the end.
// Steps live in features/onboarding/steps.tsx; every write goes through commitIntake (which wraps the
// original commitOnboarding, so profile, goals, flags, targets, settings and the week plan are unchanged).
// Opened from Settings on an onboarded profile it runs in re-run mode with every answer pre-filled.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, TriangleAlert } from 'lucide-react'
import { Button, Screen } from '../components'
import { FEATURES } from '../config/features'
import { useToast } from '../hooks'
import { nowIso, todayStr } from '../lib/util'
import { buildBaseline, localBaseline, type Baseline } from '../features/ai/intake'
import { commitIntake, readIntake, reportContextLines, saveBaseline, toBaselineAnswers, type IntakeAnswers } from '../features/onboarding/state'
import { StartingPoint } from '../features/onboarding/StartingPoint'
import { DEFAULTED_STEPS, STEPS, type StepCtx } from '../features/onboarding/steps'

/** The essentials: enough to set targets, respect injuries and build the first week. */
const QUICK_STEP_IDS = new Set([
  'welcome', 'name', 'goal', 'dob', 'sex', 'height', 'weight', 'target', 'experience', 'days', 'equipment',
  'bodycheck', 'meals', 'sleep', 'stress', 'reports', 'ai', 'disclaimer', 'start',
])
import { initialWizardState, type WizardState } from '../features/settings/onboarding'

const AUTO_ADVANCE_MS = 260

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayStr()
  const [s, setS] = useState<WizardState>(() => initialWizardState(today))
  const [a, setAns] = useState<IntakeAnswers>(() => readIntake(s.diet))
  const [step, setStep] = useState(0)
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [building, setBuilding] = useState(false)

  const heading = useRef<HTMLHeadingElement>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>()
  const recoveryAnswered = useRef(false)
  const buildKey = useRef('')
  const runId = useRef(0)
  const committed = useRef(false)

  // Depth: a first run starts with the essentials (about 2 minutes); the full intake adds lifestyle detail.
  // Re-running from Settings always shows everything.
  const [depth, setDepth] = useState<'quick' | 'full'>(() => (s.rerun ? 'full' : 'quick'))
  const steps = useMemo(() => {
    const all = FEATURES.reports ? STEPS : STEPS.filter((d) => d.id !== 'reports')
    return depth === 'full' ? all : all.filter((d) => QUICK_STEP_IDS.has(d.id))
  }, [depth])
  const def = steps[Math.min(step, steps.length - 1)]
  const last = step >= steps.length - 1

  const set = (patch: Partial<WizardState>) => setS((prev) => ({ ...prev, ...patch }))
  const setA = (patch: Partial<IntakeAnswers>) => {
    if ('stress' in patch || 'energy' in patch) recoveryAnswered.current = true
    setAns((prev) => ({ ...prev, ...patch }))
  }

  useEffect(() => {
    setError(null)
    window.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  const ctx: StepCtx = {
    s,
    set,
    a,
    setA,
    today,
    answered: s.rerun || !DEFAULTED_STEPS.has(def.id) || touched.has(def.id),
    pick: (apply) => {
      apply()
      setError(null)
      setTouched((prev) => new Set(prev).add(def.id))
      const from = step
      clearTimeout(advanceTimer.current)
      advanceTimer.current = setTimeout(() => setStep((cur) => (cur === from && from < steps.length - 1 ? from + 1 : cur)), AUTO_ADVANCE_MS)
    },
  }

  // The local baseline follows the targets live (they stay editable on the last screen); an AI one is kept as written.
  const answers = useMemo(() => toBaselineAnswers(s, a, today), [s, a, today])
  const shown: Baseline | null = baseline && baseline.generatedBy === 'local' ? { ...baseline, ...localBaseline(answers) } : baseline

  // Build the Starting point on arrival at the last step. AI when connected, rules otherwise; never throws.
  useEffect(() => {
    if (!def.final) return
    const reportLines = reportContextLines(a.shareReports)
    const key = JSON.stringify([{ ...answers, kcal: null, proteinG: null }, reportLines])
    if (key === buildKey.current) return
    buildKey.current = key
    const id = ++runId.current
    setBaseline(null)
    setBuilding(true)
    void buildBaseline(answers, { reportLines }).then((b) => {
      if (id !== runId.current) return
      // Finished after "Start" was tapped: the local version is already saved; upgrade it quietly.
      if (committed.current) {
        if (b.generatedBy === 'ai') saveBaseline(b)
        return
      }
      setBaseline(b)
      setBuilding(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const finish = () => {
    setSaving(true)
    try {
      const final: Baseline = shown && !building ? shown : { ...localBaseline(answers), generatedBy: 'local', ts: nowIso() }
      commitIntake(s, a, final, { logCheckIn: recoveryAnswered.current }, today)
      committed.current = true
      toast.show(s.rerun ? 'Profile updated' : "You're set. First stop: Today.", 'success')
      navigate(s.rerun ? '/settings' : '/', { replace: true })
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error && e.message ? e.message : 'Could not save. Try again.')
    }
  }

  const next = () => {
    clearTimeout(advanceTimer.current)
    const err = def.validate?.(ctx) ?? null
    if (err) {
      setError(err)
      return
    }
    if (last) finish()
    else setStep(step + 1)
  }

  /** Skip never blocks: an out-of-range optional value is dropped instead of reported. */
  const skip = () => {
    clearTimeout(advanceTimer.current)
    if (def.validate?.(ctx)) {
      if (def.id === 'waist') setA({ waistCm: null })
      if (def.id === 'target') set({ targetWeightKg: null })
    }
    setStep(step + 1)
  }

  const back = () => {
    clearTimeout(advanceTimer.current)
    if (step > 0) setStep(step - 1)
  }

  return (
    <Screen
      pillar={def.pillar}
      back={s.rerun ? '/settings' : undefined}
      backLabel="Cancel"
      right={
        def.optional && !last ? (
          <Button variant="ghost" size="sm" onClick={skip} aria-label={`Skip: ${def.question}`}>
            Skip
          </Button>
        ) : undefined
      }
    >
      <div
        role="progressbar"
        aria-label="Intake progress"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${steps.length}: ${def.section}`}
        className="h-1 rounded-full bg-surface-2 overflow-hidden"
      >
        <div className="h-full rounded-full bg-pillar transition-[width] duration-500 ease-out" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>

      {/* Keyed so each step gets one entrance. The fixed footer stays outside (a transformed ancestor would capture it). */}
      <div key={def.id} className="flex-1 pb-36 anim-rise">
        {def.final ? (
          <StartingPoint s={s} set={set} today={today} baseline={shown} building={building} />
        ) : (
          <>
            <header className="pt-7 pb-7">
              <p className="eyebrow text-pillar">{def.section}</p>
              <h1 ref={heading} tabIndex={-1} className="voice text-[28px] leading-[1.2] mt-3 text-balance outline-none">
                {def.question}
              </h1>
            </header>
            {def.render(ctx)}
            {def.id === 'welcome' && !s.rerun && (
              <div className="mt-7 grid grid-cols-2 gap-3" role="radiogroup" aria-label="How much to cover now">
                {([
                  { v: 'quick', title: 'Quick start', sub: 'About 2 minutes' },
                  { v: 'full', title: 'Full intake', sub: 'About 5 minutes' },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={depth === o.v}
                    onClick={() => setDepth(o.v)}
                    className={`press min-h-[64px] rounded-2xl border px-4 py-3 text-left ${depth === o.v ? 'border-pillar-line bg-pillar-soft' : 'border-line bg-surface'}`}
                  >
                    <span className="block text-[15px] font-semibold text-app">{o.title}</span>
                    <span className="block text-[13px] text-muted">{o.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 pointer-events-none">
        <div
          className="pointer-events-auto mx-auto w-full max-w-[430px] glass shadow-float border-t border-line px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          {error && (
            <p className="flex items-start gap-2 text-[14px] leading-snug mb-3" role="alert">
              <TriangleAlert size={16} className="shrink-0 mt-0.5 text-stop" aria-hidden />
              <span>{error}</span>
            </p>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="secondary" size="lg" onClick={back} disabled={saving} icon={<ChevronLeft size={20} />} className="w-[116px] shrink-0">
                Back
              </Button>
            )}
            <Button size="lg" full onClick={next} loading={saving} icon={last ? <Check size={20} /> : undefined}>
              {last ? (s.rerun ? 'Save changes' : 'Start') : step === 0 ? 'Begin' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </Screen>
  )
}
