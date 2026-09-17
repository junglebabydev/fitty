// Settings → About: which build this device runs, and a manual update check.
// The app shell is cached by a service worker, so a fresh deploy is not visible until the new worker activates.
import { useState } from 'react'
import { DownloadCloud } from 'lucide-react'
import { Button } from '../../components'

type Phase = 'idle' | 'checking' | 'updating' | 'current' | 'unsupported' | 'failed'

const MESSAGE: Record<Phase, string> = {
  idle: '',
  checking: 'Checking for a newer version…',
  updating: 'New version found. The app reloads in a moment.',
  current: 'This is the latest version.',
  unsupported: 'Updates install automatically when you reload.',
  failed: 'Could not check. You may be offline or signed out of Cloudflare Access.',
}

function builtLabel(): string {
  try {
    return new Date(__BUILD_TIME__).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function AppUpdate() {
  const [phase, setPhase] = useState<Phase>('idle')

  const check = async () => {
    if (!('serviceWorker' in navigator)) { setPhase('unsupported'); return }
    setPhase('checking')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) { setPhase('unsupported'); return }
      await reg.update()
      // Give the browser a moment to start installing a changed worker.
      await new Promise((r) => setTimeout(r, 1500))
      if (reg.installing || reg.waiting) {
        setPhase('updating')
        // autoUpdate reloads on activation; this is the fallback if that event is missed.
        setTimeout(() => window.location.reload(), 4000)
      } else {
        setPhase('current')
      }
    } catch {
      setPhase('failed')
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-medium leading-tight">Version {__BUILD_ID__}</p>
          <p className="mt-0.5 text-[14px] leading-snug text-muted">Built {builtLabel()}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={check} loading={phase === 'checking'} icon={<DownloadCloud size={16} aria-hidden />}>
          Check for updates
        </Button>
      </div>
      {phase !== 'idle' && <p role="status" className="text-[14px] leading-snug text-muted">{MESSAGE[phase]}</p>}
    </div>
  )
}
