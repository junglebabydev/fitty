import { useCallback } from 'react'
import { getSetting, setSetting } from '../../db/repositories'
import { useQuery } from '../../hooks'

/**
 * Reactive setting: re-reads on every db change. `fallback` is intentionally
 * not a dependency (object fallbacks would be new on every render).
 */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useQuery(() => getSetting<T>(key, fallback), [key])
  const set = useCallback((v: T) => setSetting(key, v), [key])
  return [value, set]
}
