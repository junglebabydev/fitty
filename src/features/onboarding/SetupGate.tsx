// UI for the setup gate (features/onboarding/setup.ts): the sheet an action raises when it is
// locked, the screen a locked route renders, the card that replaces a locked control, and the
// prompt Today shows while the intake is still unfinished.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Lock } from 'lucide-react'
import { Button, EmptyState, Sheet } from '../../components'
import { useQuery } from '../../hooks'
import { gateCopy, isOnboarded, onboardingSkipped, type GatedAction } from './setup'

const MINUTES_NOTE = 'The quick version takes about two minutes and you can change every answer later.'

export interface SetupGate {
  /** The intake is finished — nothing is locked. */
  ready: boolean
  /** Runs the action when it is allowed; otherwise opens the sheet and returns false. */
  require: (action: GatedAction) => boolean
  /** Render this once in the component that owns the gate. */
  sheet: ReactNode
}

/**
 * Guard for an action that needs a finished intake:
 *
 * ```tsx
 * const setup = useSetupGate()
 * <button onClick={() => { if (setup.require('meal_photo')) photos.openCamera() }} />
 * {setup.sheet}
 * ```
 *
 * `require` reads the database synchronously, so a photo picker opened right after it still
 * runs inside the user's own tap.
 */
export function useSetupGate(): SetupGate {
  const ready = useQuery(() => isOnboarded(), [])
  const [asked, setAsked] = useState<GatedAction | null>(null)

  const require = useCallback((action: GatedAction) => {
    if (isOnboarded()) return true
    setAsked(action)
    return false
  }, [])

  return { ready, require, sheet: <SetupLockSheet action={asked} onClose={() => setAsked(null)} /> }
}

/** Why this is locked, with one way forward. */
export function SetupLockSheet({ action, onClose }: { action: GatedAction | null; onClose: () => void }) {
  const navigate = useNavigate()
  // Keep the last content so the sheet can animate out with it.
  const last = useRef<GatedAction>('workout')
  if (action) last.current = action
  const copy = gateCopy(action ?? last.current)

  return (
    <Sheet
      open={action !== null}
      onClose={onClose}
      title={copy.title}
      footer={
        <div className="flex flex-col gap-2">
          <Button full size="lg" icon={<ArrowRight size={20} />} onClick={() => navigate('/onboarding')}>Finish setup</Button>
          <Button full variant="ghost" onClick={onClose}>Not now</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <p className="m-0 text-[15px] leading-snug text-app text-pretty">{copy.body}</p>
        <p className="m-0 flex items-start gap-1.5 text-sm leading-snug text-muted">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{MINUTES_NOTE}</span>
        </p>
      </div>
    </Sheet>
  )
}

/** Full-screen stand-in for a locked route. */
export function SetupRequired({ action }: { action: GatedAction }) {
  const navigate = useNavigate()
  const copy = gateCopy(action)
  return (
    <div className="flex-1 flex flex-col justify-center pt-safe">
      <EmptyState
        icon={<Lock size={24} aria-hidden />}
        title={copy.title}
        body={copy.body}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" icon={<ArrowRight size={20} />} onClick={() => navigate('/onboarding')}>Finish setup</Button>
            <Button variant="ghost" onClick={() => navigate('/', { replace: true })}>Back to Today</Button>
          </div>
        }
      />
    </div>
  )
}

/** Renders `children` when the intake is done, the locked screen otherwise. */
export function RequireSetup({ action, children }: { action: GatedAction; children: ReactNode }) {
  const ready = useQuery(() => isOnboarded(), [])
  if (!ready) return <SetupRequired action={action} />
  return <>{children}</>
}

/** Inline stand-in for a locked control (the report uploader). */
export function SetupLockCard({ action, className }: { action: GatedAction; className?: string }) {
  const navigate = useNavigate()
  const copy = gateCopy(action)
  return (
    <section className={className} aria-label={copy.title}>
      <div className="flex flex-col gap-3 rounded-[1.25rem] border border-dashed border-line-strong bg-surface-2 p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-muted" aria-hidden>
            <Lock size={20} />
          </span>
          <p className="m-0 min-w-0 flex-1 text-[15px] font-semibold leading-tight text-app">{copy.title}</p>
        </div>
        <p className="m-0 text-sm leading-snug text-muted text-pretty">{copy.body}</p>
        <Button full icon={<ArrowRight size={18} />} onClick={() => navigate('/onboarding')}>Finish setup</Button>
      </div>
    </section>
  )
}

/**
 * Standing reminder for a skipped intake. Renders nothing once the intake is done (or when it
 * was never skipped — those profiles are sent straight to /onboarding by App).
 */
export function SetupPrompt({ className }: { className?: string }) {
  const navigate = useNavigate()
  const pending = useQuery(() => !isOnboarded() && onboardingSkipped(), [])
  if (!pending) return null
  return (
    <section className={className} aria-label="Finish setup">
      <div className="flex items-center gap-3 rounded-[1.25rem] border border-dashed border-line-strong bg-surface-2 px-4 py-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-muted" aria-hidden>
          <Lock size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-tight text-app">Setup is not finished</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted">Training and photos stay locked until I know where you are starting from.</span>
        </span>
        <Button size="sm" className="shrink-0" onClick={() => navigate('/onboarding')}>Finish</Button>
      </div>
    </section>
  )
}
