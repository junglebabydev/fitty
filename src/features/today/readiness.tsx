// Readiness hero pieces for Today: the dial centre, one reason line and the "why" sheet
// (full reasons, symptom-gate advice, link to the check-in). Display only.
import { Activity, ChevronRight, ClipboardCheck, HeartPulse, Info, Moon, type LucideIcon } from 'lucide-react'
import type { DailyCheckIn } from '../../domain/types'
import type { GateResult, ReadinessResult } from '../../engine'
import { Button, Sheet } from '../../components'
import { cx } from '../../lib/util'
import { BulletList, GATE_UI, READINESS_UI } from './ui'

/** Centre of the PillarDial: status icon + Ready / Modify / Recover. Tapping opens the reasons. */
export function ReadinessCenter({ readiness, onClick }: { readiness: ReadinessResult; onClick: () => void }) {
  const ui = READINESS_UI[readiness.state]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`Readiness: ${ui.word}. ${ui.sentence} Show reasons`}
      className="press flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full"
    >
      <ui.Icon size={22} className={ui.text} aria-hidden />
      <span className="display text-[22px] leading-tight text-app">{ui.word}</span>
      <span className="eyebrow text-muted">Readiness</span>
    </button>
  )
}

function reasonIcon(text: string): LucideIcon {
  const t = text.toLowerCase()
  if (/sleep|night/.test(t)) return Moon
  if (/heart|hr\b|bpm/.test(t)) return HeartPulse
  if (/pain|sore|knee|back|neck|swelling|reported/.test(t)) return Activity
  return Info
}

/** One quiet line under the dial: the main reason (or "Nothing holding you back"). All reasons, the gate and the check-in live in the sheet. */
export function ReasonLine({ reasons, onOpen }: { reasons: string[]; onOpen: () => void }) {
  const text = reasons[0] ?? 'Nothing holding you back'
  const more = Math.max(0, reasons.length - 1)
  const Icon = reasons[0] ? reasonIcon(reasons[0]) : Info
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${text}${more > 0 ? `. ${more} more` : ''}. Show all reasons`}
      className="press mx-auto flex min-h-11 max-w-full items-center gap-1.5 px-2 text-[15px] text-muted"
    >
      <Icon size={16} className="shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
      <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
    </button>
  )
}

export function ReadinessSheet({
  open, onClose, readiness, gate, checkIn, onCheckIn,
}: {
  open: boolean
  onClose: () => void
  readiness: ReadinessResult
  gate: GateResult
  checkIn: DailyCheckIn | null
  onCheckIn: () => void
}) {
  const ui = READINESS_UI[readiness.state]
  const gateUi = GATE_UI[gate.overall]
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Why this call"
      footer={
        <Button full variant={checkIn ? 'secondary' : 'primary'} icon={<ClipboardCheck size={18} />} onClick={onCheckIn}>
          {checkIn ? 'Update check-in' : 'Morning check-in'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <div className={cx('flex items-center gap-3 rounded-[1.25rem] border p-4', ui.soft, ui.line)} role="status">
          <ui.Icon size={30} className={cx('shrink-0', ui.text)} aria-hidden />
          <div className="min-w-0">
            <div className="display text-3xl">{ui.word}</div>
            <div className="text-sm text-muted mt-0.5">{ui.sentence}</div>
          </div>
        </div>

        <section>
          <h3 className="eyebrow text-muted mb-2.5">What it is based on</h3>
          {readiness.reasons.length > 0
            ? <BulletList items={readiness.reasons} />
            : <p className="voice text-lg text-muted">Sleep, symptoms and check-in all look fine.</p>}
        </section>

        {gate.advice.length > 0 && (
          <section>
            <h3 className="eyebrow text-muted mb-2.5 flex items-center gap-1.5">
              <gateUi.Icon size={14} className={gateUi.text} aria-hidden />
              Symptom gate
            </h3>
            <BulletList items={gate.advice} />
          </section>
        )}

        <section>
          <h3 className="eyebrow text-muted mb-2.5">Today&rsquo;s check-in</h3>
          {checkIn ? (
            <div className="grid grid-cols-3 gap-2">
              {([['Energy', checkIn.energy], ['Soreness', checkIn.soreness], ['Stress', checkIn.stress]] as const).map(([label, v]) => (
                <div key={label} className="rounded-2xl border border-line bg-surface-2 px-3 py-2.5">
                  <div className="eyebrow text-muted">{label}</div>
                  <div className="mt-1 flex items-baseline gap-0.5">
                    <span className="num text-3xl">{v ?? '–'}</span>
                    <span className="text-xs font-medium text-muted">/10</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-muted leading-snug">Not done yet. Thirty seconds on energy, soreness and stress sharpens this call.</p>
          )}
        </section>

        <p className="text-xs text-muted leading-snug">Training guidance from your own logs. It is not a medical assessment.</p>
      </div>
    </Sheet>
  )
}
