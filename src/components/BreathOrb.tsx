import { useEffect, useRef, useState, type CSSProperties } from 'react'

export type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'rest' | 'idle'

export interface BreathOrbProps {
  phase: BreathPhase
  /** Length of the current phase; becomes the scale transition-duration. */
  seconds: number
  label?: string
  size?: number
}

const FULL = 1
const EMPTY = 0.55
const IDLE = 0.7
const TOP_UP = 1.1 // second consecutive inhale (physiological sigh)
const STILL = 0.8 // reduced motion: the orb does not move

const DEFAULT_LABEL: Record<BreathPhase, string> = {
  inhale: 'Breathe in',
  hold: 'Hold',
  exhale: 'Breathe out',
  rest: 'Rest',
  idle: 'Ready',
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * Breathing guide. Inhale grows to 1, exhale settles to 0.55, hold and rest keep
 * the current size. The motion is a plain CSS transition whose duration is the
 * phase length, so the caller only has to swap `phase` + `seconds` on its own
 * timestamp-driven clock. With reduced motion only the label changes.
 */
export function BreathOrb({ phase, seconds, label, size = 260 }: BreathOrbProps) {
  const reduced = useReducedMotion()
  const [scale, setScale] = useState(IDLE)
  const [duration, setDuration] = useState(0.7)
  const current = useRef(IDLE)

  useEffect(() => {
    let next = current.current
    let dur = Math.max(0.2, seconds)
    if (phase === 'inhale') next = current.current >= FULL ? TOP_UP : FULL
    else if (phase === 'exhale') next = EMPTY
    else if (phase === 'idle') {
      next = IDLE
      dur = 0.7
    }
    if (next === current.current) return
    // Next frame, so the starting size is painted before the transition begins.
    // `current` is only committed here, which keeps StrictMode's double effect run harmless.
    const raf = requestAnimationFrame(() => {
      current.current = next
      setDuration(dur)
      setScale(next)
    })
    return () => cancelAnimationFrame(raf)
    // `label` is a dependency so two inhales in a row (sigh top-up) are seen as separate phases.
  }, [phase, seconds, label])

  const s = reduced ? STILL : scale
  const move = (factor: number): CSSProperties => ({
    transform: `scale(${(1 - (1 - s) * factor).toFixed(3)})`,
    transitionProperty: 'transform',
    transitionDuration: reduced ? '0s' : `${duration}s`,
    transitionTimingFunction: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
  })
  const text = label ?? DEFAULT_LABEL[phase]

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {/* halo: moves least, so the orb seems to breathe into it */}
      <span
        className="absolute rounded-full border border-pillar-line bg-pillar-soft"
        style={{ inset: '4%', ...move(0.45) }}
        aria-hidden
      />
      <span
        className="absolute rounded-full"
        style={{ inset: '13%', background: 'color-mix(in oklab, var(--pillar) 20%, transparent)', ...move(0.75) }}
        aria-hidden
      />
      <span
        className="glow-pillar absolute rounded-full"
        style={{
          inset: '22%',
          background:
            'radial-gradient(circle at 50% 38%, color-mix(in oklab, var(--pillar) 58%, transparent), color-mix(in oklab, var(--pillar) 26%, transparent))',
          ...move(1),
        }}
        aria-hidden
      />
      <span className="voice relative px-4 text-center text-2xl text-app" role="status" aria-live="polite">
        {text}
      </span>
    </div>
  )
}
