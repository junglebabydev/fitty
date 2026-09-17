import { useEffect, useState } from 'react'
import { Check, Clock3, HeartPulse, Layers, Trophy, Weight } from 'lucide-react'
import type { Region, WorkoutSession } from '../../domain/types'
import { Button, Field, NumberInput, Segmented, Sheet, Slider, StatTile, TextInput } from '../../components'
import { getSetting } from '../../db/repositories'
import { getHealthBridge } from '../../native'
import { cx } from '../../lib/util'
import { REGION_LABELS, fmtVolume } from './helpers'
import { defaultPostPain, type SymptomChange, type SymptomChangeKind } from './finish'

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

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function rpeWord(n: number): string {
  if (n <= 3) return 'Easy'
  if (n <= 6) return 'Moderate'
  if (n <= 8) return 'Hard'
  if (n === 9) return 'Very hard'
  return 'Max effort'
}

/** Finish flow: summary tiles, session RPE chips, post-workout symptom change per region, notes, optional Health write. */
export function FinishSheet({ open, onClose, session, regions, defaultDurationMin, setCount, volumeKg = 0, prCount = 0, finishing, onFinish }: FinishSheetProps) {
  const [rpe, setRpe] = useState(7)
  const [duration, setDuration] = useState<number | null>(defaultDurationMin)
  const [notes, setNotes] = useState('')
  const [changes, setChanges] = useState<Record<string, { change: SymptomChangeKind; postPain: number }>>({})
  const [writeHealth, setWriteHealth] = useState(false)
  const [health, setHealth] = useState<{ enabled: boolean; available: boolean | null; reason: string | null }>({ enabled: false, available: null, reason: null })

  useEffect(() => {
    if (!open) return
    setRpe(session.sessionRpe ?? 7)
    setDuration(defaultDurationMin)
    setNotes(session.notes ?? '')
    const init: Record<string, { change: SymptomChangeKind; postPain: number }> = {}
    for (const r of regions) init[r.region] = { change: 'same', postPain: r.prePain }
    setChanges(init)
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
  }, [open, session.id, session.sessionRpe, session.notes, defaultDurationMin, regions])

  const setChange = (region: Region, prePain: number, change: SymptomChangeKind) =>
    setChanges((prev) => ({ ...prev, [region]: { change, postPain: defaultPostPain(prePain, change) } }))

  const submit = () => {
    const symptomChanges: SymptomChange[] = regions.map((r) => {
      const c = changes[r.region] ?? { change: 'same' as SymptomChangeKind, postPain: r.prePain }
      return { region: r.region, prePain: r.prePain, change: c.change, postPain: c.postPain }
    })
    onFinish({
      rpe,
      durationMin: Math.max(1, Math.round(duration ?? defaultDurationMin)),
      notes,
      symptomChanges,
      writeToHealth: writeHealth && health.enabled && health.available === true,
    })
  }

  const healthOn = writeHealth && health.enabled && health.available === true
  const healthUsable = health.enabled && health.available === true
  const shownDuration = Math.max(1, Math.round(duration ?? defaultDurationMin))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish session"
      footer={
        <Button variant="primary" size="lg" full loading={finishing} icon={<Check size={20} />} onClick={submit}>
          Finish · {setCount} {setCount === 1 ? 'set' : 'sets'} logged
        </Button>
      }
    >
      <div data-pillar="train" className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Volume" value={volumeKg > 0 ? fmtVolume(volumeKg) : '—'} unit={volumeKg > 0 ? 'kg' : undefined} icon={Weight} pillar="train" />
          <StatTile label="Duration" value={shownDuration} unit="min" icon={Clock3} />
          <StatTile label="Sets" value={setCount} icon={Layers} />
          <StatTile label="Personal bests" value={prCount} icon={Trophy} />
        </div>

        <div role="radiogroup" aria-label="Session effort, RPE 1 to 10">
          <div className="flex items-baseline justify-between mb-2">
            <span className="eyebrow text-muted">Session effort · RPE</span>
            <span className="text-sm text-muted"><span className="num text-xl text-app">{rpe}</span> · {rpeWord(rpe)}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {RPE_VALUES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rpe === n}
                aria-label={`RPE ${n}, ${rpeWord(n)}`}
                onClick={() => setRpe(n)}
                className={cx(
                  'press h-11 rounded-xl border num text-xl',
                  rpe === n ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-muted border-line',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {regions.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="eyebrow text-muted">How do the areas you reported feel now?</div>
            {regions.map((r) => {
              const c = changes[r.region] ?? { change: 'same' as SymptomChangeKind, postPain: r.prePain }
              return (
                <div key={r.region} className="rounded-xl border border-line bg-surface-2 px-3 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-[15px]">{REGION_LABELS[r.region]}</span>
                    <span className="text-[13px] text-muted">was <span className="num text-base text-app">{r.prePain}</span> / 10</span>
                  </div>
                  <Segmented options={CHANGE_OPTIONS} value={c.change} onChange={(v) => setChange(r.region, r.prePain, v)} label={`${REGION_LABELS[r.region]} now`} />
                  {c.change === 'worse' && (
                    <div className="mt-3">
                      <Slider
                        label="Pain now"
                        value={c.postPain}
                        onChange={(n) => setChanges((prev) => ({ ...prev, [r.region]: { change: 'worse', postPain: n } }))}
                        min={0}
                        max={10}
                        tone="auto"
                        suffix="/10"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <Field label="Duration" hint="Counted automatically from when you started.">
          <NumberInput value={duration} onChange={setDuration} unit="min" min={1} max={300} step={1} />
        </Field>

        <Field label="Notes">
          <TextInput multiline rows={2} placeholder="Anything worth remembering?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="rounded-xl border border-line px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <HeartPulse size={18} className="text-muted shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <div id="finish-health-label" className="text-[15px] font-medium leading-tight">Write summary to Apple Health</div>
              <div className="text-[13px] text-muted mt-0.5 leading-snug">
                {!health.enabled
                  ? 'Off — enable in Settings → Apple Health.'
                  : health.available === null
                    ? 'Checking availability…'
                    : health.available
                      ? 'Name, type and duration only.'
                      : `Unavailable: ${health.reason ?? 'not supported here'}`}
              </div>
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
      </div>
    </Sheet>
  )
}
