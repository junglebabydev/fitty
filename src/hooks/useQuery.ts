import { useMemo, useSyncExternalStore } from 'react'
import { db } from '../db/database'

// A single db subscription fans out to every mounted useQuery. The store's
// "snapshot" is a monotonically increasing version number, so React only
// re-renders when the database actually changed; `fn` is then re-run
// synchronously during render.

let version = 0
const listeners = new Set<() => void>()
let unsubscribeDb: (() => void) | null = null

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (!unsubscribeDb) {
    unsubscribeDb = db.subscribe(() => {
      version++
      for (const l of listeners) l()
    })
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && unsubscribeDb) {
      unsubscribeDb()
      unsubscribeDb = null
    }
  }
}

function getSnapshot(): number {
  return version
}

/** Current database change counter. Bumps on every committed write. */
export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Runs `fn` synchronously and re-runs it whenever the database changes
 * (via `db.subscribe`) or any of `deps` change.
 */
export function useQuery<T>(fn: () => T, deps: unknown[]): T {
  const v = useDbVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(fn, [v, ...deps])
}
