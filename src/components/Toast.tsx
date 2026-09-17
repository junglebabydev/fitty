import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cx } from '../lib/util'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastApi {
  show(msg: string, kind?: ToastKind): void
}

interface ToastItem {
  id: number
  msg: string
  kind: ToastKind
}

const DURATION: Record<ToastKind, number> = { info: 2_500, success: 2_200, error: 4_000 }
const MAX_VISIBLE = 3

const fallback: ToastApi = {
  show(msg, kind = 'info') {
    // Outside a provider (tests, isolated renders) we still surface the message.
    if (kind === 'error') console.error('[toast]', msg)
    else console.info('[toast]', msg)
  },
}

const ToastContext = createContext<ToastApi>(fallback)

/** Access the toast API. Safe to call outside `ToastProvider` (falls back to console). */
export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/** Glass body for every kind; the icon (shape + status colour) carries the kind. */
const ICON_TONE: Record<ToastKind, string> = {
  info: 'text-muted',
  success: 'text-ok',
  error: 'text-stop',
}

const ICON: Record<ToastKind, typeof Info> = { info: Info, success: CircleCheck, error: CircleAlert }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const t = timers.current.get(id)
    if (t !== undefined) {
      window.clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, msg, kind }])
      const t = window.setTimeout(() => dismiss(id), DURATION[kind])
      timers.current.set(id, t)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 pointer-events-none pt-safe px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="flex flex-col gap-2 pt-3">
          {items.map((t) => {
            const Icon = ICON[t.kind]
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => dismiss(t.id)}
                className={cx(
                  'pointer-events-auto anim-toast-in w-full text-left text-app',
                  'glass shadow-float flex items-start gap-2.5 rounded-2xl border border-line-strong px-4 py-3 text-[15px] font-medium leading-snug',
                )}
                role={t.kind === 'error' ? 'alert' : 'status'}
              >
                <Icon size={18} className={cx('shrink-0 mt-px', ICON_TONE[t.kind])} aria-hidden />
                <span className="min-w-0">{t.msg}</span>
              </button>
            )
          })}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
