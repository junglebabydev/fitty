// Readiness hero pieces for Today: the dial centre, at most two reason chips and the "why" sheet
// (full reasons, symptom-gate advice, link to the check-in). Display only.
import { Activity, ClipboardCheck, HeartPulse, Info, Moon, type LucideIcon } from 'lucide-react'
import type { DailyCheckIn } from '../../domain/types'
import type { GateResult, ReadinessResult } from '../../engine'
import { Button, Sheet } from '../../components'
import { cx } from '../../lib/util'
import { BulletList, GATE_UI, READINESS_UI } from './ui'

/** Centre of the PillarDial: status icon + READY / MODIFY / RECOVER. Tapping opens the reasons. */
export function ReadinessCenter({ readiness, onClick }: { readiness: ReadinessResult; onClick: () => void }) {
  const ui = READINESS_UI[readiness.state]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Readiness: ${ui.word}. ${ui.sentence} Show reasons`}
      className="press flex flex-col items-center justify-center gap-1 rounded-full min-h-24 min-w-24"
    >
      <ui.Icon size={26} className={ui.text} aria-hidden />
      <span className="display text-[1.75rem] text-app">{ui.word}</span>
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

// 36px pill with an invisible 44px hit area, so chips stay light but easy to hit.
const CHIP =
  'press relative inline-flex items-center gap-1.5 h-9 max-w-full px-3 rounded-full border border-line bg-surface text-sm font-medium ' +
  'after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]'

/** At most two chips (DESIGN §10.1). Everything else — all reasons, the gate, the check-in — is one tap away in the sheet. */
export function ReasonChips({ reasons, onOpen }: { reasons: string[]; onOpen: () => void }) {
  const shown = reasons.slice(0, 2)
  const more = reasons.length - shown.length
  return (
    <div className="flex flex-wrap justify-center gap-x-2 gap-y-3">
      {shown.map((r, i) => {
        const Icon = reasonIcon(r)
        return (
          <button
            key={i}
            type="button"
            onClick={onOpen}
            className={CHIP}
            aria-haspopup="dialog"
            aria-label={i === shown.length - 1 && more > 0 ? `${r}. ${more} more — show all` : undefined}
          >
            <Icon size={15} className="shrink-0 text-muted" aria-hidden />
            <span className="truncate">{r}</span>
          </button>
        )
      })}
      {shown.length === 0 && (
        <button type="button" onClick={onOpen} className={CHIP} aria-haspopup="dialog">
          <Info size={15} className="shrink-0 text-muted" aria-hidden />
          <span>Nothing holding you back</span>
        </button>
      )}
    </div>
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
