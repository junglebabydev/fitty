import { useCallback, useEffect, useRef, useState } from 'react'
import { cycleStartSec, positionAt, type BreathPhase, type BreathPlan, type BreathPosition } from './breathing'

export type BreathStatus = 'idle' | 'running' | 'paused' | 'done'

export interface BreathingSession {
  status: BreathStatus
  /** Where the guide is right now (first phase while idle). */
  position: BreathPosition
  start(): void
  pause(): void
  resume(): void
  /** Stops early and returns the active (un-paused) seconds so far. */
  end(): number
  reset(): void
  /** Active seconds at call time; safe to call from unmount cleanups. */
  getActiveSec(): number
}

const TICK_MS = 100

/**
 * Runs a breathing schedule on the wall clock, so it stays correct when timers are
 * throttled. Pausing rewinds to the start of the interrupted breath; active time keeps
 * counting only while running.
 */
export function useBreathingSession(phases: BreathPhase[], plan: BreathPlan, onComplete?: (activeSec: number) => void): BreathingSession {
  const [status, setStatus] = useState<BreathStatus>('idle')
  const [elapsed, setElapsed] = useState(0)

  const anchorMs = useRef(0) // wall clock when the current running stretch began
  const baseElapsed = useRef(0) // schedule seconds at the anchor
  const baseActive = useRef(0) // active seconds banked before the anchor
  const statusRef = useRef<BreathStatus>('idle')
  const doneRef = useRef(onComplete)
  doneRef.current = onComplete

  const setBoth = (s: BreathStatus) => { statusRef.current = s; setStatus(s) }
  const sinceAnchor = () => (statusRef.current === 'running' ? Math.max(0, (Date.now() - anchorMs.current) / 1000) : 0)
  const getActiveSec = useCallback(() => baseActive.current + sinceAnchor(), [])

  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const t = baseElapsed.current + sinceAnchor()
      if (t >= plan.totalSec) {
        // A throttled (hidden) tab can tick late; never count more than the schedule had left.
        baseActive.current += Math.min(sinceAnchor(), Math.max(0, plan.totalSec - baseElapsed.current))
        baseElapsed.current = plan.totalSec
        setBoth('done')
        setElapsed(plan.totalSec)
        doneRef.current?.(baseActive.current)
        return
      }
      setElapsed(t)
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [status, plan.totalSec])

  const start = useCallback(() => {
    if (plan.totalSec <= 0) return
    anchorMs.current = Date.now()
    baseElapsed.current = 0
    baseActive.current = 0
    setElapsed(0)
    setBoth('running')
  }, [plan.totalSec])

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return
    const run = sinceAnchor()
    baseActive.current += run
    baseElapsed.current = cycleStartSec(plan, baseElapsed.current + run)
    setBoth('paused')
    setElapsed(baseElapsed.current)
  }, [plan])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    anchorMs.current = Date.now()
    setBoth('running')
  }, [])

  const reset = useCallback(() => {
    baseElapsed.current = 0
    baseActive.current = 0
    setBoth('idle')
    setElapsed(0)
  }, [])

  const end = useCallback(() => {
    const active = baseActive.current + sinceAnchor()
    reset()
    return active
  }, [reset])

  return { status, position: positionAt(phases, plan, elapsed), start, pause, resume, end, reset, getActiveSec }
}
