import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Pillar } from './pillars'

export interface CelebrateProps {
  show: boolean
  title: string
  body?: string
  onDone: () => void
  pillar?: Pillar
}

const DURATION_MS = 1800

/**
 * A brief success moment (PR, target hit): three expanding rings and a popped
 * title. Never blocks input and never depends on `animationend`: a timer calls
 * `onDone`. No confetti.
 */
export function Celebrate({ show, title, body, onDone, pillar }: CelebrateProps) {
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => done.current(), DURATION_MS)
    return () => window.clearTimeout(t)
  }, [show])

  if (!show) return null

  return createPortal(
    <div
      data-pillar={pillar}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center anim-fade-in"
      style={{ background: 'radial-gradient(70% 38% at 50% 46%, color-mix(in oklab, var(--c-bg) 90%, transparent), transparent 100%)' }}
    >
      <div className="relative flex w-full max-w-[430px] flex-col items-center px-8 text-center">
        <div className="absolute left-1/2 top-1/2 -ml-16 -mt-16 h-32 w-32" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="anim-burst absolute inset-0 rounded-full border-2 border-pillar"
              style={{ animationDelay: `${i * 160}ms`, animationDuration: '900ms' }}
            />
          ))}
        </div>
        <p className="display anim-pop relative m-0 text-5xl text-app">{title}</p>
        {body !== undefined && (
          <p className="anim-rise relative m-0 mt-2 text-base text-muted" style={{ animationDelay: '160ms' }}>
            {body}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
