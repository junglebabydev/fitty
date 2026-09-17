import type { ReactNode } from 'react'
import type { Pillar } from './pillars'

/** Addressable muscle regions of the stylised figure. */
export type RegionId =
  | 'neck' | 'traps' | 'frontDelts' | 'sideDelts' | 'rearDelts'
  | 'chest' | 'biceps' | 'triceps' | 'forearms'
  | 'lats' | 'midBack' | 'lowerBack'
  | 'abs' | 'obliques' | 'hipFlexors'
  | 'glutes' | 'abductors' | 'adductors' | 'quads' | 'hamstrings' | 'calves'

export const REGION_LABELS: Record<RegionId, string> = {
  neck: 'neck', traps: 'upper back and traps', frontDelts: 'front delts', sideDelts: 'side delts', rearDelts: 'rear delts',
  chest: 'chest', biceps: 'biceps', triceps: 'triceps', forearms: 'forearms',
  lats: 'lats', midBack: 'mid back', lowerBack: 'lower back',
  abs: 'abs', obliques: 'obliques and deep core', hipFlexors: 'hip flexors',
  glutes: 'glutes', abductors: 'hip abductors', adductors: 'adductors', quads: 'quads', hamstrings: 'hamstrings', calves: 'calves',
}

const FRONT_REGIONS: RegionId[] = ['neck', 'traps', 'frontDelts', 'sideDelts', 'chest', 'biceps', 'forearms', 'abs', 'obliques', 'hipFlexors', 'abductors', 'adductors', 'quads', 'calves']
const BACK_REGIONS: RegionId[] = ['neck', 'traps', 'rearDelts', 'sideDelts', 'triceps', 'forearms', 'lats', 'midBack', 'lowerBack', 'glutes', 'abductors', 'adductors', 'hamstrings', 'calves']

// Exact (normalised) names first; anything else falls through to the keyword rules below.
const EXACT: Record<string, RegionId[]> = {
  'abs': ['abs'],
  'abdominals': ['abs'],
  'lower abs': ['abs', 'hipFlexors'],
  'core': ['abs', 'obliques'],
  'deep core': ['obliques', 'abs'],
  'obliques': ['obliques'],
  'chest': ['chest'],
  'upper chest': ['chest'],
  'pecs': ['chest'],
  'shoulders': ['frontDelts', 'sideDelts', 'rearDelts'],
  'delts': ['frontDelts', 'sideDelts', 'rearDelts'],
  'front delts': ['frontDelts'],
  'side delts': ['sideDelts'],
  'rear delts': ['rearDelts'],
  'rotator cuff': ['rearDelts'],
  'arms': ['biceps', 'triceps', 'forearms'],
  'biceps': ['biceps'],
  'brachialis': ['biceps'],
  'triceps': ['triceps'],
  'forearms': ['forearms'],
  'grip': ['forearms'],
  'neck': ['neck'],
  'traps': ['traps'],
  'upper back': ['traps', 'midBack'],
  'back': ['lats', 'midBack', 'traps'],
  'mid back': ['midBack'],
  'rhomboids': ['midBack'],
  'lats': ['lats'],
  'lower back': ['lowerBack'],
  'erectors': ['lowerBack'],
  'glutes': ['glutes'],
  'glute medius': ['abductors', 'glutes'],
  'abductors': ['abductors'],
  'adductors': ['adductors'],
  'hip flexors': ['hipFlexors'],
  'legs': ['quads', 'hamstrings', 'glutes', 'calves'],
  'quads': ['quads'],
  'quadriceps': ['quads'],
  'hamstrings': ['hamstrings'],
  'calves': ['calves'],
  'soleus': ['calves'],
  'full body': ['chest', 'lats', 'frontDelts', 'rearDelts', 'abs', 'glutes', 'quads', 'hamstrings', 'calves'],
  'cardiovascular': [],
  'cardio': [],
  'heart': [],
}

// Ordered: the first matching rule wins, so specific phrases sit above general ones.
const KEYWORDS: [RegExp, RegionId[]][] = [
  [/full body|whole body|total body/, EXACT['full body']],
  [/rear delt|posterior delt|rotator|infraspinatus|teres minor/, ['rearDelts']],
  [/side delt|lateral delt|medial delt/, ['sideDelts']],
  [/front delt|anterior delt/, ['frontDelts']],
  [/delt|shoulder/, ['frontDelts', 'sideDelts', 'rearDelts']],
  [/chest|pec/, ['chest']],
  [/bicep|brachi/, ['biceps']],
  [/tricep/, ['triceps']],
  [/forearm|grip|wrist/, ['forearms']],
  [/neck/, ['neck']],
  [/trap|upper back/, ['traps']],
  [/lat\b|lats|latissimus|teres major/, ['lats']],
  [/rhomboid|mid back|middle back/, ['midBack']],
  [/lower back|low back|erector|lumbar|spinal/, ['lowerBack']],
  [/back/, ['lats', 'midBack', 'traps']],
  [/oblique|deep core|transvers|serratus/, ['obliques']],
  [/lower ab/, ['abs', 'hipFlexors']],
  [/\bab\b|abs|abdom|rectus abd/, ['abs']],
  [/core|trunk/, ['abs', 'obliques']],
  [/hip flexor|psoas|iliopsoas/, ['hipFlexors']],
  [/glute med|glute min|abductor|tfl|outer hip/, ['abductors']],
  [/adductor|inner thigh|groin/, ['adductors']],
  [/glute|hip ext/, ['glutes']],
  [/quad|thigh/, ['quads']],
  [/hamstring/, ['hamstrings']],
  [/calf|calves|soleus|gastroc|tibialis|shin/, ['calves']],
  [/leg/, ['quads', 'hamstrings', 'glutes', 'calves']],
  [/arm/, ['biceps', 'triceps', 'forearms']],
]

function regionsForName(raw: string): RegionId[] {
  const name = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name) return []
  const exact = EXACT[name]
  if (exact) return exact
  // "calves (soleus)", "triceps (long head)" → try the part before the bracket.
  const base = name.replace(/\(.*?\)/g, '').trim()
  if (base && EXACT[base]) return EXACT[base]
  for (const [re, regions] of KEYWORDS) if (re.test(name)) return regions
  return []
}

/** Maps the free-text muscle names used in src/data/exercises.ts onto figure regions (deduplicated, input order kept). */
export function muscleRegions(names: string[]): RegionId[] {
  const out: RegionId[] = []
  for (const n of names) for (const r of regionsForName(n)) if (!out.includes(r)) out.push(r)
  return out
}

// ---- Figure geometry (viewBox 0 0 100 210, centre line x = 50) ------------------------------------
// `half` shapes are drawn for the viewer's right side and mirrored; `mid` shapes sit on the centre line.
interface Shapes { half?: ReactNode; mid?: ReactNode }

const FOREARM = <ellipse cx="83" cy="96" rx="3.4" ry="12" transform="rotate(-8 83 96)" />
const SIDE_DELT = <ellipse cx="78" cy="45.4" rx="2.5" ry="6.4" transform="rotate(-12 78 45.4)" />

const FRONT: Partial<Record<RegionId, Shapes>> = {
  neck: { mid: <rect x="46.6" y="24.5" width="6.8" height="6.5" rx="2.5" /> },
  traps: { half: <path d="M55 32.8 Q60 35.2 66.5 36.6 Q60 38.8 55 38 Z" /> },
  frontDelts: { half: <ellipse cx="72.4" cy="43.6" rx="4.3" ry="6.2" transform="rotate(-20 72.4 43.6)" /> },
  sideDelts: { half: SIDE_DELT },
  chest: { half: <path d="M51 40.6 Q58 38.8 65.4 40.2 Q69.4 43 68.4 50 Q66.4 57.4 58 57.6 Q54 57.6 51 56 Z" /> },
  biceps: { half: <ellipse cx="78.3" cy="64" rx="4.2" ry="10.4" transform="rotate(-5 78.3 64)" /> },
  forearms: { half: FOREARM },
  abs: {
    half: (
      <>
        <rect x="50.9" y="60.4" width="5.8" height="8.2" rx="2.3" />
        <rect x="50.9" y="69.8" width="5.8" height="8.2" rx="2.3" />
        <rect x="50.9" y="79.2" width="5.8" height="8.2" rx="2.3" />
        <path d="M50.9 88.8 H56.7 L55.8 98 Q53.6 103 50.9 104 Z" />
      </>
    ),
  },
  obliques: { half: <path d="M59 60.4 Q64 61 67.8 59 L66.2 76 Q64.6 88 65 95 L58.8 101.4 Z" /> },
  hipFlexors: { half: <ellipse cx="60" cy="108.6" rx="5.4" ry="3.1" transform="rotate(-32 60 108.6)" /> },
  abductors: { half: <ellipse cx="67.4" cy="114.4" rx="2.2" ry="7" transform="rotate(-5 67.4 114.4)" /> },
  adductors: { half: <ellipse cx="56" cy="131" rx="2.4" ry="11" transform="rotate(4 56 131)" /> },
  quads: { half: <ellipse cx="63.4" cy="139" rx="5.5" ry="17.6" transform="rotate(-3 63.4 139)" /> },
  calves: { half: <ellipse cx="61.8" cy="178" rx="4" ry="12.4" /> },
}

const BACK: Partial<Record<RegionId, Shapes>> = {
  neck: { mid: <rect x="46.6" y="24" width="6.8" height="5.4" rx="2.5" /> },
  traps: { mid: <path d="M50 30.6 L55 32.6 Q60 35.4 67 36.8 L58.6 42.8 L50 45.8 L41.4 42.8 L33 36.8 Q40 35.4 45 32.6 Z" /> },
  rearDelts: { half: <ellipse cx="72.4" cy="44.2" rx="4.4" ry="5.9" transform="rotate(-20 72.4 44.2)" /> },
  sideDelts: { half: SIDE_DELT },
  midBack: { mid: <path d="M50 48 L58.8 45 L62 53.2 L50 67 L38 53.2 L41.2 45 Z" /> },
  lats: { half: <path d="M64.2 53.4 L69.4 53.8 Q68.8 66 65.8 78 Q62.4 88 55.6 92 L52 70.8 Q60.4 63.2 64.2 53.4 Z" /> },
  lowerBack: { half: <path d="M50.8 72.8 L54 93 Q54.2 99 50.8 101 Z" /> },
  triceps: { half: <ellipse cx="78.4" cy="63.6" rx="4.4" ry="10.8" transform="rotate(-5 78.4 63.6)" /> },
  forearms: { half: FOREARM },
  abductors: { half: <ellipse cx="63.4" cy="100.8" rx="4.4" ry="3" transform="rotate(28 63.4 100.8)" /> },
  glutes: { half: <path d="M50.8 104.6 Q60 101.6 66.6 107.6 Q68.8 116 63.4 121 Q56.4 124 50.8 120.6 Z" /> },
  adductors: { half: <ellipse cx="55.6" cy="134" rx="2.2" ry="9" transform="rotate(4 55.6 134)" /> },
  hamstrings: { half: <ellipse cx="63" cy="143.4" rx="5.5" ry="16" transform="rotate(-3 63 143.4)" /> },
  calves: { half: <path d="M57 166 Q61.9 160.4 66.8 166 Q68 178 63.7 188.4 Q61.9 190.6 60.1 188.4 Q55.8 178 57 166 Z" /> },
}

const MIRROR = 'matrix(-1 0 0 1 100 0)'

// One continuous outline per side: trapezius slope → shoulder cap → arm → armpit → waist → hip → leg → foot.
// It starts a hair left of the centre line so the mirrored halves overlap and never show a seam.
const BODY_HALF =
  'M49.6 31 L54.5 31 Q60 34.4 68 35.4 Q79.4 36.4 81.6 47 Q83.6 60 84.2 72 Q87.6 90 88.2 108 Q90.6 116 88.6 123.6 ' +
  'Q85.8 128.6 82.8 124 Q81.8 116 80.8 109 Q78.4 92 75.4 79 Q73.6 65 71 54.6 Q69.6 70 66 86 Q66.2 98 69.6 110 ' +
  'Q71.6 131 67.6 152 Q66.6 160 68 170 Q69 184 64.2 198 L66.4 204.4 Q66.6 208 62 208 L56.4 208 Q54 208 55 204 L57 198 ' +
  'Q54.6 182 56 168 Q56.6 160 55.6 152 Q54.6 134 51.6 119.4 L49.6 118.4 Z'

function Silhouette() {
  const shapes = (
    <>
      <ellipse cx="50" cy="13.6" rx="8.6" ry="10.8" />
      <rect x="45.5" y="21" width="9" height="13" rx="3" />
      <path d={BODY_HALF} />
      <path d={BODY_HALF} transform={MIRROR} />
    </>
  )
  // A hairline outline keeps the figure legible on tinted tiles in the light theme. It is drawn first and the
  // fill goes on top, so only the outer half of the stroke shows and the centre seam stays invisible.
  return (
    <>
      <g className="fill-none stroke-line-strong" strokeWidth="1.4" strokeLinejoin="round">{shapes}</g>
      <g className="fill-surface-3">{shapes}</g>
    </>
  )
}

function Figure({ side, primary, secondary, x }: { side: 'front' | 'back'; primary: Set<RegionId>; secondary: Set<RegionId>; x: number }) {
  const shapes = side === 'front' ? FRONT : BACK
  const order = side === 'front' ? FRONT_REGIONS : BACK_REGIONS
  return (
    <g transform={x ? `translate(${x} 0)` : undefined}>
      <Silhouette />
      {order.map((id) => {
        const s = shapes[id]
        if (!s) return null
        const isPrimary = primary.has(id)
        const isSecondary = !isPrimary && secondary.has(id)
        return (
          <g
            key={id}
            data-region={id}
            data-level={isPrimary ? 'primary' : isSecondary ? 'secondary' : undefined}
            className={isPrimary || isSecondary ? 'fill-pillar' : 'fill-line'}
            opacity={isSecondary ? 0.42 : 1}
            style={{ transition: 'opacity 300ms var(--ease-out-soft)' }}
          >
            {s.mid}
            {s.half}
            {s.half && <g transform={MIRROR}>{s.half}</g>}
          </g>
        )
      })}
    </g>
  )
}

export interface MuscleMapProps {
  /** Free-text muscle names as used in src/data/exercises.ts (primaryMuscles). */
  primary: string[]
  secondary?: string[]
  view?: 'both' | 'front' | 'back'
  /** Height in px; width follows the figure's proportions. */
  size?: number
  pillar?: Pillar
  ariaLabel?: string
}

const FIG_W = 100
const FIG_H = 210
const GAP = 8

/** Stylised front / back body. Primary muscles fill with the pillar hue, secondary at ~40%, the rest stay neutral. */
export function MuscleMap({ primary, secondary = [], view = 'both', size = 120, pillar, ariaLabel }: MuscleMapProps) {
  const p = new Set(muscleRegions(primary))
  const s = new Set(muscleRegions(secondary))
  const vbW = view === 'both' ? FIG_W * 2 + GAP : FIG_W
  const width = Math.round((size * vbW) / FIG_H)

  const label = ariaLabel ?? (
    primary.length === 0 && secondary.length === 0
      ? 'Muscle map'
      : `Muscles worked: ${[primary.join(', '), secondary.length ? `secondary ${secondary.join(', ')}` : ''].filter(Boolean).join('; ')}`
  )

  return (
    <svg
      data-pillar={pillar}
      width={width}
      height={size}
      viewBox={`0 0 ${vbW} ${FIG_H}`}
      role="img"
      aria-label={label}
      className="block shrink-0"
    >
      {view !== 'back' && <Figure side="front" primary={p} secondary={s} x={0} />}
      {view !== 'front' && <Figure side="back" primary={p} secondary={s} x={view === 'both' ? FIG_W + GAP : 0} />}
    </svg>
  )
}
