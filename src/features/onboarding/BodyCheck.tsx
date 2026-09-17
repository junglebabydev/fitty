// Body check: tap the front / back figure to mark areas to look after. Each mark becomes a
// condition flag (existing table): a short label + "what aggravates it" chips kept in its notes.
// MuscleMap has no tap API and maps muscles, not joints, so this step draws its own figure.
import { useState } from 'react'
import { Check, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Chip, Field, Sheet, TextInput } from '../../components'
import type { Region } from '../../domain/types'
import { cx } from '../../lib/util'
import { newConditionDraft, type ConditionDraft } from '../settings/onboarding'
import { CONDITION_SUGGESTIONS, REGION_LABEL } from '../settings/options'
import { AGGRAVATOR_OPTIONS } from './options'
import { composeAggravators, parseAggravators } from './state'
import { Hint, toggleValue } from './ui'

const W = 150
const H = 300

/** Hotspot centres in the 150 × 300 figure box. 44px targets, ≥ 8px apart. */
const FRONT: { region: Region; x: number; y: number }[] = [
  { region: 'neck', x: 75, y: 52 },
  { region: 'shoulder', x: 24, y: 86 },
  { region: 'shoulder', x: 126, y: 86 },
  { region: 'hip', x: 75, y: 158 },
  { region: 'knee_right', x: 47, y: 222 },
  { region: 'knee_left', x: 103, y: 222 },
]
const BACK: { region: Region; x: number; y: number }[] = [
  { region: 'back_upper', x: 75, y: 66 },
  { region: 'back_mid', x: 75, y: 120 },
  { region: 'back_lower', x: 75, y: 174 },
]

function Figure({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} fill="none" stroke="var(--c-line-strong)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="75" cy="24" r="15" fill="var(--c-surface-2)" />
      {/* torso */}
      <path d="M62 42 L88 42 L112 56 Q120 60 120 70 L116 146 Q115 160 106 166 L44 166 Q35 160 34 146 L30 70 Q30 60 38 56 Z" fill="var(--c-surface-2)" />
      {/* arms */}
      <path d="M32 64 Q18 70 16 92 L12 150 Q11 158 17 158 Q23 158 24 150 L33 96" fill="var(--c-surface-2)" />
      <path d="M118 64 Q132 70 134 92 L138 150 Q139 158 133 158 Q127 158 126 150 L117 96" fill="var(--c-surface-2)" />
      {/* legs */}
      <path d="M44 166 L40 226 L42 284 Q42 292 50 292 Q58 292 58 284 L62 226 L75 176 L88 226 L92 284 Q92 292 100 292 Q108 292 108 284 L110 226 L106 166 Z" fill="var(--c-surface-2)" />
      {back ? <path d="M75 46 L75 160" strokeDasharray="3 5" /> : <path d="M58 70 Q75 80 92 70 M75 84 L75 140" strokeOpacity={0.7} />}
    </svg>
  )
}

function Side({ title, spots, marked, onTap, back }: { title: string; spots: typeof FRONT; marked: Set<Region>; onTap: (r: Region) => void; back?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="eyebrow text-muted">{title}</p>
      <div className="relative" style={{ width: W, height: H }}>
        <Figure back={back} />
        {spots.map((h, i) => {
          const on = marked.has(h.region)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              aria-label={`${REGION_LABEL[h.region]}${on ? ', marked' : ''}`}
              onClick={() => onTap(h.region)}
              className="press absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
              style={{ left: h.x, top: h.y }}
            >
              <span
                className={cx(
                  'inline-flex items-center justify-center rounded-full border transition-all',
                  on ? 'h-8 w-8 bg-pillar border-transparent text-accent-fg anim-pop' : 'h-5 w-5 bg-surface border-line-strong',
                )}
              >
                {on ? <Check size={16} strokeWidth={3} aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-faint)]" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function BodyCheck({ conditions, onChange }: { conditions: ConditionDraft[]; onChange: (next: ConditionDraft[]) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const marked = new Set(conditions.map((c) => c.region))
  const open = conditions.find((c) => c.key === openKey) ?? null

  const tap = (region: Region) => {
    const existing = conditions.find((c) => c.region === region)
    if (existing) {
      setOpenKey(existing.key)
      return
    }
    // The label defaults to the area's name: never empty, never a diagnosis.
    const draft = newConditionDraft(region, REGION_LABEL[region])
    onChange([...conditions, draft])
    setOpenKey(draft.key)
  }
  const patch = (key: string, p: Partial<ConditionDraft>) => onChange(conditions.map((c) => (c.key === key ? { ...c, ...p } : c)))
  const remove = (key: string) => {
    onChange(conditions.filter((c) => c.key !== key))
    setOpenKey(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center gap-4">
        <Side title="Front" spots={FRONT} marked={marked} onTap={tap} />
        <Side title="Back" spots={BACK} marked={marked} onTap={tap} back />
      </div>

      <div role="group" aria-label="Marked areas" className="flex flex-wrap justify-center gap-2.5">
        {conditions.map((c) => (
          <Chip key={c.key} selected check onClick={() => setOpenKey(c.key)} aria-label={`Edit ${REGION_LABEL[c.region]}`}>
            {c.label.trim() && c.label.trim() !== REGION_LABEL[c.region] ? `${REGION_LABEL[c.region]} · ${c.label.trim()}` : REGION_LABEL[c.region]}
          </Chip>
        ))}
        <Chip icon={<Plus size={15} />} onClick={() => tap('other')} selected={false}>
          Somewhere else
        </Chip>
      </div>

      <Hint icon={<ShieldCheck size={16} />}>This shapes exercise choice. It never diagnoses.</Hint>

      <Sheet
        open={open !== null}
        onClose={() => setOpenKey(null)}
        title={open ? REGION_LABEL[open.region] : ''}
        footer={
          open && (
            <div className="flex gap-3">
              <Button variant="secondary" size="lg" icon={<Trash2 size={18} />} onClick={() => remove(open.key)}>
                Remove
              </Button>
              <Button size="lg" full onClick={() => setOpenKey(null)}>
                Done
              </Button>
            </div>
          )
        }
      >
        {open && <ConditionForm draft={open} onChange={(p) => patch(open.key, p)} />}
      </Sheet>
    </div>
  )
}

function ConditionForm({ draft, onChange }: { draft: ConditionDraft; onChange: (p: Partial<ConditionDraft>) => void }) {
  const { aggravators, rest } = parseAggravators(draft.baselineNotes)
  const suggestions = CONDITION_SUGGESTIONS[draft.region] ?? []
  const id = `bc-${draft.key}`
  return (
    <div className="flex flex-col gap-5 pb-2">
      <Field label="What do you call it?" htmlFor={id} hint="Your words, or what your clinician called it.">
        <TextInput id={id} value={draft.label} onChange={(e) => onChange({ label: e.currentTarget.value })} placeholder={REGION_LABEL[draft.region]} />
        <div className="flex flex-wrap gap-2 mt-2">
          {suggestions.map((sg) => (
            <Chip key={sg} selected={draft.label.trim() === sg} onClick={() => onChange({ label: sg })}>
              {sg}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="What aggravates it?">
        <div role="group" aria-label="What aggravates it" className="flex flex-wrap gap-2">
          {AGGRAVATOR_OPTIONS.map((opt) => (
            <Chip key={opt} selected={aggravators.includes(opt)} check onClick={() => onChange({ baselineNotes: composeAggravators(toggleValue(aggravators, opt), rest) })}>
              {opt}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}
