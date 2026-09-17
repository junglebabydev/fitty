// Asked once, before the first AI extraction: what is sent, to whom, that it is logged, and whether the coach may use summaries.
import { useEffect, useState } from 'react'
import { FileText, ScrollText, Server } from 'lucide-react'
import { Button, Sheet } from '../../components'
import { getSetting } from '../../db/repositories'
import { useAIStatus } from '../ai/config'
import { Toggle } from '../settings/SettingsUI'
import { SHARE_REPORTS_KEY } from './context'
import { fmtBytes } from './files'

export interface ConsentSheetProps {
  open: boolean
  fileName: string
  bytes: number
  /** "Send and extract": the caller stores the consent and the share choice, then runs the extraction. */
  onAgree: (shareWithCoach: boolean) => void
  /** "Save without AI": the report is saved for manual entry and nothing is sent. */
  onSkip: () => void
  onClose: () => void
}

export function providerLabel(active: string): string {
  if (active === 'claude-code') return 'Claude, through Claude Code on your Mac (your subscription)'
  if (active === 'anthropic') return 'Claude, through the Anthropic API with your key'
  return 'On-device demo (nothing is sent)'
}

export function ConsentSheet({ open, fileName, bytes, onAgree, onSkip, onClose }: ConsentSheetProps) {
  const status = useAIStatus()
  const [share, setShare] = useState(false)

  useEffect(() => {
    if (open) setShare(getSetting<unknown>(SHARE_REPORTS_KEY, false) === true)
  }, [open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Read this report with AI?"
      footer={
        <div className="flex flex-col gap-2">
          <Button full onClick={() => onAgree(share)}>Send and extract</Button>
          <Button full variant="ghost" onClick={onSkip}>Save without AI</Button>
        </div>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] leading-snug text-app">
        <li className="flex items-start gap-3">
          <FileText size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span><span className="text-muted">Sent: </span>this file only ({fileName}, {fmtBytes(bytes)}).</span>
        </li>
        <li className="flex items-start gap-3">
          <Server size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span><span className="text-muted">To: </span>{providerLabel(status.active)}.</span>
        </li>
        <li className="flex items-start gap-3">
          <ScrollText size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span>Logged in your privacy ledger. Values are copied as printed, never interpreted.</span>
        </li>
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-2">
        <span id="share-reports-label" className="text-[15px] leading-snug text-app">Let the coach use report summaries as context</span>
        <Toggle checked={share} onChange={setShare} label="Let the coach use report summaries as context" />
      </div>
      <p className="m-0 mt-2 text-sm text-muted">Off by default. You can change it on any report.</p>
    </Sheet>
  )
}
