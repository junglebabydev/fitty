// Mood shape for Mind home. Same visual language as MoodSlider's blob: a compact pebble when
// things feel unpleasant, an open six-petal bloom when they feel pleasant. Flat and still (DESIGN §11:
// no glow, no drift). Decorative only: the caller prints the mood word next to it.
import type { CSSProperties } from 'react'

export interface MoodOrbProps {
  /** -3..3, or null when there is no check-in yet (drawn as neutral). */
  valence: number | null
  size?: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Rest-blue → mind-lavender → eat-lime, mixed from the theme tokens. */
function moodColor(t: number): string {
  if (t <= 0.5) return `color-mix(in oklab, var(--c-mind) ${Math.round((t / 0.5) * 100)}%, var(--c-rest))`
  return `color-mix(in oklab, var(--c-eat) ${Math.round(((t - 0.5) / 0.5) * 100)}%, var(--c-mind))`
}

function blobRadius(t: number): string {
  const low = [44, 56, 60, 40, 60, 44, 56, 40]
  const r = low.map((v) => `${lerp(v, 50, t).toFixed(1)}%`)
  return `${r[0]} ${r[1]} ${r[2]} ${r[3]} / ${r[4]} ${r[5]} ${r[6]} ${r[7]}`
}

export function MoodOrb({ valence, size = 96 }: MoodOrbProps) {
  const v = valence == null ? 0 : Math.max(-3, Math.min(3, Math.round(valence)))
  const t = (v + 3) / 6
  const spread = 60 * t
  const squeeze = lerp(1, 0.58, t)
  const radius = blobRadius(t)
  const ease = '600ms var(--ease-out-soft)'

  const layer = (i: number): CSSProperties => ({
    borderRadius: radius,
    transform: `rotate(${(i - 1) * spread}deg) scaleX(${squeeze})`,
    background: 'var(--mood)',
    opacity: valence == null ? 0.25 : 0.4,
    transition: `transform ${ease}, border-radius ${ease}, background 600ms linear`,
  })

  return (
    <span className="block" style={{ '--mood': moodColor(t) } as CSSProperties} aria-hidden>
      <span className="relative block" style={{ width: size, height: size, transform: `scale(${lerp(0.78, 1, t)})`, transition: `transform ${ease}` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute inset-0" style={layer(i)} />
        ))}
        <span className="absolute inset-[34%] rounded-full" style={{ background: 'var(--mood)', opacity: 0.9 }} />
      </span>
    </span>
  )
}
