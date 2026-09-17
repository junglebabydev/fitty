import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cx } from '../lib/util'

export interface FieldProps {
  label: ReactNode
  children: ReactNode
  /** Helper text under the control. */
  hint?: ReactNode
  /** Validation message; when set, replaces the hint and is styled as an error. */
  error?: ReactNode
  /** id of the control, wires the label for screen readers / tap-to-focus. */
  htmlFor?: string
  /** Right-aligned element next to the label (e.g. a unit toggle). */
  action?: ReactNode
  className?: string
}

/** Always-visible label above a control, with a hint or an error (icon + words) below. */
export function Field({ label, children, hint, error, htmlFor, action, className }: FieldProps) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="eyebrow text-muted">
          {label}
        </label>
        {action !== undefined && <div className="text-[13px]">{action}</div>}
      </div>
      {children}
      {error ? (
        <p className="m-0 flex items-start gap-1.5 text-[13px] leading-snug text-stop" role="alert">
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="m-0 text-[13px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
