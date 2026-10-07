// "Do it with Coach": the same session row as the player, done as a chat. The coach posts one step at a time and you
// answer with a tap or a few words ("12", "10 at 16 kg", "done", "skip", "how?"). Steps, logging, the symptom gate,
// pain and finishing run on the phone with the player's own functions and sheets, so the player, Today and history see
// exactly the same sets. Only open questions go to the coach service, with this chat as the conversation.
// Everything resumes from the database; the chat text is kept for the browser session only.
//   /coach/workout/:id     a session row
//   /coach/workout/today   today's Blueprint session (?key=w1d3 for another day's), asked or created first
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUp, List, ShieldAlert } from 'lucide-react'
import type { Region, WorkoutSession } from '../domain/types'
import { parseProgramKey } from '../domain/programs'
import { ExerciseVisual, IconButton, Screen, useToast } from '../components'
import { getProgram } from '../data/programs'
import { addSet, deleteSet, getConditionFlags, getSession, getSetsForSession, lastSetsForExercise, previousSetsForExercise, updateSession, updateSet } from '../db/repositories'
import { aiConnected, coachConversation, isAIError } from '../ai'
import { REDACTED_SAFETY_TURN, computeDailyPriority, isExerciseAllowed, screenMessage } from '../engine'
import { acquireWakeLock } from '../native'
import { beep, speak, unlockCues } from '../native/cues'
import { useNow, useOnline, useQuery } from '../hooks'
import { cx, nowIso, todayStr } from '../lib/util'
import { buildCoachFacts, profileSummary, todayReadiness } from '../features/coach/facts'
import { runCoachTool } from '../features/coach/tools'
import { SupportSheet } from '../features/mind/SupportSheet'
import { SafetyCheckSheet, previewSafety } from '../features/programs'
import {
  GATE_REGIONS, GateResultSheet, PainSheet, REGION_LABELS, SubstituteSheet, SymptomGateSheet, computeDurationMin, defaultPostPain, evaluateProgressionWithPain,
  exerciseMap, finishSession, fmtClock, fmtLoad, fmtSec, libraryExercises, noImpactChosen, readSessionFlag, reapplyGate, reducePlannedLoad,
  screenAnswersFor, skipSession, startSessionWithGate, substituteExercise, summarizeSets, todaysGate, todaysRegionState, writeSessionFlag,
  type GateEntry, type GateOutcome, type PainOutcome, type SymptomChange, type SymptomChangeKind,
} from '../features/workout'
import { circuitRestAfter } from '../features/workout/focus'
import { autoBlock, startWord } from '../features/workout/autoRun'
import { NO_LOAD_EQUIPMENT, buildSetRow } from '../features/workout/useSetLogger'
import { blueprintProgram, blueprintRows, ensureTodayRow } from '../features/blueprint/session'
import { dayKey, rowForDate } from '../features/blueprint/week'
import { parseGateReply, parseWorkoutReply } from '../features/coachWorkout/parse'
import { currentStep, progress, setsByExerciseId, stepLine, type Step } from '../features/coachWorkout/step'

export default function CoachWorkoutScreen() {
  const { id } = useParams()
  return id === 'today' ? <TodayResolver /> : <CoachWorkout key={id} sessionId={Number(id)} />
}

/** Today's Blueprint session: an existing row, or the series' safety questions (once) and a new row. */
function TodayResolver() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const today = todayStr()
  const key = params.get('key') ?? dayKey(today)
  const program = blueprintProgram()
  const [asking, setAsking] = useState(false)
  const go = useCallback((id: number) => navigate(`/coach/workout/${id}`, { replace: true }), [navigate])

  useEffect(() => {
    const row = rowForDate(blueprintRows(today), today, key)
    if (row) return go(row.id)
    const flags = getConditionFlags().map((f) => f.region)
    if (previewSafety(program, screenAnswersFor(program.id), flags, noImpactChosen(), today).state === 'ready') go(ensureTodayRow(key, today))
    else setAsking(true)
  }, [today, key, program, go])

  return (
    <Screen pillar="coach" title="Workout" back="/coach" backLabel="Coach">
      <SafetyCheckSheet open={asking} program={program} mode="workout" onClose={() => navigate('/coach', { replace: true })} onDone={() => go(ensureTodayRow(key, today))} />
    </Screen>
  )
}

// --- the chat --------------------------------------------------------------------------------------------------

interface Line {
  id: string
  from: 'coach' | 'you'
  text: string
  /** The set this line logged, while it can still be undone. */
  undo?: number
  /** A message the safety screen caught: never sent to a model. */
  screened?: boolean
}

/** A hold or steady block counting down, anchored to the wall clock so a locked phone does not lose it. */
interface Countdown { index: number; setNo: number; startedAt: number; endsAt: number; /** Scheduled by a running block. */ auto?: boolean }

interface Chip { label: string; primary?: boolean; run: () => void }

const KEEP_LINES = 80
const HELP = 'I can log a set ("12", "10 at 16 kg"), skip a move, explain one ("how?") or stop for pain. Ask me anything else when the AI is connected.'
let seq = 0
const lineId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

function CoachWorkout({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const now = useNow(1000)
  const today = todayStr()

  const session = useQuery(() => (Number.isFinite(sessionId) ? getSession(sessionId) : null), [sessionId])
  const library = useQuery(libraryExercises, [])
  const byId = useMemo(() => exerciseMap(library), [library])
  const sets = useQuery(() => (session ? getSetsForSession(session.id) : []), [session?.id])
  const setsFor = useMemo(() => setsByExerciseId(sets), [sets])
  const regionState = useQuery(() => todaysRegionState(today), [today])
  const gate = useQuery(() => todaysGate(today), [today])

  // The player's own per-session flags, so both views agree on what was stopped and what carries a pain flag.
  const stoppedKey = `workout-stopped-${sessionId}`
  const painNextKey = `workout-painnext-${sessionId}`
  const [stopped, setStopped] = useState<string[]>(() => readSessionFlag<string[]>(stoppedKey, []))
  const markStopped = (exerciseId: string) => setStopped((prev) => {
    const next = prev.includes(exerciseId) ? prev : [...prev, exerciseId]
    writeSessionFlag(stoppedKey, next)
    return next
  })

  const threadKey = `coach-workout-${sessionId}`
  const timerKey = `coach-workout-timer-${sessionId}`
  const [lines, setLines] = useState<Line[]>(() => readSessionFlag<Line[]>(threadKey, []))
  useEffect(() => { writeSessionFlag(threadKey, lines.slice(-KEEP_LINES)) }, [lines, threadKey])
  const say = useCallback((from: Line['from'], text: string, extra: Partial<Line> = {}) => {
    setLines((prev) => [...prev, { id: lineId(), from, text, ...extra }])
  }, [])

  // A hold that was running resumes (and logs at its end) after a reload or a locked phone; a round a running block had
  // scheduled but not started is dropped, so a reload never starts one by itself.
  const [countdown, setCountdownState] = useState<Countdown | null>(() => {
    const c = readSessionFlag<Countdown | null>(timerKey, null)
    return c?.auto && Date.now() < c.startedAt ? null : c
  })
  const setCountdown = (c: Countdown | null) => { setCountdownState(c); writeSessionFlag(timerKey, c) }
  const [restUntil, setRestUntil] = useState<number | null>(null)
  // The block running on its own (autoRun.ts): after each rest its next round or station is scheduled. This visit only.
  const [armed, setArmed] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  // A safety-screen hit stops the prompts until "Keep going"; kept across a reload.
  const haltedKey = `coach-workout-halted-${sessionId}`
  const [halted, setHaltedState] = useState(() => readSessionFlag<boolean>(haltedKey, false))
  const setHalted = (v: boolean) => { setHaltedState(v); writeSessionFlag(haltedKey, v) }
  const [askFinish, setAskFinish] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [changes, setChanges] = useState<Partial<Record<Region, SymptomChangeKind>>>({})
  const [gateSheet, setGateSheet] = useState(false)
  const [gateOutcome, setGateOutcome] = useState<GateOutcome | null>(null)
  const [painFor, setPainFor] = useState<Step | null>(null)
  const [subFor, setSubFor] = useState<{ step: Step; reason: string } | null>(null)
  const [supportOpen, setSupportOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const status = session?.status ?? null
  const inProgress = status === 'in_progress'
  const step = useMemo(() => (session && inProgress ? currentStep(session.exercises, sets, stopped, byId) : null), [session, inProgress, sets, stopped, byId])
  const prog = useMemo(() => (session ? progress(session.exercises, sets, stopped) : { done: 0, total: 0 }), [session, sets, stopped])
  const loadable = !!step && !NO_LOAD_EQUIPMENT.includes(step.exercise.equipment.toLowerCase())
  const info = useQuery(() => {
    if (!step || !session) return null
    const last = lastSetsForExercise(step.exercise.id, session.id)
    const here = setsFor.get(step.planned.exerciseId) ?? []
    const target = evaluateProgressionWithPain(step.planned, step.exercise, last, previousSetsForExercise(step.exercise.id, session.id))
    // As the player prefills: a load reduced after a pain report first, then the last set today, then the target.
    const reduced = step.planned.reducedReason && step.planned.loadKg != null ? step.planned.loadKg : null
    const load = loadable ? reduced ?? here[here.length - 1]?.loadKg ?? target.nextLoadKg ?? step.planned.loadKg ?? null : null
    return { load, lastTime: last.length ? summarizeSets(last, step.kind !== 'reps') : null }
  }, [step?.index, step?.setNo, session?.id, loadable])
  const blocked = !!step && !isExerciseAllowed(step.exercise, gate).allowed
  // Any area reported today, even at 0: "All good" would overwrite it, so the sheet's "Same as earlier" asks instead.
  const reportedToday = Object.keys(regionState).length > 0
  const sore = useMemo(() => (Object.entries(regionState) as [Region, { painScore: number } | undefined][])
    .filter(([, v]) => !!v && v.painScore > 0).map(([region, v]) => ({ region, prePain: v!.painScore })), [regionState])
  const programCues = session ? getProgram(parseProgramKey(session.templateKey)?.programId ?? '')?.cues ?? {} : {}

  // Keep the screen awake while the workout runs.
  useEffect(() => {
    if (!inProgress) return
    let release: (() => void) | null = null
    let cancelled = false
    acquireWakeLock().then((r) => { if (cancelled) r(); else release = r }).catch(() => {})
    return () => { cancelled = true; release?.() }
  }, [inProgress])

  // --- actions ----------------------------------------------------------------------------------------------

  const logStep = (s: Step, v: { reps?: number; loadKg?: number | null; sec?: number }) => {
    if (!session) return
    const timed = s.kind !== 'reps'
    const exerciseId = s.planned.exerciseId
    const pain = readSessionFlag<Record<string, boolean>>(painNextKey, {})
    const loadKg = loadable ? (v.loadKg ?? info?.load ?? null) : null
    const row = buildSetRow({
      sessionId: session.id, exerciseId, setIndex: (setsFor.get(exerciseId)?.length ?? 0) + 1, timed, loadable,
      reps: v.reps ?? null, loadKg, durationSec: timed ? v.sec ?? null : null, rir: 2, painFlag: !!pain[exerciseId], loggedAt: nowIso(),
    })
    const setId = addSet(row)
    if (pain[exerciseId]) writeSessionFlag(painNextKey, { ...pain, [exerciseId]: false })
    const what = timed ? fmtSec(v.sec ?? 0) : `${v.reps} ${s.planned.perSide ? 'each side' : v.reps === 1 ? 'rep' : 'reps'}`
    say('coach', `Logged ${s.exercise.name}${s.label ? `, ${s.label.toLowerCase()}` : ''}: ${what}${loadKg != null ? ` · ${fmtLoad(loadKg)}` : ''}.`, { undo: setId })
    // The player's rest rule: a circuit rests after each round, anything else after each set.
    const rest = circuitRestAfter(session.exercises, setsFor, stopped, s.index) ?? s.planned.restSec
    setRestUntil(rest > 0 ? Date.now() + rest * 1000 : null)
  }

  const undo = () => {
    const last = [...lines].reverse().find((l) => l.undo != null)
    if (!last?.undo) { say('coach', 'Nothing to undo.'); return }
    deleteSet(last.undo)
    setLines((prev) => prev.map((l) => (l.id === last.id ? { ...l, undo: undefined } : l)))
    setArmed(null)
    setCountdown(null)
    setRestUntil(null)
    say('coach', 'Removed. Tell me again when you are ready.')
  }

  const startTimer = (s: Step) => {
    if (s.seconds == null) return
    unlockCues()
    const block = autoBlock(s.planned, s.index)
    if (block && s.kind === 'hold') {
      // The first tap of a block starts the run: rounds and stations go on by themselves from here.
      setArmed(block)
      speak(startWord(s.planned, s.setNo, s.exercise.name))
    }
    const t = Date.now()
    setCountdown({ index: s.index, setNo: s.setNo, startedAt: t, endsAt: t + s.seconds * 1000 })
    setRestUntil(null)
  }

  /** Stops a running block and any countdown: after pain, a safety stop or a finish, only a new Start tap goes on. */
  const stopRun = () => {
    setArmed(null)
    setCountdown(null)
  }
  const pause = stopRun

  const doneEarly = (s: Step) => {
    if (!countdown || Date.now() < countdown.startedAt) return
    const sec = Math.max(1, Math.round((Date.now() - countdown.startedAt) / 1000))
    setCountdown(null)
    logStep(s, { sec })
  }

  const skip = (s: Step) => {
    markStopped(s.planned.exerciseId)
    setArmed(null)
    setCountdown(null)
    setRestUntil(null)
    say('coach', `Skipped ${s.exercise.name}.`)
  }

  const how = (s: Step) => say('coach', [s.exercise.instructions, s.planned.cue].filter(Boolean).join('\n\n'))

  const startWith = (entries: GateEntry[]) => {
    if (!session) return
    const outcome = startSessionWithGate(session, entries, library, null)
    try { updateSession(session.id, { readiness: todayReadiness().state }) } catch { /* readiness is optional */ }
    setGateSheet(false)
    if (outcome.changes.length || outcome.gate.overall !== 'OK' || outcome.blocked.length) setGateOutcome(outcome)
    say('coach', outcome.changes.length ? `Adjusted for today: ${outcome.changes.join('; ')}.` : programCues.start ?? "Let's go.")
  }

  const onPain = (o: PainOutcome) => {
    const s = painFor
    setPainFor(null)
    stopRun()
    if (!session || !s) return
    const exerciseId = s.planned.exerciseId
    const logged = setsFor.get(exerciseId) ?? []
    const last = logged[logged.length - 1]
    if (last) updateSet(last.id, { painFlag: true })
    else writeSessionFlag(painNextKey, { ...readSessionFlag<Record<string, boolean>>(painNextKey, {}), [exerciseId]: true })
    const outcome = reapplyGate(session, library)
    const swapped = outcome.exercises[s.index]?.exerciseId !== exerciseId
    setCountdown(null)
    if (o.level === 'red' || o.action === 'stop') {
      markStopped(exerciseId)
      say('coach', `Stopping ${s.exercise.name} for today.`)
    } else if (swapped) {
      say('coach', `Swapped for today: ${outcome.changes.join('; ')}.`)
    } else if (o.action === 'substitute') {
      // The player's substitute sheet, with its safe filters and the pain as the reason.
      setSubFor({ step: s, reason: `${REGION_LABELS[o.check.region]} pain ${o.check.painScore}/10` })
    } else if (o.action === 'reduce_load') {
      const next = reducePlannedLoad(session, s.index, last?.loadKg ?? s.planned.loadKg ?? null)
      say('coach', next != null ? `Load down to ${fmtLoad(next)}. Keep the range pain-free.` : 'No load to drop. Shorten the range instead.')
    } else {
      say('coach', 'Noted. Keep it pain-free, and stop if it gets worse.')
    }
  }

  const finish = async () => {
    if (!session || finishing) return
    setFinishing(true)
    try {
      const symptomChanges: SymptomChange[] = sore.map((r) => {
        const change = changes[r.region] ?? 'same'
        return { region: r.region, prePain: r.prePain, change, postPain: defaultPostPain(r.prePain, change) }
      })
      const durationMin = computeDurationMin(session)
      await finishSession({ session, sets, rpe: null, durationMin, notes: session.notes ?? '', symptomChanges, writeToHealth: false })
      setCountdown(null)
      setAskFinish(false)
      say('coach', `${programCues.finish ?? 'Done.'} ${sets.length} ${sets.length === 1 ? 'set' : 'sets'} in ${durationMin} min.`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not finish the session.', 'error')
    } finally {
      setFinishing(false)
    }
  }

  /** An open question: the coach service, with this chat as the conversation. Answers locally when it can't. */
  const ask = async (q: string, before: Line[]) => {
    if (!aiConnected() || !online) { say('coach', online ? HELP : `Offline. ${HELP}`); return }
    setThinking(true)
    try {
      const facts = buildCoachFacts(today)
      // The service drops anything before the first user turn, so the workout context opens with one.
      const raw: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: `I'm doing ${session?.name ?? 'my workout'} with you now.` },
        ...before.slice(-10).map((l) => ({ role: l.from === 'you' ? 'user' as const : 'assistant' as const, content: l.screened ? REDACTED_SAFETY_TURN : l.text })),
        ...(step ? [{ role: 'assistant' as const, content: [stepLine(step), step.planned.cue].filter(Boolean).join('. ') }] : []),
        { role: 'user', content: q },
      ]
      const turns = raw.reduce<typeof raw>((out, t) => {
        const prev = out[out.length - 1]
        if (prev && prev.role === t.role) prev.content = `${prev.content}\n${t.content}`
        else out.push({ ...t })
        return out
      }, [])
      const outcome = await coachConversation(
        { turns, facts, priority: computeDailyPriority(facts), profileSummary: profileSummary(), extras: {}, previousAgent: null },
        (name, args) => runCoachTool(name, args, facts.today),
      )
      say('coach', outcome.kind === 'withheld' ? HELP : outcome.text)
    } catch (e) {
      say('coach', isAIError(e) && e.kind === 'offline' ? `Offline. ${HELP}` : HELP)
    } finally {
      setThinking(false)
    }
  }

  const submit = (raw: string) => {
    const q = raw.trim()
    if (!q || !session || thinking) return
    setDraft('')
    const before = lines
    // The chat safety screen first, before anything else and offline too. No model sees a caught message.
    const hit = screenMessage(q)
    say('you', q, hit ? { screened: true } : {})
    if (hit) {
      say('coach', hit.reply)
      stopRun()
      setHalted(true)
      setSupportOpen(true)
      return
    }
    if (status === 'planned') {
      // Pain words always go to the gate sheet; an all-clear starts at 0 only when nothing was reported earlier today.
      const g = parseGateReply(q)
      if (g === 'all_good' && !reportedToday) { startWith(GATE_REGIONS.map((region) => ({ region, painScore: 0, redFlags: {} }))); return }
      if (g !== 'other') { setGateSheet(true); return }
      void ask(q, before)
      return
    }
    if (!inProgress || halted) { void ask(q, before); return }
    const r = parseWorkoutReply(q, step?.kind ?? null)
    if (r.kind === 'undo') return undo()
    if (r.kind === 'finish') { stopRun(); setAskFinish(true); say('coach', prog.done ? 'Finish here?' : 'Nothing is logged yet. Finish anyway?'); return }
    if (step) {
      if (r.kind === 'pain') { stopRun(); setPainFor(step); return }
      if (r.kind === 'reps' && step.kind === 'reps') return logStep(step, { reps: r.reps, loadKg: r.loadKg })
      if (r.kind === 'seconds' && step.kind !== 'reps') return logStep(step, { sec: r.sec })
      if (r.kind === 'done') {
        if (step.kind === 'reps') { say('coach', `How many ${step.planned.perSide ? 'each side' : 'reps'}?`); return }
        if (countdown) return doneEarly(step)
        return logStep(step, { sec: step.seconds ?? 0 })
      }
      if (r.kind === 'start') {
        if (step.kind !== 'reps') return startTimer(step)
        say('coach', 'Go. Tell me the reps when you are done.')
        return
      }
      if (r.kind === 'skip') return skip(step)
      if (r.kind === 'how') return how(step)
    }
    void ask(q, before)
  }

  // A tap answers like a typed reply: the chip's words go in the chat, then the action runs.
  const tap = (label: string, run: () => void) => () => { say('you', label); run() }

  // --- effects ----------------------------------------------------------------------------------------------

  // The opening line: where things stand, from the database (the stored chat is a convenience).
  const opened = useRef(false)
  useEffect(() => {
    if (!session || opened.current) return
    opened.current = true
    const once = (text: string) => { if (lines[lines.length - 1]?.text !== text) say('coach', text) }
    if (session.status === 'planned') once(`${session.name} today. Before we start: anything hurting?`)
    else if (session.status === 'in_progress') once(prog.done ? `Welcome back. ${prog.done} of ${prog.total} sets done.` : programCues.start ?? "Let's go.")
    else if (session.status === 'completed' && !lines.length) say('coach', `This one is done: ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}.`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // An earlier report today goes straight to the gate sheet ("How is it now?"), never to a one-tap "All good".
  useEffect(() => {
    if (status === 'planned' && reportedToday) setGateSheet(true)
  }, [status, reportedToday])

  // A countdown that ran out (on screen or while the phone was locked) logs the target time once.
  const loggedTimer = useRef<string | null>(null)
  useEffect(() => {
    if (!countdown || !step) return
    if (countdown.index !== step.index || countdown.setNo !== step.setNo) { setCountdown(null); return }
    if (now.getTime() < countdown.endsAt) return
    const k = `${countdown.index}:${countdown.setNo}`
    if (loggedTimer.current === k) return
    loggedTimer.current = k
    setCountdown(null)
    if (armed && session) {
      // What comes next: another round of this block, or the end of the run.
      const next = currentStep(session.exercises, [...sets, { exerciseId: step.planned.exerciseId }], stopped, byId)
      const same = !!next && autoBlock(next.planned, next.index) === armed
      beep(true)
      speak(!next ? 'Done' : same ? (step.planned.restExerciseId ? 'Easy' : `Next, ${next.exercise.name}`) : `Done. Next, ${next.exercise.name}`)
      if (!same) setArmed(null)
    }
    logStep(step, { sec: step.seconds ?? Math.round((countdown.endsAt - countdown.startedAt) / 1000) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, countdown, step])

  // A running block schedules its next round or station to start when the rest ends.
  useEffect(() => {
    if (!armed || !step || halted || askFinish || countdown || step.kind !== 'hold' || step.seconds == null) return
    if (autoBlock(step.planned, step.index) !== armed) return
    const startAt = Math.max(Date.now(), restUntil ?? 0)
    setCountdown({ index: step.index, setNo: step.setNo, startedAt: startAt, endsAt: startAt + step.seconds * 1000, auto: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, step?.index, step?.setNo, halted, askFinish, countdown, restUntil])

  // Beeps on the last three seconds of a running block's rest and work, and one word when a round starts.
  const cued = useRef<string>('')
  useEffect(() => {
    if (!armed || !countdown || !step) return
    const t = now.getTime()
    const round = `${countdown.index}:${countdown.setNo}`
    if (t < countdown.startedAt) {
      const pre = Math.ceil((countdown.startedAt - t) / 1000)
      if (pre <= 3 && cued.current !== `rest${round}:${pre}`) { cued.current = `rest${round}:${pre}`; beep() }
      return
    }
    if (countdown.auto && !cued.current.startsWith(`go${round}`)) { cued.current = `go${round}`; speak(startWord(step.planned, step.setNo, step.exercise.name)); return }
    const left = Math.ceil((countdown.endsAt - t) / 1000)
    if (left > 0 && left <= 3 && cued.current !== `go${round}:${left}`) { cued.current = `go${round}:${left}`; beep() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [lines.length, step?.index, step?.setNo, thinking, askFinish])

  // --- view -------------------------------------------------------------------------------------------------

  if (session === null) {
    return (
      <Screen pillar="coach" title="Workout" back="/" backLabel="Today">
        <p className="text-muted">This workout no longer exists.</p>
      </Screen>
    )
  }
  if (!session) return null

  const finishQuestion = inProgress && (askFinish || !step) && !halted ? sore.find((r) => !changes[r.region]) ?? null : null
  // A scheduled round shows its rest first ("Rest 0:15, then it starts"), then its countdown.
  const waiting = !!countdown && now.getTime() < countdown.startedAt
  const restLeft = waiting ? Math.ceil((countdown!.startedAt - now.getTime()) / 1000) : restUntil ? Math.max(0, Math.ceil((restUntil - now.getTime()) / 1000)) : 0
  const timerLeft = countdown && !waiting ? Math.max(0, Math.ceil((countdown.endsAt - now.getTime()) / 1000)) : null
  const running = !!armed && !!step && autoBlock(step.planned, step.index) === armed
  const lastLine = lines[lines.length - 1]

  const chips: Chip[] = []
  if (status === 'planned') {
    if (reportedToday) chips.push({ label: 'Check in', primary: true, run: () => setGateSheet(true) })
    else {
      chips.push({ label: 'All good', primary: true, run: tap('All good', () => startWith(GATE_REGIONS.map((region) => ({ region, painScore: 0, redFlags: {} })))) })
      chips.push({ label: 'Something hurts', run: tap('Something hurts', () => setGateSheet(true)) })
    }
    chips.push({ label: 'Not today', run: () => navigate('/') })
  } else if (status === 'completed' || status === 'skipped') {
    chips.push({ label: 'Back to Today', primary: true, run: () => navigate('/') })
    if (status === 'completed') chips.push({ label: 'See summary', run: () => navigate(`/train/session/${session.id}`) })
  } else if (halted) {
    chips.push({ label: 'Keep going', primary: true, run: tap('Keep going', () => setHalted(false)) })
    chips.push({ label: 'End workout', run: tap('End workout', () => { setHalted(false); setAskFinish(true) }) })
  } else if (finishQuestion) {
    for (const [value, label] of [['better', 'Better'], ['same', 'Same'], ['worse', 'Worse']] as const) {
      chips.push({ label, run: tap(label, () => setChanges((c) => ({ ...c, [finishQuestion.region]: value }))) })
    }
  } else if (askFinish || !step) {
    chips.push({ label: 'Finish', primary: true, run: () => void finish() })
    if (step) chips.push({ label: 'Keep going', run: tap('Keep going', () => setAskFinish(false)) })
  } else {
    if (lastLine?.undo != null) chips.push({ label: 'Undo', run: tap('Undo', undo) })
    if (blocked) chips.push({ label: 'Skip', primary: true, run: tap('Skip', () => skip(step)) })
    if (step.kind === 'reps') {
      const nums = [...new Set([step.planned.repMin, Math.round((step.planned.repMin + step.planned.repMax) / 2), step.planned.repMax])]
      for (const n of nums) chips.push({ label: `${n}`, primary: !blocked && n === step.planned.repMax, run: tap(`${n}`, () => logStep(step, { reps: n })) })
    } else if (waiting && countdown) {
      chips.push({ label: 'Skip rest', primary: true, run: () => { const t = Date.now(); setCountdown({ ...countdown, startedAt: t, endsAt: t + (step.seconds ?? 0) * 1000 }) } })
    } else if (countdown) {
      chips.push({ label: 'Done early', primary: true, run: tap('Done early', () => doneEarly(step)) })
    } else {
      chips.push({ label: `Start ${fmtSec(step.seconds ?? 0)}`, primary: !blocked, run: () => startTimer(step) })
      chips.push({ label: 'Done', run: tap('Done', () => logStep(step, { sec: step.seconds ?? 0 })) })
    }
    if (running) chips.push({ label: 'Pause', run: tap('Pause', pause) })
    if (!blocked) chips.push({ label: 'Skip', run: tap('Skip', () => skip(step)) })
    chips.push({ label: 'How?', run: tap('How?', () => how(step)) })
    chips.push({ label: 'Pain', run: () => { stopRun(); setPainFor(step) } })
  }

  return (
    <Screen
      pillar="coach"
      title={session.name}
      back="/"
      backLabel="Today"
      subtitle={inProgress ? `With Coach · ${prog.done} of ${prog.total} sets` : 'With Coach'}
      right={<IconButton icon={<List size={22} />} label="Open in the player" onClick={() => navigate(`/train/session/${session.id}`)} />}
    >
      <div className="flex flex-col gap-2.5 pb-44" aria-live="polite">
        {lines.map((l) => (l.from === 'you' ? <YouBubble key={l.id} text={l.text} /> : <CoachBubble key={l.id} text={l.text} />))}

        {inProgress && step && !halted && !askFinish && (
          <StepCard step={step} load={info?.load ?? null} lastTime={info?.lastTime ?? null} timerLeft={timerLeft} restLeft={restLeft} autoNext={waiting} blocked={blocked} />
        )}
        {finishQuestion && <CoachBubble text={`How is your ${REGION_LABELS[finishQuestion.region].toLowerCase()} now?`} />}
        {inProgress && !step && !halted && !finishQuestion && <CoachBubble text={`That's everything${prog.total ? `: ${prog.done} of ${prog.total} sets` : ''}. Finish?`} />}
        {inProgress && step && askFinish && !halted && !finishQuestion && <CoachBubble text={`Finish here? ${prog.done} of ${prog.total} sets done.`} />}
        {thinking && <CoachBubble text="…" />}
        {/* Scrolled to just above the reply bar, not under it. */}
        <div ref={endRef} style={{ scrollMarginBottom: 'calc(9.5rem + env(safe-area-inset-bottom, 0px))' }} />
      </div>

      <ReplyBar chips={chips} draft={draft} setDraft={setDraft} onSend={() => submit(draft)} disabled={thinking || finishing} />

      <SymptomGateSheet
        open={gateSheet && status === 'planned'}
        sessionName="workout"
        initial={regionState}
        onStart={startWith}
        onDismiss={() => navigate('/')}
        onClose={() => setGateSheet(false)}
      />
      <GateResultSheet
        outcome={gateOutcome}
        onClose={() => setGateOutcome(null)}
        onSkip={() => { skipSession(session as WorkoutSession, 'symptom gate RED'); setGateOutcome(null); navigate('/') }}
      />
      <SubstituteSheet
        open={subFor !== null}
        onClose={() => setSubFor(null)}
        exercise={subFor?.step.exercise ?? null}
        gate={gate}
        library={library}
        inSessionIds={session.exercises.map((e) => e.exerciseId)}
        initialReason={subFor?.reason}
        onPick={(sub, reason) => {
          if (!subFor) return
          substituteExercise(session as WorkoutSession, subFor.step.index, sub, reason)
          say('coach', `Swapped ${subFor.step.exercise.name} for ${sub.name}.`)
          setSubFor(null)
        }}
      />
      <PainSheet open={painFor !== null} onClose={() => setPainFor(null)} exercise={painFor?.exercise ?? null} sessionId={session.id} onOutcome={onPain} />
      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
    </Screen>
  )
}

// --- pieces ----------------------------------------------------------------------------------------------------

function YouBubble({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="sr-only">You</span>
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-[1.25rem] rounded-br-md bg-accent px-3.5 py-2 text-base leading-snug text-accent-fg">{text}</div>
    </div>
  )
}

function CoachBubble({ text }: { text: string }) {
  return (
    <div className="flex max-w-[88%] flex-col items-start">
      <span className="sr-only">Coach</span>
      <div className="whitespace-pre-wrap break-words rounded-[1.25rem] rounded-bl-md bg-surface px-3.5 py-2 text-base leading-snug text-app">{text}</div>
    </div>
  )
}

/** The step the coach is asking for: the drawing, the target, the cue, last time, and the rest or the countdown. */
function StepCard({ step, load, lastTime, timerLeft, restLeft, autoNext, blocked }: {
  step: Step; load: number | null; lastTime: string | null; timerLeft: number | null; restLeft: number; autoNext: boolean; blocked: boolean
}) {
  return (
    <div className="flex w-[88%] max-w-[360px] flex-col overflow-hidden rounded-[1.25rem] rounded-bl-md bg-surface">
      <span className="sr-only">Coach</span>
      <ExerciseVisual exercise={step.exercise} size="card" className="rounded-none! border-0!" />
      <div className="px-3.5 pb-3 pt-2.5">
        {step.label && <div className="eyebrow text-muted">{step.label}</div>}
        <div className="text-[17px] font-semibold leading-tight text-app">{step.exercise.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="num text-3xl text-app">{timerLeft != null ? fmtClock(timerLeft) : step.target}</span>
          {load != null && <span className="text-[15px] font-medium text-muted">{fmtLoad(load)}</span>}
        </div>
        {step.planned.cue && <p className="m-0 mt-1.5 text-[15px] leading-snug text-muted">{step.planned.cue}</p>}
        {lastTime && <p className="m-0 mt-1 text-[13px] text-faint">Last time: {lastTime}</p>}
        {restLeft > 0 && timerLeft == null && <p className="m-0 mt-2 text-[13px] font-semibold text-muted">Rest {fmtClock(restLeft)}{autoNext ? ', then it starts' : ''}</p>}
        {blocked && (
          <p className="m-0 mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-warn">
            <ShieldAlert size={15} className="mt-px shrink-0" aria-hidden />
            Today's check says leave this one out.
          </p>
        )}
      </div>
    </div>
  )
}

function ReplyBar({ chips, draft, setDraft, onSend, disabled }: {
  chips: Chip[]; draft: string; setDraft: (v: string) => void; onSend: () => void; disabled: boolean
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] bg-app/90 px-3 pt-2 backdrop-blur" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      {chips.length > 0 && (
        <div className="no-scrollbar -mx-3 mb-2 flex gap-2 overflow-x-auto px-3" role="group" aria-label="Quick replies">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={disabled}
              onClick={c.run}
              className={cx(
                'press h-10 shrink-0 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40',
                c.primary ? 'bg-accent text-accent-fg' : 'border border-line-strong bg-surface text-app',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex h-14 items-center gap-2 rounded-full border border-line-strong bg-surface pl-4 pr-1.5"
        onSubmit={(e) => { e.preventDefault(); onSend() }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply to Coach…"
          aria-label="Reply to Coach"
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent text-base text-app outline-none placeholder:text-faint"
        />
        <button type="submit" disabled={disabled || !draft.trim()} aria-label="Send" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-30">
          <ArrowUp size={20} aria-hidden />
        </button>
      </form>
    </div>
  )
}
