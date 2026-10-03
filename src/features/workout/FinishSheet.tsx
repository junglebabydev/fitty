import { useEffect, useState } from 'react'
import { Check, HeartPulse, Plus } from 'lucide-react'
import type { Region, WorkoutSession } from '../../domain/types'
import { isProgramSession, type Feel } from '../../domain/programs'
import { Button, Chip, NumberInput, Segmented, Sheet, Slider, TextInput } from '../../components'
import { getSetting } from '../../db/repositories'
import { getHealthBridge } from '../../native'
import { cx } from '../../lib/util'
import { REGION_LABELS, fmtVolume } from './helpers'
import { defaultPostPain, type SymptomChange, type SymptomChangeKind } from './finish'
import { recordFeel } from './program'

export interface FinishSheetProps {
  open: boolean
  onClose(): void
  session: WorkoutSession
  /** Regions reported today (morning / pre / during) with their latest pain, for the better/same/worse question. */
  regions: { region: Region; prePain: number }[]
  defaultDurationMin: number
  setCount: number
  /** Σ load × reps for the summary tiles. */
  volumeKg?: number
  /** Personal bests detected this session. */
  prCount?: number
  finishing: boolean
  onFinish(input: { rpe: number | null; durationMin: number; notes: string; symptomChanges: SymptomChange[]; writeToHealth: boolean }): void
}

const CHANGE_OPTIONS: { value: SymptomChangeKind; label: string }[] = [
  { value: 'better', label: 'Better' },
  { value: 'same', label: 'Same' },
  { value: 'worse', label: 'Worse' },
]

const FEEL_OPTIONS: { value: Feel; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'right', label: 'About right' },
  { value: 'hard', label: 'Too hard' },
]

/** Finish flow: what you did in one line, how a sore area feels now (only if one was reported) and, for a programme session, one optional "How did it feel?". */
export function FinishSheet({ open, onClose, session, regions, defaultDurationMin, setCount, volumeKg = 0, prCount = 0, finishing, onFinish }: FinishSheetProps) {
  const [duration, setDuration] = useState<number | null>(defaultDurationMin)
  const [editDuration, setEditDuration] = useState(false)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [changes, setChanges] = useState<Record<string, { change: SymptomChangeKind; postPain: number }>>({})
  const [writeHealth, setWriteHealth] = useState(false)
  const [feel, setFeel] = useState<Feel | null>(null)
  const program = isProgramSession(session)
  const [health, setHealth] = useState<{ enabled: boolean; available: boolean | null; reason: string | null }>({ enabled: false, available: null, reason: null })

  useEffect(() => {
    if (!open) return
    setDuration(defaultDurationMin)
    setEditDuration(false)
    setNote('')
    setNoteOpen(false)
    const init: Record<string, { change: SymptomChangeKind; postPain: number }> = {}
    for (const r of regions) init[r.region] = { change: 'same', postPain: r.prePain }
    setChanges(init)
    setFeel(null)
    const enabled = getSetting<boolean>('health.writeWorkouts', false)
    setHealth({ enabled, available: null, reason: null })
    setWriteHealth(false)
    if (enabled) {
      let live = true
      getHealthBridge().isAvailable()
        .then((r) => { if (live) { setHealth({ enabled, available: r.available, reason: r.reason ?? null }); setWriteHealth(r.available) } })
        .catch(() => { if (live) setHealth({ enabled, available: false, reason: 'Could not reach Apple Health.' }) })
      return () => { live = false }
    }
  }, [open, session.id, session.sessionRpe, defaultDurationMin, regions])

  const setChange = (region: Region, prePain: number, change: SymptomChangeKind) =>
    setChanges((prev) => ({ ...prev, [region]: { change, postPain: defaultPostPain(prePain, change) } }))

  const shownDuration = Math.max(1, Math.round(duration ?? defaultDurationMin))
  const healthUsable = health.enabled && health.available === true
  const healthOn = writeHealth && healthUsable

  const submit = () => {
    // Before finishing: the answer counts for the programme week the session belongs to. Optional, so it never blocks.
    if (program && feel) {
      try { recordFeel(session.id, feel) } catch { /* keep finishing */ }
    }
    const symptomChanges: SymptomChange[] = regions.map((r) => {
      const c = changes[r.region] ?? { change: 'same' as SymptomChangeKind, postPain: r.prePain }
      return { region: r.region, prePain: r.prePain, change: c.change, postPain: c.postPain }
    })
    // The session's own notes (planner rationale) are kept; a new note is added under them.
    const notes = [session.notes?.trim(), note.trim()].filter(Boolean).join('\n')
    onFinish({ rpe: session.sessionRpe ?? null, durationMin: shownDuration, notes, symptomChanges, writeToHealth: healthOn })
  }

  const stats: { value: string | number; unit: string; label: string }[] = [
    { value: shownDuration, unit: 'min', label: 'Time' },
    { value: setCount, unit: setCount === 1 ? 'set' : 'sets', label: 'Sets' },
    ...(volumeKg > 0 ? [{ value: fmtVolume(volumeKg), unit: 'kg', label: 'Volume' }] : []),
    ...(prCount > 0 ? [{ value: prCount, unit: prCount === 1 ? 'best' : 'bests', label: 'Personal bests' }] : []),
  ]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nice work"
      footer={
        <Button variant="primary" size="lg" full loading={finishing} icon={<Check size={20} />} onClick={submit}>
          Finish
        </Button>
      }
    >
      <div data-pillar="train" className="flex flex-col gap-7">
        {/* What you did: numbers only, no boxes. Time is tap-to-correct. */}
        <div>
          <dl className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="sr-only">{s.label}</dt>
                <dd className="flex items-baseline gap-1">
                  {s.label === 'Time' ? (
                    <button type="button" onClick={() => setEditDuration((v) => !v)} aria-expanded={editDuration} aria-label={`Time ${shownDuration} minutes. Tap to change`} className="press num text-4xl text-app underline decoration-line-strong decoration-1 underline-offset-[6px]">
                      {s.value}
                    </button>
                  ) : (
                    <span className={cx('num text-4xl', s.label === 'Personal bests' ? 'text-pillar' : 'text-app')}>{s.value}</span>
                  )}
                  <span className="text-sm text-muted">{s.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          {editDuration && (
            <div className="mt-3">
              <NumberInput value={duration} onChange={setDuration} unit="min" min={1} max={300} step={1} aria-label="Duration in minutes" />
            </div>
          )}
        </div>

        {regions.length > 0 && (
          <div className="flex flex-col gap-4">
            {regions.map((r) => {
              const c = changes[r.region] ?? { change: 'same' as SymptomChangeKind, postPain: r.prePain }
              return (
                <div key={r.region} className="flex flex-col gap-2">
                  <div className="text-[15px] font-medium text-app">How's your {REGION_LABELS[r.region].toLowerCase()} now?</div>
                  <Segmented options={CHANGE_OPTIONS} value={c.change} onChange={(v) => setChange(r.region, r.prePain, v)} label={`${REGION_LABELS[r.region]} now`} />
                  {c.change === 'worse' && (
                    <Slider
                      label="Pain now"
                      value={c.postPain}
                      onChange={(n) => setChanges((prev) => ({ ...prev, [r.region]: { change: 'worse', postPain: n } }))}
                      min={0}
                      max={10}
                      tone="auto"
                      suffix="/10"
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Programme sessions only: optional, and tapping the chosen answer again clears it, so nothing is recorded by default. */}
        {program && (
          <div className="flex flex-col gap-2">
            <div id="finish-feel-label" className="text-[15px] font-medium text-app">How did it feel?</div>
            <div role="group" aria-labelledby="finish-feel-label" className="grid grid-cols-3 gap-2">
              {FEEL_OPTIONS.map((o) => (
                <Chip key={o.value} selected={feel === o.value} onClick={() => setFeel((f) => (f === o.value ? null : o.value))} className="w-full px-2!">
                  {o.label}
                </Chip>
              ))}
            </div>
            {feel === 'hard' && <p className="text-[13px] text-muted leading-snug">Too hard repeats this week. That's normal.</p>}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {noteOpen ? (
            <TextInput multiline rows={2} autoFocus placeholder="Anything worth remembering?" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="press self-start min-h-11 inline-flex items-center gap-1.5 text-[15px] font-medium text-muted">
              <Plus size={16} aria-hidden />Add a note
            </button>
          )}

          {/* Only shown once Apple Health is switched on in Settings. */}
          {health.enabled && (
            <div className="flex items-center justify-between gap-3 min-h-11">
              <div className="flex items-center gap-2.5 min-w-0">
                <HeartPulse size={18} className="text-muted shrink-0" aria-hidden />
                <div className="min-w-0">
                  <div id="finish-health-label" className="text-[15px] text-app leading-tight">Save to Apple Health</div>
                  {health.available === false && <div className="text-[13px] text-muted mt-0.5 leading-snug">Unavailable: {health.reason ?? 'not supported here'}</div>}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={healthOn}
                aria-labelledby="finish-health-label"
                disabled={!healthUsable}
                onClick={() => setWriteHealth((v) => !v)}
                className="shrink-0 h-11 w-14 inline-flex items-center justify-center disabled:opacity-40"
              >
                <span className={cx('relative h-7 w-12 rounded-full border transition-colors duration-150', healthOn ? 'bg-ok border-ok' : 'bg-surface-3 border-line-strong')}>
                  <span className={cx('absolute top-0.5 h-[22px] w-[22px] rounded-full bg-surface shadow-float transition-[left] duration-150', healthOn ? 'left-[22px]' : 'left-0.5')} />
                </span>
                <span className="sr-only">{healthOn ? 'On' : 'Off'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
