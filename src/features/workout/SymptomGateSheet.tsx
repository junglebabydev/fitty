import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { RedFlags, Region } from '../../domain/types'
import { Button, Sheet, Slider } from '../../components'
import { cx } from '../../lib/util'
import { GATE_REGIONS, RED_FLAG_OPTIONS, REGION_LABELS, activeFlagKeys, flagsForRegion } from './helpers'
import type { GateEntry } from './gate'

export interface SymptomGateSheetProps {
  open: boolean
  sessionName: string
  /** Latest values reported earlier today, used to prefill. */
  initial: Partial<Record<Region, { painScore: number; redFlags: RedFlags }>>
  onStart(entries: GateEntry[]): void
  /** "Not today" — leave the session planned and go back. */
  onDismiss(): void
  /** X / backdrop — hide the sheet without leaving the screen (defaults to onDismiss). */
  onClose?(): void
  starting?: boolean
}

interface RegionState { region: Region; pain: number; flags: Set<keyof RedFlags> }

const EXTRA_REGIONS: Region[] = ['back_mid', 'back_upper', 'shoulder', 'hip', 'other']

function buildInitial(initial: SymptomGateSheetProps['initial']): RegionState[] {
  const rows: RegionState[] = GATE_REGIONS.map((region) => ({
    region,
    pain: initial[region]?.painScore ?? 0,
    flags: new Set(activeFlagKeys(initial[region]?.redFlags)),
  }))
  for (const region of EXTRA_REGIONS) {
    const v = initial[region]
    if (v && (v.painScore > 0 || activeFlagKeys(v.redFlags).length)) {
      rows.push({ region, pain: v.painScore, flags: new Set(activeFlagKeys(v.redFlags)) })
    }
  }
  return rows
}

/** Red-flag toggles: icon + word + a check when on (never colour alone). Swelling is a caution, the rest stop provocative work. */
export function RedFlagToggles({ keys, active, onToggle }: { keys: (keyof RedFlags)[]; active: Set<keyof RedFlags>; onToggle(k: keyof RedFlags): void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {RED_FLAG_OPTIONS.filter((o) => keys.includes(o.key)).map((o) => {
        const on = active.has(o.key)
        const Icon = o.icon
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            title={o.hint}
            onClick={() => onToggle(o.key)}
            className={cx(
              'press inline-flex items-center gap-1.5 h-11 px-3 rounded-xl border text-sm font-medium',
              on
                ? o.key === 'swelling' ? 'bg-warn/15 border-warn/50 text-warn' : 'bg-stop/15 border-stop/50 text-stop'
                : 'bg-surface border-line text-app',
            )}
          >
            <Icon size={15} aria-hidden />
            {o.label}
            {on && <Check size={14} strokeWidth={3} aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Pre-workout symptom gate (PRD §7.2): knees, back and neck pain 0–10 plus red-flag symptoms.
 * Shown before a planned session starts; the answers become 'pre_workout' symptom checks.
 */
export function SymptomGateSheet({ open, sessionName, initial, onStart, onDismiss, onClose, starting = false }: SymptomGateSheetProps) {
  const [rows, setRows] = useState<RegionState[]>(() => buildInitial(initial))
  const [showExtra, setShowExtra] = useState(false)

  // Re-prefill whenever the sheet (re)opens.
  useEffect(() => {
    if (open) { setRows(buildInitial(initial)); setShowExtra(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const update = (region: Region, patch: Partial<Pick<RegionState, 'pain'>> | { toggle: keyof RedFlags }) => {
    setRows((prev) => prev.map((r) => {
      if (r.region !== region) return r
      if ('toggle' in patch) {
        const flags = new Set(r.flags)
        if (flags.has(patch.toggle)) flags.delete(patch.toggle); else flags.add(patch.toggle)
        return { ...r, flags }
      }
      return { ...r, ...patch }
    }))
  }

  const addRegion = (region: Region) => {
    setRows((prev) => (prev.some((r) => r.region === region) ? prev : [...prev, { region, pain: 0, flags: new Set() }]))
    setShowExtra(false)
  }

  const summary = useMemo(() => {
    const hot = rows.filter((r) => r.pain > 0 || r.flags.size)
    const worst = Math.max(0, ...rows.map((r) => r.pain))
    const anyFlag = rows.some((r) => [...r.flags].some((f) => f !== 'swelling'))
    if (anyFlag || worst >= 6) return { tone: 'red' as const, text: 'Red-flag symptoms or high pain — provocative exercises will be blocked.' }
    if (worst >= 3 || rows.some((r) => r.flags.has('swelling'))) return { tone: 'amber' as const, text: 'Moderate symptoms — the plan will swap in gentler options.' }
    if (hot.length) return { tone: 'green' as const, text: 'Mild soreness only — proceed while monitoring.' }
    return { tone: 'green' as const, text: 'Nothing flagged — run the plan as written.' }
  }, [rows])

  const available = EXTRA_REGIONS.filter((r) => !rows.some((x) => x.region === r))

  const submit = () => {
    onStart(rows.map((r) => {
      const redFlags: RedFlags = {}
      for (const f of r.flags) redFlags[f] = true
      return { region: r.region, painScore: r.pain, redFlags }
    }))
  }

  const SummaryIcon = summary.tone === 'red' ? ShieldAlert : summary.tone === 'amber' ? TriangleAlert : ShieldCheck

  return (
    <Sheet
      open={open}
      onClose={onClose ?? onDismiss}
      title="Quick symptom check"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" full onClick={submit} loading={starting} icon={<ShieldCheck size={20} />}>
            Start {sessionName}
          </Button>
          <Button variant="ghost" full onClick={onDismiss}>Not today</Button>
        </div>
      }
    >
      <div data-pillar="train" className="flex flex-col gap-4">
        <div>
          <p className="voice text-xl text-app">How are the knees, back and neck right now?</p>
          <p className="text-sm text-muted mt-1.5 leading-snug">
            Thirty seconds. Your answers only shape today's exercise choices — this check never diagnoses anything.
          </p>
        </div>

        <div
          aria-live="polite"
          className={cx(
            'rounded-xl border px-3 py-2.5 text-sm font-medium leading-snug flex items-start gap-2.5',
            summary.tone === 'red' && 'border-stop/40 bg-stop/10 text-stop',
            summary.tone === 'amber' && 'border-warn/40 bg-warn/10 text-warn',
            summary.tone === 'green' && 'border-ok/40 bg-ok/10 text-ok',
          )}
        >
          <SummaryIcon size={17} className="shrink-0 mt-px" aria-hidden />
          <span>{summary.text}</span>
        </div>

        {rows.map((r) => (
          <div key={r.region} className="rounded-[1.25rem] border border-line bg-surface-2 px-3.5 py-3.5">
            <Slider
              label={REGION_LABELS[r.region]}
              value={r.pain}
              onChange={(n) => update(r.region, { pain: n })}
              min={0}
              max={10}
              tone="auto"
              suffix="/10"
              labels={['No pain', 'Worst']}
            />
            <div className="eyebrow text-muted mt-3 mb-2">Any of these?</div>
            <RedFlagToggles keys={flagsForRegion(r.region)} active={r.flags} onToggle={(k) => update(r.region, { toggle: k })} />
          </div>
        ))}

        {available.length > 0 && (
          showExtra ? (
            <div className="flex flex-wrap gap-2">
              {available.map((r) => (
                <button key={r} type="button" onClick={() => addRegion(r)} className="press inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl border border-line bg-surface text-sm font-medium">
                  <Plus size={15} aria-hidden />{REGION_LABELS[r]}
                </button>
              ))}
            </div>
          ) : (
            <Button variant="ghost" icon={<Plus size={16} />} onClick={() => setShowExtra(true)}>
              Another area
            </Button>
          )
        )}

        <p className="text-[13px] text-muted leading-snug">
          If something gets flagged, the plan swaps in gentler options and lists each substitution with its reason before you start.
        </p>
      </div>
    </Sheet>
  )
}
