import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cx } from '../lib/util'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'pillar'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  full?: boolean
  /** Shows a spinner and disables the button. */
  loading?: boolean
  /** Leading icon (a lucide element). */
  icon?: ReactNode
  children?: ReactNode
}

/*
 * primary is monochrome (bone on ink / ink on paper): one per view.
 * pillar is the hued call to action for a pillar's own hero ("Start session").
 * `text-accent-fg` flips with the theme, so it reads on every solid fill.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg active:opacity-85',
  pillar: 'bg-pillar text-accent-fg active:opacity-85',
  secondary: 'bg-surface-2 text-app border border-line active:bg-surface-3',
  outline: 'bg-transparent text-app border border-line-strong active:bg-surface-2',
  ghost: 'bg-transparent text-app active:bg-surface-2',
  danger: 'bg-stop text-accent-fg active:opacity-85',
}

const SIZE: Record<ButtonSize, string> = {
  // sm keeps a 44px hit area through the ::after overlay.
  sm: 'relative h-10 px-4 text-sm gap-1.5 after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[""]',
  md: 'h-12 px-5 text-base gap-2',
  lg: 'h-14 px-6 text-[17px] gap-2.5',
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 }

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cx(
        'press inline-flex items-center justify-center rounded-full font-semibold tracking-[0.01em] select-none whitespace-nowrap',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        loading ? 'disabled:opacity-70' : 'disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={ICON_SIZE[size]} className="shrink-0 animate-spin" aria-hidden />
      ) : icon ? (
        <span className="inline-flex shrink-0" aria-hidden>{icon}</span>
      ) : null}
      {children}
    </button>
  )
}
