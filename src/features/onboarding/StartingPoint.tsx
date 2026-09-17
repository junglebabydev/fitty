// Final screen: the baseline (AI-written or local rules), shown as three cards + the two targets.
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Eye, Minus, Plus, ThumbsUp } from 'lucide-react'
import { AIBadge, HeroNumber, IconButton, Skeleton } from '../../components'
import { clamp } from '../../lib/util'
import type { Baseline } from '../ai/intake'
import { effectiveTargets, estimateFor, type WizardState } from '../settings/onboarding'

function Block({ icon, title, items, i }: { icon: ReactNode; title: string; items: string[]; i: number }) {
  return (
    <section className="anim-rise rounded-[1.25rem] border border-line bg-surface p-4 flex gap-3.5" style={{ '--i': i } as CSSProperties} aria-label={title}>
      <span className="inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-full border border-pillar-line bg-pillar-soft text-pillar" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="eyebrow text-muted m-0">{title}</h2>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.map((t, k) => (
            <li key={k} className="flex gap-2.5 text-[15px] leading-snug text-pretty">
              <span className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-pillar" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function StartingPoint({ s, set, today, baseline, building }: { s: WizardState; set: (p: Partial<WizardState>) => void; today: string; baseline: Baseline | null; building: boolean }) {
  const t = effectiveTargets(s, estimateFor(s, today))
  const nudge = (k: 'kcal' | 'proteinG', delta: number) => {
    const kcal = k === 'kcal' ? clamp((t.kcal ?? 2000) + delta, 1000, 6000) : t.kcal
    const proteinG = k === 'proteinG' ? clamp((t.proteinG ?? 120) + delta, 40, 400) : t.proteinG
    set({ kcal, proteinG, targetsEdited: true })
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="pt-6 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-pillar">Starting point</p>
          {baseline?.generatedBy === 'ai' ? <AIBadge /> : baseline ? <span className="eyebrow text-muted">On-device</span> : <AIBadge label="Writing" />}
        </div>
        {building || !baseline ? (
          <div className="mt-4 flex flex-col gap-2.5" role="status" aria-label="Writing your starting point">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-11/12" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <p className="voice text-[22px] leading-snug mt-3 text-pretty">
            {s.name.trim() ? `${s.name.trim()}, ` : ''}
            {s.name.trim() ? baseline.summary.charAt(0).toLowerCase() + baseline.summary.slice(1) : baseline.summary}
          </p>
        )}
      </header>

      {building || !baseline ? (
        <>
          <Skeleton className="h-24 w-full rounded-[1.25rem]" />
          <Skeleton className="h-24 w-full rounded-[1.25rem]" />
          <Skeleton className="h-28 w-full rounded-[1.25rem]" />
        </>
      ) : (
        <>
          <Block i={0} icon={<ThumbsUp size={20} />} title="Strengths" items={baseline.strengths} />
          <Block i={1} icon={<Eye size={20} />} title="Watch-outs" items={baseline.watchouts} />
          <Block i={2} icon={<CalendarCheck size={20} />} title="First week" items={baseline.firstWeek} />
        </>
      )}

      <section className="rounded-[1.25rem] border border-line bg-surface p-4 grid grid-cols-2 gap-4" aria-label="Daily targets, editable">
        <div>
          <HeroNumber label="Calories" value={t.kcal != null ? t.kcal.toLocaleString('en-SG') : '—'} unit="kcal" size="md" />
          <div className="flex gap-2 mt-3">
            <IconButton icon={<Minus size={18} />} label="Lower calories by 50" variant="surface" onClick={() => nudge('kcal', -50)} />
            <IconButton icon={<Plus size={18} />} label="Raise calories by 50" variant="surface" onClick={() => nudge('kcal', 50)} />
          </div>
        </div>
        <div>
          <HeroNumber label="Protein" value={t.proteinG ?? '—'} unit="g" size="md" pillar="eat" />
          <div className="flex gap-2 mt-3">
            <IconButton icon={<Minus size={18} />} label="Lower protein by 5 grams" variant="surface" onClick={() => nudge('proteinG', -5)} />
            <IconButton icon={<Plus size={18} />} label="Raise protein by 5 grams" variant="surface" onClick={() => nudge('proteinG', 5)} />
          </div>
        </div>
      </section>

      {!building && baseline?.generatedBy === 'local' && (
        <p className="text-[14px] text-muted leading-snug px-1">
          Written from rules on this phone.{' '}
          {s.rerun ? (
            <Link to="/settings#ai" className="underline underline-offset-4 text-app">
              Connect AI
            </Link>
          ) : (
            'Connect AI in Settings → AI'
          )}{' '}
          for one written for you.
        </p>
      )}
    </div>
  )
}
