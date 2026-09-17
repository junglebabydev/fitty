// Add or edit one marker by hand: name, value, unit and the range printed on the report (optional).
// This is the whole no-AI path: every field the AI would fill can be typed here. The flag is always recomputed.
import { useEffect, useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Field, Sheet, TextInput } from '../../components'
import type { ReportMarker } from '../../domain/types'
import { normaliseMarker } from './markers'

export interface MarkerSheetProps {
  open: boolean
  /** null = add a new marker. */
  marker: ReportMarker | null
  /** Category suggestions from the markers already on the report. */
  categories: string[]
  onSave: (m: ReportMarker) => void
  onDelete?: () => void
  onClose: () => void
}

const s = (n: number | null) => (n === null ? '' : String(n))

export function MarkerSheet({ open, marker, categories, onSave, onDelete, onClose }: MarkerSheetProps) {
  const uid = useId()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(marker?.name ?? '')
    setValue(marker ? (marker.value !== null ? String(marker.value) : marker.valueText) : '')
    setUnit(marker?.unit ?? '')
    setLow(s(marker?.refLow ?? null))
    setHigh(s(marker?.refHigh ?? null))
    setCategory(marker?.category ?? categories[0] ?? '')
    setError(null)
    setConfirmDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, marker])

  function submit() {
    if (!name.trim()) return setError('Give the value a name, as printed on the report.')
    const lowN = low.trim() === '' ? null : Number(low.replace(',', '.'))
    const highN = high.trim() === '' ? null : Number(high.replace(',', '.'))
    if ((lowN !== null && !Number.isFinite(lowN)) || (highN !== null && !Number.isFinite(highN))) return setError('The range must be numbers, or left empty.')
    if (lowN !== null && highN !== null && lowN > highN) return setError('The low end of the range is above the high end.')
    // A non-numeric value ("Negative", "< 5") is kept as text and gets no flag.
    const m = normaliseMarker({ name, value, valueText: value, unit, refLow: lowN, refHigh: highN, category })
    if (!m) return setError('Give the value a name, as printed on the report.')
    onSave(m)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={marker ? 'Edit value' : 'Add a value'}
      footer={<Button full onClick={submit}>{marker ? 'Save' : 'Add'}</Button>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor={`${uid}-name`} error={error ?? undefined}>
          <TextInput id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HbA1c" autoComplete="off" invalid={!!error && !name.trim()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value" htmlFor={`${uid}-value`}>
            <TextInput id={`${uid}-value`} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="5.4" autoComplete="off" />
          </Field>
          <Field label="Unit" htmlFor={`${uid}-unit`}>
            <TextInput id={`${uid}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%" autoComplete="off" autoCapitalize="off" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Printed range low" htmlFor={`${uid}-low`}>
            <TextInput id={`${uid}-low`} value={low} onChange={(e) => setLow(e.target.value)} inputMode="decimal" placeholder="optional" autoComplete="off" />
          </Field>
          <Field label="Printed range high" htmlFor={`${uid}-high`}>
            <TextInput id={`${uid}-high`} value={high} onChange={(e) => setHigh(e.target.value)} inputMode="decimal" placeholder="optional" autoComplete="off" />
          </Field>
        </div>
        <p className="m-0 -mt-2 text-[13px] leading-snug text-muted">Use only the range printed on your report. Leave it empty if none is printed.</p>
        <Field label="Section" htmlFor={`${uid}-cat`}>
          <TextInput id={`${uid}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Lipids" autoComplete="off" list={`${uid}-cats`} />
          <datalist id={`${uid}-cats`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        {marker && onDelete && (
          <Button
            variant="ghost"
            full
            icon={<Trash2 size={18} aria-hidden />}
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          >
            {confirmDelete ? 'Tap again to delete this value' : 'Delete value'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
