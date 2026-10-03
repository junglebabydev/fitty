// Today's summary list (DESIGN §11): Apple Health-style grouped rows, one per pillar —
// icon + label in the pillar hue, one value on the right, chevron. The rows are the Pillar
// Dial's legend, so each value is the same caption that draws its arc. Display only.
import { ChevronRight } from 'lucide-react'
import { PILLARS, type PillarKey } from '../../components'

export interface SummaryRow {
  key: PillarKey
  value: string
  onClick: () => void
}

export function SummaryList({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null
  return (
    <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface p-0" aria-label="Summary">
      {rows.map((r) => {
        const meta = PILLARS[r.key]
        const Icon = meta.icon
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={r.onClick}
              aria-label={`${meta.label}: ${r.value}. Open`}
              className="press flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2"
            >
              <Icon size={20} strokeWidth={2.25} className={`shrink-0 ${meta.text}`} aria-hidden />
              <span className={`shrink-0 text-[17px] font-semibold ${meta.text}`}>{meta.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[15px] text-muted tnum">{r.value}</span>
              <ChevronRight size={18} className="-mr-1 shrink-0 text-faint" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
