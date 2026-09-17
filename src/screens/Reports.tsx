// Reports: uploaded blood tests, body-composition scans, clinical notes and imaging reports.
// Values are shown against the range PRINTED on each report. Nothing here interprets a result.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import { AIStatusChip, Button, Illustration, Screen } from '../components'
import { listReports } from '../db/repositories'
import type { HealthReport } from '../domain/types'
import { FLAG_LABEL, FlagMark, KIND_ICON, KIND_LABEL, ReportUploader, notableMarkers } from '../features/reports'
import { useQuery } from '../hooks'
import { dateOf, fmtDate } from '../lib/util'

const PREVIEW_ROWS = 4

function ReportCard({ report, index, onOpen }: { report: HealthReport; index: number; onOpen: () => void }) {
  const Icon = KIND_ICON[report.kind] ?? FileText
  const dots = notableMarkers(report.markers, 4)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${report.title || 'Untitled report'}, ${KIND_LABEL[report.kind]}, ${fmtDate(dateOf(report.ts))}${dots.length ? '. ' + dots.map((m) => `${m.name}: ${FLAG_LABEL[m.flag]}`).join('; ') : ''}`}
      className="press anim-rise flex w-full flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4 text-left active:bg-surface-2"
      style={{ '--i': index + 1 } as CSSProperties}
    >
      <span className="flex w-full items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-app" aria-hidden>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-app">{report.title || 'Untitled report'}</span>
          <span className="block text-sm text-muted">{KIND_LABEL[report.kind]} · {fmtDate(dateOf(report.ts))}</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-faint" aria-hidden />
      </span>
      {dots.length > 0 ? (
        <span className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
          {dots.map((m, i) => (
            <span key={`${m.name}-${i}`} className="min-w-0" title={`${m.name}: ${FLAG_LABEL[m.flag]}`}>
              <FlagMark flag={m.flag} label={m.name} className="max-w-full" />
            </span>
          ))}
        </span>
      ) : (
        <span className="text-sm text-muted">No values yet. Open to add them.</span>
      )}
    </button>
  )
}

export default function ReportsScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const reports = useQuery(() => listReports(), [])
  const [showAll, setShowAll] = useState(false)
  const uploaderRef = useRef<HTMLDivElement>(null)

  // ?upload=1 (Composer, Settings, Coach): bring the uploader into view and focus it. The file picker itself
  // can only be opened by the user's own tap, so the buttons are always on this screen rather than behind a sheet.
  const wantsUpload = params.get('upload') === '1'
  useEffect(() => {
    if (!wantsUpload) return
    const el = uploaderRef.current
    el?.scrollIntoView({ block: 'center' })
    el?.querySelector<HTMLInputElement>('input[type="file"]')?.focus()
    const next = new URLSearchParams(params)
    next.delete('upload')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsUpload])

  const visible = showAll ? reports : reports.slice(0, PREVIEW_ROWS)
  const onDone = (id: number) => navigate(`/reports/${id}`)

  return (
    <Screen pillar="neutral" title="Reports" back={location.key === 'default' ? '/settings' : true} right={<AIStatusChip onClick={() => navigate('/settings#ai')} />}>
      <div className="flex flex-col gap-3 pb-32">
        {reports.length === 0 ? (
          <section className="anim-rise flex flex-col items-center gap-4 rounded-[1.25rem] border border-line bg-surface p-5 text-center" style={{ '--i': 0 } as CSSProperties}>
            <Illustration name="report" size={128} />
            <p className="voice m-0 text-xl text-app text-balance">Add a blood test or a scan so your coach knows where you are starting from.</p>
            <div ref={uploaderRef} className="w-full text-left">
              <ReportUploader onDone={onDone} />
            </div>
          </section>
        ) : (
          <>
            <section ref={uploaderRef} className="anim-rise" style={{ '--i': 0 } as CSSProperties} aria-label="Add a report">
              <ReportUploader compact onDone={onDone} />
            </section>
            <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Your reports">
              {visible.map((r, i) => (
                <li key={r.id}>
                  <ReportCard report={r} index={i} onOpen={() => navigate(`/reports/${r.id}`)} />
                </li>
              ))}
            </ul>
            {reports.length > PREVIEW_ROWS && !showAll && (
              <Button variant="ghost" full onClick={() => setShowAll(true)}>See all {reports.length}</Button>
            )}
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend: marks compare each value with the range printed on the report">
              <FlagMark flag="normal" label="In range" />
              <FlagMark flag="high" label="High" />
              <FlagMark flag="low" label="Low" />
              <FlagMark flag="unknown" label="No range printed" />
            </p>
          </>
        )}
        <p className="m-0 mt-2 text-center text-sm text-muted">Discuss results with your clinician.</p>
      </div>
    </Screen>
  )
}
