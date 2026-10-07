// Today — the decision hub, v4 Apple minimal (DESIGN §10.1, §11): ≤ 1300 px, ≤ 110 words, 5 blocks.
//   1 header · 2 Pillar Dial + one reason line · 3 one coach sentence + one primary action · 4 summary rows · Composer.
// Everything else is one tap away: reasons + check-in (dial sheet), directives + evidence + proposals
// (Why sheet), plan (Train row), meals (Eat row), weight (Progress icon or Composer). AI status lives in
// Settings; Today shows a quiet "Connect AI" link only when no model is connected.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChartLine, ChevronRight, ClipboardCheck, Clock, Inbox, Moon, Play, Settings, Smile, StretchHorizontal, Utensils, type LucideIcon,
} from 'lucide-react'
import { isProgramDerived } from '../domain/programs'
import { addDays, dayName, fmtDate, toDateStr } from '../lib/util'
import { Button, IconButton, PillarDial, Screen, Sheet } from '../components'
import { useNow, useQuery, useToast } from '../hooks'
import { getCheckIn, getMealsForDate, getPendingDecisions, getSessions, lastNightSleep, moodLogsForDate, updateSession } from '../db/repositories'
import { isStaleSession } from '../features/workout/stale'
import { startedLabel } from '../features/workout/StaleSessionSheet'
import { computeDailyPriority, shortenedVersion } from '../engine'
import { SetupPrompt, useSetupGate } from '../features/onboarding/SetupGate'
import { buildCoachFacts, buildPillars } from '../features/coach/facts'
import { syncProposals } from '../features/coach/apply'
import { ensureProgramWeek } from '../features/workout/program'
import { COMPOSER_CLEARANCE, Composer } from '../features/composer'
import { useAIStatus } from '../features/ai/config'
import { nextAction, type NextActionKind } from '../features/today/nextAction'
import { ReadinessCenter, ReadinessSheet, ReasonLine } from '../features/today/readiness'
import { FEATURES } from '../config/features'
import { SummaryList, type SummaryRow } from '../features/today/tiles'
import { BulletList, Rise, greeting } from '../features/today/ui'

const PILLAR_ROUTE = { train: '/train', eat: '/eat', rest: '/sleep', mind: '/mind' } as const
const PILLAR_LABEL = { train: 'Train', eat: 'Eat', rest: 'Rest', mind: 'Mind' } as const
const PILLAR_ORDER = ['train', 'eat', 'rest', 'mind'] as const

const ACTION_ICON: Record<NextActionKind, LucideIcon> = {
  continue_workout: Play,
  start_short: Clock,
  start_workout: Play,
  morning_check_in: ClipboardCheck,
  mobility: StretchHorizontal,
  wind_down: Moon,
  log_meal: Utensils,
  mood_check_in: Smile,
}

function appendNote(notes: string, line: string): string {
  return [notes.trim(), line].filter(Boolean).join('\n')
}

export default function TodayScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(60_000)
  const today = toDateStr(now)
  const hour = now.getHours()

  const facts = useQuery(() => buildCoachFacts(today), [today, hour])
  const priority = useMemo(() => computeDailyPriority(facts), [facts])
  const pending = useQuery(() => getPendingDecisions(), [])
  const checkIn = useQuery(() => getCheckIn(today), [today])
  const mealsToday = useQuery(() => getMealsForDate(today).length, [today])
  const lastNight = useQuery(() => lastNightSleep(today), [today])
  const pillars = useQuery(() => buildPillars(), [today, hour])
  const moodToday = useQuery(() => moodLogsForDate(today).reduce<{ ts: string; valence: number } | null>((a, m) => (!a || m.ts > a.ts ? m : a), null), [today])

  const ai = useAIStatus()
  const [reasonsOpen, setReasonsOpen] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  // Training is locked until the intake is done (features/onboarding/setup.ts).
  const setup = useSetupGate()

  // Write this programme week's sessions when it has none yet, so Today shows the programme session (idempotent).
  useEffect(() => { try { ensureProgramWeek(today) } catch (e) { console.warn('ensureProgramWeek failed', e) } }, [today])

  // Keep the proposal queue fresh: inserts only proposals not already raised in the last 7 days.
  useEffect(() => {
    try {
      syncProposals()
    } catch (e) {
      console.warn('syncProposals failed', e)
    }
  }, [today])

  const session = facts.plannedToday
  // A workout started and never finished gets a nudge to wrap it up. The window runs a week ahead too: a
  // session can be started early, before its scheduled date.
  const staleSession = useQuery(() => getSessions(addDays(today, -14), addDays(today, 7)).find((s) => isStaleSession(s)) ?? null, [today, hour])
  // Programme sessions are never shortened (PRD §6.5), so canShorten stays false for them.
  const short = useMemo(() => (session && !isProgramDerived(session) ? shortenedVersion(session.exercises) : []), [session])
  const blocked = facts.readiness.state === 'RED' || facts.gate.overall === 'RED'

  const action = nextAction({
    hour,
    sessionStatus: session?.status ?? null,
    blocked,
    canShorten: short.length > 0,
    checkedIn: !!checkIn,
    mealsToday,
    proteinG: facts.intakeToday.proteinG,
    proteinExpectedG: facts.proteinPaceExpected,
    moodLogged: !!moodToday,
    mind: FEATURES.mind,
  })
  const ActionIcon = ACTION_ICON[action.kind]

  // Only shortens the plan; the session stays 'planned' so Workout runs the symptom gate
  // (startSessionWithGate stamps readiness and substitutes disallowed exercises) before it starts.
  const startShortened = () => {
    if (!session) return
    if (!setup.require('workout')) return
    updateSession(session.id, {
      exercises: short,
      notes: appendNote(session.notes, 'Shortened evening version (25–35 min)'),
    })
    toast.show('Shortened session ready — go.', 'success')
    navigate(`/train/session/${session.id}`)
  }

  const doAction = () => {
    switch (action.kind) {
      case 'continue_workout':
      case 'start_workout':
        if (session && setup.require('workout')) navigate(`/train/session/${session.id}`)
        return
      case 'start_short': return startShortened()
      case 'morning_check_in': return navigate('/checkin')
      case 'mobility': return navigate('/train/mobility')
      case 'wind_down': return navigate('/mind/breathe?technique=478&kind=winddown')
      case 'log_meal': return navigate('/eat')
      case 'mood_check_in': return navigate('/mind?checkin=1')
    }
  }

  const dial = PILLAR_ORDER.map((key) => ({
    key,
    label: PILLAR_LABEL[key],
    value: pillars[key].value,
    caption: pillars[key].caption,
    onClick: () => navigate(PILLAR_ROUTE[key]),
  }))

  // Summary rows = the dial's legend: same caption as the arc. Rows with nothing to show are hidden
  // when the pillar has a tab (Train, Eat, Mind); Rest has no tab, so its row stays and opens the log.
  const shown: Record<(typeof PILLAR_ORDER)[number], boolean> = {
    train: pillars.train.value > 0 || facts.sessionsThisWeek.length > 0,
    eat: pillars.eat.value > 0,
    rest: FEATURES.sleepTile,
    mind: FEATURES.mind && pillars.mind.value > 0,
  }
  const rows: SummaryRow[] = PILLAR_ORDER.filter((key) => shown[key]).map((key) => ({
    key,
    value: pillars[key].caption,
    onClick: key === 'rest' && !lastNight ? () => navigate('/sleep', { state: { log: true } }) : () => navigate(PILLAR_ROUTE[key]),
  }))

  const goCheckIn = () => { setReasonsOpen(false); navigate('/checkin') }
  const go = (to: string) => { setWhyOpen(false); navigate(to) }

  return (
    <Screen
      pillar="today"
      large
      eyebrow={`${dayName(today, false)} · ${fmtDate(today)}`}
      title={greeting(hour)}
      subtitle={!ai.connected && !ai.checking ? (
        <button type="button" onClick={() => navigate('/settings#ai')} className="press -my-2.5 inline-flex min-h-11 items-center gap-0.5 text-[15px] text-muted">
          Connect AI
          <ChevronRight size={16} className="text-faint" aria-hidden />
        </button>
      ) : undefined}
      right={
        <>
          <IconButton icon={<ChartLine size={22} />} label="Progress" onClick={() => navigate('/progress')} />
          <IconButton icon={<Settings size={22} />} label="Settings" onClick={() => navigate('/settings')} />
        </>
      }
    >
      <div className="flex flex-col gap-5" style={{ paddingBottom: COMPOSER_CLEARANCE + 16 }}>
        {/* Unfinished intake: the way back into setup is always in reach. */}
        <SetupPrompt />

        {/* 1. Hero: the Pillar Dial around the readiness decision, one quiet reason line. */}
        <Rise i={0} className="flex flex-col gap-2">
          <PillarDial
            hideLegend
            size={232}
            pillars={dial}
            center={<ReadinessCenter readiness={facts.readiness} onClick={() => setReasonsOpen(true)} />}
          />
          <ReasonLine reasons={facts.readiness.reasons} onOpen={() => setReasonsOpen(true)} />
        </Rise>

        {staleSession && staleSession.id !== session?.id && (
          <button
            type="button"
            onClick={() => navigate(`/train/session/${staleSession.id}`)}
            className="press flex min-h-14 w-full items-center gap-3 rounded-[1.25rem] border border-warn/40 bg-warn/5 px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-app">{staleSession.name.replace(/\s*\(.*\)$/, '')} is still open</span>
              <span className="block text-[13px] text-muted">{startedLabel(staleSession.startedAt)}. Wrap it up or mark it skipped.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
          </button>
        )}

        {/* 2. What to do now: one coach sentence, one primary action, one quiet "Why". */}
        <Rise i={1}>
          <section className="rounded-[1.25rem] border border-line bg-surface p-4" aria-label="Next">
            <p className="m-0 text-[17px] font-semibold leading-snug text-app text-balance">{priority.headline}</p>
            <div className="mt-4">
              <Button full size="lg" icon={<ActionIcon size={20} />} onClick={doAction}>{action.kind === 'continue_workout' && session && staleSession?.id === session.id ? 'Wrap up your workout' : action.label}</Button>
            </div>
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              aria-haspopup="dialog"
              aria-label={pending.length > 0 ? `Why this. ${pending.length} coach proposal${pending.length === 1 ? '' : 's'} waiting` : 'Why this'}
              className="press -mb-2 mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 text-[15px] text-muted"
            >
              Why this
              {pending.length > 0 && (
                <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] text-accent-fg" aria-hidden>{pending.length}</span>
              )}
            </button>
          </section>
        </Rise>

        {/* 3. Summary: one row per pillar, each opens its screen. */}
        <Rise i={2}>
          <SummaryList rows={rows} />
        </Rise>
      </div>

      <ReadinessSheet
        open={reasonsOpen}
        onClose={() => setReasonsOpen(false)}
        readiness={facts.readiness}
        gate={facts.gate}
        checkIn={checkIn}
        onCheckIn={goCheckIn}
      />

      <Sheet
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        title="Why this"
        footer={<Button full variant="secondary" onClick={() => go('/coach')}>Ask the coach</Button>}
      >
        <div className="flex flex-col gap-5 pt-1">
          {priority.directives.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-muted">Today</h3>
              <BulletList items={priority.directives} />
            </section>
          )}
          {priority.evidence.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-muted">Based on</h3>
              <dl className="m-0 grid grid-cols-2 gap-2">
                {priority.evidence.map((e, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface-2 px-3 py-2.5">
                    <dt className="eyebrow text-muted">{e.label}</dt>
                    <dd className="m-0 mt-1 text-[15px] font-semibold leading-snug">{e.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {action.kind === 'start_short' && session && (
            <Button full variant="outline" onClick={() => { if (setup.require('workout')) go(`/train/session/${session.id}`) }}>Do the full session instead</Button>
          )}
          {pending.length > 0 && (
            <button
              type="button"
              onClick={() => go('/coach')}
              className="press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 px-3 py-2.5 text-left"
            >
              <Inbox size={18} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="eyebrow block text-muted">{pending.length} waiting for your call</span>
                <span className="mt-0.5 block truncate text-[15px] font-medium">{pending[0].title}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
            </button>
          )}
          <p className="text-xs leading-snug text-muted">Guidance from your own logs. It is not a medical assessment.</p>
        </div>
      </Sheet>

      {setup.sheet}

      <Composer context="today" />
    </Screen>
  )
}
