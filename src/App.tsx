// App root: boot state machine (db → owner profile → seed → AI settings), router, onboarding guard, shell.
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { Compass, CopyX, Trash2 } from 'lucide-react'
import { AppShell, Button, EmptyState, ErrorState, LoadingState, ToastProvider } from './components'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useQuery, useToast } from './hooks'
import { db } from './db/database'
import { acquireTabLock } from './db/tabLock'
import { seedIfEmpty } from './db/seed'
import { getProfile } from './db/repositories'
import { applyAISettings, inferBridgeHost } from './features/ai/config'
import { applyOwnerProfile } from './features/settings/ownerBootstrap'
// Not lazy: OnboardingGate renders it outside the Suspense boundary.
import OwnerUnlockScreen from './screens/OwnerUnlock'

// --- screens (route table in docs/CONTRACTS.md) -------------------------------------

const OnboardingScreen = lazy(() => import('./screens/Onboarding'))
const TodayScreen = lazy(() => import('./screens/Today'))
const SleepScreen = lazy(() => import('./screens/Sleep'))
const CheckInScreen = lazy(() => import('./screens/CheckIn'))
const TrainScreen = lazy(() => import('./screens/Train'))
const WorkoutScreen = lazy(() => import('./screens/Workout'))
const ExerciseDetailScreen = lazy(() => import('./screens/ExerciseDetail'))
const MobilityScreen = lazy(() => import('./screens/Mobility'))
const EatScreen = lazy(() => import('./screens/Eat'))
const MealReviewScreen = lazy(() => import('./screens/MealReview'))
const FoodSearchScreen = lazy(() => import('./screens/FoodSearch'))
const MindScreen = lazy(() => import('./screens/Mind'))
const MindBreatheScreen = lazy(() => import('./screens/MindBreathe'))
const MindJournalScreen = lazy(() => import('./screens/MindJournal'))
const ProgressScreen = lazy(() => import('./screens/Progress'))
const CoachScreen = lazy(() => import('./screens/Coach'))
const SettingsScreen = lazy(() => import('./screens/Settings'))
const PrivacyLedgerScreen = lazy(() => import('./screens/PrivacyLedger'))
const HealthSettingsScreen = lazy(() => import('./screens/HealthSettings'))
const DataSettingsScreen = lazy(() => import('./screens/DataSettings'))
const ReportsScreen = lazy(() => import('./screens/Reports'))
const ReportDetailScreen = lazy(() => import('./screens/ReportDetail'))

/** Routes where the bottom tab bar is hidden (full-screen flows). */
const HIDE_TABS_PATTERNS = ['/onboarding', '/train/session/:id', '/mind/breathe']

// --- boot ---------------------------------------------------------------------------

type BootStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'other_tab' }   // another tab owns the local database
  | { kind: 'moved' }       // this tab lost ownership to another tab

// One shared promise so React StrictMode's double-invoked effect (and any remount)
// never runs db.init()/seed twice concurrently.
let bootPromise: Promise<void> | null = null

/** Set by App so the lock can tell the UI when another tab takes over. */
let onTabLost: () => void = () => {}
let stealNext = false

class OtherTabError extends Error {}

async function runBoot(): Promise<void> {
  const owns = await acquireTabLock(() => { db.freeze(); onTabLost() }, stealNext)
  stealNext = false
  if (!owns) throw new OtherTabError()
  await db.init()
  // Owner profile first: seedIfEmpty() then sees a profile and skips the demo persona.
  if (applyOwnerProfile()) await db.persist()
  await seedIfEmpty()
  applyAISettings()
}

function boot(): Promise<void> {
  if (!bootPromise) {
    bootPromise = runBoot().catch((e: unknown) => {
      bootPromise = null
      throw e
    })
  }
  return bootPromise
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  if (typeof e === 'string') return e
  return 'Unknown error'
}

export default function App() {
  const [status, setStatus] = useState<BootStatus>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus({ kind: 'loading' })
    boot().then(
      () => { if (!cancelled) setStatus({ kind: 'ready' }) },
      (e: unknown) => {
        if (e instanceof OtherTabError) { if (!cancelled) setStatus({ kind: 'other_tab' }); return }
        console.error('[boot]', e)
        if (!cancelled) setStatus({ kind: 'error', message: describeError(e) })
      },
    )
    return () => { cancelled = true }
  }, [attempt])

  // If another tab takes over the database, this copy is frozen (see db.freeze) and must not be used.
  useEffect(() => {
    onTabLost = () => setStatus({ kind: 'moved' })
    return () => { onTabLost = () => {} }
  }, [])

  if (status.kind === 'loading') return <LoadingState label="Opening your local database…" fullScreen />
  if (status.kind === 'error') return <BootError message={status.message} onRetry={() => setAttempt((a) => a + 1)} />
  if (status.kind === 'other_tab') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app px-6 text-app">
        <EmptyState
          icon={<CopyX size={28} aria-hidden />}
          title="Coach is open in another tab"
          body="Only one tab can use your local data at a time, so nothing gets overwritten."
          action={<Button onClick={() => { stealNext = true; setAttempt((a) => a + 1) }}>Use it here instead</Button>}
        />
      </div>
    )
  }
  if (status.kind === 'moved') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-app px-6 text-app">
        <EmptyState
          icon={<CopyX size={28} aria-hidden />}
          title="Coach moved to another tab"
          body="Your data is safe there. Reload to bring it back here."
          action={<Button onClick={() => window.location.reload()}>Reload here</Button>}
        />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <PersistWatcher />
        <Shell />
      </ToastProvider>
    </BrowserRouter>
  )
}

// --- boot error ---------------------------------------------------------------------

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [resetting, setResetting] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const reset = async () => {
    setResetting(true)
    try {
      await db.wipe()
    } finally {
      window.location.reload()
    }
  }

  return (
    <div className="min-h-dvh bg-app text-app flex flex-col items-center justify-center px-6 pt-safe pb-safe">
      <ErrorState
        title="Couldn't start the app"
        body={message}
        onRetry={onRetry}
      />
      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        {confirm ? (
          <>
            <p className="text-[13px] text-muted max-w-[32ch] leading-snug">
              This deletes everything stored on this device (workouts, meals, weights, settings). The demo scenario is seeded again on the next launch.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirm(false)} disabled={resetting}>Keep data</Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={16} />} loading={resetting} onClick={() => void reset()}>Delete and restart</Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" size="sm" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
            Reset local database
          </Button>
        )}
      </div>
    </div>
  )
}

// --- shell + routes -----------------------------------------------------------------

/** A failed IndexedDB write would otherwise be silent; the in-memory database is still current. */
function PersistWatcher() {
  const toast = useToast()
  useEffect(() => {
    db.onPersistError = () => toast.show("Couldn't save to this device's storage — free up space, then log again", 'error')
    return () => { db.onPersistError = null }
  }, [toast])
  return null
}

function Shell() {
  const { pathname } = useLocation()
  // No profile yet (owner unlock or onboarding): nothing behind the tabs to go to.
  const onboarded = useQuery(() => getProfile()?.onboarded ?? false, [])
  const hideTabs = !onboarded || HIDE_TABS_PATTERNS.some((p) => matchPath(p, pathname) !== null)
  return (
    <AppShell hideTabs={hideTabs}>
      <ErrorBoundary resetKey={pathname}>
        <OnboardingGate>
          <Suspense fallback={<LoadingState />}>
            <AppRoutes />
          </Suspense>
        </OnboardingGate>
      </ErrorBoundary>
    </AppShell>
  )
}

/**
 * Sends un-onboarded profiles to /onboarding; on the hosted site it first offers to
 * load the owner profile from the Worker with the PIN. Onboarded profiles may still visit
 * /onboarding: Settings and Coach link there to re-run the wizard, which detects
 * rerun mode itself (Cancel + "Save changes" both return to /settings).
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const onboarded = useQuery(() => getProfile()?.onboarded ?? false, [])
  const [skipUnlock, setSkipUnlock] = useState(false)
  const atOnboarding = pathname === '/onboarding'
  // Hosted site, fresh phone: offer to load the owner profile from the Worker before falling back to the wizard.
  if (!onboarded && !atOnboarding && !skipUnlock && inferBridgeHost(window.location.hostname) === 'cloud') {
    return <OwnerUnlockScreen onSkip={() => setSkipUnlock(true)} />
  }
  if (!onboarded && !atOnboarding) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/" element={<TodayScreen />} />
      <Route path="/sleep" element={<SleepScreen />} />
      <Route path="/checkin" element={<CheckInScreen />} />
      <Route path="/train" element={<TrainScreen />} />
      <Route path="/train/session/:id" element={<WorkoutScreen />} />
      <Route path="/train/exercise/:id" element={<ExerciseDetailScreen />} />
      <Route path="/train/mobility" element={<MobilityScreen />} />
      <Route path="/eat" element={<EatScreen />} />
      <Route path="/eat/review" element={<MealReviewScreen />} />
      <Route path="/eat/search" element={<FoodSearchScreen />} />
      <Route path="/mind" element={<MindScreen />} />
      <Route path="/mind/breathe" element={<MindBreatheScreen />} />
      <Route path="/mind/journal" element={<MindJournalScreen />} />
      <Route path="/progress" element={<ProgressScreen />} />
      <Route path="/coach" element={<CoachScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/settings/privacy" element={<PrivacyLedgerScreen />} />
      <Route path="/settings/health" element={<HealthSettingsScreen />} />
      <Route path="/settings/data" element={<DataSettingsScreen />} />
      <Route path="/reports" element={<ReportsScreen />} />
      <Route path="/reports/:id" element={<ReportDetailScreen />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

function NotFound() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <div className="flex-1 flex flex-col justify-center pt-safe">
      <EmptyState
        icon={<Compass size={26} />}
        title="Nothing here"
        body={`${pathname} is not a screen in this app.`}
        action={<Button onClick={() => navigate('/', { replace: true })}>Go to Today</Button>}
      />
    </div>
  )
}
