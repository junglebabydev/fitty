// Morning check-in (PRD §7.1, §11; DESIGN §10): one question per view. Energy, soreness, stress,
// weight when missing, then a body check as a grid of region tiles (details in a sheet).
// Saving shows the readiness it produced, then returns to Today.
import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, Plus, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { RedFlags, Region, SymptomCheck } from '../domain/types'
import { cx, nowIso, todayStr } from '../lib/util'
import { Button, NumberInput, ProgressBar, Screen, Segmented, Sheet, TextInput } from '../components'
import { useQuery, useToast } from '../hooks'
import { addBodyMetric, addSymptomCheck, getCheckIn, latestBodyMetric, metricForDate, upsertCheckIn } from '../db/repositories'
import { RED_FLAG_LABELS, latestSymptomsByRegion, type GateResult, type ReadinessResult } from '../engine'
import { gateFor, gateSymptoms, todayReadiness } from '../features/coach/facts'
import { ScaleSlider, describeEnergy, describePain, describeSoreness, describeStress } from '../features/today/ScaleSlider'
import { GATE_UI, READINESS_UI, Rise } from '../features/today/ui'

type RowKey = 'knee_left' | 'knee_right' | 'back' | 'neck'
type BackRegion = 'back_lower' | 'back_mid' | 'back_upper'

interface RowDef { key: RowKey; label: string; flags: (keyof RedFlags)[] }

const ROWS: RowDef[] = [
  { key: 'knee_left', label: 'Left knee', flags: ['locking', 'givingWay', 'swelling', 'numbness', 'weakness'] },
  { key: 'knee_right', label: 'Right knee', flags: ['locking', 'givingWay', 'swelling', 'numbness', 'weakness'] },
  { key: 'back', label: 'Back', flags: ['numbness', 'weakness', 'radiating'] },
  { key: 'neck', label: 'Neck', flags: ['numbness', 'weakness', 'radiating'] },
]

const BACK_OPTIONS: { value: BackRegion; label: string }[] = [
  { value: 'back_lower', label: 'Lower' },
  { value: 'back_mid', label: 'Mid' },
  { value: 'back_upper', label: 'Upper' },
]

interface RegionState { region: Region; pain: number; flags: RedFlags }
type RegionMap = Record<RowKey, RegionState>

const RETURN_DELAY_MS = 3500

function activeFlags(flags: RedFlags): (keyof RedFlags)[] {
  return (Object.keys(flags) as (keyof RedFlags)[]).filter((k) => flags[k] === true)
}

function sameFlags(a: RedFlags, b: RedFlags): boolean {
  const fa = activeFlags(a).sort().join(','), fb = activeFlags(b).sort().join(',')
  return fa === fb
}

/** Prefill each row from today's latest check for that region (back = whichever back region was checked last). */
function initialRegions(todays: SymptomCheck[]): RegionMap {
  const latest = latestSymptomsByRegion(todays)
  const pick = (region: Region): RegionState => {
    const snap = latest.get(region)
    return { region, pain: snap?.painScore ?? 0, flags: snap ? { ...snap.redFlags } : {} }
  }
  const backs = (['back_lower', 'back_mid', 'back_upper'] as BackRegion[]).filter((r) => latest.has(r))
  const backRegion = backs.length ? backs.sort((a, b) => latest.get(b)!.latest.ts.localeCompare(latest.get(a)!.latest.ts))[0] : 'back_lower'
  return { knee_left: pick('knee_left'), knee_right: pick('knee_right'), back: pick(backRegion), neck: pick('neck') }
}

function rowSummary(st: RegionState): { tone: 'neutral' | 'green' | 'amber' | 'red'; text: string } {
  const flags = activeFlags(st.flags)
  const hardFlag = flags.some((f) => f !== 'swelling')
  if (hardFlag) return { tone: 'red', text: `Red flag${st.pain ? ` · ${st.pain}/10` : ''}` }
  if (st.pain > 5) return { tone: 'red', text: `${st.pain}/10` }
  if (st.pain >= 3 || flags.length) return { tone: 'amber', text: `${st.pain}/10${flags.length ? ' · swelling' : ''}` }
  if (st.pain > 0) return { tone: 'green', text: `${st.pain}/10 mild` }
  return { tone: 'neutral', text: 'No pain' }
}

const SUMMARY_UI: Record<ReturnType<typeof rowSummary>['tone'], { Icon: LucideIcon; text: string }> = {
  neutral: { Icon: CircleCheck, text: 'text-muted' },
  green: { Icon: CircleCheck, text: 'text-ok' },
  amber: { Icon: TriangleAlert, text: 'text-warn' },
  red: { Icon: CircleAlert, text: 'text-stop' },
}

/** Red-flag toggle: 44px target, icon + label + pressed state, status colour only when on. */
function FlagToggle({ label, on, caution, onClick }: { label: string; on: boolean; caution: boolean; onClick: () => void }) {
  const Icon = caution ? TriangleAlert : CircleAlert
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'press inline-flex items-center gap-2 min-h-11 px-3.5 rounded-full border text-sm font-medium',
        on
          ? caution ? 'border-warn/50 bg-warn/12 text-warn' : 'border-stop/50 bg-stop/12 text-stop'
          : 'border-line bg-surface text-app',
      )}
    >
      <Icon size={16} className={cx('shrink-0', !on && 'text-faint')} aria-hidden />
      {label}
      <span className="sr-only">{on ? ', reported' : ', not reported'}</span>
    </button>
  )
}

/** One question filling the view: short label, huge numeral, a plain word, a wide slider. */
function BigScale({ label, value, onChange, describe, ends }: { label: string; value: number; onChange: (n: number) => void; describe: (n: number) => string; ends: [string, string] }) {
  const id = useId()
  const word = describe(value)
  return (
    <div className="flex flex-col items-center text-center">
      <label htmlFor={id} className="display text-4xl">{label}</label>
      <div className="mt-8 flex items-baseline gap-1.5" aria-hidden>
        <span className="num text-[8.5rem] leading-none">{value}</span>
        <span className="text-base font-medium text-muted">/10</span>
      </div>
      <div className="voice mt-2 text-2xl" aria-hidden>{word}</div>
      <input
        id={id}
        type="range"
        className="slider mt-8"
        min={0}
        max={10}
        step={1}
        value={value}
        aria-valuetext={`${value} out of 10, ${word}`}
        style={{ '--slider-pct': `${value * 10}%`, '--slider-color': 'var(--c-fg)' } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex w-full justify-between text-sm text-muted" aria-hidden>
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  )
}

type StepKey = 'energy' | 'soreness' | 'stress' | 'weight' | 'body'

export default function CheckInScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayStr()

  const existing = useQuery(() => getCheckIn(today), [today])
  const weightToday = useQuery(() => metricForDate('weight', today), [today])
  const latestWeight = useQuery(() => latestBodyMetric('weight'), [])
  // Same 2-day window as the coach / workout gate, so yesterday's flags prefill until cleared.
  const todaysSymptoms = useQuery(() => gateSymptoms(today), [today])

  const [energy, setEnergy] = useState(existing?.energy ?? 6)
  const [soreness, setSoreness] = useState(existing?.soreness ?? 2)
  const [stress, setStress] = useState(existing?.stress ?? 3)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [weight, setWeight] = useState<number | null>(null)
  const baseline = useMemo(() => initialRegions(todaysSymptoms), [todaysSymptoms])
  const [regions, setRegions] = useState<RegionMap>(baseline)
  const [result, setResult] = useState<{ readiness: ReadinessResult; gate: GateResult } | null>(null)
  const [step, setStep] = useState(0)
  const [openRow, setOpenRow] = useState<RowKey | null>(null)
  const [noteOpen, setNoteOpen] = useState((existing?.notes ?? '') !== '')

  // Weight is only asked when today has none.
  const steps: StepKey[] = weightToday ? ['energy', 'soreness', 'stress', 'body'] : ['energy', 'soreness', 'stress', 'weight', 'body']
  const current = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1

  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => navigate('/'), RETURN_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [result, navigate])

  const patch = (key: RowKey, p: Partial<RegionState>) => setRegions((r) => ({ ...r, [key]: { ...r[key], ...p } }))

  const save = () => {
    upsertCheckIn({ date: today, energy, soreness, stress, notes: notes.trim() })
    if (!weightToday && weight != null && weight >= 25 && weight <= 300) {
      addBodyMetric({ ts: nowIso(), type: 'weight', value: Math.round(weight * 10) / 10, unit: 'kg', source: 'manual' })
    }
    const ts = nowIso()
    let logged = 0
    for (const row of ROWS) {
      const st = regions[row.key]
      const base = baseline[row.key]
      const active = st.pain > 0 || activeFlags(st.flags).length > 0
      const hadCheck = todaysSymptoms.some((s) => s.region === base.region)
      const changed = hadCheck ? base.pain !== st.pain || !sameFlags(base.flags, st.flags) || base.region !== st.region : active
      if (!changed) continue
      const flags: RedFlags = {}
      for (const k of activeFlags(st.flags)) flags[k] = true
      addSymptomCheck({ ts, region: st.region, painScore: st.pain, redFlags: flags, notes: '', context: 'morning', sessionId: null })
      logged++
    }
    const readiness = todayReadiness(today)
    const gate = gateFor(today)
    setResult({ readiness, gate })
    toast.show(logged ? `Check-in saved · ${logged} symptom check${logged === 1 ? '' : 's'} logged` : 'Check-in saved', 'success')
  }

  if (result) {
    const ui = READINESS_UI[result.readiness.state]
    const gateUi = GATE_UI[result.gate.overall]
    const reasons = result.readiness.reasons.slice(0, 2)
    return (
      <Screen pillar="today" back="/">
        <div className="flex flex-1 flex-col gap-6 pb-32 pt-6">
          <Rise i={0}>
            <div className={cx('rounded-[1.5rem] border px-5 py-10 text-center', ui.soft, ui.line)} role="status">
              <ui.Icon size={56} className={cx('mx-auto anim-pop', ui.text)} aria-hidden />
              <div className="display mt-4 text-6xl">{ui.word}</div>
            </div>
          </Rise>

          {(reasons.length > 0 || result.gate.overall !== 'OK') && (
            <Rise i={1}>
              <ul className="flex flex-col gap-3 px-1">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 text-[17px] leading-snug">
                    <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted" aria-hidden />
                    <span className="min-w-0">{r}</span>
                  </li>
                ))}
                {result.gate.overall !== 'OK' && result.gate.advice.length > 0 && (
                  <li className="flex items-start gap-3 text-[17px] leading-snug">
                    <gateUi.Icon size={20} className={cx('mt-0.5 shrink-0', gateUi.text)} aria-hidden />
                    <span className="min-w-0">
                      <span className="font-semibold">{result.gate.overall === 'AMBER' ? 'Modify' : 'Protect'}. </span>
                      {result.gate.advice[0]}
                    </span>
                  </li>
                )}
              </ul>
            </Rise>
          )}

          <Rise i={2} className="mt-auto">
            <Button full size="lg" onClick={() => navigate('/')}>Back to Today</Button>
          </Rise>
        </div>
      </Screen>
    )
  }

  const openDef = openRow ? ROWS.find((r) => r.key === openRow) ?? null : null
  const openSt = openRow ? regions[openRow] : null
  const weightInvalid = weight != null && (weight < 25 || weight > 300)

  return (
    <Screen pillar="today" back="/" title="Check-in">
      <div className="flex flex-1 flex-col pb-32">
        <ProgressBar value={step + 1} max={steps.length} height="sm" label={<span className="eyebrow text-muted">{step + 1} of {steps.length}</span>} />

        <div key={current} className="anim-fade-in flex flex-1 flex-col justify-center py-8">
          {current === 'energy' && <BigScale label="Energy" value={energy} onChange={setEnergy} describe={describeEnergy} ends={['Flat', 'Full']} />}
          {current === 'soreness' && <BigScale label="Soreness" value={soreness} onChange={setSoreness} describe={describeSoreness} ends={['None', 'Very sore']} />}
          {current === 'stress' && <BigScale label="Stress" value={stress} onChange={setStress} describe={describeStress} ends={['Calm', 'Very high']} />}

          {current === 'weight' && (
            <div className="flex flex-col items-center text-center">
              <h2 className="display text-4xl">Weight</h2>
              <div className="mt-8 w-full max-w-[260px]">
                <NumberInput
                  value={weight}
                  onChange={setWeight}
                  unit="kg"
                  step={0.1}
                  min={25}
                  max={300}
                  size="lg"
                  placeholder={latestWeight ? latestWeight.value.toFixed(1) : '0.0'}
                  aria-label="Weight in kilograms, optional"
                />
              </div>
              {weightInvalid && (
                <p className="mt-3 flex items-center gap-2 text-sm" role="alert">
                  <CircleAlert size={17} className="shrink-0 text-stop" aria-hidden />
                  <span>Between 25 and 300 kg.</span>
                </p>
              )}
            </div>
          )}

          {current === 'body' && (
            <div className="flex flex-col">
              <h2 className="display text-center text-4xl">Any pain?</h2>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {ROWS.map((row) => {
                  const summary = rowSummary(regions[row.key])
                  const sUi = SUMMARY_UI[summary.tone]
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setOpenRow(row.key)}
                      aria-label={`${row.label}: ${summary.text}. Edit`}
                      className={cx(
                        'press flex min-h-[104px] flex-col justify-between rounded-[1.25rem] border bg-surface p-3.5 text-left',
                        summary.tone === 'red' ? 'border-stop/50' : summary.tone === 'amber' ? 'border-warn/50' : 'border-line',
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[17px] font-semibold leading-tight">{row.label}</span>
                        <sUi.Icon size={22} className={cx('shrink-0', sUi.text)} aria-hidden />
                      </span>
                      <span className={cx('text-sm font-medium', sUi.text)}>{summary.text}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-5">
                {noteOpen ? (
                  <TextInput multiline rows={2} aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note" />
                ) : (
                  <button type="button" onClick={() => setNoteOpen(true)} className="press inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-muted">
                    <Plus size={18} aria-hidden /> Add a note
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {step > 0 && <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>Back</Button>}
          {isLast ? (
            <Button full size="lg" onClick={save} disabled={weightInvalid}>Save check-in</Button>
          ) : (
            <Button full size="lg" onClick={() => setStep(step + 1)} disabled={current === 'weight' && weightInvalid}>
              {current === 'weight' && weight == null ? 'Skip' : 'Next'}
            </Button>
          )}
        </div>
      </div>

      <Sheet
        open={openDef !== null}
        onClose={() => setOpenRow(null)}
        title={openDef?.label}
        footer={<Button full size="lg" onClick={() => setOpenRow(null)}>Done</Button>}
      >
        {openDef && openSt && (
          <div className="flex flex-col gap-5 pb-2 pt-1" data-pillar="today">
            {openDef.key === 'back' && (
              <Segmented<BackRegion>
                label="Which part of the back"
                size="sm"
                options={BACK_OPTIONS}
                value={openSt.region as BackRegion}
                onChange={(v) => patch('back', { region: v })}
              />
            )}
            <ScaleSlider
              label="Pain"
              size="md"
              tone="status"
              value={openSt.pain}
              onChange={(n) => patch(openDef.key, { pain: n })}
              describe={describePain}
              ends={['No pain', 'Worst']}
            />
            <div>
              <div className="eyebrow mb-2.5 text-muted">Red flags</div>
              <div className="flex flex-wrap gap-2">
                {openDef.flags.map((k) => (
                  <FlagToggle
                    key={k}
                    label={RED_FLAG_LABELS[k].replace(/^\w/, (c) => c.toUpperCase())}
                    on={openSt.flags[k] === true}
                    caution={k === 'swelling'}
                    onClick={() => patch(openDef.key, { flags: { ...openSt.flags, [k]: !openSt.flags[k] } })}
                  />
                ))}
              </div>
              {activeFlags(openSt.flags).some((f) => f !== 'swelling') && (
                <p className="mt-3 flex items-start gap-2 rounded-2xl border border-stop/30 bg-stop/10 p-3 text-sm leading-snug" role="status">
                  <CircleAlert size={18} className="mt-px shrink-0 text-stop" aria-hidden />
                  <span>This stops provocative work today. If it persists, get it assessed. This app does not diagnose.</span>
                </p>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
