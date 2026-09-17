import { useId, type CSSProperties } from 'react'

export interface MoodSliderProps {
  /** Valence, integer -3..3. */
  value: number
  onChange: (v: number) => void
}

const WORDS: Record<number, string> = {
  [-3]: 'Very unpleasant',
  [-2]: 'Unpleasant',
  [-1]: 'Slightly unpleasant',
  0: 'Neutral',
  1: 'Slightly pleasant',
  2: 'Pleasant',
  3: 'Very pleasant',
}

const STOPS = [-3, -2, -1, 0, 1, 2, 3]

/** Rest-blue → mind-lavender → eat-lime, mixed in oklab from the theme tokens. */
function moodColor(t: number): string {
  if (t <= 0.5) {
    const p = Math.round((t / 0.5) * 100)
    return `color-mix(in oklab, var(--c-mind) ${p}%, var(--c-rest))`
  }
  const p = Math.round(((t - 0.5) / 0.5) * 100)
  return `color-mix(in oklab, var(--c-eat) ${p}%, var(--c-mind))`
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** A heavy, uneven pebble at the low end relaxes into even petals at the high end. */
function blobRadius(t: number): string {
  const low = [44, 56, 60, 40, 60, 44, 56, 40]
  const high = [50, 50, 50, 50, 50, 50, 50, 50]
  const r = low.map((v, i) => `${lerp(v, high[i], t).toFixed(1)}%`)
  return `${r[0]} ${r[1]} ${r[2]} ${r[3]} / ${r[4]} ${r[5]} ${r[6]} ${r[7]}`
}

/**
 * Seven-stop valence slider (How We Feel / State of Mind pattern). The blob
 * folds into a small compact shape when things feel unpleasant and opens into a
 * six-petal bloom when they feel pleasant; the word carries the meaning, the
 * hue only supports it.
 */
export function MoodSlider({ value, onChange }: MoodSliderProps) {
  const id = useId()
  const v = Math.max(-3, Math.min(3, Math.round(Number.isFinite(value) ? value : 0)))
  const t = (v + 3) / 6
  const mood = moodColor(t)
  const spread = 60 * t // degrees between the three layers
  const squeeze = lerp(1, 0.58, t) // petals get slimmer as they open
  const scale = lerp(0.7, 1.06, t)
  const radius = blobRadius(t)

  const root = {
    '--mood': mood,
    '--slider-color': mood,
    '--slider-pct': `${t * 100}%`,
  } as CSSProperties

  const layer = (i: number): CSSProperties => ({
    borderRadius: radius,
    transform: `rotate(${(i - 1) * spread}deg) scaleX(${squeeze})`,
    background:
      'radial-gradient(circle at 40% 32%, color-mix(in oklab, var(--mood) 80%, var(--c-fg)) 0%, var(--mood) 45%, color-mix(in oklab, var(--mood) 55%, transparent) 100%)',
    opacity: 0.62,
    transition: 'transform 600ms var(--ease-out-soft), border-radius 600ms var(--ease-out-soft), background 600ms linear',
  })

  return (
    <div className="flex w-full flex-col items-center" style={root}>
      <div className="flex h-52 w-full items-center justify-center" aria-hidden>
        <div className="anim-drift">
          <div
            className="relative h-36 w-36"
            style={{ transform: `scale(${scale})`, transition: 'transform 600ms var(--ease-out-soft)' }}
          >
            {/* Glow as a gradient, not a filter: it fades to nothing and never shows a clipped box. */}
            <span
              className="absolute -inset-[18%] rounded-full"
              style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--mood) 50%, transparent), transparent)' }}
            />
            {[0, 1, 2].map((i) => (
              <span key={i} className="absolute inset-0" style={layer(i)} />
            ))}
            <span
              className="absolute inset-[34%] rounded-full"
              style={{ background: 'color-mix(in oklab, var(--mood) 70%, var(--c-fg))', opacity: 0.55, transition: 'background 600ms linear' }}
            />
          </div>
        </div>
      </div>

      <p className="voice m-0 mt-1 min-h-[2.2em] text-center text-2xl text-app" aria-hidden>
        {WORDS[v]}
      </p>

      <label htmlFor={id} className="sr-only">
        How are you feeling
      </label>
      <input
        id={id}
        type="range"
        className="slider mt-2"
        min={-3}
        max={3}
        step={1}
        value={v}
        aria-valuemin={-3}
        aria-valuemax={3}
        aria-valuenow={v}
        aria-valuetext={WORDS[v]}
        // First touch counts as an answer even when the thumb does not move.
        onPointerDown={() => onChange(v)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="-mt-1 flex w-full justify-between px-[14px]" aria-hidden>
        {STOPS.map((s) => (
          <span key={s} className={s === v ? 'h-1.5 w-px bg-accent' : 'h-1 w-px bg-line-strong'} />
        ))}
      </div>
      <div className="mt-1.5 flex w-full justify-between text-xs text-muted" aria-hidden>
        <span>Very unpleasant</span>
        <span>Very pleasant</span>
      </div>
    </div>
  )
}
