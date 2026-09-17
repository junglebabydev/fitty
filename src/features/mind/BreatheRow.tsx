// Breathe as a row of visual cards: a small breathing glyph, the name and the minutes. No descriptions.
// The suggested technique is outlined and carries a three-word reason (icon + words, never colour alone).
import type { CSSProperties } from 'react'
import { Sparkles } from 'lucide-react'
import { BREATHING_TECHNIQUES } from '../../engine/mind'
import { cx } from '../../lib/util'
import { minutesRangeLabel, phaseTableSeconds } from './breathing'

export interface BreatheRowProps {
  suggestedId: string
  /** Three words. */
  reason: string
  onPick: (techniqueId: string) => void
}

// The glyph breathes at the technique's own cycle length. It stops under reduced motion.
const GLYPH_CSS = `
@keyframes mind-glyph { 0%, 100% { transform: scale(0.56); } 45%, 55% { transform: scale(1); } }
.mind-glyph { animation: mind-glyph var(--breath, 10s) ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .mind-glyph { animation: none; transform: scale(0.8); } }
`

function BreathGlyph({ id, cycleSec }: { id: string; cycleSec: number }) {
  const shape = id === 'box' ? 'rounded-[30%]' : 'rounded-full'
  return (
    <span className="relative flex h-16 w-16 items-center justify-center" aria-hidden>
      <span className={cx('absolute inset-0 border border-pillar-line bg-pillar-soft', shape)} />
      {id === '478' && <span className="absolute inset-[14%] rounded-full border border-pillar-line" />}
      <span
        className={cx('mind-glyph absolute inset-[16%]', shape)}
        style={{
          '--breath': `${Math.max(4, cycleSec)}s`,
          background: 'radial-gradient(circle at 50% 38%, color-mix(in oklab, var(--pillar) 70%, transparent), color-mix(in oklab, var(--pillar) 30%, transparent))',
        } as CSSProperties}
      />
      {id === 'sigh' && <span className="absolute right-[6%] top-[6%] h-[26%] w-[26%] rounded-full bg-pillar opacity-60" />}
    </span>
  )
}

export function BreatheRow({ suggestedId, reason, onPick }: BreatheRowProps) {
  // Suggested first, so it is on screen without scrolling.
  const ordered = [...BREATHING_TECHNIQUES].sort((a, b) => Number(b.id === suggestedId) - Number(a.id === suggestedId))
  return (
    <>
      <style>{GLYPH_CSS}</style>
      <ul className="no-scrollbar -mx-4 m-0 flex list-none snap-x gap-3 overflow-x-auto px-4 py-1">
        {ordered.map((t) => {
          const suggested = t.id === suggestedId
          const minutes = minutesRangeLabel(t.phases, t.maxCycles)
          return (
            <li key={t.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onPick(t.id)}
                aria-label={`${t.name}, ${minutes}${suggested ? `. Suggested: ${reason}` : ''}`}
                className={cx(
                  'press flex h-full min-h-[152px] w-[150px] flex-col items-center gap-1.5 rounded-[1.25rem] border bg-surface px-2.5 pb-3 pt-3.5 text-center text-app',
                  suggested ? 'border-2 border-pillar' : 'border-line',
                )}
              >
                <BreathGlyph id={t.id} cycleSec={phaseTableSeconds(t.phases)} />
                <span className="text-[15px] font-semibold leading-tight">{t.name}</span>
                <span className="num text-lg leading-none text-muted">{minutes}</span>
                {suggested && (
                  <span className="mt-auto inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium leading-tight text-pillar">
                    <Sparkles size={12} className="shrink-0" aria-hidden />
                    {reason}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
