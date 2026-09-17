import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { cx } from '../lib/util'
import { INPUT_BASE } from './TextInput'
import { formatNumberInput, inRange, parseNumberInput } from './util'

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'size'> {
  value: number | null
  onChange: (n: number | null) => void
  step?: number
  /** Unit suffix shown inside the field (kg, cm, g, min). */
  unit?: string
  min?: number
  max?: number
  /** Larger, centred display for hero inputs like weight. */
  size?: 'md' | 'lg'
  /** Called with the committed (parsed, unclamped) value on blur. */
  onCommit?: (n: number | null) => void
  /** Force the error style. Out-of-range values are styled automatically once the field is left. */
  invalid?: boolean
}

/**
 * Decimal-friendly numeric field with big tap targets. Keeps local text state
 * so "8." and "83," stay editable. Values outside min/max are never rewritten:
 * the field is marked invalid on blur and callers gate Save on validity.
 */
export function NumberInput({
  value,
  onChange,
  step,
  unit,
  min,
  max,
  size = 'md',
  onCommit,
  invalid = false,
  className,
  onBlur,
  onFocus,
  placeholder,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(() => formatNumberInput(value))
  const [editing, setEditing] = useState(false)

  // Sync from outside only when the user is not typing, to avoid clobbering "8."
  useEffect(() => {
    if (editing) return
    setText((prev) => (parseNumberInput(prev) === value ? prev : formatNumberInput(value)))
  }, [value, editing])

  const commit = () => {
    const parsed = parseNumberInput(text)
    setText(formatNumberInput(parsed))
    if (parsed !== value) onChange(parsed)
    onCommit?.(parsed)
  }
  const showInvalid = invalid || (!editing && value !== null && !inRange(value, min, max))

  return (
    <div className={cx('relative flex items-center', className)}>
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        placeholder={placeholder ?? (step !== undefined && step < 1 ? '0.0' : '0')}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setEditing(false)
          commit()
          onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          const parsed = parseNumberInput(raw)
          if (parsed !== value) onChange(parsed)
        }}
        className={cx(
          INPUT_BASE,
          'num',
          size === 'lg' ? 'h-20 text-5xl text-center' : 'h-12 text-2xl',
          unit && (size === 'lg' ? 'pl-14 pr-14' : 'pr-12'),
          showInvalid && 'border-stop! focus:border-stop!',
        )}
        aria-invalid={showInvalid || undefined}
        {...rest}
      />
      {unit && (
        <span
          className={cx(
            'absolute right-4 text-muted pointer-events-none font-medium',
            size === 'lg' ? 'text-base' : 'text-sm',
          )}
          aria-hidden
        >
          {unit}
        </span>
      )}
    </div>
  )
}
