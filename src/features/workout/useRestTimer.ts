import { useCallback, useEffect, useRef, useState } from 'react'

export interface RestTimer {
  /** Seconds left (0 when idle). */
  remaining: number
  /** Length of the current rest (0 when idle). */
  total: number
  running: boolean
  start(sec: number): void
  skip(): void
  extend(sec?: number): void
}

const TICK_MS = 250

/**
 * Countdown for the rest between sets. Wall-clock based so it stays correct
 * when the tab is backgrounded; vibrates (where supported) when it reaches zero.
 */
export function useRestTimer(onDone?: () => void): RestTimer {
  const [endAt, setEndAt] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (endAt == null) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0) {
        setEndAt(null)
        try { navigator.vibrate?.([120, 60, 120]) } catch { /* unsupported */ }
        doneRef.current?.()
      }
    }
    tick()
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [endAt])

  const start = useCallback((sec: number) => {
    if (sec <= 0) { setEndAt(null); setTotal(0); setRemaining(0); return }
    setTotal(sec)
    setRemaining(sec)
    setEndAt(Date.now() + sec * 1000)
  }, [])

  const skip = useCallback(() => {
    setEndAt(null)
    setRemaining(0)
    setTotal(0)
  }, [])

  /** Add (or, with a negative value, remove) seconds. Dropping below zero ends the rest on the next tick. */
  const extend = useCallback((sec = 30) => {
    setEndAt((prev) => {
      const base = prev ?? Date.now()
      return base + sec * 1000
    })
    setTotal((t) => Math.max(0, t + sec))
  }, [])

  return { remaining, total, running: endAt != null, start, skip, extend }
}
