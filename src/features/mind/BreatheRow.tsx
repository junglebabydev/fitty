// Breathe as one card: the suggested technique, its minutes, a three-word reason and Start.
// The other techniques sit behind a quiet "Other techniques" row that opens a list sheet (no carousel).
import { useState } from 'react'
import { ChevronRight, Play, Wind } from 'lucide-react'
import { Button, Card, Divider, ListRow, Sheet } from '../../components'
import { BREATHING_TECHNIQUES } from '../../engine/mind'
import { minutesRangeLabel } from './breathing'

export interface BreatheRowProps {
  suggestedId: string
  /** Three words. */
  reason: string
  onPick: (techniqueId: string) => void
  /** Start is the screen's primary action (true once today's check-in is done). */
  primary?: boolean
}

export function BreatheRow({ suggestedId, reason, onPick, primary = false }: BreatheRowProps) {
  const [listOpen, setListOpen] = useState(false)
  const suggested = BREATHING_TECHNIQUES.find((t) => t.id === suggestedId) ?? BREATHING_TECHNIQUES[0]
  const minutes = minutesRangeLabel(suggested.phases, suggested.maxCycles)

  const pick = (id: string) => {
    setListOpen(false)
    onPick(id)
  }

  return (
    <>
      <Card flush>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pillar-soft text-pillar" aria-hidden>
            <Wind size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-tight text-app">{suggested.name}</span>
            <span className="mt-0.5 block text-[13px] leading-tight text-muted">{minutes} · {reason}</span>
          </span>
          <Button
            variant={primary ? 'primary' : 'secondary'}
            size="sm"
            icon={<Play size={16} />}
            aria-label={`Start ${suggested.name}, ${minutes}. Suggested: ${reason}`}
            onClick={() => onPick(suggested.id)}
          >
            Start
          </Button>
        </div>
        <Divider inset />
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="press flex min-h-11 w-full items-center justify-between px-4 text-[15px] text-pillar active:bg-surface-2"
        >
          Other techniques
          <ChevronRight size={18} className="text-faint" aria-hidden />
        </button>
      </Card>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Breathe">
        <div data-pillar="mind" className="pb-2">
          <Card flush>
            {BREATHING_TECHNIQUES.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <Divider inset />}
                <ListRow
                  title={t.name}
                  subtitle={t.purpose}
                  right={minutesRangeLabel(t.phases, t.maxCycles)}
                  chevron
                  onClick={() => pick(t.id)}
                />
              </div>
            ))}
          </Card>
        </div>
      </Sheet>
    </>
  )
}
