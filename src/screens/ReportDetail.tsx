// One report: what it is, then every value drawn against the range PRINTED on the report.
// Nothing is interpreted here. Every field the AI fills can be added or corrected by hand.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Eye, FileText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { aiConnected } from '../ai'
import { AIBadge, Button, EmptyState, Field, IconButton, Screen, Sheet, TextInput } from '../components'
import { deleteReport, getReport, getSetting, setSetting, updateReport } from '../db/repositories'
import type { ReportKind, ReportMarker } from '../domain/types'
import { useAIStatus } from '../features/ai/config'
import {
  ConsentSheet, KIND_ICON, KIND_LABEL, MarkerSheet, REPORT_CONSENT_KEY, REPORT_DISCLAIMER, REPORT_KINDS, RangeBar,
  SHARE_REPORTS_KEY, dataUrlToAttachment, extractReport, groupByCategory, reportTs,
} from '../features/reports'
import { Toggle } from '../features/settings/SettingsUI'
import { useQuery, useToast } from '../hooks'
import { cx, dateOf, fmtDate } from '../lib/util'

const rise = (i: number) => ({ className: 'anim-rise', style: { '--i': i } as CSSProperties })

function dataUrlToBlobUrl(dataUrl: string): string | null {
  const att = dataUrlToAttachment(dataUrl)
  if (!att) return null
  try {
    const bin = atob(att.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: att.mediaType }))
  } catch {
    return null
  }
}

export default function ReportDetailScreen() {
  const { id: idParam } = useParams()
  const id = Number(idParam)
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  useAIStatus() // re-render when the AI connection changes
  const report = useQuery(() => (Number.isFinite(id) ? getReport(id) : null), [id])
  const share = useQuery(() => getSetting<unknown>(SHARE_REPORTS_KEY, false) === true, [])

  const [markerSheet, setMarkerSheet] = useState<{ index: number | null } | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<ReportKind>('other')

  const fileDataUrl = report?.fileDataUrl ?? null
  const isPdf = report?.mediaType === 'application/pdf'
  // PDFs open in a new tab from a blob: URL (browsers block top-level data: URLs). Built ahead of the tap so the link is a plain <a>.
  const pdfUrl = useMemo(() => (fileDataUrl && isPdf ? dataUrlToBlobUrl(fileDataUrl) : null), [fileDataUrl, isPdf])
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  const back = location.key === 'default' ? '/reports' : true

  if (!report) {
    return (
      <Screen pillar="neutral" title="Report" back="/reports">
        <EmptyState icon={<FileText size={26} />} title="Report not found" body="It may have been deleted." action={<Button onClick={() => navigate('/reports', { replace: true })}>All reports</Button>} />
      </Screen>
    )
  }

  const groups = groupByCategory(report.markers)
  const categories = groups.map((g) => g.category)
  const KindIcon = KIND_ICON[report.kind] ?? FileText
  const editing = markerSheet && markerSheet.index !== null ? report.markers[markerSheet.index] ?? null : null
  const canExtract = report.status !== 'extracted' && !!fileDataUrl && aiConnected()

  function saveMarker(m: ReportMarker) {
    if (!report || !markerSheet) return
    const next = [...report.markers]
    if (markerSheet.index === null) next.push(m)
    else next[markerSheet.index] = m
    updateReport(report.id, { markers: next })
    setMarkerSheet(null)
  }

  function removeMarker() {
    if (!report || !markerSheet || markerSheet.index === null) return
    updateReport(report.id, { markers: report.markers.filter((_, i) => i !== markerSheet.index) })
    setMarkerSheet(null)
  }

  function openMeta() {
    if (!report) return
    setTitle(report.title)
    setDate(dateOf(report.ts))
    setKind(report.kind)
    setMetaOpen(true)
  }

  function saveMeta() {
    if (!report) return
    updateReport(report.id, { title: title.trim() || report.title, kind, ts: reportTs(date, report.ts) })
    setMetaOpen(false)
  }

  async function runExtraction() {
    if (!report || !fileDataUrl) return
    const att = dataUrlToAttachment(fileDataUrl, report.fileName)
    if (!att) return
    setExtracting(true)
    const outcome = await extractReport(att, report.ts, report.title)
    setExtracting(false)
    if (outcome.status !== 'extracted') {
      toast.show(outcome.status === 'failed' ? `AI could not read it. ${outcome.reason}` : 'AI is not connected.', 'error')
      return
    }
    const r = outcome.report
    // Values typed by hand are kept; transcribed values are added after them.
    updateReport(report.id, { status: 'extracted', kind: r.kind, title: r.title, ts: r.ts, summary: r.summary, markers: [...report.markers, ...r.markers] })
    toast.show(`${r.markers.length} value${r.markers.length === 1 ? '' : 's'} copied. Check them against the original.`, 'success')
  }

  function onExtractTap() {
    if (getSetting<unknown>(REPORT_CONSENT_KEY, false) === true) void runExtraction()
    else setConsentOpen(true)
  }

  return (
    <Screen
      pillar="neutral"
      title="Report"
      back={back}
      right={<IconButton icon={<Pencil size={20} />} label="Edit title, date and type" onClick={openMeta} />}
    >
      <div className="flex flex-col gap-6 pb-32">
        <header className="anim-rise flex flex-col gap-3" style={rise(0).style}>
          <h2 className="display m-0 text-3xl text-app text-balance">{report.title || 'Untitled report'}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-3 text-[13px] font-medium text-app">
              <KindIcon size={14} aria-hidden />
              {KIND_LABEL[report.kind]}
            </span>
            <span>{fmtDate(dateOf(report.ts))}</span>
            {report.status === 'extracted' ? <AIBadge label="AI transcribed" /> : <span className="eyebrow">Entered by hand</span>}
          </div>
          {report.summary && <p className="m-0 text-base leading-snug text-app">{report.summary}</p>}
          {report.status === 'extracted' && <p className="m-0 text-sm text-muted">Copied as printed. Check values against the original; tap any value to correct it.</p>}
        </header>

        {groups.length === 0 ? (
          <section className="anim-rise flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4" style={rise(1).style}>
            <p className="m-0 text-base text-app">No values yet.</p>
            <p className="m-0 text-sm leading-snug text-muted">
              Add the values you want to keep, with the range printed on the report.
              {!aiConnected() && (
                <> <Link to="/settings#ai" className="font-semibold text-app underline underline-offset-2">Connect AI</Link> to have them copied for you.</>
              )}
            </p>
          </section>
        ) : (
          groups.map((g, gi) => (
            <section key={g.category} {...rise(gi + 1)} aria-label={g.category}>
              <h3 className="eyebrow m-0 mb-2 text-muted">{g.category}</h3>
              <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-[1.25rem] border border-line bg-surface p-0">
                {g.items.map(({ marker, index }) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => setMarkerSheet({ index })}
                      aria-label={`Edit ${marker.name}`}
                      className="press block min-h-11 w-full px-4 py-3 text-left active:bg-surface-2"
                    >
                      <RangeBar marker={marker} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <section className="flex flex-col gap-2">
          <Button variant="secondary" full icon={<Plus size={18} aria-hidden />} onClick={() => setMarkerSheet({ index: null })}>Add a value</Button>
          {canExtract && (
            <Button variant="outline" full loading={extracting} disabled={extracting} icon={<Sparkles size={18} aria-hidden />} onClick={onExtractTap}>
              {extracting ? 'Reading the report…' : 'Copy values with AI'}
            </Button>
          )}
          {fileDataUrl && isPdf && pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line-strong px-5 text-base font-semibold text-app active:bg-surface-2"
            >
              <Eye size={18} aria-hidden />
              View original PDF
            </a>
          )}
          {fileDataUrl && !isPdf && (
            <Button variant="outline" full icon={<Eye size={18} aria-hidden />} onClick={() => setImageOpen(true)}>View original</Button>
          )}
          {!fileDataUrl && <p className="m-0 text-center text-sm text-muted">The original file was 4 MB or larger, so only the values are kept.</p>}
        </section>

        <section className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-line bg-surface px-4 py-2">
          <span className="text-[15px] leading-snug text-app">Let the coach use report summaries as context</span>
          <Toggle checked={share} onChange={(next) => setSetting(SHARE_REPORTS_KEY, next)} label="Let the coach use report summaries as context" />
        </section>

        <Button variant="ghost" full icon={<Trash2 size={18} aria-hidden />} onClick={() => setDeleteOpen(true)}>Delete report</Button>

        <p className="m-0 text-center text-sm leading-snug text-muted">{REPORT_DISCLAIMER}</p>
      </div>

      <MarkerSheet
        open={markerSheet !== null}
        marker={editing}
        categories={categories}
        onSave={saveMarker}
        onDelete={markerSheet?.index != null ? removeMarker : undefined}
        onClose={() => setMarkerSheet(null)}
      />

      <Sheet open={metaOpen} onClose={() => setMetaOpen(false)} title="Report details" footer={<Button full onClick={saveMeta}>Save</Button>}>
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="report-title">
            <TextInput id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Report date" htmlFor="report-date">
            <TextInput id="report-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Type">
            <div role="radiogroup" aria-label="Report type" className="flex flex-wrap gap-2">
              {REPORT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cx(
                    'press inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium',
                    kind === k ? 'border-transparent bg-accent text-accent-fg' : 'border-line-strong bg-transparent text-app',
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Sheet>

      <Sheet open={imageOpen} onClose={() => setImageOpen(false)} title={report.fileName || 'Original'}>
        {fileDataUrl && !isPdf && <img src={fileDataUrl} alt={`Original file: ${report.fileName || report.title}`} className="block h-auto w-full rounded-xl border border-line" />}
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this report?"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              full
              onClick={() => {
                deleteReport(report.id)
                toast.show('Report deleted.')
                navigate('/reports', { replace: true })
              }}
            >
              Delete report
            </Button>
            <Button variant="ghost" full onClick={() => setDeleteOpen(false)}>Keep it</Button>
          </div>
        }
      >
        <p className="m-0 text-base leading-snug text-muted">The file and its values are removed from this device. This cannot be undone.</p>
      </Sheet>

      <ConsentSheet
        open={consentOpen}
        fileName={report.fileName}
        bytes={fileDataUrl ? Math.floor((fileDataUrl.length * 3) / 4) : 0}
        onAgree={(shareChoice) => {
          setSetting(REPORT_CONSENT_KEY, true)
          setSetting(SHARE_REPORTS_KEY, shareChoice)
          setConsentOpen(false)
          void runExtraction()
        }}
        onSkip={() => setConsentOpen(false)}
        onClose={() => setConsentOpen(false)}
      />
    </Screen>
  )
}
