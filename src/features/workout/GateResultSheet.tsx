// What the symptom gate changed before a session starts (moved out of screens/Workout.tsx so the coach-led workout
// shows the same sheet): flagged areas, advice, substitutions, moves still blocked, and on RED the skip path.
import { ArrowLeftRight, Play, ShieldAlert, TriangleAlert } from 'lucide-react'
import { Button, Sheet } from '../../components'
import type { GateResult } from '../../engine'
import { cx } from '../../lib/util'
import type { GateOutcome } from './gate'
import { REGION_LABELS } from './helpers'


export function GateResultSheet({ outcome, onClose, onSkip }: { outcome: GateOutcome | null; onClose(): void; onSkip(): void }) {
  const red = outcome?.gate.overall === 'RED'
  return (
    <Sheet
      open={outcome !== null}
      onClose={onClose}
      title={red ? 'Protect it today' : outcome?.changes.length ? 'Adjusted for today' : 'Heads up'}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" full onClick={onClose} icon={<Play size={18} />}>
            {red ? 'Continue with safe exercises' : 'Start logging'}
          </Button>
          {red && <Button variant="ghost" full onClick={onSkip}>Skip today's session</Button>}
        </div>
      }
    >
      {outcome && <GateSummary gate={outcome.gate} changes={outcome.changes} blocked={outcome.blocked} />}
    </Sheet>
  )
}

function GateSummary({ gate, changes, blocked }: { gate: GateResult; changes: string[]; blocked: { name: string; reasons: string[] }[] }) {
  const flagged = gate.regions.filter((r) => r.level !== 'OK')
  return (
    <div className="flex flex-col gap-4">
      {flagged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flagged.map((r) => (
            <span key={r.region} className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold', r.level === 'RED' ? 'bg-stop/10 text-stop' : 'bg-warn/10 text-warn')}>
              {r.level === 'RED' ? <ShieldAlert size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}
              {REGION_LABELS[r.region]} · {r.level === 'RED' ? 'protect' : 'modify'}
            </span>
          ))}
        </div>
      )}
      {gate.advice.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-[15px] leading-snug">
          {gate.advice.map((a, i) => <li key={i} className="flex gap-2"><span className="text-faint" aria-hidden>—</span><span>{a}</span></li>)}
        </ul>
      )}
      {changes.length > 0 && (
        <div>
          <div className="eyebrow text-muted mb-2">Substitutions made</div>
          <ul className="flex flex-col gap-2">
            {changes.map((c, i) => (
              <li key={i} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5">
                <ArrowLeftRight size={16} className="text-pillar shrink-0 mt-0.5" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {blocked.length > 0 && (
        <div>
          <div className="eyebrow text-muted mb-2">Still blocked</div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted">
            {blocked.map((b) => <li key={b.name}><span className="text-app font-medium">{b.name}</span> — {b.reasons.join('; ')}</li>)}
          </ul>
        </div>
      )}
      {gate.overall === 'RED' && (
        <div className="rounded-xl border border-stop/40 bg-stop/5 px-3 py-2.5 text-sm leading-snug flex items-start gap-2.5">
          <ShieldAlert size={16} className="text-stop shrink-0 mt-0.5" aria-hidden />
          <span>Stop anything that provokes the area today. Pain above 5/10 or red-flag symptoms that persist warrant an appropriate clinical assessment — this app does not diagnose.</span>
        </div>
      )}
      {gate.overall === 'OK' && changes.length === 0 && <div className="text-[15px] text-muted">Nothing flagged — the plan runs as written.</div>}
    </div>
  )
}
