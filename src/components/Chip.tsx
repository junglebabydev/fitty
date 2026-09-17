import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx } from '../lib/util'
import type { Tone } from './tones'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  icon?: ReactNode
  /** Colour when selected. Defaults to the current pillar hue; status tones are for safety chips (pain, symptoms). */
  tone?: Tone
  /** Show a check mark when selected. */
  check?: boolean
}

const SELECTED: Record<Tone, string> = {
  default: 'bg-pillar-soft border-pillar-line text-pillar',
  accent: 'bg-pillar-soft border-pillar-line text-pillar',
  neutral: 'bg-surface-3 border-line-strong text-app',
  green: 'bg-ok/15 border-ok/40 text-ok',
  amber: 'bg-warn/15 border-warn/40 text-warn',
  red: 'bg-stop/15 border-stop/40 text-stop',
}

export function Chip({
  selected = false,
  onClick,
  children,
  icon,
  tone = 'accent',
  check = false,
  className,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 h-11 min-w-11 px-4 rounded-full text-sm border whitespace-nowrap select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        selected ? cx(SELECTED[tone], 'font-semibold') : 'bg-surface-2 text-app border-line font-medium active:bg-surface-3',
        className,
      )}
      {...rest}
    >
      {selected && check ? <Check size={15} strokeWidth={2.5} aria-hidden /> : icon ? <span className="inline-flex" aria-hidden>{icon}</span> : null}
      {children}
    </button>
  )
}
