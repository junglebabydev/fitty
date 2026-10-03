import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, ShieldAlert, TriangleAlert } from 'lucide-react'
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
 * Pre-workout symptom gate (PRD §7.2), one question first: "Anything hurting today?"
 * "All good" starts in one tap (every gate region at 0, no flags). "Something hurts" asks where,
 * then pain 0–10 and red flags for just those areas. Answers become 'pre_workout' symptom checks.
 */
export function SymptomGateSheet({ open, sessionName, initial, onStart, onDismiss, onClose, starting = false }: SymptomGateSheetProps) {
  const [rows, setRows] = useState<RegionState[]>([])
  const [earlier, setEarlier] = useState<RegionState[]>([])
  const [detail, setDetail] = useState(false)
  const [showExtra, setShowExtra] = useState(false)

  // Re-prefill whenever the sheet (re)opens. Areas reported earlier today can be reused in one tap.
  useEffect(() => {
    if (!open) return
    const reported = buildInitial(initial).filter((r) => r.pain > 0 || r.flags.size)
    setEarlier(reported)
    setRows(reported)
    setDetail(false)
    setShowExtra(false)
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

  const toggleRegion = (region: Region) =>
    setRows((prev) => (prev.some((r) => r.region === region) ? prev.filter((r) => r.region !== region) : [...prev, { region, pain: 3, flags: new Set() }]))

  const summary = useMemo(() => {
    const worst = Math.max(0, ...rows.map((r) => r.pain))
    const anyFlag = rows.some((r) => [...r.flags].some((f) => f !== 'swelling'))
    if (anyFlag || worst >= 6) return { tone: 'red' as const, text: 'Provocative exercises will be blocked today.' }
    if (worst >= 3 || rows.some((r) => r.flags.has('swelling'))) return { tone: 'amber' as const, text: 'Gentler options will be swapped in.' }
    return null
  }, [rows])

  // Every gate region is always reported (0 when not picked), plus any extra area picked.
  const submit = (picked: RegionState[]) => {
    const all = [...GATE_REGIONS.map((region) => picked.find((r) => r.region === region) ?? { region, pain: 0, flags: new Set<keyof RedFlags>() }),
      ...picked.filter((r) => !GATE_REGIONS.includes(r.region))]
    onStart(all.map((r) => {
      const redFlags: RedFlags = {}
      for (const f of r.flags) redFlags[f] = true
      return { region: r.region, painScore: r.pain, redFlags }
    }))
  }

  const areaChoices = showExtra ? [...GATE_REGIONS, ...EXTRA_REGIONS] : GATE_REGIONS
  const SummaryIcon = summary?.tone === 'red' ? ShieldAlert : TriangleAlert

  return (
    <Sheet
      open={open}
      onClose={onClose ?? onDismiss}
      title={detail ? 'Where does it hurt?' : earlier.length > 0 ? 'How is it now?' : 'Anything hurting today?'}
      footer={
        detail ? (
          <div className="flex flex-col gap-1">
            <Button variant="primary" size="lg" full onClick={() => submit(rows)} loading={starting}>
              {rows.length === 0 ? 'Nothing hurts, start' : `Start ${sessionName}`}
            </Button>
            <Button variant="ghost" full onClick={() => { setDetail(false); setRows(earlier) }}>Back</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {earlier.length > 0 ? (
              <>
                <Button variant="primary" size="lg" full onClick={() => submit(earlier)} loading={starting} icon={<Check size={20} />}>
                  Same as earlier, start
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => setDetail(true)}>It's changed</Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="lg" full onClick={() => submit([])} loading={starting} icon={<Check size={20} />}>
                  All good, start
                </Button>
                <Button variant="secondary" size="lg" full onClick={() => { setRows([]); setDetail(true) }}>Something hurts</Button>
              </>
            )}
            <Button variant="ghost" full onClick={onDismiss}>Not today</Button>
          </div>
        )
      }
    >
      <div data-pillar="train" className="flex flex-col gap-5">
        {!detail ? (
          <p className="text-[15px] text-muted leading-snug">
            {earlier.length > 0
              ? `Earlier today: ${earlier.map((r) => `${REGION_LABELS[r.region].toLowerCase()} ${r.pain}/10`).join(', ')}.`
              : "Knees, back or neck. It only shapes today's exercises."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Areas that hurt">
              {areaChoices.map((region) => {
                const on = rows.some((r) => r.region === region)
                return (
                  <button
                    key={region}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleRegion(region)}
                    className={cx('press h-11 px-4 rounded-full text-[15px] font-medium', on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-app')}
                  >
                    {REGION_LABELS[region]}
                  </button>
                )
              })}
              {!showExtra && (
                <button type="button" onClick={() => setShowExtra(true)} className="press h-11 px-3 inline-flex items-center gap-1 text-[15px] font-medium text-muted">
                  <Plus size={16} aria-hidden />More
                </button>
              )}
            </div>

            {rows.map((r) => (
              <div key={r.region} className="flex flex-col gap-3">
                <Slider
                  label={REGION_LABELS[r.region]}
                  value={r.pain}
                  onChange={(n) => update(r.region, { pain: n })}
                  min={0}
                  max={10}
                  tone="auto"
                  suffix="/10"
                  labels={['Mild', 'Worst']}
                />
                <RedFlagToggles keys={flagsForRegion(r.region)} active={r.flags} onToggle={(k) => update(r.region, { toggle: k })} />
              </div>
            ))}

            {summary && (
              <div aria-live="polite" className={cx('flex items-start gap-2 text-sm font-medium leading-snug', summary.tone === 'red' ? 'text-stop' : 'text-warn')}>
                <SummaryIcon size={16} className="shrink-0 mt-px" aria-hidden />
                <span>{summary.text}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
