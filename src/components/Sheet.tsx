import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../lib/util'
import { IconButton } from './IconButton'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Pinned bottom area for primary actions (Confirm / Cancel). */
  footer?: ReactNode
  /** Hide the close (X) button in the header. */
  hideClose?: boolean
  /** Max height as a dvh percentage (default 90). */
  maxHeightVh?: number
  className?: string
}

const EXIT_MS = 200
const DISMISS_DRAG_PX = 90

/**
 * Bottom sheet: blurred glass backdrop, grab handle (swipe down to dismiss),
 * ESC / backdrop close, body scroll lock, safe-area padding. Renders in a portal.
 */
export function Sheet({ open, onClose, title, children, footer, hideClose = false, maxHeightVh = 90, className }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Mount / unmount with an exit animation.
  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
      setDragY(0)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Scroll lock + ESC while visible.
  useEffect(() => {
    if (!mounted || closing) return
    document.body.classList.add('sheet-open')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('sheet-open')
      document.removeEventListener('keydown', onKey)
    }
  }, [mounted, closing, onClose])

  if (!mounted) return null

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    dragStart.current = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return
    const dy = (e.touches[0]?.clientY ?? dragStart.current) - dragStart.current
    setDragY(Math.max(0, dy))
  }
  const onTouchEnd = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    if (dragY > DISMISS_DRAG_PX) onClose()
    setDragY(0)
  }

  const panelStyle = dragY > 0 ? { transform: `translateY(${dragY}px)`, animation: 'none' } : undefined

  return createPortal(
    <div className="fixed inset-0 z-40" role="presentation">
      <div
        className={cx('absolute inset-0 bg-black/55 backdrop-blur-[6px]', closing ? 'anim-fade-out' : 'anim-fade-in')}
        onClick={onClose}
        style={{ touchAction: 'none' }}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx(
          'absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-surface text-app',
          'rounded-t-[1.75rem] border border-b-0 border-line-strong shadow-float flex flex-col',
          closing ? 'anim-sheet-down' : 'anim-sheet-up',
          className,
        )}
        style={{ maxHeight: `${maxHeightVh}dvh`, ...panelStyle }}
      >
        <div
          className="shrink-0 pt-2.5 pb-2 flex justify-center cursor-grab"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          style={{ touchAction: 'none' }}
        >
          <span className="h-1 w-9 rounded-full bg-line-strong" aria-hidden />
        </div>

        {(title !== undefined || !hideClose) && (
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 pb-3 min-h-11">
            <h2 className="display m-0 min-w-0 truncate text-2xl">{title}</h2>
            {!hideClose && (
              <IconButton icon={<X size={18} />} label="Close" variant="surface" size="sm" onClick={onClose} className="-mr-0.5" />
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>

        {footer !== undefined && <div className="shrink-0 px-4 pt-3 pb-3 border-t border-line">{footer}</div>}
        <div className="pb-safe shrink-0" aria-hidden />
      </div>
    </div>,
    document.body,
  )
}
