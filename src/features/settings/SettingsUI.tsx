// Small presentational pieces shared by the settings screens and onboarding.
// The UI kit has no switch control, so `Toggle` lives here; `Group` is the
// grouped-list wrapper (eyebrow header + flush hairline card + inset dividers
// + optional footer note); `Row` is a ListRow at the 56px settings height.
import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import { Card, Divider, INPUT_BASE, ListRow, type ListRowProps } from '../../components'
import { cx } from '../../lib/util'

export interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Accessible name — the switch has no visible text. */
  label: string
  className?: string
}

/** Switch. 44px tall hit area around a 31px track; the checked track takes the screen's pillar hue. */
export function Toggle({ checked, onChange, disabled = false, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('inline-flex items-center h-11 w-[51px] shrink-0 select-none rounded-full', disabled && 'opacity-40 cursor-default', className)}
    >
      <span
        aria-hidden
        className={cx(
          'relative block h-[31px] w-[51px] rounded-full border transition-colors duration-200',
          checked ? 'bg-pillar border-transparent' : 'bg-surface-3 border-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] left-[2px] h-[25px] w-[25px] rounded-full transition-transform duration-200',
            checked ? 'translate-x-5 bg-app' : 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)]',
          )}
        />
      </span>
    </button>
  )
}

export interface GroupProps {
  title?: ReactNode
  children: ReactNode
  /** Small explanatory note under the card. */
  footer?: ReactNode
  /** Right-aligned element next to the eyebrow (a small ghost button). */
  action?: ReactNode
  className?: string
}

/** Grouped list: eyebrow section label, a flush hairline card, inset dividers between rows. */
export function Group({ title, children, footer, action, className }: GroupProps) {
  // toArray already drops null/undefined/booleans; keep elements and text only.
  const rows = Children.toArray(children).filter((c) => isValidElement(c) || typeof c === 'string')
  return (
    <section className={cx('pt-6', className)}>
      {(title !== undefined || action !== undefined) && (
        <div className="flex items-end justify-between gap-3 px-1 pb-2 min-h-[24px]">
          {title !== undefined ? <h2 className="eyebrow text-muted">{title}</h2> : <span />}
          {action !== undefined && <div className="shrink-0 -my-2">{action}</div>}
        </div>
      )}
      <Card flush>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <Divider inset />}
            {row}
          </Fragment>
        ))}
      </Card>
      {footer !== undefined && <p className="text-[13px] text-muted px-1 pt-2 leading-snug">{footer}</p>}
    </section>
  )
}

/** ListRow at the settings height (56px). */
export function Row({ className, ...rest }: ListRowProps) {
  return <ListRow {...rest} className={cx('min-h-[56px]!', className)} />
}

export interface TimeInputProps {
  /** 'HH:MM' or '' */
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  label: string
  className?: string
}

export function TimeInput({ value, onChange, disabled = false, label, className }: TimeInputProps) {
  return (
    <input
      type="time"
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.value)}
      className={cx(INPUT_BASE, 'h-11 w-auto min-w-[112px] text-[16px] tnum px-3', className)}
    />
  )
}

/** Text block used inside a Group for prose (disclaimers, explanations). */
export function GroupText({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 py-3.5 text-[14px] text-muted leading-snug', className)}>{children}</div>
}

/** Block inside a Group holding a labelled control that needs the full width (a Segmented, a field). */
export function GroupBlock({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 py-3.5">
      {label !== undefined && <div className="text-[16px] leading-tight mb-2.5">{label}</div>}
      {children}
      {hint !== undefined && <p className="text-[13px] text-muted mt-2.5 leading-snug">{hint}</p>}
    </div>
  )
}

/** Row with a title/subtitle on the left and a control on the right (no nested buttons). */
export function ControlRow({
  title,
  subtitle,
  control,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  control: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-center gap-3 w-full min-h-[56px] px-4 py-2.5', className)}>
      {icon !== undefined && (
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-surface-2 text-muted shrink-0" aria-hidden>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-tight">{title}</span>
        {subtitle !== undefined && <span className="block text-[13px] text-muted mt-0.5 leading-snug">{subtitle}</span>}
      </span>
      <span className="shrink-0 inline-flex items-center">{control}</span>
    </div>
  )
}

/** Inline status line: icon + word, never colour alone. */
export function StatusLine({ tone, icon, children, className }: { tone: 'ok' | 'warn' | 'stop' | 'muted'; icon: ReactNode; children: ReactNode; className?: string }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'stop' ? 'text-stop' : 'text-muted'
  return (
    <p className={cx('flex items-start gap-2 text-[14px] leading-snug', className)}>
      <span className={cx('shrink-0 mt-0.5 inline-flex', color)} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 text-app">{children}</span>
    </p>
  )
}
