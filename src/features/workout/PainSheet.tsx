import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Minus, Play, ShieldAlert, ShieldCheck, Square, TriangleAlert } from 'lucide-react'
import type { Exercise, RedFlags, Region, SymptomCheck } from '../../domain/types'
import { Button, Chip, Sheet, Slider, TextInput } from '../../components'
import { addSymptomCheck } from '../../db/repositories'
import { regionLabel, type GateResult } from '../../engine'
import { cx, nowIso } from '../../lib/util'
import { ALL_REGIONS, REGION_LABELS, flagsForRegion, guessRegion } from './helpers'
import { RedFlagToggles } from './SymptomGateSheet'
import { todaysGate } from './gate'

export type PainLevel = 'monitor' | 'amber' | 'red'
export type PainAction = 'continue' | 'substitute' | 'reduce_load' | 'stop'

export interface PainOutcome {
  check: Omit<SymptomCheck, 'id'> & { id: number }
  gate: GateResult
  level: PainLevel
  action: PainAction
}

export interface PainSheetProps {
  open: boolean
  onClose(): void
  exercise: Exercise | null
  sessionId: number
  /** Called after the check is saved and the user picks what to do. */
  onOutcome(outcome: PainOutcome): void
}

function levelFor(pain: number, flags: Set<keyof RedFlags>): PainLevel {
  const hard = [...flags].some((f) => f !== 'swelling')
  if (hard || pain > 5) return 'red'
  if (pain >= 3 || flags.has('swelling')) return 'amber'
  return 'monitor'
}

/**
 * Pain / Issue report during a set (PRD §9.3): region, pain 0–10, red flags and a note.
 * Saves a 'during_workout' symptom check, then offers the safety-appropriate next step.
 */
export function PainSheet({ open, onClose, exercise, sessionId, onOutcome }: PainSheetProps) {
  const [region, setRegion] = useState<Region>('other')
  const [pain, setPain] = useState(3)
  const [flags, setFlags] = useState<Set<keyof RedFlags>>(new Set())
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<{ check: PainOutcome['check']; gate: GateResult } | null>(null)

  // Keyed on the exercise id, not the object: the library re-queries on every DB write
  // (including saving this report), which would otherwise reset the form mid-flow.
  const exerciseId = exercise?.id ?? null
  useEffect(() => {
    if (open) {
      setRegion(exercise ? guessRegion(exercise) : 'other')
      setPain(3)
      setFlags(new Set())
      setNote('')
      setSaved(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exerciseId])

  const level = useMemo(() => levelFor(pain, flags), [pain, flags])
  const allowedFlags = flagsForRegion(region)

  const toggle = (k: keyof RedFlags) => setFlags((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  const save = () => {
    const redFlags: RedFlags = {}
    for (const f of flags) redFlags[f] = true
    const row: Omit<SymptomCheck, 'id'> = {
      ts: nowIso(),
      region,
      painScore: pain,
      redFlags,
      notes: [exercise ? `During ${exercise.name}` : 'During workout', note.trim()].filter(Boolean).join(': '),
      context: 'during_workout',
      sessionId,
      exerciseId: exercise?.id ?? null,
    }
    const id = addSymptomCheck(row)
    setSaved({ check: { ...row, id }, gate: todaysGate() })
  }

  const finish = (action: PainAction) => {
    if (!saved) return
    onOutcome({ check: saved.check, gate: saved.gate, level, action })
  }

  const LevelIcon = level === 'red' ? ShieldAlert : level === 'amber' ? TriangleAlert : ShieldCheck
  const regionAdvice = saved ? saved.gate.advice.filter((a) => a.toLowerCase().startsWith(regionLabel(region).toLowerCase())) : []

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={saved ? 'Noted' : 'Pain / issue'}
      footer={
        saved ? (
          <div className="flex flex-col gap-2">
            {level === 'red' ? (
              <Button variant="danger" size="lg" full icon={<Square size={18} />} onClick={() => finish('stop')}>
                Stop this exercise
              </Button>
            ) : level === 'amber' ? (
              <>
                <Button variant="primary" size="lg" full icon={<ArrowLeftRight size={18} />} onClick={() => finish('substitute')}>
                  Substitute exercise
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<Minus size={16} />} onClick={() => finish('reduce_load')}>Reduce load 10%</Button>
                  <Button variant="outline" icon={<Play size={16} />} onClick={() => finish('continue')}>Continue carefully</Button>
                </div>
              </>
            ) : (
              <Button variant="primary" size="lg" full onClick={() => finish('continue')}>Continue while monitoring</Button>
            )}
          </div>
        ) : (
          <Button variant="primary" size="lg" full onClick={save}>Save report</Button>
        )
      }
    >
      {!saved ? (
        <div data-pillar="train" className="flex flex-col gap-4">
          {exercise && <div className="text-[15px] text-muted">While doing <span className="font-semibold text-app">{exercise.name}</span>.</div>}
          <div>
            <div className="eyebrow text-muted mb-2">Where</div>
            <div className="flex flex-wrap gap-2">
              {ALL_REGIONS.map((r) => (
                <Chip key={r} selected={region === r} onClick={() => { setRegion(r); setFlags(new Set()) }} className="h-11">{REGION_LABELS[r]}</Chip>
              ))}
            </div>
          </div>
          <div className="rounded-[1.25rem] border border-line bg-surface-2 px-3.5 py-3.5">
            <Slider label="Pain right now" value={pain} onChange={setPain} min={0} max={10} tone="auto" suffix="/10" labels={['None', 'Worst']} />
          </div>
          <div>
            <div className="eyebrow text-muted mb-2">Anything like this?</div>
            <RedFlagToggles keys={allowedFlags} active={flags} onToggle={toggle} />
          </div>
          <TextInput placeholder="What happened? (optional)" aria-label="What happened (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div
            aria-live="polite"
            className={cx(
              'rounded-xl border px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5',
              level === 'red' && 'border-stop/40 bg-stop/10 text-stop',
              level === 'amber' && 'border-warn/40 bg-warn/10 text-warn',
              level === 'monitor' && 'border-ok/40 bg-ok/10 text-ok',
            )}
          >
            <LevelIcon size={17} className="shrink-0 mt-px" aria-hidden />
            <span>
              {level === 'red' && 'This will stop provocative work for the area today and flag the set.'}
              {level === 'amber' && 'This flags the set and offers a gentler option or a lighter load.'}
              {level === 'monitor' && 'Mild — the set gets a pain flag and progression holds; keep the range pain-free.'}
            </span>
          </div>
          <p className="text-[13px] text-muted leading-snug">This report only changes today's training — it never diagnoses anything.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={cx(
            'rounded-[1.25rem] border px-4 py-3.5 flex items-start gap-3',
            level === 'red' && 'border-stop/40 bg-stop/5',
            level === 'amber' && 'border-warn/40 bg-warn/5',
            level === 'monitor' && 'border-ok/40 bg-ok/5',
          )}>
            <LevelIcon size={22} className={cx('shrink-0', level === 'red' ? 'text-stop' : level === 'amber' ? 'text-warn' : 'text-ok')} aria-hidden />
            <div className="text-[15px] leading-snug">
              <div className="font-semibold">
                {level === 'red' && `${REGION_LABELS[region]}: stop loading it today`}
                {level === 'amber' && `${REGION_LABELS[region]}: modify, don't push through`}
                {level === 'monitor' && `${REGION_LABELS[region]}: mild — noted`}
              </div>
              <div className="text-muted text-sm mt-1">
                {level === 'red'
                  ? 'Provocative exercises for this area are blocked for the rest of the session. If pain above 5/10 or red-flag symptoms (locking, giving way, numbness, weakness, radiating) persist, get an appropriate clinical assessment — this app does not diagnose.'
                  : level === 'amber'
                    ? 'The current set is flagged and progression holds. Swap to a gentler option or drop the load; avoid the range that provokes it.'
                    : 'The set is flagged so progression will hold next time. Reduce range or load if it climbs.'}
              </div>
            </div>
          </div>
          {regionAdvice.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm text-muted px-1">
              {regionAdvice.map((a, i) => <li key={i} className="flex gap-2"><span className="text-faint" aria-hidden>—</span><span>{a}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}
