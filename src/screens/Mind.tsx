// Mind home (DESIGN §10.1 budget): greeting, mood orb, breathe row, journal + rest tiles, 14-day mood line.
// Weekly stats and insights sit behind "See patterns". The Support line is always visible.
// Behaviour support only. Nothing here diagnoses, names a condition or scores a questionnaire.
import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarCheck, ChevronRight, LifeBuoy, Moon, NotebookPen, Timer, X } from 'lucide-react'
import { Button, Card, LineChart, Screen, Sheet, StatTile } from '../components'
import { useNow, useQuery } from '../hooks'
import {
  getCheckIn, getMindSessions, getMoodLogs, getSessions, getSetting, getSleepRecords, lastNightSleep, mindfulMinutes, moodLogsForDate, setSetting,
} from '../db/repositories'
import { VALENCE_WORDS, mindInsights, moodSummary, promptForDate, suggestTechnique, supportSignal } from '../engine/mind'
import { addDays, dateOf, daysBetween, fmtDate, fmtDuration, fmtTime, toDateStr } from '../lib/util'
import { BreatheRow } from '../features/mind/BreatheRow'
import { MoodCheckInSheet } from '../features/mind/MoodCheckInSheet'
import { MoodOrb } from '../features/mind/MoodOrb'
import { SupportSheet } from '../features/mind/SupportSheet'
import { clipWords, dailyMoodSeries, fmtValence, mindGreeting, moodHeadline, promptBody, suggestReason } from '../features/mind/helpers'

const SUPPORT_DISMISSED_KEY = 'mind.supportDismissedOn'
/** A dismissed support card stays away for a few days rather than returning every morning. */
const SUPPORT_QUIET_DAYS = 3
const CALIBRATION_DAYS = 14
const INSIGHT_WINDOW = 90

const rise = (i: number) => ({ '--i': i }) as CSSProperties

export default function MindScreen() {
  const navigate = useNavigate()
  const now = useNow(60_000)
  const today = toDateStr(now)
  const hour = now.getHours()

  const [params, setParams] = useSearchParams()
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [patternsOpen, setPatternsOpen] = useState(false)

  // /mind?checkin=1 opens the sheet once; the flag is dropped so Back or a reload does not reopen it.
  useEffect(() => {
    if (params.get('checkin') !== '1') return
    setCheckInOpen(true)
    const next = new URLSearchParams(params)
    next.delete('checkin')
    setParams(next, { replace: true })
  }, [params, setParams])

  const moodsToday = useQuery(() => moodLogsForDate(today), [today])
  const moods = useQuery(() => getMoodLogs(INSIGHT_WINDOW), [today])
  const checkIn = useQuery(() => getCheckIn(today), [today])
  const sleep = useQuery(() => lastNightSleep(today), [today])
  const minutes7 = useQuery(() => mindfulMinutes(addDays(today, -6), today), [today])
  const dismissedOn = useQuery(() => getSetting<string>(SUPPORT_DISMISSED_KEY, ''), [])
  const insights = useQuery(
    () => mindInsights({
      moods: getMoodLogs(INSIGHT_WINDOW),
      sleep: getSleepRecords(INSIGHT_WINDOW),
      sessions: getSessions(addDays(today, -(INSIGHT_WINDOW - 1)), today),
      mindSessions: getMindSessions(INSIGHT_WINDOW),
      today,
    }),
    [today],
  )

  const latest = moodsToday.length ? moodsToday[moodsToday.length - 1] : null
  const summary = moodSummary(moods, today)
  const series = dailyMoodSeries(moods, today, 14).map((p) => ({ x: fmtDate(p.x), y: p.y }))
  const daysLogged = new Set(moods.map((m) => dateOf(m.ts))).size
  const support = supportSignal(moods, today)
  const supportVisible = support.show && !(dismissedOn && daysBetween(dismissedOn, today) < SUPPORT_QUIET_DAYS)
  const prompt = promptForDate(today)

  const pickInput = { stress: checkIn?.stress ?? null, valence: latest?.valence ?? null, hourNow: hour, sleepLastNightMin: sleep?.durationMin ?? null }
  const pick = suggestTechnique(pickInput)
  const headline = moodHeadline(summary, VALENCE_WORDS)
  const moodWord = latest ? VALENCE_WORDS[latest.valence] ?? 'Neutral' : null

  return (
    <Screen pillar="mind" large title="Mind" eyebrow={fmtDate(today)} subtitle={<span className="voice text-lg text-app">{mindGreeting(hour)}</span>}>
      <div className="relative flex flex-col gap-5 pb-10">
        {/* Ambient wash behind the header. Decorative only; stops under reduced motion. */}
        <div className="pointer-events-none absolute -inset-x-4 -top-44 h-80 overflow-hidden" aria-hidden>
          <span className="anim-drift absolute -left-10 top-6 h-56 w-56 rounded-full bg-mind opacity-[0.13] blur-3xl" />
          <span className="anim-drift absolute -right-12 top-24 h-48 w-48 rounded-full bg-rest opacity-[0.10] blur-3xl" style={{ animationDelay: '-4s' }} />
        </div>

        {/* Mood orb: today's state of mind, or the check-in call to action. */}
        <section aria-label="State of mind" className="anim-rise relative flex justify-center" style={rise(0)}>
          <button
            type="button"
            onClick={() => setCheckInOpen(true)}
            aria-label={moodWord && latest ? `Today feels ${moodWord.toLowerCase()}, logged at ${fmtTime(latest.ts)}. Log again` : 'How are you? Check in'}
            className="press flex min-w-[240px] flex-col items-center rounded-[2rem] px-6 pb-1 pt-3 text-app"
          >
            <MoodOrb valence={latest?.valence ?? null} />
            <span className="voice mt-6 block text-3xl">{moodWord ?? 'How are you?'}</span>
            <span className="mt-1 block text-sm text-muted">{latest ? `${fmtTime(latest.ts)} · tap to log again` : 'Tap to check in'}</span>
          </button>
        </section>

        {/* Gentle, dismissible support card: an observation plus an option. */}
        {supportVisible && (
          <section aria-label="A note from the app" className="anim-rise relative" style={rise(1)}>
            <div className="rounded-[1.25rem] border border-pillar-line bg-pillar-soft p-4">
              <div className="flex items-start gap-3">
                <LifeBuoy size={22} className="mt-0.5 shrink-0 text-pillar" aria-hidden />
                <p className="voice m-0 flex-1 text-lg text-app">{support.message}</p>
                <button
                  type="button"
                  aria-label="Dismiss this note"
                  onClick={() => setSetting(SUPPORT_DISMISSED_KEY, today)}
                  className="press -mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>
              <div className="mt-3">
                <Button variant="secondary" onClick={() => setSupportOpen(true)}>See who you can talk to</Button>
              </div>
            </div>
          </section>
        )}

        {/* Breathe */}
        <section aria-label="Breathe" className="anim-rise relative flex flex-col gap-2" style={rise(2)}>
          <h2 className="eyebrow m-0 text-pillar">Breathe</h2>
          <BreatheRow
            suggestedId={pick.techniqueId}
            reason={suggestReason(pickInput)}
            onPick={(id) => navigate(`/mind/breathe?technique=${encodeURIComponent(id)}`)}
          />
        </section>

        {/* Journal + Rest */}
        <section aria-label="Journal and rest" className="anim-rise relative grid grid-cols-2 gap-3" style={rise(3)}>
          <button
            type="button"
            onClick={() => navigate('/mind/journal')}
            aria-label={`Journal. Today's prompt: ${promptBody(prompt.text)}`}
            className="press flex min-w-0 flex-col rounded-[1.25rem] border border-line bg-surface p-3.5 text-left text-app active:bg-surface-2"
          >
            <span className="eyebrow flex items-center gap-1.5 text-pillar"><NotebookPen size={13} strokeWidth={2.25} aria-hidden />Journal</span>
            <span className="mt-2 flex h-10 items-center text-pillar" aria-hidden><NotebookPen size={30} strokeWidth={1.5} /></span>
            <span className="mt-1.5 block w-full truncate text-xs text-muted">{clipWords(promptBody(prompt.text), 6)}</span>
          </button>
          <StatTile
            pillar="rest"
            icon={Moon}
            label="Rest"
            value={sleep ? fmtDuration(sleep.durationMin) : '—'}
            sub={sleep ? 'Last night' : 'Not logged'}
            onClick={() => navigate('/sleep')}
          />
        </section>

        {/* 14-day mood line */}
        <section aria-label="Last 14 days" className="anim-rise relative" style={rise(4)}>
          <Card pillar="mind" eyebrow="14 days">
            <p className="m-0 text-[17px] font-semibold leading-snug text-app">{headline}</p>
            <div className="mt-2">
              <LineChart
                points={series}
                pillar="mind"
                height={112}
                yFormat={(n) => fmtValence(n)}
                showDots
                ariaLabel={`Daily mood over the last 14 days, from minus 3 very unpleasant to plus 3 very pleasant. ${headline}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setPatternsOpen(true)}
              className="press -mb-2 mt-1 flex min-h-11 w-full items-center justify-between text-[15px] font-medium text-pillar"
            >
              See patterns
              <ChevronRight size={18} aria-hidden />
            </button>
          </Card>
        </section>

        {/* Support: always visible, quiet, two taps to a phone number. */}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="press anim-rise relative flex min-h-11 w-full items-center gap-2.5 px-1 text-left text-[15px] text-muted"
          style={rise(5)}
        >
          <LifeBuoy size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1"><span className="font-medium text-app">Support</span> · people to talk to, any time</span>
          <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
        </button>
      </div>

      {/* Patterns: weekly numbers and gated insights, one tap away from the root. */}
      <Sheet open={patternsOpen} onClose={() => setPatternsOpen(false)} title="Patterns">
        <div data-pillar="mind" className="flex flex-col gap-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Checked in" value={summary.daysCheckedIn7} unit="of 7" sub="This week" icon={CalendarCheck} pillar="mind" />
            <StatTile label="Mindful" value={minutes7} unit="min" sub="This week" icon={Timer} pillar="mind" />
          </div>
          {summary.avg7 != null && (
            <p className="m-0 px-1 text-sm text-muted">
              7-day average <span className="num text-xl text-app">{fmtValence(summary.avg7)}</span>
              {summary.prevAvg7 != null && <> · week before <span className="num text-xl text-app">{fmtValence(summary.prevAvg7)}</span></>}
              <span className="block text-[13px]">−3 very unpleasant · 0 neutral · +3 very pleasant</span>
            </p>
          )}
          {insights.length === 0 ? (
            <Card>
              <p className="voice m-0 text-lg text-app">Patterns appear after about two weeks of check-ins.</p>
              <p className="m-0 mt-2 text-sm text-muted">Day {Math.min(daysLogged, CALIBRATION_DAYS)} of {CALIBRATION_DAYS}</p>
            </Card>
          ) : (
            insights.map((ins) => (
              <Card key={ins.id}>
                <p className="voice m-0 text-lg text-app">{ins.text}</p>
                <dl className="m-0 mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="eyebrow text-muted">With</dt>
                    <dd className="m-0 mt-1"><span className="num text-3xl text-app">{fmtValence(ins.withAvg)}</span> <span className="text-sm text-muted">avg · {ins.nWith} days</span></dd>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="eyebrow text-muted">Without</dt>
                    <dd className="m-0 mt-1"><span className="num text-3xl text-app">{fmtValence(ins.withoutAvg)}</span> <span className="text-sm text-muted">avg · {ins.nWithout} days</span></dd>
                  </div>
                </dl>
                <p className="m-0 mt-3 text-[13px] text-muted">{ins.caveat}</p>
              </Card>
            ))
          )}
        </div>
      </Sheet>

      <MoodCheckInSheet open={checkInOpen} onClose={() => setCheckInOpen(false)} />
      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
    </Screen>
  )
}
