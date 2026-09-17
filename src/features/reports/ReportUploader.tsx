// Upload a report (PDF or photo). Both buttons are real <input type="file"> elements inside <label>s, so the tap
// itself opens the picker / camera (no await before the click — required on iPhone over plain HTTP).
// With AI connected the file is transcribed (after a one-time consent sheet); without AI it is saved for manual entry.
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, FileUp, Loader2 } from 'lucide-react'
import { aiConnected } from '../../ai'
import { addReport, getSetting, setSetting } from '../../db/repositories'
import type { HealthReport } from '../../domain/types'
import { cx, nowIso } from '../../lib/util'
import { ConsentSheet } from './ConsentSheet'
import { REPORT_CONSENT_KEY, SHARE_REPORTS_KEY } from './context'
import { extractReport } from './extract'
import { REPORT_ACCEPT, prepareFile, titleFromFileName, type PreparedFile } from './files'

export interface ReportUploaderProps {
  /** Smaller buttons side by side (onboarding, sheets). */
  compact?: boolean
  /** Called with the saved report id. */
  onDone?: (id: number) => void
}

type Phase =
  | { step: 'idle' }
  | { step: 'preparing' }
  | { step: 'consent'; file: PreparedFile }
  | { step: 'extracting'; file: PreparedFile }
  | { step: 'saved'; id: number; title: string; message: string; needsAI: boolean }

const PICK_BASE =
  'press relative inline-flex cursor-pointer select-none items-center justify-center rounded-full font-semibold ' +
  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--pillar)]'

export function ReportUploader({ compact = false, onDone }: ReportUploaderProps) {
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const fileId = useId()
  const cameraId = useId()

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const busy = phase.step === 'preparing' || phase.step === 'extracting'

  function save(file: PreparedFile, patch: Partial<Omit<HealthReport, 'id'>>, message: string, needsAI: boolean) {
    const report: Omit<HealthReport, 'id'> = {
      ts: nowIso(),
      kind: 'other',
      title: titleFromFileName(file.name),
      fileName: file.name,
      mediaType: file.mediaType,
      fileDataUrl: file.storedDataUrl,
      status: 'manual',
      summary: '',
      markers: [],
      notes: '',
      ...patch,
    }
    let id: number
    try {
      id = addReport(report)
    } catch {
      if (alive.current) {
        setError('Could not save the report on this device. Free up some space and try again.')
        setPhase({ step: 'idle' })
      }
      return
    }
    const kept = file.storedDataUrl ? '' : ' The original is over 4 MB, so only the values are kept.'
    if (alive.current) setPhase({ step: 'saved', id, title: report.title, message: message + kept, needsAI })
    onDone?.(id)
  }

  async function runExtraction(file: PreparedFile) {
    setPhase({ step: 'extracting', file })
    const outcome = await extractReport({ base64: file.base64, mediaType: file.mediaType, name: file.name }, nowIso(), titleFromFileName(file.name))
    if (outcome.status === 'extracted') {
      const r = outcome.report
      const n = r.markers.length
      save(file, { status: 'extracted', kind: r.kind, title: r.title, ts: r.ts, summary: r.summary, markers: r.markers },
        n ? `Saved with ${n} value${n === 1 ? '' : 's'}. Check them against the original.` : 'Saved. No values were found; you can add them by hand.', false)
    } else if (outcome.status === 'failed') {
      save(file, {}, `Saved. AI could not read it (${outcome.reason.replace(/\.$/, '')}). Add values by hand.`, false)
    } else {
      save(file, {}, 'Saved. Add values by hand.', true)
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = '' // picking the same file again must fire `change`
    if (!picked) return
    setError(null)
    setPhase({ step: 'preparing' })
    try {
      const file = await prepareFile(picked)
      if (!aiConnected()) return save(file, {}, 'Saved. Add values by hand.', true)
      if (getSetting<unknown>(REPORT_CONSENT_KEY, false) !== true) return setPhase({ step: 'consent', file })
      await runExtraction(file)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not read that file.')
      setPhase({ step: 'idle' })
    }
  }

  const consentFile = phase.step === 'consent' ? phase.file : null
  const size = compact ? 'h-11 px-4 text-sm gap-1.5' : 'h-14 px-6 text-[17px] gap-2.5'

  return (
    <div className="flex flex-col gap-2" aria-busy={busy}>
      <div className={cx('flex gap-2', compact ? 'flex-row flex-wrap' : 'flex-col')}>
        <label htmlFor={fileId} className={cx(PICK_BASE, size, 'bg-accent text-accent-fg active:opacity-85', !compact && 'w-full', busy && 'pointer-events-none opacity-50')}>
          {busy ? <Loader2 size={compact ? 16 : 20} className="animate-spin" aria-hidden /> : <FileUp size={compact ? 16 : 20} aria-hidden />}
          <span>{phase.step === 'extracting' ? 'Reading the report…' : phase.step === 'preparing' ? 'Preparing…' : 'Upload a report'}</span>
          <input id={fileId} type="file" accept={REPORT_ACCEPT} className="sr-only" disabled={busy} onChange={onPick} aria-label="Upload a report: PDF or photo" />
        </label>
        <label htmlFor={cameraId} className={cx(PICK_BASE, size, 'border border-line-strong bg-transparent text-app active:bg-surface-2', !compact && 'w-full', busy && 'pointer-events-none opacity-50')}>
          <Camera size={compact ? 16 : 20} aria-hidden />
          <span>Take a photo</span>
          <input id={cameraId} type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={onPick} aria-label="Take a photo of a report" />
        </label>
      </div>

      <div role="status" aria-live="polite" className="text-sm leading-snug">
        {phase.step === 'extracting' && <p className="m-0 text-muted">Copying the printed values. This can take a minute.</p>}
        {phase.step === 'saved' && (
          <p className="m-0 flex items-start gap-1.5 text-app">
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {phase.message}{' '}
              <Link to={`/reports/${phase.id}`} className="font-semibold underline underline-offset-2">Open {phase.title}</Link>
              {phase.needsAI && (
                <>
                  {' · '}
                  <Link to="/settings#ai" className="font-semibold underline underline-offset-2">Connect AI</Link> to read reports automatically.
                </>
              )}
            </span>
          </p>
        )}
      </div>
      {error && <p role="alert" className="m-0 text-sm font-medium text-app">{error}</p>}
      {phase.step === 'idle' && !error && !compact && (
        <p className="m-0 text-center text-sm text-muted">PDF or photo, up to 15 MB. Stored on this device.</p>
      )}

      <ConsentSheet
        open={consentFile !== null}
        fileName={consentFile?.name ?? ''}
        bytes={consentFile?.bytes ?? 0}
        onAgree={(share) => {
          if (!consentFile) return
          setSetting(REPORT_CONSENT_KEY, true)
          setSetting(SHARE_REPORTS_KEY, share)
          void runExtraction(consentFile)
        }}
        onSkip={() => { if (consentFile) save(consentFile, {}, 'Saved without AI. Add values by hand.', false) }}
        onClose={() => setPhase({ step: 'idle' })}
      />
    </div>
  )
}
