// The intake conversation, one question per step. Each step: a section (eyebrow), a pillar hue,
// one line in the coach's voice and an answer area. Copy budget: ≤ 40 words per step.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Armchair,
  ArrowDownToLine,
  Bike,
  Building2,
  Cable,
  Check,
  ChefHat,
  Clock,
  Cog,
  Dumbbell,
  Eye,
  EyeOff,
  Feather,
  Flame,
  Footprints,
  HeartPulse,
  KeyRound,
  Lock,
  Medal,
  Megaphone,
  MessageCircle,
  Moon,
  PersonStanding,
  RectangleHorizontal,
  Salad,
  Sandwich,
  ShieldCheck,
  Smile,
  Soup,
  Sprout,
  Store,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Truck,
  Utensils,
  Waves,
  Zap,
} from 'lucide-react'
import { AIStatusChip, Button, Card, Chip, Field, Illustration, PILLARS, PILLAR_KEYS, StatusPill, TextInput } from '../../components'
import type { Tone } from '../../components'
import { coachChat, isAIError } from '../../ai'
import { getSetting, listReports, setSetting } from '../../db/repositories'
import type { HealthReport } from '../../domain/types'
import { useToast } from '../../hooks'
import { cx } from '../../lib/util'
import { HEALTH_DATA_TYPES, getHealthBridge } from '../../native'
import { activeProviderLabel, applyAISettings, refreshAI, useAIStatus } from '../ai/config'
import { ReportUploader } from '../reports'
import { MIND_CHECKIN_PRESETS, MIND_GOAL_OPTIONS } from '../settings/keys'
import { ageFromDob, validateStep, weeklyRateTo, STEP, type WizardState } from '../settings/onboarding'
import { ACTIVITY_OPTIONS, COACH_STYLE_OPTIONS, EQUIPMENT_OPTIONS, EXPERIENCE_OPTIONS, MOBILITY_OPTIONS, SEX_OPTIONS, splitKnown } from '../settings/options'
import { Toggle } from '../settings/SettingsUI'
import { cmToFtIn, displayLength, displayWeight, ftInToCm, lengthUnit, parseLength, parseWeight, weightUnit } from '../settings/units'
import { BodyCheck } from './BodyCheck'
import {
  ALCOHOL_OPTIONS,
  BEDTIME_OPTIONS,
  CAFFEINE_OPTIONS,
  ENJOY_OPTIONS,
  FOOD_OPTIONS,
  GOAL_OPTIONS,
  MINUTES_OPTIONS,
  NOT_WORKED_OPTIONS,
  RECENT_SESSION_OPTIONS,
  SUPPLEMENT_SUGGESTIONS,
  WORKED_OPTIONS,
  type PrimaryGoal,
} from './options'
import { INTAKE_KEYS, daysFromTarget, validateDob, validateHeight, validateWeight, type IntakeAnswers } from './state'
import { BigStepper, ChipCloud, Hint, OptionCards, Scale10, toggleValue } from './ui'

export type StepPillar = 'neutral' | 'train' | 'eat' | 'rest' | 'mind' | 'coach'

export interface StepCtx {
  s: WizardState
  set: (p: Partial<WizardState>) => void
  a: IntakeAnswers
  setA: (p: Partial<IntakeAnswers>) => void
  today: string
  /** Single-choice tap: apply the answer, then move on after a beat. */
  pick: (apply: () => void) => void
  /** False on a first run until the step's default has been tapped, so defaults are not shown as answers. */
  answered: boolean
}

export interface StepDef {
  id: string
  section: string
  pillar: StepPillar
  question: string
  /** Shows Skip. */
  optional?: boolean
  /** The final step renders its own body and changes the primary button. */
  final?: boolean
  validate?: (c: StepCtx) => string | null
  render: (c: StepCtx) => ReactNode
}

const I = 22

const GOAL_ICON: Record<PrimaryGoal, ReactNode> = {
  lose_fat: <Flame size={I} />,
  build_muscle: <Dumbbell size={I} />,
  get_fitter: <HeartPulse size={I} />,
  feel_better: <Smile size={I} />,
  move_pain_free: <PersonStanding size={I} />,
}

const EQUIPMENT_ICON: Record<string, ReactNode> = {
  dumbbells: <Dumbbell size={16} />,
  machines: <Cog size={16} />,
  bench: <RectangleHorizontal size={16} />,
  cables: <Cable size={16} />,
  lat_pulldown: <ArrowDownToLine size={16} />,
  pool: <Waves size={16} />,
  stationary_bike: <Bike size={16} />,
  treadmill: <Footprints size={16} />,
  rower: <Activity size={16} />,
}

const FOOD_ICON: Record<string, ReactNode> = {
  sg_hawker: <Soup size={16} />,
  home_cooked: <ChefHat size={16} />,
  cafe: <Store size={16} />,
  delivery: <Truck size={16} />,
  meal_prep: <Utensils size={16} />,
  canteen: <Building2 size={16} />,
  fast_food: <Sandwich size={16} />,
  vegetarian: <Salad size={16} />,
}

const CHECKIN_ICON: ReactNode[] = [<Sunrise size={I} key="a" />, <Sun size={I} key="b" />, <Sunset size={I} key="c" />, <Moon size={I} key="d" />]

function describeStress(n: number): string {
  return n <= 2 ? 'Calm' : n <= 4 ? 'Manageable' : n <= 6 ? 'Noticeable' : n <= 8 ? 'High' : 'Very high'
}
function describeEnergy(n: number): string {
  return n <= 2 ? 'Flat' : n <= 4 ? 'Low' : n <= 6 ? 'Steady' : n <= 8 ? 'Good' : 'Full'
}

/** Toggles `v` in a stored list split into known option values + free-text extras (kept). */
function toggleKnown(all: string[], options: { value: string; label: string }[], v: string): string[] {
  const { known, extras } = splitKnown(all, options)
  return [...toggleValue(known, v), ...extras]
}

// --- steps with local state ----------------------------------------------------------------

function ReportsStep({ setA }: Pick<StepCtx, 'setA'>) {
  const [reports, setReports] = useState<HealthReport[]>(() => listReports())
  const refresh = () => {
    setReports(listReports())
    // The uploader asks about sharing at upload; mirror its answer so the AI step shows the same switch.
    setA({ shareReports: getSetting<unknown>(INTAKE_KEYS.shareReports, false) === true })
  }
  return (
    <div className="flex flex-col items-center gap-5">
      {reports.length === 0 && <Illustration name="report" size={132} />}
      <ReportUploader compact onDone={refresh} />
      {reports.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 w-full" aria-label="Uploaded reports">
          {reports.slice(0, 4).map((r) => (
            <li key={r.id} className="anim-pop rounded-[1.25rem] border border-line bg-surface p-3.5 min-w-0">
              <p className="eyebrow text-pillar flex items-center gap-1.5">
                <Check size={13} strokeWidth={3} aria-hidden /> Added
              </p>
              <p className="font-semibold text-[15px] leading-tight mt-1.5 truncate">{r.title || r.fileName || 'Report'}</p>
              <p className="text-[13px] text-muted mt-0.5">{r.markers.length ? `${r.markers.length} markers` : r.ts.slice(0, 10)}</p>
            </li>
          ))}
        </ul>
      )}
      <Hint icon={<Lock size={16} />}>Stored on this phone. Discuss results with your clinician.</Hint>
    </div>
  )
}

function AIStep({ s, set, a, setA }: Pick<StepCtx, 's' | 'set' | 'a' | 'setA'>) {
  const status = useAIStatus()
  const how = status.connected
    ? `I think with ${activeProviderLabel(status)}. Only what a question needs is sent.`
    : status.mode === 'mock'
      ? 'Demo mode: I work from rules on this phone. Nothing leaves it.'
      : `${status.message} Until then I work from rules on this phone.`
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3">
        <AIStatusChip />
        <p className="text-[16px] leading-snug text-pretty">{how}</p>
      </div>
      {!status.connected && status.mode !== 'mock' && (status.host === 'cloud' && status.cloud !== 'none' ? <ConnectWorker /> : <ConnectGemini />)}
      <div className="rounded-[1.25rem] border border-line bg-surface divide-y divide-[var(--c-line)]">
        <SwitchRow title="Send meal photos to AI" sub="Off = rough on-device estimate" checked={s.sendMealPhotos} onChange={(sendMealPhotos) => set({ sendMealPhotos })} />
        <SwitchRow title="Share report summaries with the coach" sub="Context only, never a diagnosis" checked={a.shareReports} onChange={(shareReports) => setA({ shareReports })} />
      </div>
      <Hint icon={<ShieldCheck size={16} />}>Every call that leaves this phone is listed in the privacy ledger.</Hint>
    </div>
  )
}

/**
 * Connect AI without leaving the intake: the owner pastes their own Google Gemini key. It is written to the local
 * database only ('ai.geminiKey'), sent only to Google in a request header, and checked with one tiny call.
 */
function ConnectGemini() {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const connect = async () => {
    const trimmed = key.trim()
    if (!trimmed) return
    setBusy(true)
    setResult(null)
    setSetting('ai.geminiKey', trimmed)
    const mode = getSetting<string>('ai.mode', 'auto')
    if (mode === 'mock') setSetting('ai.mode', 'auto')
    applyAISettings()
    try {
      await coachChat('You are a connectivity check. Reply with the single word OK. No emoji.', [{ role: 'user', content: 'OK?' }])
      setResult({ ok: true, text: 'Connected. I can read photos, plan sessions and answer questions now.' })
      setKey('')
    } catch (e) {
      setResult({ ok: false, text: isAIError(e) ? e.message : 'That did not work. Check the key and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-pillar" aria-hidden />
        <p className="text-[16px] font-semibold">Connect AI with a Gemini key</p>
      </div>
      <Field label="Gemini API key">
        <div className="flex items-center gap-2">
          <TextInput
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your key"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Gemini API key"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide key' : 'Show key'}
            className="press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted"
          >
            {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
      </Field>
      <div className="flex items-center gap-3">
        <Button onClick={connect} loading={busy} disabled={!key.trim() || busy}>Connect</Button>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium text-pillar underline underline-offset-4">
          Get a key
        </a>
      </div>
      {result && (
        <p role="status" className={cx('text-[15px] leading-snug', result.ok ? 'text-ok' : 'text-warn')}>
          {result.ok ? 'Connected: ' : 'Not connected: '}
          {result.text}
        </p>
      )}
      <p className="text-[14px] leading-snug text-muted">
        The key stays on this phone and goes only to Google. On Google's free tier, what you send may be used to improve their products; paid keys are not. You can skip this and add it later in Settings.
      </p>
    </div>
  )
}

/**
 * Hosted site with a Cloudflare Worker: the AI key lives on the server, so this phone only needs the bridge PIN.
 * The PIN is stored in the local database ('ai.bridgePin') and sent only to this site, in a request header.
 */
function ConnectWorker() {
  const status = useAIStatus()
  const [pin, setPin] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  const connect = async () => {
    const trimmed = pin.trim()
    if (!trimmed) return
    setBusy(true)
    setSetting('ai.bridgePin', trimmed)
    if (getSetting<string>('ai.mode', 'auto') === 'mock') setSetting('ai.mode', 'auto')
    try {
      await refreshAI()
    } finally {
      setBusy(false)
      setTried(true)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-pillar" aria-hidden />
        <p className="text-[16px] font-semibold">Connect to your server's AI</p>
      </div>
      <Field label="Bridge PIN">
        <div className="flex items-center gap-2">
          <TextInput
            type={show ? 'text' : 'password'}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="The COACH_BRIDGE_PIN you set"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Bridge PIN"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide PIN' : 'Show PIN'}
            className="press inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted"
          >
            {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
      </Field>
      <Button onClick={connect} loading={busy} disabled={!pin.trim() || busy}>Connect</Button>
      <p role="status" className={cx('text-[15px] leading-snug', tried ? 'text-warn' : 'text-muted')}>{status.message}</p>
      <p className="text-[14px] leading-snug text-muted">Your AI key stays on the server. This phone only keeps the PIN. You can skip this and do it later in Settings.</p>
    </div>
  )
}

function SwitchRow({ title, sub, checked, onChange }: { title: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 min-h-[64px]">
      <div className="min-w-0">
        <p className="font-medium text-[16px] leading-tight">{title}</p>
        <p className="text-[14px] text-muted leading-snug mt-0.5">{sub}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function HealthStep({ s, set }: Pick<StepCtx, 's' | 'set'>) {
  const toast = useToast()
  const [avail, setAvail] = useState<{ loading: boolean; available: boolean }>({ loading: true, available: false })
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    let alive = true
    getHealthBridge()
      .isAvailable()
      .then((r) => alive && setAvail({ loading: false, available: r.available }))
      .catch(() => alive && setAvail({ loading: false, available: false }))
    return () => {
      alive = false
    }
  }, [])

  const connect = async () => {
    setConnecting(true)
    try {
      const perms = await getHealthBridge().requestPermissions(HEALTH_DATA_TYPES)
      set({ healthPermissions: perms })
      const granted = Object.values(perms).filter((p) => p === 'granted').length
      toast.show(granted ? `${granted} of ${HEALTH_DATA_TYPES.length} data types connected` : 'No data types were granted', granted ? 'success' : 'info')
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Could not request Health permissions', 'error')
    } finally {
      setConnecting(false)
    }
  }

  const granted = s.healthPermissions ? Object.values(s.healthPermissions).filter((p) => p === 'granted').length : 0
  const reads: { icon: ReactNode; label: string }[] = [
    { icon: <Moon size={20} />, label: 'Sleep' },
    { icon: <Dumbbell size={20} />, label: 'Workouts' },
    { icon: <HeartPulse size={20} />, label: 'Heart rate' },
    { icon: <Footprints size={20} />, label: 'Steps' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid grid-cols-4 gap-2.5" aria-label="What would be read">
        {reads.map((r) => (
          <li key={r.label} className="flex flex-col items-center gap-2 rounded-[1.25rem] border border-line bg-surface py-4">
            <span className="text-pillar" aria-hidden>
              {r.icon}
            </span>
            <span className="text-[13px] text-muted">{r.label}</span>
          </li>
        ))}
      </ul>
      {avail.available ? (
        <Button full size="lg" variant="pillar" icon={<ShieldCheck size={20} />} loading={connecting} onClick={connect}>
          {granted ? `Connected · ${granted}/${HEALTH_DATA_TYPES.length}` : 'Connect Apple Health'}
        </Button>
      ) : (
        <Hint icon={<Lock size={16} />}>{avail.loading ? 'Checking…' : 'Live sync needs the iOS app. Today you can import a Health export file; it is read on this phone.'}</Hint>
      )}
      {s.rerun ? (
        <Link to="/settings/health" className="press inline-flex items-center min-h-11 text-[15px] font-medium underline underline-offset-4 self-start">
          Open Apple Health settings
        </Link>
      ) : (
        <p className="text-[14px] text-muted">Read-only. Set up any time in Settings → Apple Health.</p>
      )}
    </div>
  )
}

function Disclaimer({ s, set }: Pick<StepCtx, 's' | 'set'>) {
  return (
    <div className="flex flex-col gap-4">
      <Card eyebrow="Wellbeing support, not a medical service">
        <p className="text-[15px] leading-snug">I plan, track and hold you to it. I never diagnose. Pain, numbness or anything that worries you goes to a clinician, and Mind → Support lists people to talk to.</p>
      </Card>
      <button
        type="button"
        role="checkbox"
        aria-checked={s.accepted}
        onClick={() => set({ accepted: !s.accepted })}
        className={cx('press flex items-center gap-3 w-full min-h-[64px] text-left rounded-[1.25rem] border px-4 py-4', s.accepted ? 'bg-accent-soft border-line-strong' : 'bg-surface border-line')}
      >
        <span className={cx('inline-flex items-center justify-center h-7 w-7 rounded-md border shrink-0 transition-colors', s.accepted ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong bg-surface-2')} aria-hidden>
          {s.accepted && <Check size={18} />}
        </span>
        <span className="text-[16px] leading-snug">I understand. This does not replace medical or mental-health care.</span>
      </button>
    </div>
  )
}

function TargetStep({ s, set, a }: Pick<StepCtx, 's' | 'set' | 'a'>) {
  const imperial = s.units === 'imperial'
  const rate = weeklyRateTo(s.weightKg, s.targetWeightKg, s.horizonMonths)
  const tone: Tone = rate == null ? 'neutral' : Math.abs(rate) <= 0.5 ? 'green' : Math.abs(rate) <= 1 ? 'amber' : 'red'
  const pace = rate == null ? 'No target: maintain' : rate === 0 ? 'Maintain' : `≈ ${Math.abs(rate).toFixed(1)} kg/week ${rate < 0 ? 'down' : 'up'} · ${Math.abs(rate) <= 0.5 ? 'sustainable' : Math.abs(rate) <= 1 ? 'ambitious' : 'too fast'}`
  const quick = a.goal === 'build_muscle' ? [2, 4] : a.goal === 'lose_fat' ? [-3, -5, -8] : []
  return (
    <div className="flex flex-col gap-7">
      <div>
        <BigStepper
          label="Target weight"
          value={displayWeight(s.targetWeightKg, s.units)}
          onChange={(v) => set({ targetWeightKg: parseWeight(v, s.units) })}
          unit={weightUnit(s.units)}
          step={0.5}
          decimals={1}
          min={imperial ? 66 : 30}
          max={imperial ? 660 : 300}
          fallback={displayWeight(s.weightKg, s.units) ?? (imperial ? 165 : 75)}
        />
        {s.weightKg != null && quick.length > 0 && (
          <div role="group" aria-label="Quick targets" className="flex justify-center gap-2.5 mt-4">
            {quick.map((d) => (
              <Chip key={d} selected={s.targetWeightKg === s.weightKg! + d} onClick={() => set({ targetWeightKg: s.weightKg! + d })}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`} kg
              </Chip>
            ))}
          </div>
        )}
      </div>
      <BigStepper label="In how many months" value={s.horizonMonths} onChange={(v) => set({ horizonMonths: v == null ? s.horizonMonths : Math.min(12, Math.max(1, Math.round(v))) })} unit="mo" min={1} max={12} fallback={4} />
      <div className="flex justify-center">
        <StatusPill tone={tone} dot size="md">
          {pace}
        </StatusPill>
      </div>
    </div>
  )
}

function HeightStep({ s, set }: Pick<StepCtx, 's' | 'set'>) {
  const imperial = s.units === 'imperial'
  const ftIn = s.heightCm != null ? cmToFtIn(s.heightCm) : null
  return (
    <div className="flex flex-col gap-6">
      {imperial ? (
        <div className="flex flex-col gap-6">
          <BigStepper label="Feet" value={ftIn?.ft ?? null} onChange={(ft) => set({ heightCm: ft == null ? null : ftInToCm(ft, ftIn?.inch ?? 0) })} unit="ft" min={3} max={8} fallback={5} />
          <BigStepper label="Inches" value={ftIn?.inch ?? null} onChange={(inch) => set({ heightCm: ftInToCm(ftIn?.ft ?? 5, inch ?? 0) })} unit="in" min={0} max={11} fallback={8} />
        </div>
      ) : (
        <BigStepper label="Height" value={s.heightCm} onChange={(heightCm) => set({ heightCm })} unit="cm" min={100} max={250} fallback={170} />
      )}
      <div role="group" aria-label="Units" className="flex justify-center gap-2.5">
        <Chip selected={!imperial} onClick={() => set({ units: 'metric' })}>
          kg · cm
        </Chip>
        <Chip selected={imperial} onClick={() => set({ units: 'imperial' })}>
          lb · ft
        </Chip>
      </div>
    </div>
  )
}

// --- the conversation --------------------------------------------------------------------------

export const STEPS: StepDef[] = [
  {
    id: 'welcome',
    section: 'Welcome',
    pillar: 'neutral',
    question: "I'm your coach. Let's find your starting line.",
    render: () => (
      <div className="flex flex-col items-center gap-7 pt-2">
        <ul className="grid grid-cols-4 gap-3 w-full" aria-label="Train, Eat, Rest, Mind">
          {PILLAR_KEYS.map((k, i) => {
            const P = PILLARS[k]
            const Icon = P.icon
            return (
              <li key={k} className="anim-rise flex flex-col items-center gap-2" style={{ '--i': i } as CSSProperties}>
                <span className={cx('inline-flex items-center justify-center h-16 w-16 rounded-full border border-line bg-surface', P.text)} aria-hidden>
                  <Icon size={26} />
                </span>
                <span className="eyebrow text-muted">{P.label}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-[16px] text-muted text-center leading-snug text-pretty">
          A few taps about where you are today.
          <br />
          Everything stays on this phone unless you say otherwise.
        </p>
      </div>
    ),
  },
  {
    id: 'name',
    section: 'Welcome',
    pillar: 'neutral',
    question: 'What should I call you?',
    optional: true,
    render: ({ s, set }) => (
      <Field label="First name" htmlFor="in-name">
        <TextInput id="in-name" value={s.name} onChange={(e) => set({ name: e.currentTarget.value })} placeholder="Your name" autoComplete="given-name" enterKeyHint="next" className="h-16! text-[22px]!" />
      </Field>
    ),
  },
  {
    id: 'goal',
    section: 'Goal',
    pillar: 'coach',
    question: 'What matters most right now?',
    validate: ({ a }) => (a.goal ? null : 'Pick the one that matters most.'),
    render: ({ a, setA, pick }) => <OptionCards label="Primary goal" options={GOAL_OPTIONS.map((o) => ({ ...o, icon: GOAL_ICON[o.value] }))} value={a.goal} onPick={(goal) => pick(() => setA({ goal }))} />,
  },
  {
    id: 'dob',
    section: 'Body now',
    pillar: 'neutral',
    question: 'When were you born?',
    validate: ({ s, today }) => validateDob(s.dob, today),
    render: ({ s, set, today }) => {
      const age = ageFromDob(s.dob, today)
      return (
        <div className="flex flex-col items-center gap-5">
          <Field label="Date of birth" htmlFor="in-dob" className="w-full">
            <TextInput id="in-dob" type="date" value={s.dob} max={today} onChange={(e) => set({ dob: e.currentTarget.value })} className="h-16! text-[22px]!" />
          </Field>
          {age != null && age >= 0 && age < 120 && (
            <p className="flex items-baseline gap-1.5" aria-live="polite">
              <span className="num text-6xl">{age}</span>
              <span className="text-muted text-lg font-medium">years</span>
            </p>
          )}
          <Hint>Used for the energy estimate. It never leaves this phone.</Hint>
        </div>
      )
    },
  },
  {
    id: 'sex',
    section: 'Body now',
    pillar: 'neutral',
    question: 'Which one fits the energy formula?',
    render: ({ s, set, pick, answered }) => <OptionCards label="Sex" options={SEX_OPTIONS.map((o) => ({ ...o, icon: <PersonStanding size={I} /> }))} value={answered ? s.sex : null} onPick={(sex) => pick(() => set({ sex }))} />,
  },
  {
    id: 'height',
    section: 'Body now',
    pillar: 'neutral',
    question: 'How tall are you?',
    validate: ({ s }) => validateHeight(s.heightCm),
    render: (c) => <HeightStep {...c} />,
  },
  {
    id: 'weight',
    section: 'Body now',
    pillar: 'neutral',
    question: 'What do you weigh today?',
    validate: ({ s }) => validateWeight(s.weightKg),
    render: ({ s, set }) => (
      <BigStepper
        label="Weight"
        value={displayWeight(s.weightKg, s.units)}
        onChange={(v) => set({ weightKg: parseWeight(v, s.units) })}
        unit={weightUnit(s.units)}
        step={0.1}
        decimals={1}
        min={s.units === 'imperial' ? 66 : 30}
        max={s.units === 'imperial' ? 660 : 300}
        fallback={s.units === 'imperial' ? 165 : 75}
        hint="Saved as today's weigh-in. I work from the 7-day average."
      />
    ),
  },
  {
    id: 'waist',
    section: 'Body now',
    pillar: 'neutral',
    question: 'And your waist, if you know it?',
    optional: true,
    validate: ({ a }) => (a.waistCm != null && (a.waistCm < 40 || a.waistCm > 200) ? 'Waist should be between 40 and 200 cm.' : null),
    render: ({ s, a, setA }) => (
      <BigStepper
        label="Waist"
        value={displayLength(a.waistCm, s.units)}
        onChange={(v) => setA({ waistCm: parseLength(v, s.units) })}
        unit={lengthUnit(s.units)}
        step={s.units === 'imperial' ? 0.5 : 1}
        decimals={s.units === 'imperial' ? 1 : 0}
        min={s.units === 'imperial' ? 16 : 40}
        max={s.units === 'imperial' ? 80 : 200}
        fallback={s.units === 'imperial' ? 34 : 86}
        hint="At the navel, relaxed. The second signal after weight."
      />
    ),
  },
  {
    id: 'target',
    section: 'Goal',
    pillar: 'coach',
    question: 'Where do you want to land?',
    optional: true,
    validate: ({ s, today }) => validateStep(STEP.goal, s, today),
    render: (c) => <TargetStep {...c} />,
  },
  {
    id: 'activity',
    section: 'Body now',
    pillar: 'neutral',
    question: 'Outside training, your days are…',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Activity outside training"
        options={ACTIVITY_OPTIONS.map((o, i) => ({ value: o.value, label: o.label, sub: o.hint, icon: [<Armchair size={I} key="a" />, <Footprints size={I} key="b" />, <Zap size={I} key="c" />][i] }))}
        value={answered ? s.activity : null}
        onPick={(activity) => pick(() => set({ activity }))}
      />
    ),
  },
  {
    id: 'experience',
    section: 'Training now',
    pillar: 'train',
    question: 'How much lifting is behind you?',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Experience"
        options={EXPERIENCE_OPTIONS.map((o, i) => ({ ...o, sub: ['New to it', 'A year or two', 'Years of structured training'][i], icon: [<Sprout size={I} key="a" />, <TrendingUp size={I} key="b" />, <Medal size={I} key="c" />][i] }))}
        value={answered ? s.experience : null}
        onPick={(experience) => pick(() => set({ experience }))}
      />
    ),
  },
  {
    id: 'recent',
    section: 'Training now',
    pillar: 'train',
    question: 'Lately, how many sessions a week?',
    optional: true,
    render: ({ a, setA, pick }) => <OptionCards label="Sessions per week lately" columns={2} options={RECENT_SESSION_OPTIONS} value={a.recentSessions} onPick={(recentSessions) => pick(() => setA({ recentSessions }))} />,
  },
  {
    id: 'enjoy',
    section: 'Training now',
    pillar: 'train',
    question: 'What do you actually enjoy?',
    optional: true,
    render: ({ s, set }) => <ChipCloud label="What you enjoy" options={ENJOY_OPTIONS} selected={s.preferences} onToggle={(v) => set({ preferences: toggleValue(s.preferences, v) })} />,
  },
  {
    id: 'days',
    section: 'Training now',
    pillar: 'train',
    question: 'How many days can you honestly give me?',
    render: ({ s, set }) => (
      <BigStepper label="Days per week" value={s.daysTarget} onChange={(v) => v != null && set(daysFromTarget(v))} unit="days" min={2} max={7} fallback={3} hint="Miss one and the week reflows. No guilt." />
    ),
  },
  {
    id: 'minutes',
    section: 'Training now',
    pillar: 'train',
    question: 'And how long per session?',
    optional: true,
    render: ({ a, setA, pick }) => (
      <OptionCards label="Minutes per session" columns={2} options={MINUTES_OPTIONS.map((o) => ({ ...o, sub: 'minutes' }))} value={a.minutesPerSession} onPick={(minutesPerSession) => pick(() => setA({ minutesPerSession }))} />
    ),
  },
  {
    id: 'equipment',
    section: 'Training now',
    pillar: 'train',
    question: 'What can you reach?',
    render: ({ s, set }) => {
      const { known, extras } = splitKnown(s.equipment, EQUIPMENT_OPTIONS)
      return (
        <ChipCloud
          label="Available equipment"
          options={[...EQUIPMENT_OPTIONS.map((o) => ({ ...o, icon: EQUIPMENT_ICON[o.value] })), ...extras.map((v) => ({ value: v, label: v }))]}
          selected={[...known, ...extras]}
          onToggle={(v) => set({ equipment: extras.includes(v) ? s.equipment.filter((e) => e !== v) : toggleKnown(s.equipment, EQUIPMENT_OPTIONS, v) })}
        />
      )
    },
  },
  {
    id: 'style',
    section: 'Training now',
    pillar: 'coach',
    question: 'How should I talk to you?',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Coach style"
        options={COACH_STYLE_OPTIONS.map((o, i) => ({ value: o.value, label: o.label, sub: ['Direct about what was missed', 'Plain-spoken, fewer nudges', 'Softer tone, priorities only'][i], icon: [<Megaphone size={I} key="a" />, <MessageCircle size={I} key="b" />, <Feather size={I} key="c" />][i] }))}
        value={answered ? s.coachStyle : null}
        onPick={(coachStyle) => pick(() => set({ coachStyle }))}
      />
    ),
  },
  {
    id: 'bodycheck',
    section: 'Body check',
    pillar: 'train',
    question: 'Anything I should look after? Tap it.',
    optional: true,
    render: ({ s, set }) => <BodyCheck conditions={s.conditions} onChange={(conditions) => set({ conditions })} />,
  },
  {
    id: 'mobility',
    section: 'Body check',
    pillar: 'train',
    question: 'Where do you feel tight?',
    optional: true,
    render: ({ s, set }) => {
      const { known, extras } = splitKnown(s.mobility, MOBILITY_OPTIONS)
      return <ChipCloud label="Mobility priorities" options={[...MOBILITY_OPTIONS, ...extras.map((v) => ({ value: v, label: v }))]} selected={[...known, ...extras]} onToggle={(v) => set({ mobility: extras.includes(v) ? s.mobility.filter((e) => e !== v) : toggleKnown(s.mobility, MOBILITY_OPTIONS, v) })} />
    },
  },
  {
    id: 'meals',
    section: 'Eating now',
    pillar: 'eat',
    question: 'How many meals on a normal day?',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Meals per day"
        options={[
          { value: 1 as const, label: 'One' },
          { value: 2 as const, label: 'One or two' },
          { value: 3 as const, label: 'Three or more' },
        ].map((o) => ({ ...o, icon: <Utensils size={I} /> }))}
        value={answered ? s.diet.mealsPerDay : null}
        onPick={(mealsPerDay) => pick(() => set({ diet: { ...s.diet, mealsPerDay } }))}
      />
    ),
  },
  {
    id: 'breakfast',
    section: 'Eating now',
    pillar: 'eat',
    question: 'Breakfast?',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Breakfast"
        options={[
          { value: 'skip', label: 'I usually skip it', sub: 'Protein pacing starts at your first meal', icon: <Clock size={I} /> },
          { value: 'eat', label: 'I eat breakfast', icon: <Sunrise size={I} /> },
        ]}
        value={answered ? (s.diet.skipsBreakfast ? 'skip' : 'eat') : null}
        onPick={(v) => pick(() => set({ diet: { ...s.diet, skipsBreakfast: v === 'skip' } }))}
      />
    ),
  },
  {
    id: 'foods',
    section: 'Eating now',
    pillar: 'eat',
    question: 'Where does most of your food come from?',
    optional: true,
    render: ({ a, setA }) => <ChipCloud label="Typical food" options={FOOD_OPTIONS.map((o) => ({ ...o, icon: FOOD_ICON[o.value] }))} selected={a.foods} onToggle={(v) => setA({ foods: toggleValue(a.foods, v) })} />,
  },
  {
    id: 'alcohol',
    section: 'Eating now',
    pillar: 'eat',
    question: 'How often do you drink?',
    optional: true,
    render: ({ a, setA, pick }) => <OptionCards label="Alcohol" columns={2} options={ALCOHOL_OPTIONS.map((o) => ({ ...o, label: o.label }))} value={a.alcohol} onPick={(alcohol) => pick(() => setA({ alcohol }))} />,
  },
  {
    id: 'caffeine',
    section: 'Eating now',
    pillar: 'eat',
    question: 'Coffee or tea per day?',
    optional: true,
    render: ({ a, setA, pick }) => <OptionCards label="Caffeine" options={CAFFEINE_OPTIONS} value={a.caffeine} onPick={(caffeine) => pick(() => setA({ caffeine }))} />,
  },
  {
    id: 'supplements',
    section: 'Eating now',
    pillar: 'eat',
    question: 'Any supplements?',
    optional: true,
    render: ({ a, setA }) => {
      const has = (x: string) => a.supplements.toLowerCase().includes(x.toLowerCase())
      const toggle = (x: string) => {
        const parts = a.supplements.split(',').map((p) => p.trim()).filter((p) => p && p !== 'Yes')
        setA({ supplements: (has(x) ? parts.filter((p) => p.toLowerCase() !== x.toLowerCase()) : [...parts, x]).join(', ') })
      }
      return (
        <div className="flex flex-col gap-4">
          <Field label="What you take" htmlFor="in-supps">
            <TextInput id="in-supps" value={a.supplements} onChange={(e) => setA({ supplements: e.currentTarget.value })} placeholder="e.g. whey, creatine" className="h-14! text-[18px]!" />
          </Field>
          <div role="group" aria-label="Common supplements" className="flex flex-wrap gap-2.5">
            {SUPPLEMENT_SUGGESTIONS.map((x) => (
              <Chip key={x} selected={has(x)} check onClick={() => toggle(x)}>
                {x}
              </Chip>
            ))}
          </div>
        </div>
      )
    },
  },
  {
    id: 'sleep',
    section: 'Sleep & stress',
    pillar: 'rest',
    question: 'How long do you usually sleep?',
    optional: true,
    render: ({ a, setA }) => <BigStepper label="Hours a night" value={a.sleepHours} onChange={(sleepHours) => setA({ sleepHours })} unit="h" step={0.5} decimals={1} min={3} max={12} fallback={7} />,
  },
  {
    id: 'bedtime',
    section: 'Sleep & stress',
    pillar: 'rest',
    question: 'Is your bedtime consistent?',
    optional: true,
    render: ({ a, setA, pick }) => <OptionCards label="Bedtime consistency" options={BEDTIME_OPTIONS.map((o) => ({ ...o, icon: <Moon size={I} /> }))} value={a.bedtime} onPick={(bedtime) => pick(() => setA({ bedtime }))} />,
  },
  {
    id: 'stress',
    section: 'Sleep & stress',
    pillar: 'mind',
    question: 'How is stress right now?',
    optional: true,
    render: ({ a, setA }) => <Scale10 label="Stress" value={a.stress} onChange={(stress) => setA({ stress })} ends={['Calm', 'Very high']} describe={describeStress} />,
  },
  {
    id: 'energy',
    section: 'Sleep & stress',
    pillar: 'mind',
    question: 'And your energy?',
    optional: true,
    render: ({ a, setA }) => <Scale10 label="Energy" value={a.energy} onChange={(energy) => setA({ energy })} ends={['Flat', 'Full']} describe={describeEnergy} />,
  },
  {
    id: 'wants',
    section: 'Sleep & stress',
    pillar: 'mind',
    question: 'What would you like more of?',
    optional: true,
    render: ({ s, set }) => <ChipCloud label="What you would like more of" options={MIND_GOAL_OPTIONS} selected={s.mindGoals} onToggle={(v) => set({ mindGoals: toggleValue(s.mindGoals, v) })} />,
  },
  {
    id: 'checkin',
    section: 'Sleep & stress',
    pillar: 'mind',
    question: 'When is a good moment to check in?',
    render: ({ s, set, pick, answered }) => (
      <OptionCards
        label="Preferred check-in time"
        columns={2}
        options={MIND_CHECKIN_PRESETS.map((p, i) => ({ value: p.value, label: p.label, sub: p.value, icon: CHECKIN_ICON[i] }))}
        value={answered ? s.mindCheckinTime : null}
        onPick={(mindCheckinTime) => pick(() => set({ mindCheckinTime }))}
      />
    ),
  },
  {
    id: 'worked',
    section: 'What you know',
    pillar: 'coach',
    question: 'What has worked for you before?',
    optional: true,
    render: ({ a, setA }) => <ChipCloud label="What has worked" options={WORKED_OPTIONS.map((x) => ({ value: x, label: x }))} selected={a.worked} onToggle={(v) => setA({ worked: toggleValue(a.worked, v) })} />,
  },
  {
    id: 'notworked',
    section: 'What you know',
    pillar: 'coach',
    question: "And what hasn't?",
    optional: true,
    render: ({ a, setA }) => (
      <div className="flex flex-col gap-5">
        <ChipCloud label="What has not worked" options={NOT_WORKED_OPTIONS.map((x) => ({ value: x, label: x }))} selected={a.notWorked} onToggle={(v) => setA({ notWorked: toggleValue(a.notWorked, v) })} />
        <Field label="In your words (optional)" htmlFor="in-history">
          <TextInput id="in-history" value={a.historyNote} onChange={(e) => setA({ historyNote: e.currentTarget.value })} placeholder="One line is plenty" maxLength={160} />
        </Field>
      </div>
    ),
  },
  {
    id: 'reports',
    section: 'Reports',
    pillar: 'neutral',
    question: 'Any recent reports? Blood tests, body scans, physio notes.',
    optional: true,
    render: (c) => <ReportsStep setA={c.setA} />,
  },
  {
    id: 'ai',
    section: 'AI & privacy',
    pillar: 'coach',
    question: 'Here is how I think.',
    render: (c) => <AIStep {...c} />,
  },
  {
    id: 'health',
    section: 'AI & privacy',
    pillar: 'rest',
    question: 'Want to log less? Bring your Health data.',
    optional: true,
    render: (c) => <HealthStep {...c} />,
  },
  {
    id: 'disclaimer',
    section: 'Before we start',
    pillar: 'neutral',
    question: 'One honest note, then we begin.',
    validate: ({ s, today }) => validateStep(STEP.disclaimer, s, today),
    render: (c) => <Disclaimer {...c} />,
  },
  {
    id: 'start',
    section: 'Starting point',
    pillar: 'coach',
    question: '',
    final: true,
    render: () => null,
  },
]

/** Steps whose stored default is not shown as an answer on a first run. */
export const DEFAULTED_STEPS = new Set(['sex', 'activity', 'experience', 'style', 'meals', 'breakfast', 'checkin'])
