import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cx } from '../lib/util'

/** Filled field + hairline. Focus swaps the hairline for the pillar hue (replaces the global outline). */
export const INPUT_BASE =
  'w-full bg-surface-2 text-app rounded-2xl border border-line px-4 text-base ' +
  'focus:outline-none focus:border-pillar transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Render a textarea instead of a single-line input. */
  multiline?: boolean
  rows?: number
  /** Leading icon inside the field. */
  icon?: ReactNode
  /** Trailing element inside the field (a clear button, a unit). */
  right?: ReactNode
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { multiline = false, rows = 3, icon, right, invalid = false, className, ...rest },
  ref,
) {
  const stateCls = invalid ? 'border-stop! focus:border-stop!' : undefined

  if (multiline) {
    const taProps = rest as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>
    return (
      <textarea
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cx(INPUT_BASE, 'py-3 leading-snug resize-none', stateCls, className)}
        {...taProps}
      />
    )
  }

  if (!icon && !right) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cx(INPUT_BASE, 'h-12', stateCls, className)} {...rest} />
  }

  return (
    <div className={cx('relative flex items-center', className)}>
      {icon && (
        <span className="absolute left-4 text-muted pointer-events-none inline-flex" aria-hidden>
          {icon}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cx(INPUT_BASE, 'h-12', icon ? 'pl-11' : undefined, right ? 'pr-12' : undefined, stateCls)}
        {...rest}
      />
      {right && <span className="absolute right-2 inline-flex items-center">{right}</span>}
    </div>
  )
})
