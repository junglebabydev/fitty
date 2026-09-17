// Screen wake lock for the guided workout logger. The browser silently drops
// the lock whenever the tab is hidden, so we re-acquire on visibilitychange
// until the caller releases. Unsupported browsers get a no-op release.
//
// Capacitor swap: @capacitor-community/keep-awake — KeepAwake.keepAwake() /
// KeepAwake.allowSleep().

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function'
}

export async function acquireWakeLock(): Promise<() => void> {
  if (!isWakeLockSupported() || typeof document === 'undefined') return () => {}

  let sentinel: WakeLockSentinel | null = null
  let released = false

  const request = async () => {
    if (released || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
      })
    } catch {
      // Denied (low battery, permissions policy) — the workout still works, the screen may dim.
      sentinel = null
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && !sentinel) void request()
  }

  document.addEventListener('visibilitychange', onVisibility)
  await request()

  return () => {
    if (released) return
    released = true
    document.removeEventListener('visibilitychange', onVisibility)
    const s = sentinel
    sentinel = null
    if (s) void s.release().catch(() => {})
  }
}
