// Sleep (PRD §11; DESIGN §10.1, pillar rest): last night as a ring against the sleep goal, one 7/30-day
// trend with the usual-range band, two tiles and a wind-down button. The coach reading, manual log,
// recent nights and source / HealthKit rows sit behind "More".
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BedDouble, CircleAlert, Ellipsis, HeartPulse, Moon, Plus, Trash2, Watch, Wind } from 'lucide-react'
import type { SleepRecord } from '../domain/types'
import { addDays, dateOf, dayName, fmtDate, fmtDuration, fmtTime, isoAt, toDateStr } from '../lib/util'
import {
  Button, Card, CoachQuote, Divider, Field, INPUT_BASE, IconButton, Illustration, LineChart, ListRow, RangeTabs, Ring, Screen, Sheet, StatTile, StatusPill,
  type Tone,
} from '../components'
import { useNow, useQuery, useToast } from '../hooks'
import { addSleepRecord, deleteSleepRecord, getSetting, getSleepRecords, lastNightSleep } from '../db/repositories'
import { DEFAULT_SLEEP_GOAL_MIN, SLEEP_SHORT_MIN, SLEEP_TARGET_MIN, SLEEP_AVG_LOW_MIN, dailySeries } from '../engine'
import { HEALTH_UNAVAILABLE_REASON } from '../native'
import { Duration, Rise } from '../features/today/ui'

type Permission = 'granted' | 'denied' | 'undetermined'

const SOURCE_LABEL: Record<SleepRecord['source'], string> = { healthkit: 'Apple Health', manual: 'Manual', seed: 'Sample data' }

const PERMISSION_UI: Record<Permission, { tone: Tone; label: string; sub: string }> = {
  granted: { tone: 'green', label: 'Connected', sub: 'Sleep analysis is read from Apple Watch' },
  denied: { tone: 'red', label: 'Denied', sub: 'Sleep access is off — manual entry only' },
  undetermined: { tone: 'neutral', label: 'Not connected', sub: HEALTH_UNAVAILABLE_REASON },
}

// --- pure helpers -------------------------------------------------------------------

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function stdDev(xs: number[]): number | null {
  const m = mean(xs)
  if (m == null || xs.length < 2) return null
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

/** Minutes after 18:00 local, so bedtimes either side of midnight compare sensibly (23:30 → 330, 00:30 → 390). */
export function bedtimeMinutes(ts: string): number {
  const d = new Date(ts)
  return (d.getHours() * 60 + d.getMinutes() - 18 * 60 + 1440) % 1440
}

export interface SleepSummary {
  lastMin: number | null
  avg7: number | null
  avg30: number | null
  consistencySd: number | null
  nights7: number
}

/** One deterministic coach sentence (PRD §11: a single bad night never cancels training). */
export function sleepInterpretation(s: SleepSummary): string {
  const parts: string[] = []
  if (s.lastMin == null) {
    parts.push(`No record for last night. Readiness is running on the 7-day average${s.avg7 != null ? ` (${fmtDuration(s.avg7)})` : ''} — log it or connect Apple Health.`)
  } else if (s.lastMin < SLEEP_SHORT_MIN) {
    parts.push(`${fmtDuration(s.lastMin)} is a short night. Today is reduced volume, not a rest day: keep the loads, drop the last set of each exercise, and be in bed by 22:30.`)
  } else if (s.lastMin < SLEEP_TARGET_MIN && s.avg7 != null && s.lastMin < s.avg7 - 15) {
    parts.push(`${fmtDuration(s.lastMin)}, ${fmtDuration(s.avg7 - s.lastMin)} under your 7-day average. One short night trims today's volume; two in a row would change the plan. Lights out by 22:45.`)
  } else if (s.lastMin < SLEEP_TARGET_MIN) {
    parts.push(`${fmtDuration(s.lastMin)} — under the 7-hour line but close to your average. Train as planned and protect tonight.`)
  } else if (s.avg7 != null && s.avg7 < SLEEP_AVG_LOW_MIN) {
    parts.push(`Good night (${fmtDuration(s.lastMin)}), but the 7-day average is only ${fmtDuration(s.avg7)}. Consistency lifts recovery more than one long night.`)
  } else {
    parts.push(`${fmtDuration(s.lastMin)} — solid. Normal progression today.`)
  }
  if (s.consistencySd != null && s.consistencySd > 60) {
    parts.push(`Bedtime varies by about ±${Math.round(s.consistencySd)} min — a fixed window will help more than extra hours.`)
  }
  if (s.lastMin != null && s.nights7 < 4) {
    parts.push(`Only ${s.nights7} of the last 7 nights ${s.nights7 === 1 ? 'is' : 'are'} logged, so the average is rough.`)
  }
  return parts.join(' ')
}

/** Manual record from a wake date and two HH:MM strings; bed time later than wake time means the night before. */
export function manualRecord(wakeDate: string, bed: string, wake: string): Omit<SleepRecord, 'id'> | null {
  const [bh, bm] = bed.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  if (![bh, bm, wh, wm].every(Number.isFinite)) return null
  const bedDate = bh * 60 + bm >= wh * 60 + wm ? addDays(wakeDate, -1) : wakeDate
  const startTs = isoAt(bedDate, bh, bm)
  const endTs = isoAt(wakeDate, wh, wm)
  const durationMin = Math.round((new Date(endTs).getTime() - new Date(startTs).getTime()) / 60_000)
  if (durationMin < 15 || durationMin > 16 * 60) return null
  return { startTs, endTs, durationMin, source: 'manual', quality: null }
}

/** Minutes after midnight, for wake times. */
export function wakeMinutes(ts: string): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

/** "23:05" from minutes after midnight (wraps). */
export function clockLabel(minutesAfterMidnight: number): string {
  const m = ((Math.round(minutesAfterMidnight) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Personal baseline: mean ± 1 SD of nightly duration. Needs 5+ nights so one odd night cannot define "usual". */
export function baselineBand(durations: number[]): [number, number] | null {
  const m = mean(durations)
  const sd = stdDev(durations)
  if (m == null || sd == null || durations.length < 5) return null
  const half = Math.max(20, sd)
  return [Math.round(m - half), Math.round(m + half)]
}

/** Trailing mean over `window` slots, null until `minCount` values exist. Aligned with the input. */
export function rollingMean(values: (number | null)[], window = 7, minCount = 3): (number | null)[] {
  return values.map((_, i) => {
    const xs = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null)
    return xs.length >= minCount ? mean(xs) : null
  })
}

/** The interpreted line above the chart: ten words at most. Descriptive, never a verdict. */
export function trendHeadline(rangeDays: number, durations: number[], band: [number, number] | null, avg7: number | null): string {
  const avg = mean(durations)
  if (avg == null) return `No nights logged in ${rangeDays} days.`
  const lead = `Averaging ${fmtDuration(avg)}`
  if (rangeDays <= 7) {
    if (!band) return `${lead} this week.`
    return `${lead}, ${avg < band[0] ? 'below' : avg > band[1] ? 'above' : 'inside'} your usual range.`
  }
  if (avg7 == null) return `${lead} this month.`
  const diff = avg7 - avg
  return Math.abs(diff) < 10 ? `${lead}. The last week matches it.` : `${lead}. Last week ran ${fmtDuration(Math.abs(diff))} ${diff < 0 ? 'shorter' : 'longer'}.`
}

/** The one sentence under the ring: ten words at most. A single short night trims volume, it never cancels training. */
export function heroHeadline(lastMin: number | null): string {
  if (lastMin == null) return 'Nothing recorded for last night.'
  if (lastMin < SLEEP_SHORT_MIN) return 'Short night. Lighter volume today, early bed tonight.'
  if (lastMin < SLEEP_TARGET_MIN) return 'A little under 7 hours. Train as planned.'
  return 'Solid night. Normal progression today.'
}

function consistencyWord(sd: number | null): string {
  if (sd == null) return 'Needs 3+ nights'
  return `±${Math.round(sd)} min · ${sd <= 30 ? 'steady' : sd <= 60 ? 'fair' : 'varies'}`
}

type Range = 7 | 30
const RANGE_OPTIONS: { value: Range; label: string }[] = [{ value: 7, label: '7D' }, { value: 30, label: '30D' }]

// --- screen ---------------------------------------------------------------------------

export default function SleepScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const now = useNow(60_000)
  const today = toDateStr(now)

  const last = useQuery(() => lastNightSleep(today), [today])
  const nights30 = useQuery(() => getSleepRecords(30), [today])
  const perms = useQuery(() => getSetting<Record<string, string>>('health.permissions', {}), [])

  const wantsLog = !!(location.state as { log?: boolean } | null)?.log
  const [sheetOpen, setSheetOpen] = useState(wantsLog)
  const [moreOpen, setMoreOpen] = useState(false)
  const [wakeDate, setWakeDate] = useState(today)
  const [bed, setBed] = useState('23:00')
  const [wake, setWake] = useState('07:00')
  const [range, setRange] = useState<Range>(7)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const nights7 = useMemo(() => nights30.filter((n) => dateOf(n.endTs) >= addDays(today, -6)), [nights30, today])
  const summary: SleepSummary = useMemo(
    () => ({
      lastMin: last?.durationMin ?? null,
      avg7: mean(nights7.map((n) => n.durationMin)),
      avg30: mean(nights30.map((n) => n.durationMin)),
      consistencySd: nights30.length >= 3 ? stdDev(nights30.map((n) => bedtimeMinutes(n.startTs))) : null,
      nights7: nights7.length,
    }),
    [last, nights7, nights30],
  )
  const band = useMemo(() => baselineBand(nights30.map((n) => n.durationMin)), [nights30])
  const chart = useMemo(() => {
    const days = dailySeries(nights30.map((n) => ({ ts: n.endTs, value: n.durationMin })), range, today)
    const points = days.map((d) => ({ x: range === 7 ? dayName(d.date) : fmtDate(d.date), y: d.value }))
    return { points, average: range === 30 ? rollingMean(days.map((d) => d.value)) : undefined }
  }, [nights30, range, today])
  const rangeDurations = useMemo(
    () => nights30.filter((n) => dateOf(n.endTs) >= addDays(today, -(range - 1))).map((n) => n.durationMin),
    [nights30, range, today],
  )
  const bedAvg = useMemo(() => (nights30.length >= 3 ? mean(nights30.map((n) => bedtimeMinutes(n.startTs))) : null), [nights30])
  // Same locale clock format as the nightly rows ("11:57 pm" → value + unit).
  const clockParts = (minutesAfterMidnight: number | null): { value: string; unit?: string } => {
    if (minutesAfterMidnight == null) return { value: '—' }
    const [h, m] = clockLabel(minutesAfterMidnight).split(':').map(Number)
    const [value, unit] = fmtTime(isoAt(today, h, m)).split(' ')
    return { value, unit }
  }
  const bedClock = clockParts(bedAvg != null ? bedAvg + 18 * 60 : null)
  const sourceMix = useMemo(() => {
    const counts = new Map<SleepRecord['source'], number>()
    for (const n of nights30) counts.set(n.source, (counts.get(n.source) ?? 0) + 1)
    return [...counts.entries()].map(([k, v]) => `${SOURCE_LABEL[k]} ${v}`).join(' · ')
  }, [nights30])
  const recent = useMemo(() => [...nights30].reverse().slice(0, 7), [nights30])

  const permRaw = perms.sleep
  const perm: Permission = permRaw === 'granted' || permRaw === 'denied' ? permRaw : 'undetermined'
  const permUi = PERMISSION_UI[perm]

  const draft = manualRecord(wakeDate, bed, wake)
  const save = () => {
    if (!draft) return
    addSleepRecord(draft)
    toast.show(`${fmtDuration(draft.durationMin)} logged`, 'success')
    setSheetOpen(false)
  }
  const remove = (r: SleepRecord) => {
    deleteSleepRecord(r.id)
    setConfirmId(null)
    toast.show('Sleep record removed', 'info')
  }
  const openLog = () => {
    setMoreOpen(false)
    setSheetOpen(true)
  }

  const hasAny = nights30.length > 0 || !!last
  const goal = DEFAULT_SLEEP_GOAL_MIN
  const trend = trendHeadline(range, rangeDurations, band, summary.avg7)

  return (
    <Screen
      pillar="rest"
      title="Sleep"
      back={window.history.length > 1 ? true : '/'}
      right={<IconButton icon={<Ellipsis size={22} />} label="More: log sleep, recent nights and sources" onClick={() => setMoreOpen(true)} />}
    >
      <div className="flex flex-col gap-3 pb-32">
        {!hasAny ? (
          <Rise i={0} className="flex flex-col items-center px-4 pb-6 pt-10 text-center">
            <span className="text-pillar" aria-hidden><Illustration name="moon" size={120} /></span>
            <p className="voice mt-5 text-2xl text-balance">No nights here yet.</p>
            <Button className="mt-6" size="lg" icon={<Plus size={20} />} onClick={() => setSheetOpen(true)}>Log last night</Button>
          </Rise>
        ) : (
          <Rise i={0} className="flex flex-col items-center pb-2 pt-3 text-center">
            <Ring
              pillar="rest"
              size={224}
              stroke={14}
              value={last?.durationMin ?? 0}
              max={goal}
              ariaLabel={last ? `Last night ${fmtDuration(last.durationMin)} of a ${fmtDuration(goal)} goal` : 'No sleep recorded for last night'}
            >
              <span className="eyebrow text-pillar">Last night</span>
              {last ? <Duration min={last.durationMin} size="xl" className="mt-1" /> : <span className="num mt-1 text-7xl text-muted" aria-hidden>—</span>}
              <span className="mt-1 text-sm text-muted">of {fmtDuration(goal)}</span>
            </Ring>
            <p className="voice mt-4 text-xl text-balance">{heroHeadline(last?.durationMin ?? null)}</p>
            {!last && <Button className="mt-3" variant="secondary" icon={<Plus size={18} />} onClick={() => setSheetOpen(true)}>Log last night</Button>}
          </Rise>
        )}

        {hasAny && (
          <Rise i={1}>
            <Card pillar="rest" eyebrow="Trend" action={<RangeTabs options={RANGE_OPTIONS} value={range} onChange={setRange} />}>
              <p className="text-[17px] font-medium leading-snug text-pretty">{trend}</p>
              <div className="mt-2">
                <LineChart
                  pillar="rest"
                  points={chart.points}
                  average={chart.average}
                  band={band ?? undefined}
                  target={goal}
                  yFormat={fmtDuration}
                  height={168}
                  ariaLabel={`Sleep duration, last ${range} nights. ${trend} Dashed line: ${fmtDuration(goal)} goal.${band ? ` Shaded band: your usual range, ${fmtDuration(band[0])} to ${fmtDuration(band[1])}.` : ''}`}
                />
              </div>
            </Card>
          </Rise>
        )}

        {hasAny && (
          <Rise i={2} className="grid grid-cols-2 gap-3">
            <StatTile pillar="rest" icon={BedDouble} label="Bedtime" value={bedClock.value} unit={bedClock.unit} sub={consistencyWord(summary.consistencySd)} />
            <StatTile pillar="rest" icon={Moon} label="7-day avg" value={summary.avg7 != null ? fmtDuration(summary.avg7) : '—'} sub={`${summary.nights7} of 7 nights`} />
          </Rise>
        )}

        <Rise i={3} className="pt-1">
          <Button variant="secondary" size="lg" full icon={<Wind size={20} />} onClick={() => navigate('/mind/breathe?technique=478&kind=winddown')}>Wind down</Button>
        </Rise>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col gap-3 pb-2" data-pillar="rest">
          <Button full size="lg" icon={<Plus size={20} />} onClick={openLog}>Log a night</Button>

          <Card>
            <CoachQuote compact>{sleepInterpretation(summary)}</CoachQuote>
          </Card>

          <Card flush>
            <ListRow
              icon={<Watch size={18} />}
              title="Source"
              subtitle={sourceMix ? `30 days: ${sourceMix}` : 'No nights logged yet'}
              right={last ? SOURCE_LABEL[last.source] : undefined}
            />
            <Divider inset />
            <ListRow
              icon={<HeartPulse size={18} />}
              title="Apple Health"
              subtitle={permUi.sub}
              right={<StatusPill tone={permUi.tone} dot>{permUi.label}</StatusPill>}
              to="/settings/health"
              chevron
            />
          </Card>

          {recent.length > 0 && (
            <Card flush eyebrow="Recent nights">
              {recent.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && <Divider inset />}
                  <ListRow
                    title={`${dayName(dateOf(r.endTs))} ${fmtDate(dateOf(r.endTs))}`}
                    subtitle={`${fmtTime(r.startTs)} → ${fmtTime(r.endTs)} · ${SOURCE_LABEL[r.source]}`}
                    right={
                      confirmId === r.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>Keep</Button>
                          <Button size="sm" variant="danger" onClick={() => remove(r)}>Delete</Button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="num text-xl text-app">{fmtDuration(r.durationMin)}</span>
                          {r.source === 'manual' && (
                            <IconButton icon={<Trash2 size={17} />} label={`Delete ${fmtDate(dateOf(r.endTs))} record`} onClick={() => setConfirmId(r.id)} className="-mr-2.5" />
                          )}
                        </span>
                      )
                    }
                  />
                </div>
              ))}
            </Card>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Log sleep"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" full onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button full disabled={!draft} onClick={save}>Save</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1" data-pillar="rest">
          <div className="rounded-[1.25rem] border border-line bg-surface-2 px-4 py-4 text-center">
            <div className="eyebrow text-muted">Duration</div>
            <div className="num mt-1.5 text-6xl">{draft ? fmtDuration(draft.durationMin) : '—'}</div>
          </div>
          <Field label="Woke up on" htmlFor="sleep-date">
            <input id="sleep-date" type="date" className={`${INPUT_BASE} h-12`} value={wakeDate} max={today} onChange={(e) => setWakeDate(e.target.value || today)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bed time" htmlFor="sleep-bed">
              <input id="sleep-bed" type="time" className={`${INPUT_BASE} h-12 tnum`} value={bed} onChange={(e) => setBed(e.target.value)} />
            </Field>
            <Field label="Wake time" htmlFor="sleep-wake">
              <input id="sleep-wake" type="time" className={`${INPUT_BASE} h-12 tnum`} value={wake} onChange={(e) => setWake(e.target.value)} />
            </Field>
          </div>
          {!draft && (
            <p className="flex items-start gap-2 text-sm leading-snug" role="alert">
              <CircleAlert size={17} className="mt-px shrink-0 text-stop" aria-hidden />
              <span>Check the times. A night is between 15 minutes and 16 hours.</span>
            </p>
          )}
          <Button variant="ghost" onClick={() => { setSheetOpen(false); navigate('/settings/health') }}>
            Connect Apple Health instead
          </Button>
        </div>
      </Sheet>
    </Screen>
  )
}
