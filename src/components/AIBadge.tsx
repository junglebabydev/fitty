import { Sparkles } from 'lucide-react'

export interface AIBadgeProps {
  /** Defaults to "AI". Keep it to one or two words ("AI draft", "AI estimate"). */
  label?: string
}

/** Tiny sparkle + eyebrow that marks anything model-generated. */
export function AIBadge({ label = 'AI' }: AIBadgeProps) {
  return (
    <span className="eyebrow inline-flex items-center gap-1 whitespace-nowrap text-pillar">
      <Sparkles size={12} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  )
}
