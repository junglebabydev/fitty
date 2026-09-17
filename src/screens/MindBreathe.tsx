// Guided breathing. Full screen, tab bar hidden (see HIDE_TABS_PATTERNS in App.tsx).
// The schedule runs on wall-clock timestamps (useBreathingSession); the orb is a CSS transition per phase.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Info, Pause, Play, Square } from 'lucide-react'
import { BreathOrb, Button, Chip, IconButton, MoodSlider, Screen, Sheet } from '../components'
import { useQuery, useToast } from '../hooks'
import { addMindSession, getCheckIn, getMindSessions, lastNightSleep, latestMoodLog } from '../db/repositories'
import { BREATHING_TECHNIQUES, suggestTechnique } from '../engine/mind'
import type { MindSession } from '../domain/types'
import { acquireWakeLock } from '../native'
import { dateOf, hourNow, nowIso, todayStr } from '../lib/util'
import { approxMinutes, durationOptions, fmtClock, patternLabel, shouldSavePartial } from '../features/mind/breathing'
import { moodDeltaSentence } from '../features/mind/helpers'
import { useBreathingSession } from '../features/mind/useBreathingSession'

interface SessionMeta {
  ts: string
  technique: string
  kind: MindSession['kind']
  valenceBefore: number | null
}

function defaultTechniqueId(): string {
  const today = todayStr()
  const latest = latestMoodLog()
  const pick = suggestTechnique({
    stress: getCheckIn(today)?.stress ?? null,
    valence: latest && dateOf(latest.ts) === today ? latest.valence : null,
    hourNow: hourNow(),
    sleepLastNightMin: lastNightSleep(today)?.durationMin ?? null,
  })
  return BREATHING_TECHNIQUES.some((t) => t.id === pick.techniqueId) ? pick.techniqueId : BREATHING_TECHNIQUES[0].id
}

export default function MindBreatheScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const kind: MindSession['kind'] = params.get('kind') === 'winddown' ? 'winddown' : 'breathing'

  const [techniqueId, setTechniqueId] = useState<string>(() => {
    const asked = params.get('technique')
    return asked && BREATHING_TECHNIQUES.some((t) => t.id === asked) ? asked : defaultTechniqueId()
  })
  const technique = BREATHING_TECHNIQUES.find((t) => t.id === techniqueId) ?? BREATHING_TECHNIQUES[0]
  const options = useMemo(() => durationOptions(technique.phases, technique.maxCycles), [technique])
  const [minutes, setMinutes] = useState(3)
  const option = options.find((o) => o.minutes === minutes) ?? options[options.length - 1]
  const plan = option.plan

  const [moodOpen, setMoodOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [before, setBefore] = useState<number | null>(null)
  const [after, setAfter] = useState<number | null>(null)
  const [doneSec, setDoneSec] = useState(0)

  const meta = useRef<SessionMeta | null>(null)
  const saved = useRef(true)

  const session = useBreathingSession(technique.phases, plan, (activeSec) => setDoneSec(activeSec))
  const { status, position } = session

  // Seconds already saved in the last 7 days; the finished session is added on top until it is written.
  const savedSec7 = useQuery(() => getMindSessions(7).reduce((sum, s) => sum + s.durationSec, 0), [])

  const write = (completed: boolean, durationSec: number, valenceAfter: number | null) => {
    if (saved.current || !meta.current) return
    saved.current = true
    addMindSession({ ...meta.current, durationSec: Math.round(durationSec), completed, valenceAfter })
  }

  // Leaving the screen (or closing the tab) keeps a finished session, or an unfinished one of 30 s or more.
  const finalize = useRef<() => void>(() => {})
  finalize.current = () => {
    if (status === 'done') write(true, doneSec, after)
    else if (status === 'running' || status === 'paused') {
      const sec = session.getActiveSec()
      if (shouldSavePartial(sec)) write(false, sec, null)
    }
  }
  useEffect(() => {
    const onHide = () => finalize.current()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      finalize.current()
    }
  }, [])

  // Keep the screen awake only while the guide is moving.
  useEffect(() => {
    if (status !== 'running') return
    let release: (() => void) | null = null
    let cancelled = false
    void acquireWakeLock().then((r) => {
      if (cancelled) r()
      else release = r
    })
    return () => {
      cancelled = true
      release?.()
    }
  }, [status])

  const start = () => {
    meta.current = { ts: nowIso(), technique: technique.id, kind, valenceBefore: before }
    saved.current = false
    setAfter(null)
    setDoneSec(0)
    session.start()
  }

  const endEarly = () => {
    const sec = session.end()
    if (shouldSavePartial(sec)) {
      write(false, sec, null)
      toast.show(`${approxMinutes(sec)} min counted toward this week`, 'info')
    }
    saved.current = true
  }

  const finish = (goAgain: boolean) => {
    write(true, doneSec, after)
    if (goAgain) {
      setBefore(after ?? before)
      session.reset()
    } else {
      navigate('/mind', { replace: true })
    }
  }

  const active = status === 'running' || status === 'paused'
  const pendingSec = status === 'done' && !saved.current ? doneSec : 0
  const weekMinutes = Math.round((savedSec7 + pendingSec) / 60)

  if (status === 'done') {
    return (
      <Screen pillar="mind" back>
        <div className="flex flex-1 flex-col items-center gap-8 pb-8 pt-4 text-center">
          <div className="anim-fade-in flex flex-col items-center gap-2" style={{ animationDuration: '800ms' }}>
            <BreathOrb phase="idle" seconds={1} label="Done" size={180} />
            <p className="voice m-0 mt-2 text-2xl text-app">{approxMinutes(doneSec)} {approxMinutes(doneSec) === 1 ? 'minute' : 'minutes'} of {technique.name.toLowerCase()}.</p>
            <p className="m-0 text-base text-muted">
              <span className="num text-2xl text-app">{weekMinutes}</span> mindful {weekMinutes === 1 ? 'minute' : 'minutes'} in the last 7 days
            </p>
          </div>

          <section aria-label="How do you feel now" className="w-full rounded-[1.25rem] border border-line bg-surface p-4">
            <h2 className="eyebrow m-0 text-pillar">How do you feel now?</h2>
            <MoodSlider value={after ?? before ?? 0} onChange={setAfter} />
            {after != null && <p className="voice m-0 mt-3 text-lg text-app" role="status">{moodDeltaSentence(before, after)}</p>}
          </section>

          <div className="mt-auto flex w-full flex-col gap-2">
            <Button size="lg" full onClick={() => finish(false)}>Done</Button>
            <Button variant="ghost" size="lg" full onClick={() => finish(true)}>Go again</Button>
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      pillar="mind"
      back
      right={active ? undefined : <IconButton icon={<Info size={20} />} label={`About ${technique.name}`} onClick={() => setInfoOpen(true)} />}
    >
      <div className="flex flex-1 flex-col pb-6">
        {!active && (
          <div className="anim-fade-in flex flex-col gap-5">
            <div>
              <p className="eyebrow m-0 text-pillar">{kind === 'winddown' ? 'Wind down' : 'Breathe'}</p>
              <h1 className="display m-0 mt-1 text-4xl text-app">{technique.name}</h1>
            </div>

            <fieldset className="m-0 border-0 p-0">
              <legend className="eyebrow mb-2 p-0 text-muted">Technique</legend>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
                {BREATHING_TECHNIQUES.map((t) => (
                  <Chip key={t.id} className="min-h-11 shrink-0" selected={t.id === technique.id} check onClick={() => setTechniqueId(t.id)}>{t.name}</Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="m-0 border-0 p-0">
              <legend className="eyebrow mb-2 p-0 text-muted">Length</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <Chip key={o.minutes} className="min-h-11 min-w-[72px] justify-center" selected={o.minutes === option.minutes} check onClick={() => setMinutes(o.minutes)}>{o.label}</Chip>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
          <BreathOrb
            phase={status === 'running' ? position.phase.phase : 'idle'}
            seconds={status === 'running' ? position.phase.seconds : 0.7}
            label={status === 'running' ? position.phase.label : status === 'paused' ? 'Paused' : 'Ready'}
            size={active ? 280 : 220}
          />
          {active && (
            <p
              className="num m-0 text-5xl text-app"
              role="timer"
              aria-label={`${fmtClock(position.remaining)} remaining, cycle ${position.cycleIndex + 1} of ${plan.cycles}`}
            >
              {fmtClock(position.remaining)}
            </p>
          )}
        </div>

        {!active ? (
          <div className="flex flex-col gap-3">
            {moodOpen ? (
              <section aria-label="How do you feel right now" className="rounded-[1.25rem] border border-line bg-surface p-4">
                <h2 className="eyebrow m-0 text-muted">Right now I feel</h2>
                <MoodSlider value={before ?? 0} onChange={setBefore} />
              </section>
            ) : (
              <Button variant="ghost" full onClick={() => setMoodOpen(true)}>
                {before == null ? 'Rate your mood first' : 'Change mood rating'}
              </Button>
            )}
            <Button size="lg" full icon={<Play size={20} />} onClick={start}>Start</Button>
          </div>
        ) : (
          <div className="flex gap-3">
            {status === 'running' ? (
              <Button variant="secondary" size="lg" full icon={<Pause size={20} />} onClick={session.pause}>Pause</Button>
            ) : (
              <Button size="lg" full icon={<Play size={20} />} onClick={session.resume}>Resume</Button>
            )}
            <Button variant="outline" size="lg" full icon={<Square size={18} />} onClick={endEarly}>End</Button>
          </div>
        )}
      </div>

      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title={technique.name}>
        <div data-pillar="mind" className="flex flex-col gap-3 pb-2">
          <p className="voice m-0 text-xl text-app">{technique.purpose}.</p>
          <p className="m-0 text-base text-muted">
            <span className="num text-2xl text-app">{patternLabel(technique.phases)}</span> seconds · {plan.cycles} {plan.cycles === 1 ? 'cycle' : 'cycles'} · {fmtClock(plan.totalSec)}
          </p>
          <p className="m-0 text-base text-muted">{technique.note}</p>
        </div>
      </Sheet>
    </Screen>
  )
}
