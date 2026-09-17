import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  CircleAlert,
  CircleCheck,
  CloudOff,
  Dumbbell,
  FileArchive,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Import,
  Info,
  Lock,
  Moon,
  Scale,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { Button, Card, IconButton, PermissionDenied, Screen, Segmented, Sheet, Skeleton, StatTile, StatusPill } from '../components'
import type { Tone } from '../components'
import { useQuery, useToast } from '../hooks'
import { dateOf, fmtDate, fmtTime, nowIso, todayStr } from '../lib/util'
import { HEALTH_DATA_TYPES, HEALTH_TYPE_INFO, HEALTH_UNAVAILABLE_REASON, getHealthBridge, type HealthDataType, type HealthPermission } from '../native'
import { importAppleHealthExport, type HealthImportSummary } from '../native/healthExport'
import { fmtBytes } from '../features/settings/files'
import { HEALTH_IMPORT_DAYS, importHealthData, summariseImport, type HealthImportResult } from '../features/settings/healthImport'
import { KEYS, readHealthPermissions, writeHealthPermissions } from '../features/settings/keys'
import { ControlRow, Group, GroupText, Row, StatusLine, Toggle } from '../features/settings/SettingsUI'
import { useSetting } from '../features/settings/useSetting'

const ICON: Record<HealthDataType, ReactNode> = {
  sleep: <Moon size={18} />,
  workouts: <Dumbbell size={18} />,
  activeEnergy: <Flame size={18} />,
  steps: <Footprints size={18} />,
  heartRate: <Heart size={18} />,
  restingHeartRate: <HeartPulse size={18} />,
  bodyMass: <Scale size={18} />,
}

const PERM_TONE: Record<HealthPermission, Tone> = { granted: 'green', denied: 'red', undetermined: 'neutral' }
const PERM_LABEL: Record<HealthPermission, string> = { granted: 'On', denied: 'Denied', undetermined: 'Not asked' }

/** Types the live importer actually reads today. */
const IMPORTED_TYPES: HealthDataType[] = ['sleep', 'bodyMass', 'restingHeartRate']

const EXPORT_DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
]

const EXPORT_STEPS: ReactNode[] = [
  <>
    Open the <b className="font-semibold text-app">Health</b> app on your iPhone.
  </>,
  <>
    Tap your <b className="font-semibold text-app">profile picture</b>, top right.
  </>,
  <>
    Tap <b className="font-semibold text-app">Export All Health Data</b> and wait for it to finish.
  </>,
  <>
    Save or share <b className="font-semibold text-app">export.zip</b>, then choose it below.
  </>,
]

/** Five-point summary of docs/APPLE_HEALTH.md. */
const HOW_IT_WORKS: { title: string; body: string }[] = [
  { title: 'A native shell via Capacitor', body: 'This same app gets wrapped in a native iOS shell. Screens, data and logic stay exactly as they are.' },
  { title: 'HealthKit permissions', body: 'A small Swift plugin asks HealthKit for each data type separately. You choose what it may read; writing back is a separate switch, off by default.' },
  { title: 'Apple Watch arrives through the Health app', body: 'Your Watch syncs sleep, heart rate, HRV and workouts to Health on your iPhone. The shell reads them from there, so no Watch app is needed.' },
  { title: 'Needs Xcode and an Apple Developer account', body: 'HealthKit is an entitlement Apple only grants to signed apps, so building the shell takes a Mac with Xcode and a developer account.' },
  { title: 'Data stays on device', body: 'Records are copied into the local database on this phone. No server, no account, nothing uploaded.' },
]

interface Availability {
  loading: boolean
  available: boolean
  reason?: string
}

type ExportProgress = { bytesRead: number; totalBytes: number; phase: string }

const PHASE_LABEL: Record<string, string> = { unzipping: 'Unzipping the export', parsing: 'Reading records', saving: 'Saving to this phone' }

function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? (phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : 'Working')
}

function when(ts: string): string {
  return `${dateOf(ts) === todayStr() ? 'Today' : fmtDate(dateOf(ts))} ${fmtTime(ts)}`
}

export default function HealthSettingsScreen() {
  const toast = useToast()
  const [avail, setAvail] = useState<Availability>({ loading: true, available: false })
  const perms = useQuery(() => readHealthPermissions(), [])
  const [writeWorkouts, setWriteWorkouts] = useSetting<boolean>(KEYS.healthWriteWorkouts, false)
  const [writeBodyMass, setWriteBodyMass] = useSetting<boolean>(KEYS.healthWriteBodyMass, false)
  const [lastImport] = useSetting<string | null>(KEYS.healthLastImport, null)
  const [lastFileImport, setLastFileImport] = useSetting<string | null>(KEYS.healthLastFileImport, null)
  const [busy, setBusy] = useState<HealthDataType | 'all' | 'import' | null>(null)
  const [importResult, setImportResult] = useState<HealthImportResult | null>(null)
  const [howOpen, setHowOpen] = useState(false)

  // Export-file import (works in every build).
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [days, setDays] = useState(90)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [summary, setSummary] = useState<HealthImportSummary | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getHealthBridge()
      .isAvailable()
      .then((r) => alive && setAvail({ loading: false, available: r.available, reason: r.reason }))
      .catch((e: unknown) => alive && setAvail({ loading: false, available: false, reason: e instanceof Error && e.message ? e.message : HEALTH_UNAVAILABLE_REASON }))
    return () => {
      alive = false
    }
  }, [])

  const denied = HEALTH_DATA_TYPES.filter((t) => perms[t] === 'denied')
  const granted = HEALTH_DATA_TYPES.filter((t) => perms[t] === 'granted')
  const canImport = avail.available && IMPORTED_TYPES.some((t) => perms[t] === 'granted')

  const request = async (types: HealthDataType[], key: HealthDataType | 'all') => {
    setBusy(key)
    try {
      const r = await getHealthBridge().requestPermissions(types)
      const patch: Partial<Record<HealthDataType, HealthPermission>> = {}
      for (const t of types) patch[t] = r[t]
      writeHealthPermissions(patch)
      const on = types.filter((t) => r[t] === 'granted').length
      if (types.length === 1) {
        const t = types[0]
        toast.show(r[t] === 'granted' ? `${HEALTH_TYPE_INFO[t].label} connected` : r[t] === 'denied' ? `${HEALTH_TYPE_INFO[t].label} was denied` : `${HEALTH_TYPE_INFO[t].label}: no answer yet`, r[t] === 'granted' ? 'success' : 'info')
      } else {
        toast.show(on ? `${on} of ${types.length} data types connected` : 'Nothing was granted', on ? 'success' : 'info')
      }
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Could not request permissions', 'error')
    } finally {
      setBusy(null)
    }
  }

  const toggleType = (t: HealthDataType, on: boolean) => {
    if (on) {
      void request([t], t)
      return
    }
    // HealthKit has no programmatic revoke: pause reads locally and point to the Health app.
    writeHealthPermissions({ [t]: 'undetermined' })
    toast.show(`Paused ${HEALTH_TYPE_INFO[t].label}. To revoke fully: Health app → Profile → Apps → Coach.`, 'info')
  }

  const runImport = async () => {
    setBusy('import')
    setImportResult(null)
    try {
      const r = await importHealthData(HEALTH_IMPORT_DAYS)
      setImportResult(r)
      toast.show(r.error ? 'Import finished with errors' : summariseImport(r), r.error ? 'error' : 'success')
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Import failed'
      setImportResult({ sleep: 0, weight: 0, restingHr: 0, skipped: 0, error: message })
      toast.show(message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const pickFile = (f: File | null) => {
    setFile(f)
    setSummary(null)
    setFileError(null)
    setProgress(null)
  }

  const runFileImport = async () => {
    if (!file || reading) return
    setReading(true)
    setSummary(null)
    setFileError(null)
    setProgress({ bytesRead: 0, totalBytes: file.size, phase: /\.zip$/i.test(file.name) ? 'unzipping' : 'parsing' })
    try {
      const r = await importAppleHealthExport(file, { days, onProgress: (p) => setProgress(p) })
      setSummary(r)
      const n = r.sleepNights + r.weights + r.restingHr + r.hrv + r.steps + r.activeEnergy + r.workouts
      if (n) setLastFileImport(nowIso())
      toast.show(n ? `Imported ${n.toLocaleString('en-SG')} records from Apple Health` : 'Nothing new to import', n ? 'success' : 'info')
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'The file could not be read.'
      setFileError(message)
      toast.show('Import did not finish', 'error')
    } finally {
      setReading(false)
      setProgress(null)
    }
  }

  const pct = progress && progress.totalBytes > 0 ? Math.min(100, Math.round((progress.bytesRead / progress.totalBytes) * 100)) : null
  const importedTotal = summary ? summary.sleepNights + summary.weights + summary.restingHr + summary.hrv + summary.steps + summary.activeEnergy + summary.workouts : 0

  return (
    <Screen title="Apple Health" pillar="rest" back="/settings" backLabel="Settings">
      <p className="voice text-xl text-muted anim-rise">Two ways to bring in your iPhone and Apple Watch data. One of them works today.</p>

      {/* ---- 1. export file ------------------------------------------------ */}
      <Card pillar="rest" eyebrow="Option 1 · works today" className="mt-5 anim-rise">
        <h2 className="display text-2xl">Import an Apple Health export</h2>
        <p className="text-[14px] text-muted leading-snug mt-1.5">Sleep, weight, resting heart rate, HRV, steps, active energy and workouts, including everything your Apple Watch recorded.</p>

        <ol className="mt-4 flex flex-col gap-2.5">
          {EXPORT_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-[15px] text-muted leading-snug">
              <span className="num text-[15px] inline-flex items-center justify-center h-6 w-6 rounded-full bg-pillar-soft text-pillar shrink-0" aria-hidden>
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5">
          <div className="eyebrow text-muted mb-2">How far back</div>
          <Segmented options={EXPORT_DAY_OPTIONS} value={days} onChange={setDays} label="How far back to import" />
        </div>

        <input
          ref={fileInput}
          id="hs-file"
          type="file"
          accept=".zip,.xml,application/zip,application/x-zip-compressed,text/xml,application/xml"
          className="sr-only"
          tabIndex={-1}
          aria-label="Apple Health export file"
          onChange={(e) => {
            pickFile(e.currentTarget.files?.[0] ?? null)
            e.currentTarget.value = '' // choosing the same file again should still fire
          }}
        />

        <div className="mt-4">
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 pl-3.5 pr-1.5 min-h-[56px]">
              <FileArchive size={20} className="text-pillar shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium truncate">{file.name}</div>
                <div className="text-[13px] text-muted tnum">{fmtBytes(file.size)}</div>
              </div>
              <IconButton icon={<X size={18} />} label="Remove file" onClick={() => pickFile(null)} disabled={reading} />
            </div>
          ) : (
            <Button full size="lg" variant="outline" icon={<Upload size={20} />} onClick={() => fileInput.current?.click()}>
              Choose export.zip or export.xml
            </Button>
          )}
        </div>

        {file && !reading && !summary && !fileError && (
          <Button full size="lg" variant="pillar" className="mt-3" icon={<Import size={20} />} onClick={() => void runFileImport()}>
            Import the last {EXPORT_DAY_OPTIONS.find((o) => o.value === days)?.label ?? `${days} days`}
          </Button>
        )}

        {reading && (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="font-medium">{phaseLabel(progress?.phase ?? '')}…</span>
              <span className="text-muted tnum">{progress && pct != null ? `${fmtBytes(progress.bytesRead)} of ${fmtBytes(progress.totalBytes)} · ${pct}%` : ''}</span>
            </div>
            <div
              className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden"
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
            >
              <div className={pct == null ? 'h-full w-1/3 rounded-full bg-pillar anim-pulse-soft' : 'h-full rounded-full bg-pillar transition-[width] duration-300 ease-out'} style={pct == null ? undefined : { width: `${pct}%` }} />
            </div>
            <p className="text-[13px] text-muted mt-2 leading-snug">Large exports can take a minute. Keep this screen open.</p>
          </div>
        )}

        {fileError && (
          <div className="mt-4 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3" role="alert">
            <StatusLine tone="stop" icon={<CircleAlert size={18} />}>
              <span className="font-semibold">Import did not finish. </span>
              <span className="text-muted">{fileError}</span>
            </StatusLine>
            <p className="text-[13px] text-muted mt-2 leading-snug">Nothing was changed by a failed read. Check it is the export.zip (or the export.xml inside it) from the Health app, then try again.</p>
            <div className="flex gap-2 mt-3">
              <Button size="md" variant="secondary" onClick={() => void runFileImport()} disabled={!file}>
                Try again
              </Button>
              <Button size="md" variant="ghost" onClick={() => fileInput.current?.click()}>
                Choose another file
              </Button>
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-5 anim-rise">
            <StatusLine tone="ok" icon={<CircleCheck size={18} />}>
              <span className="font-semibold">{importedTotal ? 'Imported.' : 'Nothing new to import.'}</span>{' '}
              <span className="text-muted">
                {summary.from && summary.to ? `${fmtDate(summary.from)} to ${fmtDate(summary.to)}` : 'No records in the chosen window'}
                {summary.skipped ? ` · ${summary.skipped.toLocaleString('en-SG')} already on this phone` : ''}
              </span>
            </StatusLine>
            {importedTotal > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <StatTile label="Sleep" value={summary.sleepNights} unit="nights" icon={Moon} pillar="rest" />
                <StatTile label="Weight" value={summary.weights} unit="weigh-ins" icon={Scale} />
                <StatTile label="Resting HR" value={summary.restingHr} unit="days" icon={HeartPulse} />
                <StatTile label="HRV" value={summary.hrv} unit="days" icon={Activity} />
                <StatTile label="Steps" value={summary.steps} unit="days" icon={Footprints} />
                <StatTile label="Active energy" value={summary.activeEnergy} unit="days" icon={Flame} />
                <StatTile label="Workouts" value={summary.workouts} unit="sessions" icon={Dumbbell} pillar="train" />
              </div>
            )}
            {summary.warnings.length > 0 && (
              <div className="mt-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
                <StatusLine tone="warn" icon={<CircleAlert size={18} />}>
                  <span className="font-semibold">
                    {summary.warnings.length} note{summary.warnings.length === 1 ? '' : 's'} from the import
                  </span>
                </StatusLine>
                <ul className="mt-2 flex flex-col gap-1 text-[13px] text-muted leading-snug list-disc pl-5">
                  {summary.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button full size="md" variant="secondary" className="mt-3" onClick={() => fileInput.current?.click()}>
              Import another file
            </Button>
          </div>
        )}

        <StatusLine tone="muted" icon={<Lock size={16} />} className="mt-4">
          <span className="text-muted text-[13px]">
            The file is opened and parsed on this phone. Nothing is uploaded, and importing twice never duplicates records.
            {lastFileImport ? ` Last import: ${when(lastFileImport)}.` : ''}
          </span>
        </StatusLine>
      </Card>

      {/* ---- 2. live HealthKit ---------------------------------------------- */}
      <Card pillar="rest" eyebrow="Option 2 · iOS app" className="mt-3 anim-rise">
        <h2 className="display text-2xl">Live HealthKit sync</h2>
        <p className="text-[14px] text-muted leading-snug mt-1.5">Automatic, no files. Sleep and weight appear on their own each morning.</p>

        <div className="mt-4">
          {avail.loading ? (
            <div role="status" aria-label="Checking HealthKit availability">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full mt-2" />
            </div>
          ) : avail.available ? (
            <>
              <StatusLine tone={granted.length ? 'ok' : 'muted'} icon={granted.length ? <CircleCheck size={18} /> : <Info size={18} />}>
                <span className="font-semibold">{granted.length ? `${granted.length} of ${HEALTH_DATA_TYPES.length} data types connected.` : 'Available, not connected yet.'}</span>{' '}
                <span className="text-muted">Each permission is separate and explains why it is used.</span>
              </StatusLine>
              <Button full size="lg" variant="pillar" className="mt-3" icon={<ShieldCheck size={20} />} loading={busy === 'all'} disabled={busy !== null} onClick={() => void request(HEALTH_DATA_TYPES, 'all')}>
                {granted.length ? 'Ask for the rest' : 'Connect all read types'}
              </Button>
            </>
          ) : (
            <StatusLine tone="warn" icon={<CloudOff size={18} />}>
              <span className="font-semibold">Requires the iOS app shell.</span>{' '}
              <span className="text-muted">
                {avail.reason && avail.reason !== HEALTH_UNAVAILABLE_REASON ? `${avail.reason}. ` : ''}
                HealthKit only talks to native apps. The switches below turn live once this app runs inside the shell; until then, use the export above or manual entry.
              </span>
            </StatusLine>
          )}
        </div>
      </Card>

      <Group className="pt-3!">
        <Row icon={<Info size={18} />} title="How this works" subtitle="The iOS shell, permissions and your Apple Watch" chevron onClick={() => setHowOpen(true)} />
      </Group>

      {denied.length > 0 && (
        <PermissionDenied
          className="mt-4"
          what={denied.length === 1 ? HEALTH_TYPE_INFO[denied[0]].label : `${denied.length} Health data types`}
          why={`${denied.map((t) => HEALTH_TYPE_INFO[t].label).join(', ')}: denied in iOS. To re-enable: Health app → your profile picture → Apps & Services → Coach → turn the data type on, then come back and toggle it here.`}
        />
      )}

      <Group title="Read from Health" footer="Reads only. Sleep, resting HR and body mass feed readiness and the weight trend; the rest is context for conditioning days.">
        {HEALTH_DATA_TYPES.map((t) => (
          <ControlRow
            key={t}
            icon={ICON[t]}
            title={HEALTH_TYPE_INFO[t].label}
            subtitle={HEALTH_TYPE_INFO[t].why}
            control={
              <div className="flex flex-col items-end gap-0.5">
                <StatusPill tone={avail.available ? PERM_TONE[perms[t]] : 'neutral'} dot size="sm">
                  {avail.available ? PERM_LABEL[perms[t]] : 'iOS app only'}
                </StatusPill>
                <Toggle checked={perms[t] === 'granted'} onChange={(on) => toggleType(t, on)} disabled={!avail.available || busy !== null} label={`${HEALTH_TYPE_INFO[t].label} read access`} />
              </div>
            }
          />
        ))}
      </Group>

      <Group title="Write to Health" footer="Off by default. Detailed strength data (exercise, set, reps, load, RIR) always stays in the local database; only a summary is written.">
        <ControlRow
          icon={<Dumbbell size={18} />}
          title="Write completed workouts"
          subtitle="Name, type, duration, average HR"
          control={<Toggle checked={writeWorkouts} onChange={setWriteWorkouts} disabled={!avail.available} label="Write workouts to Health" />}
        />
        <ControlRow
          icon={<Scale size={18} />}
          title="Write body mass"
          subtitle="Manual and voice weigh-ins"
          control={<Toggle checked={writeBodyMass} onChange={setWriteBodyMass} disabled={!avail.available} label="Write body mass to Health" />}
        />
      </Group>

      <Group title="Live import" footer={`Pulls the last ${HEALTH_IMPORT_DAYS} days of sleep, body mass and resting HR from HealthKit. Rows with a timestamp already stored are skipped, so importing twice is safe.`}>
        <ControlRow
          icon={<Import size={18} />}
          title="Import now"
          subtitle={avail.available ? `Last import: ${lastImport ? when(lastImport) : 'never'}` : 'Requires the iOS app shell'}
          control={
            <Button size="md" variant="secondary" loading={busy === 'import'} disabled={!canImport || busy !== null} onClick={() => void runImport()}>
              Import
            </Button>
          }
        />
        {!canImport && avail.available && <GroupText>Grant sleep, body mass or resting heart rate above to enable importing.</GroupText>}
        {importResult && (
          <div className="px-4 py-3.5" role="status">
            <StatusLine tone={importResult.error ? 'stop' : 'ok'} icon={importResult.error ? <CircleAlert size={18} /> : <CircleCheck size={18} />}>
              {summariseImport(importResult)}
              {importResult.error ? <span className="text-muted"> Problems: {importResult.error}.</span> : null}
            </StatusLine>
          </div>
        )}
      </Group>

      <Sheet
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title="How live sync works"
        footer={
          <Button full size="lg" variant="secondary" onClick={() => setHowOpen(false)}>
            Got it
          </Button>
        }
      >
        <div data-pillar="rest">
          <p className="voice text-lg text-muted">HealthKit only talks to native apps, so the web build needs a thin iOS wrapper around it.</p>
          <ol className="mt-4 flex flex-col gap-4">
            {HOW_IT_WORKS.map((b, i) => (
              <li key={b.title} className="flex items-start gap-3">
                <span className="num text-[15px] inline-flex items-center justify-center h-6 w-6 rounded-full bg-pillar-soft text-pillar shrink-0" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-tight">{b.title}</div>
                  <p className="text-[14px] text-muted leading-snug mt-1">{b.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-faint mt-5 leading-snug">The full build guide lives in docs/APPLE_HEALTH.md in the project.</p>
        </div>
      </Sheet>
    </Screen>
  )
}
