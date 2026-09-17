// Progress screen (DESIGN §10, v3): visual first. Hero weight number + chart straight away (one short sentence),
// a 2 × 2 tile grid (waist, best lift, sessions, sleep) where every tile opens its chart in a sheet, photos as a
// horizontal strip, adherence bars behind "See adherence", and a link to Reports. Explanations live in sheets.
// Nothing here judges, streaks or diagnoses.
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, CalendarCheck, Camera, Dumbbell, FileText, GitCompare, Image, Info, Lock, Moon, Plus, Ruler, Trash2, X } from 'lucide-react'
import type { BodyMetric, ProgressPhoto } from '../domain/types'
import {
  BarChart, Button, Card, Chip, Divider, HeroNumber, IconButton, LineChart, ListRow, NumberInput, PILLARS, RangeTabs, Screen, Segmented,
  Sheet, StatTile,
} from '../components'
import { useQuery, useToast } from '../hooks'
import {
  addBodyMetric, addPhoto, dailyTotalsRange, deletePhoto, getBodyMetrics, getExercises, getGoals, getMoodLogs, getPhotos,
  getSessions, getSetsForSession, getSleepRecords,
} from '../db/repositories'
import { pickImage } from '../native'
import { addDays, cx, dateOf, dayName, daysBetween, fmtDate, fmtTime, nowIso, startOfWeek, todayStr } from '../lib/util'
import {
  adherenceLine, adherencePct, buildWeightChart, computeAdherence, computeStrengthTrends, computeWaistStats, computeWeightStats,
  nightlySleep, signed, sleepHeadline, strengthHeadline, waistLine, weightCalibration, weightHeadline, weightHeadlineShort,
  type Calibration, type DayValue, type StrengthTrend, type WaistStats, type WeekAdherence, type WeightChart, type WeightStats,
} from '../features/progress'

type MetricKind = 'weight' | 'waist'
type Angle = ProgressPhoto['angle']
type WeightRange = 14 | 30 | 90
type PillarKey = keyof typeof PILLARS

const RANGES: { value: WeightRange; label: string }[] = [
  { value: 14, label: '14 d' },
  { value: 30, label: '30 d' },
  { value: 90, label: '90 d' },
]
/** Longest range plus the six days the first rolling average needs. */
const WEIGHT_HISTORY_DAYS = 96
const SLEEP_BARS = 7

const ANGLES: { value: Angle; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
]

const METRIC_UI: Record<MetricKind, { title: string; unit: string; step: number; min: number; max: number; placeholder: number }> = {
  weight: { title: 'Log weight', unit: 'kg', step: 0.1, min: 30, max: 250, placeholder: 80 },
  waist: { title: 'Log waist', unit: 'cm', step: 0.5, min: 50, max: 200, placeholder: 85 },
}

function goalValue(goals: ReturnType<typeof getGoals>, type: 'weight' | 'waist'): number | null {
  const g = goals.find((x) => x.type === type && x.status === 'active') ?? goals.find((x) => x.type === type)
  if (!g) return null
  if (type === 'waist' && /^in/i.test(g.unit)) return Math.round(g.targetValue * 2.54 * 2) / 2
  return g.targetValue
}

/** Staggered entrance (DESIGN §4 motion). */
function rise(i: number): { className: string; style: CSSProperties } {
  return { className: 'anim-rise', style: { '--i': i } as CSSProperties }
}

// --- sheets --------------------------------------------------------------------------

function LogMetricSheet({ kind, open, initial, onClose, onSaved }: {
  kind: MetricKind
  open: boolean
  initial: number | null
  onClose: () => void
  onSaved: (value: number) => void
}) {
  const ui = METRIC_UI[kind]
  const [value, setValue] = useState<number | null>(initial)
  const [key, setKey] = useState(0)
  // Reset the field each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setValue(initial); setKey((k) => k + 1) }
  }
  const valid = value != null && value >= ui.min && value <= ui.max
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ui.title}
      footer={<Button variant="primary" size="lg" full disabled={!valid} onClick={() => valid && onSaved(value as number)}>Save</Button>}
    >
      <div className="py-2">
        <NumberInput
          key={key}
          value={value}
          onChange={setValue}
          unit={ui.unit}
          step={ui.step}
          min={ui.min}
          max={ui.max}
          size="lg"
          placeholder={String(ui.placeholder)}
          autoFocus
          aria-label={ui.title}
        />
        <p className="mt-4 text-sm text-muted text-center text-pretty">
          {kind === 'weight' ? 'Same time each morning, after the bathroom, before coffee.' : 'At the navel, relaxed, after breathing out.'}
        </p>
        <p className="mt-1 text-xs text-faint text-center tnum">Logged as {fmtDate(todayStr())} · {fmtTime(nowIso())}</p>
      </div>
    </Sheet>
  )
}

function AddPhotoSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [angle, setAngle] = useState<Angle>('front')
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null)

  // pickImage must be invoked synchronously inside the tap handler (browsers block pickers opened later).
  const capture = (source: 'camera' | 'library') => {
    const picked = pickImage(source)
    setBusy(source)
    picked
      .then((img) => {
        if (!img) return
        addPhoto({ ts: nowIso(), angle, uri: img.dataUrl })
        toast.show('Photo saved on this device', 'success')
        onSaved()
      })
      .catch((e: unknown) => toast.show(e instanceof Error ? e.message : 'Could not read that photo', 'error'))
      .finally(() => setBusy(null))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add progress photo">
      <div className="space-y-4 py-1">
        <Segmented options={ANGLES} value={angle} onChange={setAngle} label="Angle" />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="lg" icon={<Camera size={20} />} loading={busy === 'camera'} disabled={busy !== null} onClick={() => capture('camera')}>Take photo</Button>
          <Button variant="secondary" size="lg" icon={<Image size={20} />} loading={busy === 'library'} disabled={busy !== null} onClick={() => capture('library')}>From library</Button>
        </div>
        <p className="text-sm text-muted leading-snug text-pretty">Same spot, same light, same time of day.</p>
        <LocalOnly>Downscaled and stored in this app's local database. Never uploaded.</LocalOnly>
      </div>
    </Sheet>
  )
}

function LocalOnly({ children = 'Stored on this device only' }: { children?: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted leading-snug">
      <Lock size={13} className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function PhotoCaption({ p }: { p: ProgressPhoto }) {
  return (
    <div className="mt-1.5 text-sm text-muted tnum">
      {fmtDate(dateOf(p.ts))} · {fmtTime(p.ts)} · <span className="capitalize">{p.angle}</span>
    </div>
  )
}

function PhotoViewerSheet({ photo, onClose, onCompare, onDeleted }: {
  photo: ProgressPhoto | null
  onClose: () => void
  onCompare: (p: ProgressPhoto) => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const last = useRef<ProgressPhoto | null>(null)
  if (photo) last.current = photo
  const shown = photo ?? last.current
  const close = () => { setConfirm(false); onClose() }
  return (
    <Sheet
      open={photo !== null}
      onClose={close}
      title={shown ? `${fmtDate(dateOf(shown.ts))} · ${shown.angle}` : undefined}
      footer={!photo ? undefined : (
        confirm ? (
          <div>
            <p className="mb-2 text-sm text-muted text-center">Delete this photo? This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="secondary" full onClick={() => setConfirm(false)}>Keep</Button>
              <Button
                variant="danger"
                full
                icon={<Trash2 size={18} />}
                onClick={() => { deletePhoto(photo.id); setConfirm(false); toast.show('Photo deleted', 'info'); onDeleted() }}
              >
                Delete photo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" full icon={<GitCompare size={18} />} onClick={() => { setConfirm(false); onCompare(photo) }}>Compare</Button>
            <Button variant="outline" full icon={<Trash2 size={18} />} onClick={() => setConfirm(true)}>Delete</Button>
          </div>
        )
      )}
    >
      {shown && (
        <div className="py-1">
          <img src={shown.uri} alt={`${shown.angle} progress photo, ${fmtDate(dateOf(shown.ts))}`} className="w-full max-h-[60dvh] object-contain rounded-[1.25rem] bg-surface-2" />
          <PhotoCaption p={shown} />
          <div className="mt-2"><LocalOnly /></div>
        </div>
      )}
    </Sheet>
  )
}

function CompareSheet({ pair, onClose }: { pair: [ProgressPhoto, ProgressPhoto] | null; onClose: () => void }) {
  const last = useRef<[ProgressPhoto, ProgressPhoto] | null>(null)
  if (pair) last.current = pair
  const shownPair = pair ?? last.current
  const ordered = shownPair ? [...shownPair].sort((a, b) => a.ts.localeCompare(b.ts)) : null
  const days = ordered ? daysBetween(dateOf(ordered[0].ts), dateOf(ordered[1].ts)) : 0
  return (
    <Sheet open={pair !== null} onClose={onClose} title="Compare" footer={<Button variant="primary" full onClick={onClose}>Done</Button>}>
      {ordered && (
        <div className="py-1">
          <p className="mb-3 text-[17px] font-semibold leading-snug">
            {days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'} apart`}{ordered[0].angle !== ordered[1].angle ? ' · different angles' : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ordered.map((p, i) => (
              <div key={p.id}>
                <div className="eyebrow text-muted mb-1.5">{i === 0 ? 'Before' : 'After'}</div>
                <img src={p.uri} alt={`${i === 0 ? 'Before' : 'After'}: ${p.angle}, ${fmtDate(dateOf(p.ts))}`} className="w-full aspect-[3/4] object-cover rounded-[1.25rem] bg-surface-2" />
                <PhotoCaption p={p} />
              </div>
            ))}
          </div>
          <div className="mt-3"><LocalOnly /></div>
        </div>
      )}
    </Sheet>
  )
}

// --- weight hero ------------------------------------------------------------------------

function WeightHero({ stats, chart, calibration, headline, ariaHeadline, range, onRange, onLog, onInfo }: {
  stats: WeightStats
  chart: WeightChart
  calibration: Calibration
  headline: string
  ariaHeadline: string
  range: WeightRange
  onRange: (r: WeightRange) => void
  onLog: () => void
  onInfo: () => void
}) {
  const has = stats.latest != null
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <HeroNumber label="Weight" value={has ? (stats.latest as number).toFixed(1) : '—'} unit="kg" size="xl" />
        <div className="flex shrink-0 items-center gap-1">
          <IconButton icon={<Info size={18} />} label="About this chart" onClick={onInfo} />
          <IconButton icon={<Plus size={20} />} label="Log weight" variant="primary" onClick={onLog} />
        </div>
      </div>

      <p className="m-0 mt-2 text-[15px] font-semibold leading-snug text-pretty">{headline}</p>

      {has && !calibration.done && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Calibration: day ${calibration.day} of ${calibration.of}`}>
          <div className="h-full rounded-full bg-pillar" style={{ width: `${(calibration.day / calibration.of) * 100}%` }} />
        </div>
      )}

      <div className="mt-3">
        <LineChart
          points={chart.dates.map((d, i) => ({ x: fmtDate(d), y: chart.raw[i] }))}
          average={chart.average}
          target={stats.goal ?? undefined}
          height={190}
          yFormat={(n) => n.toFixed(1)}
          ariaLabel={`Weight over the last ${range} days. ${ariaHeadline}`}
        />
      </div>
      <div className="mt-2 flex justify-center">
        <RangeTabs options={RANGES} value={range} onChange={onRange} />
      </div>
    </Card>
  )
}

function ChartInfoSheet({ open, onClose, stats, longHeadline }: { open: boolean; onClose: () => void; stats: WeightStats; longHeadline: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Reading this chart">
      <div className="space-y-4 pb-2 pt-1">
        <p className="m-0 text-[15px] leading-snug text-pretty">{longHeadline}</p>
        <ul className="m-0 list-none space-y-2 p-0 text-sm text-muted">
          <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-pillar opacity-40" aria-hidden />Faint dots are daily weigh-ins.</li>
          <li className="flex items-center gap-2"><span className="h-[3px] w-4 rounded-full bg-pillar" aria-hidden />The bold line is the 7-day average. Decisions use this line.</li>
          {stats.goal != null && <li className="flex items-center gap-2"><span className="w-4 border-t border-dashed border-muted" aria-hidden />The dashed line is your {stats.goal} kg goal.</li>}
        </ul>
        <dl className="m-0 grid grid-cols-3 gap-2">
          <MiniStat label="7-day avg" value={stats.avg7 != null ? stats.avg7.toFixed(1) : '—'} unit="kg" />
          <MiniStat label="Weekly rate" value={stats.rateKg != null ? signed(stats.rateKg, 2) : '—'} unit="kg" />
          <MiniStat label="To goal" value={stats.toGoal == null ? '—' : stats.toGoal > 0 ? stats.toGoal.toFixed(1) : 'Reached'} unit={stats.toGoal != null && stats.toGoal > 0 ? 'kg' : undefined} />
        </dl>
        <p className="m-0 text-sm text-muted">Weigh at the same time each morning. One weigh-in never changes the plan.</p>
      </div>
    </Sheet>
  )
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <dt className="eyebrow text-[0.625rem] text-muted">{label}</dt>
      <dd className="m-0 mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <span className="num text-2xl">{value}</span>
        {unit && <span className="text-xs font-medium text-muted">{unit}</span>}
      </dd>
    </div>
  )
}

// --- tile detail sheets ---------------------------------------------------------------------

type Detail = 'waist' | 'strength' | 'sessions' | 'sleep' | 'adherence'

function shortWeek(w: WeekAdherence): string {
  return w.label === 'This week' ? 'This wk' : w.label === 'Last week' ? 'Last wk' : fmtDate(w.weekStart)
}

function WaistDetail({ stats, waists, onLog }: { stats: WaistStats; waists: BodyMetric[]; onLog: () => void }) {
  const points = useMemo(
    () => [...waists].sort((a, b) => a.ts.localeCompare(b.ts)).map((w) => ({ x: fmtDate(dateOf(w.ts)), y: w.value })),
    [waists],
  )
  const sentence = waistLine(stats) ?? 'No waist measurements yet.'
  return (
    <div className="pb-2 pt-1">
      <p className="m-0 text-[17px] font-semibold leading-snug text-pretty">{sentence}</p>
      <div className="mt-3">
        <LineChart points={points} target={stats.goal ?? undefined} height={170} showDots yFormat={(n) => n.toFixed(1)} ariaLabel={`Waist measurements. ${sentence}`} />
      </div>
      <p className="m-0 mt-2 text-sm text-muted">Measure at the navel, relaxed, once a week.</p>
      <Button variant="primary" full icon={<Plus size={18} />} onClick={onLog} className="mt-4">Log waist</Button>
    </div>
  )
}

function StrengthDetail({ trends, initialId }: { trends: StrengthTrend[]; initialId: string | null }) {
  const navigate = useNavigate()
  const [pickedId, setPickedId] = useState<string | null>(initialId)
  if (trends.length === 0) return <p className="m-0 py-2 text-[15px] text-muted">Log loaded sets in a session and your top lifts appear here.</p>
  const picked = trends.find((t) => t.exerciseId === pickedId) ?? trends[0]
  const headline = strengthHeadline(picked)
  return (
    <div data-pillar="train" className="pb-2 pt-1">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Lift to chart">
        {trends.map((t) => (
          <Chip key={t.exerciseId} selected={t.exerciseId === picked.exerciseId} onClick={() => setPickedId(t.exerciseId)} className="h-11 shrink-0">{t.name}</Chip>
        ))}
      </div>
      <p className="m-0 mt-4 text-[17px] font-semibold leading-snug text-pretty">{headline}</p>
      <div className="mt-2">
        <LineChart
          points={picked.points.map((p) => ({ x: fmtDate(p.date), y: p.e1rm }))}
          height={170}
          pillar="train"
          showDots
          yFormat={(n) => n.toFixed(1)}
          ariaLabel={`${picked.name} estimated one-rep max by session. ${headline}`}
        />
      </div>
      <p className="m-0 mt-2 text-sm text-muted tnum">
        Latest {picked.latest.loadKg} kg × {picked.latest.reps} · best {picked.best.e1rm.toFixed(1)} kg · Epley estimate
      </p>
      <Button variant="secondary" full onClick={() => navigate(`/train/exercise/${picked.exerciseId}`)} className="mt-4">Open {picked.name}</Button>
    </div>
  )
}

function SessionsDetail({ weeks }: { weeks: WeekAdherence[] }) {
  const asc = [...weeks].reverse()
  const done = asc.reduce((a, w) => a + w.training.done, 0)
  const planned = asc.reduce((a, w) => a + w.training.planned, 0)
  const sentence = planned > 0 ? `${done} of ${planned} planned sessions done in ${asc.length} weeks.` : 'No sessions planned yet.'
  return (
    <div data-pillar="train" className="pb-2 pt-1">
      <p className="m-0 text-[17px] font-semibold leading-snug text-pretty">{sentence}</p>
      <div className="mt-3">
        <BarChart
          bars={asc.map((w) => ({ label: shortWeek(w), value: w.training.done, target: w.training.planned || undefined, highlight: w.current }))}
          height={160}
          pillar="train"
          yFormat={(n) => String(Math.round(n))}
          ariaLabel={`Sessions done per week. ${sentence}`}
        />
      </div>
      <p className="m-0 mt-2 text-sm text-muted">The tick is what was planned. This week is still open.</p>
    </div>
  )
}

function SleepDetail({ series }: { series: DayValue[] }) {
  const headline = sleepHeadline(series)
  return (
    <div data-pillar="rest" className="pb-2 pt-1">
      <p className="m-0 text-[17px] font-semibold leading-snug text-pretty">{headline}</p>
      <div className="mt-3">
        <BarChart
          bars={series.map((d, i) => ({ label: dayName(d.date), value: d.value, target: 7, highlight: i === series.length - 1 }))}
          height={160}
          pillar="rest"
          yFormat={(n) => `${n.toFixed(1)} h`}
          ariaLabel={`Hours slept on each of the last ${SLEEP_BARS} nights. ${headline}`}
        />
      </div>
      <p className="m-0 mt-2 text-sm text-muted">The tick marks 7 h. Last night is highlighted.</p>
    </div>
  )
}

interface PillarRow { key: PillarKey; caption: string; noun: string; cell: (w: WeekAdherence) => { part: number; whole: number } }

const ADHERENCE_ROWS: PillarRow[] = [
  { key: 'train', caption: 'Sessions done of planned', noun: 'sessions done', cell: (w) => ({ part: w.training.done, whole: w.training.planned }) },
  { key: 'eat', caption: 'Days with meals logged', noun: 'days logged', cell: (w) => ({ part: w.nutrition.logged, whole: w.nutrition.days }) },
  { key: 'rest', caption: 'Nights of 7 h or more', noun: 'nights of 7 h or more', cell: (w) => ({ part: w.sleep.nights, whole: w.sleep.days }) },
  { key: 'mind', caption: 'Days checked in', noun: 'days checked in', cell: (w) => ({ part: w.mind.checkedIn, whole: w.mind.days }) },
]

function AdherenceDetail({ weeks }: { weeks: WeekAdherence[] }) {
  const asc = [...weeks].reverse()
  const sentence = adherenceLine(weeks)
  if (!sentence) return <p className="m-0 py-2 text-[15px] text-muted">Plan a week in Train and log meals in Eat to see this fill in.</p>
  return (
    <div className="pb-2 pt-1">
      <p className="m-0 text-[17px] font-semibold leading-snug text-pretty">{sentence}</p>
      <div className="mt-4 grid grid-cols-4 gap-2" aria-hidden>
        {asc.map((w) => <span key={w.weekStart} className="eyebrow truncate text-[0.625rem] text-faint">{shortWeek(w)}</span>)}
      </div>
      <div className="mt-3 space-y-4">
        {ADHERENCE_ROWS.map((row) => {
          const meta = PILLARS[row.key]
          const Icon = meta.icon
          return (
            <div key={row.key} data-pillar={row.key} role="group" aria-label={`${meta.label}: ${row.caption.toLowerCase()}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="eyebrow flex items-center gap-1.5 text-pillar"><Icon size={13} strokeWidth={2.25} aria-hidden />{meta.label}</span>
                <span className="truncate text-xs text-muted">{row.caption}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {asc.map((w) => {
                  const { part, whole } = row.cell(w)
                  return (
                    <div key={w.weekStart} role="img" aria-label={`${w.label}: ${whole > 0 ? `${part} of ${whole} ${row.noun}` : 'nothing planned'}`}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-pillar" style={{ width: `${adherencePct(part, whole)}%` }} />
                      </div>
                      <div className="mt-1 whitespace-nowrap">
                        {whole > 0 ? (
                          <><span className="num text-lg">{part}</span><span className="text-xs text-muted tnum">/{whole}</span></>
                        ) : (
                          <span className="text-xs text-faint">None planned</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="m-0 mt-4 text-xs text-muted">Counts, not scores. This week is still open.</p>
    </div>
  )
}

const DETAIL_TITLE: Record<Detail, string> = {
  waist: 'Waist',
  strength: 'Estimated 1RM',
  sessions: 'Sessions',
  sleep: 'Sleep',
  adherence: 'Last 4 weeks',
}

// --- photos strip ----------------------------------------------------------------------------------

function PhotoStrip({ photos, onAdd, onOpen, compareMode, selected, onToggleCompare, onSelect }: {
  photos: ProgressPhoto[]
  onAdd: () => void
  onOpen: (p: ProgressPhoto) => void
  compareMode: boolean
  selected: number[]
  onToggleCompare: () => void
  onSelect: (p: ProgressPhoto) => void
}) {
  return (
    <section aria-label="Progress photos">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="eyebrow m-0 flex items-center gap-1.5 text-muted"><Lock size={12} aria-hidden />Photos · on this device</h2>
        {photos.length >= 2 && (
          <button type="button" onClick={onToggleCompare} aria-pressed={compareMode} className="press -mr-2 inline-flex h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-app">
            {compareMode ? <X size={16} aria-hidden /> : <GitCompare size={16} aria-hidden />}
            {compareMode ? 'Cancel' : 'Compare'}
          </button>
        )}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add progress photo"
          className="press flex aspect-[3/4] w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface text-muted active:bg-surface-2"
        >
          <Camera size={22} aria-hidden />
          <span className="text-xs font-semibold">Add</span>
        </button>
        {photos.map((p) => {
          const idx = selected.indexOf(p.id)
          const date = dateOf(p.ts)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => (compareMode ? onSelect(p) : onOpen(p))}
              aria-label={`${p.angle} photo, ${fmtDate(date)}${idx >= 0 ? ', selected' : ''}`}
              aria-pressed={compareMode ? idx >= 0 : undefined}
              className={cx('press relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2', idx >= 0 && 'ring-[3px] ring-accent')}
            >
              <img src={p.uri} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-left text-[11px] font-semibold text-white tnum">{fmtDate(date)}</span>
              {idx >= 0 && (
                <span className="num absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-sm text-accent-fg">{idx + 1}</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// --- screen -----------------------------------------------------------------------------

export default function ProgressScreen() {
  const toast = useToast()
  const today = todayStr()

  const goals = useQuery(() => getGoals(), [])
  const weightGoal = goalValue(goals, 'weight')
  const waistGoal = goalValue(goals, 'waist')
  const weights = useQuery(() => getBodyMetrics('weight', WEIGHT_HISTORY_DAYS), [])
  const waists = useQuery(() => getBodyMetrics('waist', 180), [])
  const photos = useQuery(() => getPhotos(), [])

  const calibration = useMemo(() => weightCalibration(weights, today), [weights, today])
  const [range, setRange] = useState<WeightRange>(() => (calibration.done ? 30 : 14))

  const weightStats = useMemo(() => computeWeightStats(weights, weightGoal, today), [weights, weightGoal, today])
  const waistStats = useMemo(() => computeWaistStats(waists, waistGoal, today), [waists, waistGoal, today])
  const chart = useMemo(() => buildWeightChart(weights, range, today), [weights, range, today])
  const headline = useMemo(() => weightHeadlineShort({ chart, stats: weightStats, calibration }), [chart, weightStats, calibration])
  const longHeadline = useMemo(() => weightHeadline({ chart, stats: weightStats, calibration, today }), [chart, weightStats, calibration, today])

  const adherence = useQuery(() => {
    const weekStart = startOfWeek(today)
    const from = addDays(weekStart, -21)
    const to = addDays(weekStart, 6)
    const span = daysBetween(from, today) + 1
    return computeAdherence({
      today,
      weeks: 4,
      sessions: getSessions(from, to),
      intake: dailyTotalsRange(from, today),
      sleep: getSleepRecords(span),
      moodDates: getMoodLogs(span).map((l) => dateOf(l.ts)),
    })
  }, [today])

  const strength = useQuery(() => {
    const sessions = getSessions(addDays(today, -90), today).filter((s) => s.status === 'completed' || s.status === 'in_progress')
    const sets = sessions.flatMap((s) => getSetsForSession(s.id))
    return computeStrengthTrends({ sessions, sets, exercises: getExercises(), top: 4 })
  }, [today])
  const bestLift = useMemo(() => strength.reduce<StrengthTrend | null>((best, t) => (!best || t.latest.e1rm > best.latest.e1rm ? t : best), null), [strength])

  const sleepSeries = useQuery(() => nightlySleep(getSleepRecords(SLEEP_BARS), SLEEP_BARS, today), [today])
  const sleepNights = sleepSeries.filter((d): d is { date: string; value: number } => d.value != null)
  const sleepAvg = sleepNights.length ? sleepNights.reduce((a, d) => a + d.value, 0) / sleepNights.length : null

  const thisWeek = adherence.find((w) => w.current) ?? null

  const [detail, setDetail] = useState<Detail | null>(null)
  const lastDetail = useRef<Detail>('waist')
  if (detail) lastDetail.current = detail
  const shownDetail = detail ?? lastDetail.current
  const [infoOpen, setInfoOpen] = useState(false)
  const [logSheet, setLogSheet] = useState<MetricKind | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [viewer, setViewer] = useState<ProgressPhoto | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [pair, setPair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null)

  const saveMetric = (kind: MetricKind, value: number) => {
    const m: Omit<BodyMetric, 'id'> = { ts: nowIso(), type: kind, value, unit: METRIC_UI[kind].unit, source: 'manual' }
    addBodyMetric(m)
    setLogSheet(null)
    toast.show(`${kind === 'weight' ? 'Weight' : 'Waist'} ${value} ${METRIC_UI[kind].unit} logged`, 'success')
  }

  const toggleCompare = () => {
    setCompareMode((v) => !v)
    setSelected([])
  }

  const selectForCompare = (p: ProgressPhoto) => {
    setSelected((cur) => {
      if (cur.includes(p.id)) return cur.filter((id) => id !== p.id)
      const next = [...cur, p.id]
      if (next.length === 2) {
        const a = photos.find((x) => x.id === next[0])
        const b = photos.find((x) => x.id === next[1])
        if (a && b) setPair([a, b])
        return []
      }
      return next
    })
  }

  const compareFromViewer = (p: ProgressPhoto) => {
    setViewer(null)
    setCompareMode(true)
    setSelected([p.id])
  }

  const waistDelta = waistStats.change?.delta ?? null
  const liftDelta = bestLift?.changeKg ?? null

  return (
    <Screen pillar="neutral" title="Progress" back="/" backLabel="Today">
      <div className="flex flex-col gap-3 pb-6">
        <div {...rise(0)}>
          <WeightHero
            stats={weightStats}
            chart={chart}
            calibration={calibration}
            headline={headline}
            ariaHeadline={longHeadline}
            range={range}
            onRange={setRange}
            onLog={() => setLogSheet('weight')}
            onInfo={() => setInfoOpen(true)}
          />
        </div>

        <div {...rise(1)} className="anim-rise grid grid-cols-2 gap-3">
          <StatTile
            label="Waist"
            icon={Ruler}
            value={waistStats.latest != null ? waistStats.latest.toFixed(1) : '—'}
            unit="cm"
            sub={waistDelta != null ? `${signed(waistDelta)} cm` : waistStats.latestTs ? fmtDate(dateOf(waistStats.latestTs)) : 'Tap to log'}
            trend={waistDelta == null ? undefined : waistDelta > 0.05 ? 'up' : waistDelta < -0.05 ? 'down' : 'flat'}
            onClick={() => setDetail('waist')}
          />
          <StatTile
            label="Best lift e1RM"
            icon={Dumbbell}
            pillar="train"
            value={bestLift ? bestLift.latest.e1rm.toFixed(1) : '—'}
            unit="kg"
            sub={bestLift ? bestLift.name : 'No loaded sets yet'}
            trend={liftDelta == null ? undefined : liftDelta > 0.05 ? 'up' : liftDelta < -0.05 ? 'down' : 'flat'}
            onClick={() => setDetail('strength')}
          />
          <StatTile
            label="Sessions"
            icon={CalendarCheck}
            pillar="train"
            value={thisWeek ? `${thisWeek.training.done}/${thisWeek.training.planned}` : '—'}
            sub="This week"
            onClick={() => setDetail('sessions')}
          />
          <StatTile
            label="Sleep average"
            icon={Moon}
            pillar="rest"
            value={sleepAvg != null ? sleepAvg.toFixed(1) : '—'}
            unit="h"
            sub={sleepNights.length ? `${sleepNights.length} night${sleepNights.length === 1 ? '' : 's'}` : 'No nights yet'}
            onClick={() => setDetail('sleep')}
          />
        </div>

        <div {...rise(2)}>
          <PhotoStrip
            photos={photos}
            onAdd={() => setAddOpen(true)}
            onOpen={setViewer}
            compareMode={compareMode}
            selected={selected}
            onToggleCompare={toggleCompare}
            onSelect={selectForCompare}
          />
        </div>

        <div {...rise(3)}>
          <Card flush>
            <ListRow icon={<BarChart3 size={18} />} title="See adherence" chevron onClick={() => setDetail('adherence')} />
            <Divider inset />
            <ListRow icon={<FileText size={18} />} title="Reports" chevron to="/reports" />
          </Card>
        </div>
      </div>

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title={DETAIL_TITLE[shownDetail]}>
        {shownDetail === 'waist' && <WaistDetail stats={waistStats} waists={waists} onLog={() => { setDetail(null); setLogSheet('waist') }} />}
        {shownDetail === 'strength' && <StrengthDetail trends={strength} initialId={bestLift?.exerciseId ?? null} />}
        {shownDetail === 'sessions' && <SessionsDetail weeks={adherence} />}
        {shownDetail === 'sleep' && <SleepDetail series={sleepSeries} />}
        {shownDetail === 'adherence' && <AdherenceDetail weeks={adherence} />}
      </Sheet>
      <ChartInfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} stats={weightStats} longHeadline={longHeadline} />

      <LogMetricSheet
        kind={logSheet ?? 'weight'}
        open={logSheet !== null}
        initial={logSheet === 'waist' ? waistStats.latest : weightStats.latest}
        onClose={() => setLogSheet(null)}
        onSaved={(v) => saveMetric(logSheet ?? 'weight', v)}
      />
      <AddPhotoSheet open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => setAddOpen(false)} />
      <PhotoViewerSheet photo={viewer} onClose={() => setViewer(null)} onCompare={compareFromViewer} onDeleted={() => setViewer(null)} />
      <CompareSheet
        pair={pair}
        onClose={() => { setPair(null); setCompareMode(false); setSelected([]) }}
      />
      {compareMode && (
        <div className="glass shadow-float fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-line pl-4 text-sm font-medium" role="status">
          {selected.length === 0 ? 'Pick two photos' : 'Pick the second photo'}
          <button type="button" onClick={toggleCompare} className="press inline-flex h-11 w-11 items-center justify-center rounded-full" aria-label="Cancel compare"><X size={16} aria-hidden /></button>
        </div>
      )}
    </Screen>
  )
}
