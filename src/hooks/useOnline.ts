import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void): () => void {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

function getSnapshot(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

function getServerSnapshot(): boolean {
  return true
}

/** True while the browser reports network connectivity. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
