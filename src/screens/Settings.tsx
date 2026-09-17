import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  Brain,
  CircleAlert,
  CircleCheck,
  Cloud,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HeartPulse,
  Info,
  KeyRound,
  Laptop,
  Monitor,
  Moon,
  RefreshCw,
  Ruler,
  ScrollText,
  Sparkles,
  Sun,
  Target,
  User,
  Utensils,
} from 'lucide-react'
import { Button, Chip, EmptyState, Field, IconButton, NumberInput, PermissionDenied, Screen, Segmented, Sheet, StatusPill, TextInput } from '../components'
import type { Tone } from '../components'
import { getGoals, getLedger, getNutritionTarget, getProfile, latestBodyMetric, saveProfile, setNutritionTarget, setSetting, upsertGoal } from '../db/repositories'
import { reseed } from '../db/seed'
import type { Goal, Units, UserProfile } from '../domain/types'
import { useQuery, useToast } from '../hooks'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { addDays, cx, fmtDate, round, todayStr } from '../lib/util'
import { notificationPermission, requestNotificationPermission, type NotificationState } from '../native'
import { DEFAULT_GEMINI_MODEL } from '../ai'
import { AI_GEMINI_KEY, AI_GEMINI_MODEL, aiStateLine, applyAISettings, readAISettings as readAIConfig, refreshAI, useAIStatus, type AIMode } from '../features/ai/config'
import { maskApiKey, saveAISettings, testConnection, type ConnectionTestResult } from '../features/settings/ai'
import {
  DEFAULT_EVENING_REMINDER,
  DEFAULT_MORNING_REMINDER,
  DEFAULT_VOICE_RETENTION_DAYS,
  KEYS,
  MIND_GOAL_OPTIONS,
  VOICE_RETENTION_OPTIONS,
  readAISettings,
  readHealthPermissions,
  readMindCheckinTime,
  readMindGoals,
} from '../features/settings/keys'
import { ageFromDob } from '../features/settings/onboarding'
import { COACH_STYLE_OPTIONS } from '../features/settings/options'
import { ControlRow, Group, GroupBlock, GroupText, Row, StatusLine, TimeInput, Toggle } from '../features/settings/SettingsUI'
import { useSetting } from '../features/settings/useSetting'
import { displayLength, displayWeight, fmtHeight, fmtLength, fmtWeight, lengthUnit, parseLength, parseWeight, weightUnit } from '../features/settings/units'

const NOTIF_TONE: Record<NotificationState, Tone> = { granted: 'green', denied: 'red', default: 'neutral', unsupported: 'neutral' }
const NOTIF_LABEL: Record<NotificationState, string> = { granted: 'Allowed', denied: 'Denied', default: 'Not asked', unsupported: 'Unsupported' }

const THEME_OPTIONS: { value: ThemePref; label: string; icon: JSX.Element }[] = [
  { value: 'system', label: 'System', icon: <Monitor size={15} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
  { value: 'light', label: 'Light', icon: <Sun size={15} /> },
]
const THEME_HINT: Record<ThemePref, string> = {
  system: 'Follows this phone: dark at night if you use automatic appearance.',
  dark: 'Ink background, bone type. Easiest on the eyes in the gym and in bed.',
  light: 'Warm paper background. Best in bright daylight.',
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const profile = useQuery(() => getProfile(), [])

  if (!profile) {
    return (
      <Screen title="Settings" pillar="neutral" large back="/" backLabel="Today">
        <EmptyState
          icon={<User size={26} />}
          title="No profile yet"
          body="Set up your profile, goals and privacy preferences to start."
          action={<Button onClick={() => navigate('/onboarding')}>Start setup</Button>}
        />
      </Screen>
    )
  }

  return <SettingsBody profile={profile} />
}

function SettingsBody({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayStr()
  const units: Units = profile.units

  // /settings#ai (the "Connect AI" links) lands on the AI section.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#ai') document.getElementById('ai')?.scrollIntoView({ block: 'start' })
  }, [hash])

  const goals = useQuery(() => getGoals(), [])
  const weight = useQuery(() => latestBodyMetric('weight'), [])
  const target = useQuery(() => getNutritionTarget(today), [today])
  const health = useQuery(() => readHealthPermissions(), [])
  const ledgerCount = useQuery(() => getLedger(100).length, [])
  const mindGoals = useQuery(() => readMindGoals(), [])
  const mindTime = useQuery(() => readMindCheckinTime(), [])

  const [keepPhotos, setKeepPhotos] = useSetting<boolean>(KEYS.keepMealPhotos, true)
  const [voiceDays, setVoiceDays] = useSetting<number>(KEYS.voiceRetentionDays, DEFAULT_VOICE_RETENTION_DAYS)
  const [morning, setMorning] = useSetting<string | null>(KEYS.remindersMorning, null)
  const [evening, setEvening] = useSetting<string | null>(KEYS.remindersEvening, null)

  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [notif, setNotif] = useState<NotificationState>(() => notificationPermission())
  const [goalSheet, setGoalSheet] = useState<Goal['type'] | null>(null)
  const [targetSheet, setTargetSheet] = useState(false)
  const [reseedSheet, setReseedSheet] = useState(false)
  const [reseeding, setReseeding] = useState(false)

  const weightGoal = goals.find((g) => g.type === 'weight' && g.status === 'active') ?? null
  const waistGoal = goals.find((g) => g.type === 'waist' && g.status === 'active') ?? null
  const age = ageFromDob(profile.dob, today)
  const grantedHealth = Object.values(health).filter((p) => p === 'granted').length

  const updateProfile = (patch: Partial<UserProfile>) => saveProfile({ ...profile, ...patch })

  const changeTheme = (pref: ThemePref) => {
    setTheme(pref)
    setThemePref(pref)
  }

  const requestNotif = async () => {
    const r = await requestNotificationPermission()
    setNotif(r)
    if (r === 'granted') toast.show('Notifications allowed', 'success')
    else if (r === 'denied') toast.show('Notifications are blocked for this site', 'error')
  }

  const toggleReminder = async (which: 'morning' | 'evening', on: boolean) => {
    const setter = which === 'morning' ? setMorning : setEvening
    if (!on) {
      setter(null)
      return
    }
    setter(which === 'morning' ? DEFAULT_MORNING_REMINDER : DEFAULT_EVENING_REMINDER)
    if (notif === 'default') await requestNotif()
  }

  const doReseed = async () => {
    setReseeding(true)
    try {
      await reseed()
      applyAISettings() // reseed rewrote ai.* (mock, no key); keep the in-memory gateway in step
      toast.show('Demo data restored', 'success')
      setReseedSheet(false)
      navigate('/')
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Reseed failed', 'error')
    } finally {
      setReseeding(false)
    }
  }

  const profileSub = [
    age != null ? `${age} yrs` : null,
    profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : null,
    fmtHeight(profile.heightCm, units),
    weight ? fmtWeight(weight.value, units) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const mindSub = mindGoals.length
    ? `${mindGoals.map((g) => MIND_GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g).join(', ')} · check-in ${mindTime}`
    : `Check-in around ${mindTime}`

  return (
    <Screen title="Settings" pillar="neutral" large back="/" backLabel="Today">
      <p className="voice text-lg text-muted -mt-1">Everything here lives on this phone. Change anything; nothing breaks.</p>

      <Group title="Profile" footer="Opens setup again with your current answers filled in. Cancel any time without losing anything.">
        <Row icon={<User size={18} />} title={profile.name || 'Your profile'} subtitle={profileSub} chevron onClick={() => navigate('/onboarding')} />
        <Row icon={<Utensils size={18} />} title="Diet pattern" subtitle={profile.dietPattern || 'Not set'} chevron onClick={() => navigate('/onboarding')} />
        <Row icon={<Brain size={18} />} title="Wellbeing focus" subtitle={mindSub} chevron onClick={() => navigate('/onboarding')} />
      </Group>

      <Group title="Goals & targets" footer="The coach moves targets from 14–21 day weight and waist trends, not from re-running formulas.">
        <Row
          icon={<Target size={18} />}
          title="Target weight"
          right={weightGoal ? `${fmtWeight(weightGoal.targetValue, units)}${weightGoal.targetDate ? ` by ${fmtDate(weightGoal.targetDate)}` : ''}` : 'Not set'}
          chevron
          onClick={() => setGoalSheet('weight')}
        />
        <Row
          icon={<Ruler size={18} />}
          title="Target waist"
          right={waistGoal ? `${fmtLength(waistGoal.targetValue, units)}${waistGoal.targetDate ? ` by ${fmtDate(waistGoal.targetDate)}` : ''}` : 'Not set'}
          chevron
          onClick={() => setGoalSheet('waist')}
        />
        <Row
          icon={<Utensils size={18} />}
          title="Daily targets"
          right={target ? `${target.kcal.toLocaleString('en-SG')} kcal · ${target.proteinG} g` : 'Not set'}
          chevron
          onClick={() => setTargetSheet(true)}
        />
      </Group>

      <Group title="Coach style">
        <GroupBlock hint={COACH_STYLE_OPTIONS.find((o) => o.value === profile.coachStyle)?.hint}>
          <Segmented
            options={COACH_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={profile.coachStyle}
            onChange={(coachStyle) => {
              updateProfile({ coachStyle })
              setSetting(KEYS.coachStyle, coachStyle)
            }}
            label="Coach style"
          />
        </GroupBlock>
      </Group>

      <Group title="Appearance">
        <GroupBlock hint={THEME_HINT[theme]}>
          <Segmented options={THEME_OPTIONS} value={theme} onChange={changeTheme} label="Appearance" />
        </GroupBlock>
      </Group>

      <Group title="Units">
        <GroupBlock hint="Everything is stored in metric. This only changes what you see and type.">
          <Segmented
            options={[
              { value: 'metric', label: 'Metric · kg, cm' },
              { value: 'imperial', label: 'Imperial · lb, ft' },
            ]}
            value={units}
            onChange={(u) => {
              updateProfile({ units: u })
              setSetting(KEYS.units, u)
            }}
            label="Units"
          />
        </GroupBlock>
      </Group>

      <Group
        title="Reminders"
        footer={
          notif === 'unsupported'
            ? 'This browser cannot show notifications. Reminders fire as local notifications once the app runs in the iOS shell.'
            : 'Reminders are shown while the app is open. Scheduled delivery in the background needs the iOS shell.'
        }
      >
        <ControlRow
          icon={<Bell size={18} />}
          title="Notifications"
          subtitle={notif === 'granted' ? 'Allowed for this site' : notif === 'denied' ? 'Blocked in browser settings' : notif === 'default' ? 'Asked when you turn a reminder on' : 'Not supported here'}
          control={
            notif === 'default' ? (
              <Button size="md" variant="secondary" onClick={requestNotif}>
                Allow
              </Button>
            ) : (
              <StatusPill tone={NOTIF_TONE[notif]} dot size="sm">
                {NOTIF_LABEL[notif]}
              </StatusPill>
            )
          }
        />
        {notif === 'denied' && (
          <div className="px-4 py-3">
            <PermissionDenied
              what="Notification"
              why="Reminders can't be shown until notifications are re-enabled for this site. On iPhone: Settings → Safari (or the home-screen app) → Notifications. On desktop: the lock icon in the address bar."
            />
          </div>
        )}
        <ControlRow
          title="Morning check-in"
          subtitle="Readiness, weight if missing, symptoms"
          control={
            <div className="flex items-center gap-2">
              {morning !== null && <TimeInput value={morning} onChange={(v) => setMorning(v || DEFAULT_MORNING_REMINDER)} label="Morning reminder time" />}
              <Toggle checked={morning !== null} onChange={(on) => void toggleReminder('morning', on)} label="Morning reminder" />
            </div>
          }
        />
        <ControlRow
          title="Evening log"
          subtitle="Meals, session, sleep note"
          control={
            <div className="flex items-center gap-2">
              {evening !== null && <TimeInput value={evening} onChange={(v) => setEvening(v || DEFAULT_EVENING_REMINDER)} label="Evening reminder time" />}
              <Toggle checked={evening !== null} onChange={(on) => void toggleReminder('evening', on)} label="Evening reminder" />
            </div>
          }
        />
      </Group>

      <AISection />

      <Group title="Integrations & privacy">
        <Row icon={<FileText size={18} />} title="Reports" subtitle="Blood tests, scans, clinic notes" chevron to="/reports" />
        <Row icon={<HeartPulse size={18} />} title="Apple Health" subtitle="Import an export, or live sync in the iOS app" right={grantedHealth ? `${grantedHealth} live` : undefined} chevron to="/settings/health" />
        <Row icon={<ScrollText size={18} />} title="Privacy ledger" subtitle="Every AI call that left this phone" right={`${ledgerCount}`} chevron to="/settings/privacy" />
        <Row icon={<Database size={18} />} title="Data & storage" subtitle="Export, storage, delete" chevron to="/settings/data" />
      </Group>

      <Group title="Media retention" footer="Voice transcripts and meal photos are the only media the app keeps. Progress photos always stay local.">
        <ControlRow
          title="Keep meal photos"
          subtitle="Off = discard the photo once the meal is saved"
          control={<Toggle checked={keepPhotos} onChange={setKeepPhotos} label="Keep meal photos" />}
        />
        <GroupBlock label="Keep voice transcripts for" hint="Older transcripts are pruned automatically.">
          <Segmented options={VOICE_RETENTION_OPTIONS} value={voiceDays} onChange={setVoiceDays} size="sm" label="Voice retention" />
        </GroupBlock>
      </Group>

      <Group title="About">
        <Row icon={<Info size={18} />} title="Coach" right="V0.1 · local-first" />
        <GroupText>
          <span className="text-app font-medium">Fitness and wellbeing support, not a medical service.</span> The coach is demanding on adherence and conservative on symptoms: pain above 5/10 or any red flag stops the affected
          recommendation and points to professional assessment. Mood check-ins, breathing and journaling are for reflection, not therapy. It never diagnoses.
        </GroupText>
      </Group>

      <Group title="Demo data" footer="Asks for confirmation first. Export from Data & storage if you want to keep anything.">
        <Row icon={<RefreshCw size={18} />} title="Reseed demo data" subtitle="Replace everything with the sample profile and history" chevron onClick={() => setReseedSheet(true)} />
      </Group>

      <GoalSheet type={goalSheet} goal={goalSheet === 'weight' ? weightGoal : waistGoal} units={units} today={today} onClose={() => setGoalSheet(null)} />
      <TargetSheet open={targetSheet} current={target} today={today} onClose={() => setTargetSheet(false)} />

      <Sheet
        open={reseedSheet}
        onClose={() => !reseeding && setReseedSheet(false)}
        title="Reseed demo data?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setReseedSheet(false)} disabled={reseeding}>
              Cancel
            </Button>
            <Button variant="danger" full loading={reseeding} onClick={() => void doReseed()}>
              Replace everything
            </Button>
          </div>
        }
      >
        <p className="text-[15px] leading-snug">
          This deletes every record on this phone (profile, workouts, meals, sleep, mood, coach history) and restores the sample scenario: 84.0 kg, Amber readiness, upper-body session today.
        </p>
        <p className="text-[13px] text-muted mt-2">Export first from Data & storage if you want to keep anything.</p>
      </Sheet>
    </Screen>
  )
}

// --- AI section (DESIGN §10.3) --------------------------------------------------------

const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey'

// Five choices do not fit one Segmented track at 375 px, so the mode is a wrapped chip row.
function aiModeOptions(cloud: boolean): { value: AIMode; label: string }[] {
  return [
    { value: 'auto', label: 'Auto' },
    { value: 'claude-code', label: cloud ? 'My Worker' : 'My Mac' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'mock', label: 'Demo' },
  ]
}
function aiModeHint(mode: AIMode, cloud: boolean): string {
  if (mode === 'auto') return `Auto: ${cloud ? 'your Worker if you set one up' : 'Claude on my Mac when it answers'}, then your Gemini key, then your Anthropic key, then demo.`
  if (mode === 'claude-code') return cloud ? 'My Worker: your Cloudflare Worker holds the API key. This phone only holds the PIN.' : 'Claude on my Mac: your Claude subscription, through Claude Code.'
  if (mode === 'gemini') return 'Gemini: requests go straight to Google with your key.'
  if (mode === 'anthropic') return 'Anthropic: requests go straight to Anthropic with your key.'
  return 'Demo: placeholder estimates only. Nothing leaves this phone.'
}
const BRIDGE_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Default' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
]
const MAC_STEPS: { title: string; body: JSX.Element }[] = [
  { title: 'Open Terminal on your Mac', body: <>On the Mac that serves this app, run <Code>claude</Code>.</> },
  { title: 'Sign in', body: <>Type <Code>/login</Code> and sign in with your Claude subscription.</> },
  { title: 'Keep the server running', body: <>Leave <Code>npm run dev</Code> or <Code>npm run dev:https</Code> running, and open the app from the same Wi-Fi.</> },
]
const CLOUD_STEPS: { title: string; body: JSX.Element }[] = [
  { title: 'Add two Worker secrets', body: <>Set <Code>GEMINI_API_KEY</Code> (or <Code>ANTHROPIC_API_KEY</Code>) and a <Code>COACH_BRIDGE_PIN</Code> of at least 8 characters, with <Code>npx wrangler secret put NAME</Code> or in the Cloudflare dashboard.</> },
  { title: 'Redeploy', body: <>Deploy the Worker again so it picks the secrets up.</> },
  { title: 'Enter the PIN here', body: <>Type the same PIN in the Bridge PIN field, then check again. The API key stays on the Worker.</> },
]

function Code({ children }: { children: string }) {
  return <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-app">{children}</code>
}

/** Masked Gemini key field. Saved on blur to the local settings table only; never logged, never put in a URL. */
function GeminiKeyField({ stored }: { stored: string }) {
  const toast = useToast()
  const [value, setValue] = useState(stored)
  const [show, setShow] = useState(false)

  const commit = () => {
    const next = value.trim()
    if (next === stored) return
    setSetting(AI_GEMINI_KEY, next)
    applyAISettings()
    toast.show(next ? 'Gemini key saved on this device' : 'Gemini key removed', 'success')
  }

  return (
    <Field label="Gemini API key" htmlFor="set-gemini-key" hint="Kept in this phone's database and sent only to Google. Clear the field to remove it.">
      <TextInput
        id="set-gemini-key"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        placeholder="Paste your key"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        right={<IconButton icon={show ? <EyeOff size={18} /> : <Eye size={18} />} label={show ? 'Hide key' : 'Show key'} size="sm" onClick={() => setShow((v) => !v)} />}
      />
    </Field>
  )
}

function AISection() {
  const toast = useToast()
  const status = useAIStatus()
  const legacy = useQuery(() => readAISettings(), []) // apiKey, model, sendMealPhotos
  const config = useQuery(() => readAIConfig(), []) // mode, geminiKey, geminiModel, bridgeModel, bridgePin
  const [shareReports, setShareReports] = useSetting<boolean>('ai.shareReports', false)

  const [checking, setChecking] = useState(false)
  const [howTo, setHowTo] = useState(false)
  const [keySheet, setKeySheet] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [model, setModel] = useState(legacy.model)
  const [geminiModel, setGeminiModel] = useState(config.geminiModel || DEFAULT_GEMINI_MODEL)
  const [pin, setPin] = useState(config.bridgePin)

  const mode = config.mode
  const cloud = status.host === 'cloud'
  const usesBridge = mode === 'auto' || mode === 'claude-code'
  const usesMac = usesBridge && !cloud
  const usesCloud = usesBridge && cloud
  // Hosted: a Gemini key typed into this device is the main way in, so Auto shows it too. The Worker is optional.
  const showGemini = mode === 'gemini' || (mode === 'auto' && cloud)
  const workerInUse = mode === 'claude-code' || status.cloud === 'ok' || status.cloud === 'pin' || status.cloud === 'error' || !!config.bridgePin
  const showTest = mode === 'anthropic' || (showGemini && (mode === 'gemini' || status.active !== 'mock'))
  const { line, tone } = aiStateLine(status)
  const busy = checking || status.checking

  const changeMode = (next: AIMode) => {
    setSetting('ai.mode', next)
    setSetting(KEYS.aiProvider, next === 'anthropic' ? 'anthropic' : next === 'gemini' ? 'gemini' : 'mock') // legacy key, read by older code paths
    setTestResult(null)
    applyAISettings()
  }

  const checkAgain = () => {
    setChecking(true)
    void refreshAI().finally(() => setChecking(false))
  }

  const commitPin = () => {
    const next = pin.trim()
    if (next === config.bridgePin) return
    setSetting('ai.bridgePin', next)
    applyAISettings()
  }

  const commitModel = () => {
    const m = model.trim()
    if (m && m !== legacy.model) {
      saveAISettings({ model: m })
      toast.show(`Model set to ${m}`, 'success')
    } else if (!m) {
      setModel(legacy.model)
    }
  }

  const commitGeminiModel = () => {
    const m = geminiModel.trim() || DEFAULT_GEMINI_MODEL
    setGeminiModel(m)
    if (m === (config.geminiModel || DEFAULT_GEMINI_MODEL)) return
    setSetting(AI_GEMINI_MODEL, m)
    applyAISettings()
    toast.show(`Model set to ${m}`, 'success')
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await testConnection())
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error && e.message ? e.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const pinField = (
    <div className="px-4 py-3.5">
      <Field
        label={cloud ? 'Bridge PIN' : 'PIN (optional)'}
        htmlFor="set-bridge-pin"
        hint={cloud ? 'The COACH_BRIDGE_PIN you set on your Worker. Kept on this device.' : "Only needed if your Mac's server was started with COACH_BRIDGE_PIN."}
      >
        <TextInput
          id="set-bridge-pin"
          type="password"
          inputMode={cloud ? undefined : 'numeric'}
          value={pin}
          onChange={(e) => setPin(e.currentTarget.value)}
          onBlur={commitPin}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
        />
      </Field>
    </div>
  )

  return (
    <div id="ai" className="scroll-mt-20">
      <Group title="AI" footer="Only what a request needs is sent, and every call is listed in the privacy ledger.">
        <div className="px-4 py-4">
          <div className="flex items-start gap-3" role="status" aria-live="polite">
            <span className={cx('mt-0.5 inline-flex shrink-0', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-muted')} aria-hidden>
              {tone === 'ok' ? <CircleCheck size={22} /> : tone === 'warn' ? <CircleAlert size={22} /> : <Sparkles size={22} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[19px] font-semibold leading-tight text-balance">{line}</span>
              <span className="mt-1.5 block text-[14px] leading-snug text-muted">{status.message}</span>
            </span>
          </div>
          <Button variant="secondary" full icon={<RefreshCw size={16} />} loading={busy} onClick={checkAgain} className="mt-3.5">
            Check again
          </Button>
        </div>

        <GroupBlock hint={aiModeHint(mode, cloud)}>
          <div role="radiogroup" aria-label="AI mode" className="flex flex-wrap gap-2">
            {aiModeOptions(cloud).map((o) => (
              <Chip key={o.value} role="radio" aria-checked={o.value === mode} aria-pressed={undefined} selected={o.value === mode} tone="neutral" check onClick={() => o.value !== mode && changeMode(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </GroupBlock>

        {usesCloud && mode === 'claude-code' && pinField}
        {usesCloud && mode === 'claude-code' && <Row icon={<Cloud size={18} />} title="Set up AI on my Worker" subtitle="Three steps: secrets, redeploy, PIN" chevron onClick={() => setHowTo(true)} />}

        {usesMac && <Row icon={<Laptop size={18} />} title="Set up Claude on my Mac" subtitle="Three steps, about two minutes" chevron onClick={() => setHowTo(true)} />}
        {usesMac && (
          <GroupBlock label="Claude model">
            <Segmented
              options={BRIDGE_MODEL_OPTIONS}
              value={BRIDGE_MODEL_OPTIONS.some((o) => o.value === config.bridgeModel) ? config.bridgeModel : ''}
              onChange={(m) => {
                setSetting('ai.bridgeModel', m)
                applyAISettings()
              }}
              size="sm"
              label="Claude model on my Mac"
            />
          </GroupBlock>
        )}
        {usesMac && pinField}

        {showGemini && (
          <div className="px-4 py-3.5">
            <GeminiKeyField stored={config.geminiKey} />
          </div>
        )}
        {showGemini && (
          <a
            href={GEMINI_KEY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full min-h-[56px] px-4 py-2.5 text-app active:bg-surface-2 transition-colors duration-150 focus-visible:bg-surface-2 focus-visible:-outline-offset-2"
          >
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-surface-2 text-muted shrink-0" aria-hidden>
              <ExternalLink size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium leading-tight">Get a key</span>
              <span className="block text-[13px] text-muted mt-1 leading-snug">Google AI Studio, opens in your browser</span>
            </span>
          </a>
        )}
        {mode === 'gemini' && (
          <div className="px-4 py-3.5">
            <Field label="Model" htmlFor="set-gemini-model" hint={`Default: ${DEFAULT_GEMINI_MODEL}`}>
              <TextInput
                id="set-gemini-model"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.currentTarget.value)}
                onBlur={commitGeminiModel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </Field>
          </div>
        )}
        {showGemini && (
          <GroupText>
            On Gemini's free tier Google may use what you send to improve its products and human reviewers may read it; the paid tier does not, so with health data use a paid-tier key or keep photos and reports off.
          </GroupText>
        )}

        {usesCloud && mode === 'auto' && workerInUse && pinField}
        {usesCloud && mode === 'auto' && <Row icon={<Cloud size={18} />} title="Use my Worker instead" subtitle="Optional: the key stays on the server, this phone holds a PIN" chevron onClick={() => setHowTo(true)} />}

        {mode === 'anthropic' && (
          <Row
            icon={<KeyRound size={18} />}
            title="API key"
            subtitle="Kept on this device"
            right={<span className="font-mono text-[13px]">{maskApiKey(legacy.apiKey)}</span>}
            chevron
            onClick={() => setKeySheet(true)}
          />
        )}
        {mode === 'anthropic' && (
          <div className="px-4 py-3.5">
            <Field label="Model" htmlFor="set-model">
              <TextInput
                id="set-model"
                value={model}
                onChange={(e) => setModel(e.currentTarget.value)}
                onBlur={commitModel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
              />
            </Field>
          </div>
        )}
        {showTest && (
          <ControlRow
            icon={<Bot size={18} />}
            title="Test connection"
            subtitle="Sends a one-word prompt; logged in the ledger"
            control={
              <Button size="md" variant="secondary" loading={testing} onClick={() => void runTest()}>
                Test
              </Button>
            }
          />
        )}
        {showTest && testResult && (
          <div className="px-4 py-3.5" role="status">
            <StatusLine tone={testResult.ok ? 'ok' : 'stop'} icon={testResult.ok ? <CircleCheck size={18} /> : <CircleAlert size={18} />}>
              <span className="font-semibold">{testResult.ok ? 'Connected. ' : 'Not connected. '}</span>
              <span className="text-muted">{testResult.message}</span>
            </StatusLine>
          </div>
        )}

        <ControlRow
          icon={<Sparkles size={18} />}
          title="Send meal photos to AI"
          subtitle="Only the photo you pick"
          control={<Toggle checked={legacy.sendMealPhotos} onChange={(sendMealPhotos) => saveAISettings({ sendMealPhotos })} label="Send meal photos to AI" />}
        />
        <ControlRow
          icon={<FileText size={18} />}
          title="Coach can use report summaries"
          subtitle="Summaries only, never the files"
          control={<Toggle checked={shareReports} onChange={setShareReports} label="Let the coach use report summaries" />}
        />
        <Row icon={<ScrollText size={18} />} title="Privacy ledger" subtitle="Every AI call, listed" chevron to="/settings/privacy" />
      </Group>

      <Sheet open={howTo} onClose={() => setHowTo(false)} title={cloud ? 'AI on my Cloudflare Worker' : 'Claude on my Mac'} footer={<Button full size="lg" onClick={() => { setHowTo(false); checkAgain() }}>Done, check again</Button>}>
        <ol className="m-0 list-none space-y-4 p-0 pt-1">
          {(cloud ? CLOUD_STEPS : MAC_STEPS).map((step, i) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xl" aria-hidden>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold leading-tight">{step.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Sheet>
      <ApiKeySheet open={keySheet} apiKey={legacy.apiKey} onClose={() => setKeySheet(false)} />
    </div>
  )
}

// --- goal sheet -----------------------------------------------------------------

function GoalSheet({ type, goal, units, today, onClose }: { type: Goal['type'] | null; goal: Goal | null; units: Units; today: string; onClose: () => void }) {
  const toast = useToast()
  const isWeight = type === 'weight'
  const [value, setValue] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const [seeded, setSeeded] = useState<string | null>(null)

  // Seed local state whenever the sheet opens for a (possibly different) goal.
  const key = type ? `${type}:${goal?.id ?? 'new'}` : null
  if (key && key !== seeded) {
    setSeeded(key)
    setValue(goal ? (isWeight ? displayWeight(goal.targetValue, units) : displayLength(goal.targetValue, units)) : null)
    setDate(goal?.targetDate ?? addDays(today, 120))
  }

  const save = () => {
    if (!type) return
    const canonical = isWeight ? parseWeight(value, units) : parseLength(value, units)
    if (canonical == null) {
      toast.show('Enter a target value', 'error')
      return
    }
    if (isWeight ? canonical < 30 || canonical > 300 : canonical < 40 || canonical > 200) {
      toast.show(isWeight ? 'Target weight should be between 30 and 300 kg' : 'Target waist should be between 40 and 200 cm', 'error')
      return
    }
    upsertGoal({
      id: goal?.id,
      type,
      targetValue: Math.round(canonical * 10) / 10,
      unit: isWeight ? 'kg' : 'cm',
      priority: isWeight ? 1 : 2,
      startDate: goal?.startDate ?? today,
      targetDate: date || null,
      status: 'active',
    })
    toast.show(`${isWeight ? 'Target weight' : 'Target waist'} saved`, 'success')
    onClose()
  }

  return (
    <Sheet
      open={type !== null}
      onClose={onClose}
      title={isWeight ? 'Target weight' : 'Target waist'}
      footer={
        <Button full size="lg" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <Field label={isWeight ? 'Target weight' : 'Target waist'}>
          <NumberInput
            value={value}
            onChange={setValue}
            unit={isWeight ? weightUnit(units) : lengthUnit(units)}
            step={isWeight ? 0.5 : units === 'imperial' ? 0.5 : 1}
            min={isWeight ? (units === 'imperial' ? 66 : 30) : units === 'imperial' ? 16 : 40}
            max={isWeight ? (units === 'imperial' ? 660 : 300) : units === 'imperial' ? 80 : 200}
            size="lg"
            autoFocus
          />
        </Field>
        <Field label="Target date" hint="Progress shows a projected date from your actual 7-day trend, so this is a goal, not a promise." htmlFor="goal-date">
          <TextInput id="goal-date" type="date" value={date} min={today} onChange={(e) => setDate(e.currentTarget.value)} />
        </Field>
      </div>
    </Sheet>
  )
}

// --- daily targets sheet ----------------------------------------------------------

function TargetSheet({ open, current, today, onClose }: { open: boolean; current: ReturnType<typeof getNutritionTarget>; today: string; onClose: () => void }) {
  const toast = useToast()
  const [kcal, setKcal] = useState<number | null>(null)
  const [protein, setProtein] = useState<number | null>(null)
  const [seeded, setSeeded] = useState(false)

  if (open && !seeded) {
    setSeeded(true)
    setKcal(current?.kcal ?? null)
    setProtein(current?.proteinG ?? null)
  }
  if (!open && seeded) setSeeded(false)

  const fatG = current?.fatG ?? 65
  const carbsG = kcal != null && protein != null ? Math.max(0, round((kcal - protein * 4 - fatG * 9) / 4, 5)) : null

  const save = () => {
    if (kcal == null || protein == null || kcal < 1000 || protein < 40) {
      toast.show('Calories ≥ 1,000 and protein ≥ 40 g', 'error')
      return
    }
    if (current && current.kcal === kcal && current.proteinG === protein) {
      onClose()
      return
    }
    setNutritionTarget({
      startDate: today,
      endDate: null,
      kcal,
      proteinG: protein,
      carbsG: carbsG ?? 0,
      fatG,
      rationale: `Edited manually in Settings on ${fmtDate(today)}${current ? ` (was ${current.kcal} kcal / ${current.proteinG} g)` : ''}.`,
    })
    toast.show('Daily targets updated', 'success')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Daily targets"
      footer={
        <Button full size="lg" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Protein" htmlFor="t-protein">
          <NumberInput id="t-protein" value={protein} onChange={setProtein} unit="g" step={5} min={40} max={400} size="lg" className="font-bold" />
        </Field>
        <Field label="Calories" htmlFor="t-kcal">
          <NumberInput id="t-kcal" value={kcal} onChange={setKcal} unit="kcal" step={50} min={1000} max={6000} />
        </Field>
      </div>
      <p className="text-[13px] text-muted mt-3 leading-snug">
        Fat stays at {fatG} g{carbsG != null ? `, carbs fill the remainder (≈ ${carbsG} g)` : ''}. Manual edits close the current target and start a new one from today.
      </p>
      {current?.rationale && <p className="text-[12px] text-faint mt-2 leading-snug">Current rationale: {current.rationale}</p>}
    </Sheet>
  )
}

// --- API key sheet -------------------------------------------------------------------

function ApiKeySheet({ open, apiKey, onClose }: { open: boolean; apiKey: string; onClose: () => void }) {
  const toast = useToast()
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [seeded, setSeeded] = useState(false)

  if (open && !seeded) {
    setSeeded(true)
    setValue(apiKey)
    setShow(false)
  }
  if (!open && seeded) setSeeded(false)

  const save = () => {
    saveAISettings({ apiKey: value.trim() })
    toast.show(value.trim() ? 'API key saved on this device' : 'API key removed', 'success')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Anthropic API key"
      footer={
        <div className="flex gap-3">
          {apiKey && (
            <Button
              variant="danger"
              onClick={() => {
                saveAISettings({ apiKey: '' })
                toast.show('API key removed', 'success')
                onClose()
              }}
            >
              Remove
            </Button>
          )}
          <Button full size="md" onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="pt-1">
        <Field label="API key" htmlFor="set-api-key">
          <TextInput
            id="set-api-key"
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            placeholder="sk-ant-…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            right={<IconButton icon={show ? <EyeOff size={18} /> : <Eye size={18} />} label={show ? 'Hide key' : 'Show key'} size="sm" onClick={() => setShow((v) => !v)} />}
          />
        </Field>
        <p className="text-[13px] text-muted mt-3 leading-snug">
          Stored in the local database only and sent directly from this device to Anthropic. It is redacted from JSON exports but present in the raw SQLite export.
        </p>
      </div>
    </Sheet>
  )
}
