import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Ban, Check, Sparkles } from 'lucide-react'
import type { Exercise } from '../../domain/types'
import { Button, Chip, Sheet, TextInput } from '../../components'
import { findSubstitute, isExerciseAllowed, type GateResult } from '../../engine'
import { cx } from '../../lib/util'
import { SAFETY_TAG_SHORT } from './helpers'

export interface SubstituteSheetProps {
  open: boolean
  onClose(): void
  exercise: Exercise | null
  gate: GateResult
  library: Exercise[]
  /** Exercise ids already programmed in the session (deprioritised, never hidden). */
  inSessionIds: string[]
  /** Reason prefilled from a voice request or a pain report. */
  initialReason?: string
  onPick(sub: Exercise, reason: string): void
}

const QUICK_REASONS = ['Knee', 'Back', 'Neck', 'Shoulder', 'Equipment busy', 'Preference']

interface Candidate { ex: Exercise; source: 'recommended' | 'listed' | 'pattern'; allowed: boolean; reasons: string[] }

/** Why each alternative is offered — shown on every row. */
const SOURCE_WHY: Record<Candidate['source'], string> = {
  recommended: "Closest match that avoids today's flagged areas",
  listed: 'A listed swap for this exercise',
  pattern: 'Same movement pattern',
}

/** Substitute picker: gate-safe listed substitutions first, then same-pattern options; blocked ones are shown greyed. */
export function SubstituteSheet({ open, onClose, exercise, gate, library, inSessionIds, initialReason, onPick }: SubstituteSheetProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) { setPicked(null); setReason(initialReason ?? ''); setNote('') }
  }, [open, initialReason])

  const candidates = useMemo<Candidate[]>(() => {
    if (!exercise) return []
    const byId = new Map(library.map((e) => [e.id, e]))
    const seen = new Set<string>([exercise.id])
    const out: Candidate[] = []
    const rec = findSubstitute(exercise, gate, library.filter((e) => !inSessionIds.includes(e.id))) ?? findSubstitute(exercise, gate, library)
    if (rec) { out.push({ ex: rec, source: 'recommended', allowed: true, reasons: [] }); seen.add(rec.id) }
    for (const id of exercise.substitutions) {
      const ex = byId.get(id)
      if (!ex || seen.has(id)) continue
      seen.add(id)
      const check = isExerciseAllowed(ex, gate)
      out.push({ ex, source: 'listed', allowed: check.allowed, reasons: check.reasons })
    }
    const same = library
      .filter((e) => e.pattern === exercise.pattern && !seen.has(e.id))
      .map((ex) => ({ ex, check: isExerciseAllowed(ex, gate) }))
      .sort((a, b) => Number(b.check.allowed) - Number(a.check.allowed) || a.ex.safetyTags.length - b.ex.safetyTags.length)
    for (const s of same) out.push({ ex: s.ex, source: 'pattern', allowed: s.check.allowed, reasons: s.check.reasons })
    // Allowed first, blocked last.
    return out.filter((c) => c.allowed).concat(out.filter((c) => !c.allowed))
  }, [exercise, gate, library, inSessionIds])

  const chosen = candidates.find((c) => c.ex.id === picked) ?? null
  const finalReason = [reason, note.trim()].filter(Boolean).join(' — ')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exercise ? `Swap ${exercise.name}` : 'Substitute'}
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          disabled={!chosen}
          icon={<ArrowLeftRight size={20} />}
          onClick={() => { if (chosen && exercise) onPick(chosen.ex, finalReason || 'Substituted') }}
        >
          {chosen ? `Use ${chosen.ex.name}` : 'Pick a replacement'}
        </Button>
      }
    >
      {!exercise ? null : (
        <div data-pillar="train">
          <div className="eyebrow text-muted mb-2">Why?</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK_REASONS.map((r) => (
              <Chip key={r} selected={reason === r} onClick={() => setReason(reason === r ? '' : r)} className="h-11">{r}</Chip>
            ))}
          </div>
          <TextInput placeholder="Optional note" aria-label="Optional note" value={note} onChange={(e) => setNote(e.target.value)} className="mb-5" />

          <div className="eyebrow text-muted mb-2">Replacement</div>
          {candidates.length === 0 ? (
            <div className="text-[15px] text-muted py-4 text-center">No alternatives in the library for this movement.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => {
                const selected = picked === c.ex.id
                const inSession = inSessionIds.includes(c.ex.id)
                return (
                  <li key={c.ex.id}>
                    <button
                      type="button"
                      disabled={!c.allowed}
                      aria-pressed={selected}
                      onClick={() => setPicked(c.ex.id)}
                      className={cx(
                        'press w-full min-h-[60px] text-left rounded-xl border px-3.5 py-3 flex items-start gap-3',
                        selected ? 'border-pillar-line bg-pillar-soft' : 'border-line bg-surface-2',
                        !c.allowed && 'opacity-55',
                      )}
                    >
                      <span className={cx(
                        'mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center shrink-0',
                        selected ? 'bg-pillar border-transparent text-accent-fg' : 'border-line-strong',
                      )}>
                        {selected && <Check size={13} strokeWidth={3} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[15px]">{c.ex.name}</span>
                          {c.source === 'recommended' && (
                            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-pillar-soft text-pillar text-[11px] font-semibold"><Sparkles size={11} aria-hidden />Recommended</span>
                          )}
                          {inSession && <span className="inline-flex items-center h-6 px-2 rounded-full bg-surface-3 text-muted text-[11px] font-semibold">In session</span>}
                        </span>
                        <span className="block text-[13px] text-muted capitalize">{c.ex.equipment} · {c.ex.primaryMuscles.join(', ')}</span>
                        {c.allowed ? (
                          <span className="block text-[13px] text-muted mt-0.5">
                            {SOURCE_WHY[c.source]}{c.ex.safetyTags.length > 0 ? ` · ${c.ex.safetyTags.map((t) => SAFETY_TAG_SHORT[t]).join(', ')}` : ' · no safety flags'}
                          </span>
                        ) : (
                          <span className="flex items-start gap-1 text-[13px] text-stop mt-0.5"><Ban size={13} className="shrink-0 mt-0.5" aria-hidden />Blocked today: {c.reasons.join('; ')}</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}
