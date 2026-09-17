import type { ReactNode } from 'react'

export type IllustrationName = 'plate' | 'dumbbell' | 'moon' | 'breath' | 'report' | 'chart' | 'chat'

export interface IllustrationProps {
  name: IllustrationName
  size?: number
}

// Single-weight line drawings on a 120 × 120 grid. Main lines use currentColor (the wrapper sets a muted tone);
// one accent per drawing uses the pillar hue.
const ACCENT = 'stroke-pillar'

const ART: Record<IllustrationName, ReactNode> = {
  plate: (
    <>
      <circle cx="62" cy="62" r="34" />
      <circle cx="62" cy="62" r="21" className={ACCENT} />
      <path d="M16 30 V52 M10 30 V44 Q10 52 16 52 Q22 52 22 44 V30 M16 52 V94" />
      <path d="M108 94 V30 Q99 38 99 56 Q99 62 108 64" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M40 60 H80" className={ACCENT} />
      <rect x="28" y="38" width="12" height="44" rx="5" />
      <rect x="80" y="38" width="12" height="44" rx="5" />
      <rect x="16" y="47" width="12" height="26" rx="5" />
      <rect x="92" y="47" width="12" height="26" rx="5" />
      <path d="M8 60 H16 M104 60 H112" />
      <path d="M34 100 H86" opacity="0.35" />
    </>
  ),
  moon: (
    <>
      <path d="M74 20 A37 37 0 1 0 96 76 A29 29 0 0 1 74 20 Z" />
      <path d="M95 26 l2.4 6.2 6.2 2.4 -6.2 2.4 -2.4 6.2 -2.4 -6.2 -6.2 -2.4 6.2 -2.4 Z" className={ACCENT} />
      <path d="M108 54 v7 M104.5 57.5 h7" className={ACCENT} />
      <path d="M30 106 H76 M86 106 H98" opacity="0.35" />
    </>
  ),
  breath: (
    <>
      <circle cx="60" cy="52" r="10" className={ACCENT} />
      <circle cx="60" cy="52" r="22" opacity="0.8" />
      <circle cx="60" cy="52" r="35" opacity="0.45" strokeDasharray="2 7" />
      <path d="M14 104 Q25.5 96 37 104 T60 104 T83 104 T106 104" opacity="0.35" />
    </>
  ),
  report: (
    <>
      <path d="M32 14 H74 L92 32 V102 Q92 106 88 106 H32 Q28 106 28 102 V18 Q28 14 32 14 Z" />
      <path d="M74 14 V28 Q74 32 78 32 H92" />
      <path d="M40 66 H50 L56 52 L65 80 L71 66 H80" className={ACCENT} />
      <path d="M40 44 H60 M40 92 H72" opacity="0.45" />
    </>
  ),
  chart: (
    <>
      <path d="M18 16 V100 H106" />
      <path d="M28 84 L48 64 L64 74 L98 34" className={ACCENT} />
      <circle cx="98" cy="34" r="4" className={ACCENT} />
      <path d="M28 100 V94 M48 100 V94 M64 100 V94 M82 100 V94 M98 100 V94" opacity="0.45" />
    </>
  ),
  chat: (
    <>
      <path d="M26 20 H94 Q104 20 104 30 V70 Q104 80 94 80 H56 L36 98 V80 H26 Q16 80 16 70 V30 Q16 20 26 20 Z" />
      <path d="M60 36 l3.4 9 9 3.4 -9 3.4 -3.4 9 -3.4 -9 -9 -3.4 9 -3.4 Z" className={ACCENT} />
      <path d="M82 34 v7 M78.5 37.5 h7" className={ACCENT} />
    </>
  ),
}

/** Quiet line illustration for empty states. Decorative: pair it with one sentence and one button. */
export function Illustration({ name, size = 120 }: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="block shrink-0 text-muted"
    >
      {ART[name]}
    </svg>
  )
}
