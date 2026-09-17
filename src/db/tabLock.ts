// Single-active-tab lock. Each tab keeps its own in-memory SQLite copy and persists the WHOLE database,
// so two open tabs (say the home-screen app and a Safari tab) would silently overwrite each other's saves.
// The Web Locks API lets exactly one tab own the database at a time; another tab can take over explicitly.

const LOCK_NAME = 'coach-db-owner'

type LockManagerLike = {
  request: (name: string, options: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => Promise<void> | void) => Promise<void>
}

function lockManager(): LockManagerLike | null {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { locks?: LockManagerLike })
  return nav?.locks ?? null
}

/**
 * Tries to become the tab that owns the database.
 * Resolves true when this tab holds the lock (or the browser has no Web Locks), false when another tab has it.
 * `onLost` fires if a different tab later takes over; this tab must then stop writing.
 */
export function acquireTabLock(onLost: () => void, steal = false): Promise<boolean> {
  const locks = lockManager()
  if (!locks) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    locks
      .request(LOCK_NAME, steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (!lock) { resolve(false); return }
        resolve(true)
        return new Promise<void>(() => { /* hold until this tab closes or the lock is stolen */ })
      })
      .catch(() => {
        // Rejects with AbortError when another tab steals the lock (or on unexpected failure before acquiring).
        resolve(false)
        onLost()
      })
  })
}
