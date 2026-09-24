// Today — the decision hub, v3 (DESIGN §10.1): ≤ 1.6 screens, ≤ 110 words, 5 blocks.
//   1 header · 2 Pillar Dial + readiness · 3 one coach sentence + one action · 4 pillar tiles · Composer.
// Everything else is one tap away: reasons + check-in (dial sheet), directives + evidence + proposals
// (Why sheet), full session / plan (Train tile), sleep log (Rest tile), weight (Progress icon or Composer).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChartLine, ChevronRight, ClipboardCheck, Clock, Inbox, Moon, Play, Settings, Smile, StretchHorizontal, Utensils, type LucideIcon,
} from 'lucide-react'
import type { WorkoutSession } from '../domain/types'
import { dateOf, dayName, fmtDate, toDateStr } from '../lib/util'
import { AIStatusChip, Button, IconButton, PillarDial, Screen, Sheet } from '../components'
import { useNow, useQuery, useToast } from '../hooks'
import { getCheckIn, getMealsForDate, getPendingDecisions, getSetting, lastNightSleep, moodLogsForDate, updateSession } from '../db/repositories'
import { EXERCISE_BY_ID } from '../data'
import { SESSION_TEMPLATES, VALENCE_WORDS, computeDailyPriority, estimateSessionMinutes, shortenedVersion } from '../engine'
import { getHealthBridge } from '../native'
import { buildCoachFacts, buildPillars } from '../features/coach/facts'
import { syncProposals } from '../features/coach/apply'
import { Composer } from '../features/composer'
import { importHealthData } from '../features/settings/healthImport'
import { KEYS, readHealthPermissions } from '../features/settings/keys'
import { nextAction, type NextActionKind } from '../features/today/nextAction'
import { ReadinessCenter, ReadinessSheet, ReasonChips } from '../features/today/readiness'
import { FEATURES } from '../config/features'
import { EatTile, MindTile, RestTile, TrainTile } from '../features/today/tiles'
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

function sessionMinutes(s: WorkoutSession): number {
  const t = SESSION_TEMPLATES[s.templateKey]
  return t && t.exercises.length === s.exercises.length ? t.estMin : estimateSessionMinutes(s.exercises)
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

  const [reasonsOpen, setReasonsOpen] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)

  // Keep the proposal queue fresh: inserts only proposals not already raised in the last 7 days.
  useEffect(() => {
    try {
      syncProposals()
    } catch (e) {
      console.warn('syncProposals failed', e)
    }
  }, [today])

  // Morning Apple Health pull (PRD §7.1, §18): once a day when permitted, so readiness and the
  // Rest tile do not sit on stale local data until a manual import.
  useEffect(() => {
    const last = getSetting<string | null>(KEYS.healthLastImport, null)
    if (last && dateOf(last) === today) return
    const perms = readHealthPermissions()
    if (perms.sleep !== 'granted' && perms.bodyMass !== 'granted' && perms.restingHeartRate !== 'granted') return
    let cancelled = false
    getHealthBridge()
      .isAvailable()
      .then((a) => (a.available && !cancelled ? importHealthData(7) : null))
      .then((r) => {
        if (r?.error && !cancelled) toast.show(`Apple Health import: ${r.error}`, 'error')
      })
      .catch((e: unknown) => console.warn('health import failed', e))
    return () => { cancelled = true }
  }, [today, toast])

  const session = facts.plannedToday
  const short = useMemo(() => (session ? shortenedVersion(session.exercises) : []), [session])
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
        if (session) navigate(`/train/session/${session.id}`)
        return
      case 'start_short': return startShortened()
      case 'morning_check_in': return navigate('/checkin')
      case 'mobility': return navigate('/train/mobility')
      case 'wind_down': return navigate('/mind/breathe?technique=478&kind=winddown')
      case 'log_meal': return navigate('/eat')
      case 'mood_check_in': return navigate('/mind?checkin=1')
    }
  }

  // Train tile: today's session, else the next planned one this week.
  const nextSession = session
    ?? [...facts.sessionsThisWeek].filter((s) => s.status === 'planned' && s.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
    ?? null
  const firstExercise = nextSession?.exercises[0] ? EXERCISE_BY_ID[nextSession.exercises[0].exerciseId] ?? null : null

  const dial = PILLAR_ORDER.map((key) => ({
    key,
    label: PILLAR_LABEL[key],
    value: pillars[key].value,
    caption: pillars[key].caption,
    onClick: () => navigate(PILLAR_ROUTE[key]),
  }))
  const goCheckIn = () => { setReasonsOpen(false); navigate('/checkin') }
  const go = (to: string) => { setWhyOpen(false); navigate(to) }

  return (
    <Screen
      pillar="today"
      large
      eyebrow={`${dayName(today, false)} · ${fmtDate(today)}`}
      title={greeting(hour)}
      subtitle={<AIStatusChip onClick={() => navigate('/settings#ai')} />}
      right={
        <>
          <IconButton icon={<ChartLine size={22} />} label="Progress" onClick={() => navigate('/progress')} />
          <IconButton icon={<Settings size={22} />} label="Settings" onClick={() => navigate('/settings')} />
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-24">
        {/* 2. Hero: the Pillar Dial around the readiness decision. The tiles below are its legend. */}
        <Rise i={0} className="flex flex-col gap-4">
          <PillarDial
            hideLegend
            size={248}
            pillars={dial}
            center={<ReadinessCenter readiness={facts.readiness} onClick={() => setReasonsOpen(true)} />}
          />
          <ReasonChips reasons={facts.readiness.reasons} onOpen={() => setReasonsOpen(true)} />
        </Rise>

        {/* 3. One coach sentence, one action. */}
        <Rise i={1}>
          <section className="relative rounded-[1.25rem] border border-line bg-surface p-4" aria-label="Coach">
            {pending.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/coach')}
                aria-label={`${pending.length} coach proposal${pending.length === 1 ? '' : 's'} waiting. Open Coach`}
                className="press absolute right-1.5 top-1.5 inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-muted"
              >
                <Inbox size={16} aria-hidden />
                <span className="num text-base text-app">{pending.length}</span>
                <span className="absolute right-2 top-2.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              </button>
            )}
            <p className={`voice m-0 text-xl leading-snug text-balance ${pending.length > 0 ? 'pr-12' : ''}`}>{priority.headline}</p>
            <div className="mt-3.5 flex items-center gap-1">
              <Button full size="lg" icon={<ActionIcon size={20} />} onClick={doAction}>{action.label}</Button>
              <button
                type="button"
                onClick={() => setWhyOpen(true)}
                aria-haspopup="dialog"
                className="press inline-flex min-h-11 shrink-0 items-center gap-0.5 pl-3 pr-1 text-sm font-semibold text-muted"
              >
                Why
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          </section>
        </Rise>

        {/* 4. Pillar tiles. */}
        <div className="grid grid-cols-2 gap-3">
          <Rise i={2} className="grid min-w-0">
            <TrainTile
              name={nextSession?.name ?? null}
              minutes={nextSession ? sessionMinutes(nextSession) : null}
              when={nextSession && nextSession.scheduledDate !== today ? dayName(nextSession.scheduledDate, true) : null}
              exercise={firstExercise}
              onClick={() => navigate(session ? `/train/session/${session.id}` : '/train')}
            />
          </Rise>
          <Rise i={3} className="grid min-w-0">
            <EatTile
              proteinG={facts.intakeToday.proteinG}
              proteinTarget={facts.target.proteinG}
              kcal={facts.intakeToday.kcal}
              kcalTarget={facts.target.kcal}
              onClick={() => navigate('/eat')}
            />
          </Rise>
          {FEATURES.sleepTile && <Rise i={4} className="grid min-w-0">
            <RestTile
              lastMin={lastNight?.durationMin ?? null}
              avgMin={facts.sleepAvg7Min}
              onClick={() => (lastNight ? navigate('/sleep') : navigate('/sleep', { state: { log: true } }))}
            />
          </Rise>}
          {FEATURES.mind && <Rise i={5} className="grid min-w-0">
            <MindTile
              valence={moodToday?.valence ?? null}
              word={moodToday ? VALENCE_WORDS[moodToday.valence] ?? 'Logged' : null}
              onClick={() => navigate(moodToday ? '/mind' : '/mind?checkin=1')}
            />
          </Rise>}
        </div>
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
            <Button full variant="outline" onClick={() => go(`/train/session/${session.id}`)}>Do the full session instead</Button>
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

      <Composer context="today" />
    </Screen>
  )
}
