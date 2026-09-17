import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/util'

export type IconButtonVariant = 'ghost' | 'surface' | 'primary' | 'danger'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon element (e.g. `<X size={20} />`). */
  icon: ReactNode
  /** Accessible name — required because the button has no visible text. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
}

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-app active:bg-surface-2',
  surface: 'bg-surface-2 text-app border border-line active:bg-surface-3',
  primary: 'bg-accent text-accent-fg active:opacity-85',
  danger: 'bg-stop text-accent-fg active:opacity-85',
}

const SIZE: Record<IconButtonSize, string> = {
  // sm is drawn at 36px but keeps a 44px hit area through the ::after overlay.
  sm: 'relative h-9 w-9 after:absolute after:-inset-1 after:content-[""]',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'press inline-flex shrink-0 items-center justify-center rounded-full select-none',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}
