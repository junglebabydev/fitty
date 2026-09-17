import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cx } from '../lib/util'
import type { Pillar } from './pillars'

export interface ScreenProps {
  title?: ReactNode
  /** `true` → history back; a string → navigate to that path. */
  back?: boolean | string
  /** Label next to the back chevron (default "Back"). */
  backLabel?: string
  /** Right-aligned header element (a button, a pill). */
  right?: ReactNode
  /** Small line under the large title. */
  subtitle?: ReactNode
  children: ReactNode
  /** Apply 16px horizontal padding to the content (default true). */
  padded?: boolean
  className?: string
  /** Sets `data-pillar` (drives every `*-pillar` utility below) and the atmosphere. */
  pillar?: Pillar
  /** Kicker above the title (a date, a section name). */
  eyebrow?: string
  /** Big `display` title. Tab roots use it. */
  large?: boolean
}

/**
 * Page wrapper. Owns the pillar identity (hue + top glow), the header and the
 * top safe-area inset; the tab bar inset is handled by AppShell. With `back`
 * the bar becomes a sticky glass header.
 */
export function Screen({
  title,
  back,
  backLabel = 'Back',
  right,
  subtitle,
  children,
  padded = true,
  className,
  pillar,
  eyebrow,
  large = false,
}: ScreenProps) {
  const navigate = useNavigate()
  const hasBack = back !== undefined && back !== false
  const hasTitleBlock = title !== undefined || eyebrow !== undefined || subtitle !== undefined
  const hasHeader = hasBack || right !== undefined || hasTitleBlock
  const calm = pillar === 'rest' || pillar === 'mind'
  // Detail screens carry a compact title inside the sticky bar; everything else gets a title block.
  const titleInBar = hasBack && !large
  const showBlock = titleInBar ? eyebrow !== undefined || subtitle !== undefined : hasTitleBlock

  const goBack = () => {
    if (typeof back === 'string') navigate(back)
    else navigate(-1)
  }

  const titleBlock = (
    <div className="min-w-0 flex-1">
      {eyebrow !== undefined && <p className="eyebrow m-0 mb-1.5 text-pillar">{eyebrow}</p>}
      {title !== undefined && !titleInBar && (
        <h1 className={cx('display m-0 text-app text-balance', large ? 'text-4xl' : 'text-3xl')}>{title}</h1>
      )}
      {subtitle !== undefined && <p className="m-0 mt-1.5 text-[15px] leading-snug text-muted">{subtitle}</p>}
    </div>
  )

  return (
    <div data-pillar={pillar} className={cx('flex min-h-0 flex-1 flex-col', calm ? 'atmo-calm' : 'atmo', className)}>
      {hasBack && (
        <header className="glass sticky top-0 z-20 border-b border-line pt-safe">
          <div className="flex h-12 items-center gap-1 px-1.5">
            <button
              type="button"
              onClick={goBack}
              className="press inline-flex h-11 shrink-0 items-center gap-0.5 rounded-full pl-1.5 pr-3 text-[15px] font-medium text-app active:bg-surface-3"
            >
              <ChevronLeft size={24} aria-hidden />
              <span>{backLabel}</span>
            </button>
            <div className="min-w-0 flex-1 text-center">
              {titleInBar && title !== undefined && <h1 className="display m-0 truncate text-xl text-app">{title}</h1>}
            </div>
            <div className="flex min-w-11 shrink-0 items-center justify-end gap-1 pr-1">{right}</div>
          </div>
        </header>
      )}

      {!hasBack && hasHeader && (
        <header className="flex items-start gap-3 px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
          {hasTitleBlock ? titleBlock : <span className="flex-1" />}
          {right !== undefined && <div className="-mr-1.5 -mt-1 flex shrink-0 items-center gap-1">{right}</div>}
        </header>
      )}

      {hasBack && showBlock && <div className="flex px-4 pb-3 pt-5">{titleBlock}</div>}

      <div
        className={cx(
          'flex min-h-0 flex-1 flex-col pb-6',
          padded && 'px-4',
          !hasHeader && 'pt-safe',
          hasBack && !showBlock && 'pt-4',
        )}
      >
        {children}
      </div>
    </div>
  )
}
