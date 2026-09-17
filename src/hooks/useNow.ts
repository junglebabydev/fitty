import { useEffect, useState } from 'react'

/**
 * A Date that refreshes every `intervalMs` (default 30 s) and whenever the
 * app returns to the foreground, so "time since" labels and time-of-day
 * coach rules stay current without manual wiring.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, Math.max(1_000, intervalMs))
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])

  return now
}
