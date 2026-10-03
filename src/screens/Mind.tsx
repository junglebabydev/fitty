// Mind home (DESIGN §10.1 budget, §11 Apple minimal): the check-in hero, one breathe card, list rows for
// Journal / Rest / Mood, and the always-visible Support row. The 14-day chart, weekly numbers and gated
// insights sit behind the Mood row (Patterns sheet).
// Behaviour support only. Nothing here diagnoses, names a condition or scores a questionnaire.
import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, CalendarCheck, ChevronRight, LifeBuoy, Moon, NotebookPen, Timer, X } from 'lucide-react'
import { Button, Card, Divider, LineChart, ListRow, Screen, Sheet, StatTile } from '../components'
import { useNow, useQuery } from '../hooks'
import {
  getCheckIn, getJournalEntries, getMindSessions, getMoodLogs, getSessions, getSetting, getSleepRecords, lastNightSleep, mindfulMinutes, moodLogsForDate, setSetting,
} from '../db/repositories'
import { VALENCE_WORDS, mindInsights, moodSummary, suggestTechnique, supportSignal } from '../engine/mind'
import { addDays, dateOf, daysBetween, fmtDate, fmtDuration, fmtTime, toDateStr } from '../lib/util'
import { BreatheRow } from '../features/mind/BreatheRow'
import { MoodCheckInSheet } from '../features/mind/MoodCheckInSheet'
import { MoodOrb } from '../features/mind/MoodOrb'
import { SupportSheet } from '../features/mind/SupportSheet'
import { dailyMoodSeries, fmtValence, moodHeadline, suggestReason } from '../features/mind/helpers'

const SUPPORT_DISMISSED_KEY = 'mind.supportDismissedOn'
/** A dismissed support card stays away for a few days rather than returning every morning. */
const SUPPORT_QUIET_DAYS = 3
const CALIBRATION_DAYS = 14
const INSIGHT_WINDOW = 90

const rise = (i: number) => ({ '--i': i }) as CSSProperties

/** Observation only, never a verdict: how this week compares with the week before. */
const TREND_WORD = { up: 'Lighter', down: 'Heavier', flat: 'Steady' } as const

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
  const lastEntry = useQuery(() => getJournalEntries(1)[0] ?? null, [today])
  const trendWord = summary.trend ? TREND_WORD[summary.trend] : null
  const fmtEntryDay = (d: string) => (d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : fmtDate(d))

  const pickInput = { stress: checkIn?.stress ?? null, valence: latest?.valence ?? null, hourNow: hour, sleepLastNightMin: sleep?.durationMin ?? null }
  const pick = suggestTechnique(pickInput)
  const headline = moodHeadline(summary, VALENCE_WORDS)
  const moodWord = latest ? VALENCE_WORDS[latest.valence] ?? 'Neutral' : null

  return (
    <Screen pillar="mind" large title="Mind" eyebrow={fmtDate(today)}>
      <div className="flex flex-col gap-5 pb-10">
        {/* Hero: the check-in, or today's state in one line once it is done. */}
        {latest && moodWord ? (
          <section aria-label="State of mind" className="anim-rise" style={rise(0)}>
            <button
              type="button"
              onClick={() => setCheckInOpen(true)}
              aria-label={`Today feels ${moodWord.toLowerCase()}, logged at ${fmtTime(latest.ts)}. Log again`}
              className="press flex min-h-14 w-full items-center gap-3 text-left text-app"
            >
              <MoodOrb valence={latest.valence} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold leading-tight">{moodWord}</span>
                <span className="mt-0.5 block text-[13px] text-muted">Today · {fmtTime(latest.ts)}</span>
              </span>
              <span className="shrink-0 text-[15px] text-pillar">Log again</span>
            </button>
          </section>
        ) : (
          <section aria-label="State of mind" className="anim-rise flex flex-col items-center gap-4 pt-2 text-center" style={rise(0)}>
            <MoodOrb valence={null} />
            <h2 className="display m-0 text-[28px] text-app">How are you feeling?</h2>
            <Button size="lg" full onClick={() => setCheckInOpen(true)}>Check in</Button>
          </section>
        )}

        {/* Gentle, dismissible support card: an observation plus an option. */}
        {supportVisible && (
          <section aria-label="A note from the app" className="anim-rise" style={rise(1)}>
            <div className="rounded-[1.25rem] border border-pillar-line bg-pillar-soft p-4">
              <div className="flex items-start gap-3">
                <LifeBuoy size={22} className="mt-0.5 shrink-0 text-pillar" aria-hidden />
                <p className="m-0 flex-1 text-[17px] leading-snug text-app">{support.message}</p>
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

        {/* Breathe: one suggested technique; the rest behind "Other techniques". */}
        <section aria-label="Breathe" className="anim-rise" style={rise(2)}>
          <BreatheRow
            suggestedId={pick.techniqueId}
            reason={suggestReason(pickInput)}
            primary={latest != null}
            onPick={(id) => navigate(`/mind/breathe?technique=${encodeURIComponent(id)}`)}
          />
        </section>

        {/* Journal, rest and the mood trend as plain list rows. */}
        <section aria-label="Journal, rest and mood" className="anim-rise" style={rise(3)}>
          <Card flush>
            <ListRow
              icon={<NotebookPen size={18} className="text-mind" />}
              title="Journal"
              right={lastEntry ? fmtEntryDay(dateOf(lastEntry.ts)) : undefined}
              chevron
              onClick={() => navigate('/mind/journal')}
            />
            <Divider inset />
            <ListRow
              icon={<Moon size={18} className="text-rest" />}
              title="Rest"
              right={sleep ? fmtDuration(sleep.durationMin) : undefined}
              chevron
              onClick={() => navigate('/sleep')}
            />
            <Divider inset />
            <ListRow
              icon={<Activity size={18} className="text-mind" />}
              title="Mood"
              right={trendWord ?? undefined}
              chevron
              onClick={() => setPatternsOpen(true)}
            />
          </Card>
        </section>

        {/* Support: always visible, quiet, two taps to a phone number. */}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="press anim-rise flex min-h-11 w-full items-center gap-2.5 px-1 text-left text-[15px] text-muted"
          style={rise(4)}
        >
          <LifeBuoy size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1"><span className="font-medium text-app">Support</span> · people to talk to, any time</span>
          <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
        </button>
      </div>

      {/* Patterns: weekly numbers and gated insights, one tap away from the root. */}
      <Sheet open={patternsOpen} onClose={() => setPatternsOpen(false)} title="Patterns">
        <div data-pillar="mind" className="flex flex-col gap-3 pb-2">
          <Card pillar="mind" eyebrow="Last 14 days">
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
          </Card>
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
              <p className="m-0 text-[17px] text-app">Patterns appear after about two weeks of check-ins.</p>
              <p className="m-0 mt-2 text-sm text-muted">Day {Math.min(daysLogged, CALIBRATION_DAYS)} of {CALIBRATION_DAYS}</p>
            </Card>
          ) : (
            insights.map((ins) => (
              <Card key={ins.id}>
                <p className="m-0 text-[17px] leading-snug text-app">{ins.text}</p>
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
