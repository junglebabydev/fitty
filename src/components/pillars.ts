import { Brain, Dumbbell, Moon, Utensils, type LucideIcon } from 'lucide-react'

/** Identity of a screen or component. Sets `data-pillar`, which drives the `*-pillar` utilities. */
export type Pillar = 'today' | 'train' | 'eat' | 'rest' | 'mind' | 'coach' | 'neutral'

/** The four pillars that carry their own hue. */
export type PillarKey = 'train' | 'eat' | 'rest' | 'mind'

export interface PillarMeta {
  label: string
  icon: LucideIcon
  /** Literal Tailwind classes (kept as full strings so the compiler sees them). */
  text: string
  bg: string
  stroke: string
}

export const PILLARS: Record<PillarKey, PillarMeta> = {
  train: { label: 'Train', icon: Dumbbell, text: 'text-train', bg: 'bg-train', stroke: 'stroke-train' },
  eat: { label: 'Eat', icon: Utensils, text: 'text-eat', bg: 'bg-eat', stroke: 'stroke-eat' },
  rest: { label: 'Rest', icon: Moon, text: 'text-rest', bg: 'bg-rest', stroke: 'stroke-rest' },
  mind: { label: 'Mind', icon: Brain, text: 'text-mind', bg: 'bg-mind', stroke: 'stroke-mind' },
}

/** Dial order, outer → inner. */
export const PILLAR_KEYS: PillarKey[] = ['train', 'eat', 'rest', 'mind']
