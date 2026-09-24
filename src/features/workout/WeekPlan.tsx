import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, CalendarPlus, ChevronRight, Play, Plus, RefreshCw, Search, SkipForward, StretchHorizontal } from 'lucide-react'
import type { Exercise, WorkoutSession } from '../../domain/types'
import { Button, Card, Chip, ExerciseVisual, ListRow, Screen, Segmented, TextInput, WeekStrip, useToast } from '../../components'
import { useQuery } from '../../hooks'
import { deleteSession, getProfile, getSetting, updateSession } from '../../db/repositories'
import { estimateSessionMinutes, type ReflowMove } from '../../engine'
import { addDays, cx, dayName, fmtDate, startOfWeek, todayStr } from '../../lib/util'
import { LIBRARY_AREAS, libraryResults, type LibraryArea } from './library'
import { AddSessionSheet, ReflowSheet, RescheduleSheet, SkipSheet } from './PlanSheets'
import { SAFETY_TAG_SHORT, SESSION_TYPE_META, TIER_OPTIONS, TRAIN_TIER_SETTING, isMissed, libraryExercises, sessionStatusInfo, weekTierOf, type Tier } from './helpers'
import { addSessionFromTemplate, applyReflow, applyTier, computeReflow, missedSessions, planWeek, weekSessions } from './plan'

const TIER_SEGMENTS = TIER_OPTIONS.map((t) => ({ value: t.value, label: t.label }))

type DayState = 'done' | 'planned' | 'missed' | 'rest' | 'today'

const rise = (i: number) => ({ '--i': i }) as CSSProperties

/** Full week (behind "See all" on Train): tiers, Move / Skip, reflow, add session, next week, mobility and library entries. */
export function WeekPlanView() {
  const navigate = useNavigate()
  const toast = useToast()
  const today = todayStr()
  const weekStart = startOfWeek(today)
  const nextWeekStart = addDays(weekStart, 7)

  const sessions = useQuery(() => weekSessions(weekStart), [weekStart])
  const nextWeek = useQuery(() => weekSessions(nextWeekStart), [nextWeekStart])
  const storedTier = useQuery(() => getSetting<Tier | null>(TRAIN_TIER_SETTING, null), [])
  const tier: Tier = storedTier ?? (sessions.length ? weekTierOf(sessions) : 'target')

  const [reflowMoves, setReflowMoves] = useState<ReflowMove[] | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [reschedule, setReschedule] = useState<WorkoutSession | null>(null)
  const [skipping, setSkipping] = useState<WorkoutSession | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined)

  const missed = useMemo(() => missedSessions(sessions, today), [sessions, today])
  // What a reflow would do, previewed right in the banner.
  const reflowPreview = useMemo(() => (missed.length ? computeReflow(sessions, today) : []), [missed.length, sessions, today])
  const active = sessions.filter((s) => s.status !== 'skipped')
  const completed = sessions.filter((s) => s.status === 'completed').length
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const stripDays = useMemo(() => days.map((d) => {
    const rows = sessions.filter((s) => s.scheduledDate === d && s.status !== 'skipped')
    const done = rows.filter((s) => s.status === 'completed').length
    let state: DayState = 'rest'
    if (rows.length && done === rows.length) state = 'done'
    else if (d === today) state = 'today'
    else if (rows.some((s) => isMissed(s, today))) state = 'missed'
    else if (rows.length) state = 'planned'
    const value = rows.length ? (done + (rows.some((s) => s.status === 'in_progress') ? 0.5 : 0)) / rows.length : 0
    return { date: d, label: dayName(d).slice(0, 1), value: Math.min(1, value), state }
  }), [days, sessions, today])

  const changeTier = (next: Tier) => {
    if (next === tier) return
    const r = applyTier(next, weekStart, today)
    const bits: string[] = []
    if (r.added.length) bits.push(`added ${r.added.join(', ')}`)
    if (r.removed.length) bits.push(`removed ${r.removed.join(', ')}`)
    toast.show(`${TIER_OPTIONS.find((t) => t.value === next)?.label ?? next} tier${bits.length ? ` — ${bits.join('; ')}` : ''}`, 'success')
  }

  const openReflow = () => setReflowMoves(computeReflow(sessions, today))
  const doReflow = () => {
    if (!reflowMoves) return
    const r = applyReflow(sessions, reflowMoves)
    setReflowMoves(null)
    toast.show(`${r.moved} moved${r.dropped ? `, ${r.dropped} dropped` : ''}`, 'success')
  }

  const selectDay = (d: string) => {
    setSelectedDay(d)
    document.getElementById(`train-day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const doSkip = (id: number) => {
    const s = skipping
    updateSession(id, { status: 'skipped', notes: s?.notes ? `${s.notes}\nSkipped from the plan` : 'Skipped from the plan' })
    setSkipping(null)
    toast.show('Skipped. Open it any time to bring it back.', 'info')
  }

  return (
    <Screen pillar="train" title="This week" back="/train" backLabel="Train" eyebrow={`Week of ${fmtDate(weekStart)}`}>
      <div className="flex flex-col gap-3 pb-32">
        {/* Hero: the week as a bucket */}
        <Card pillar="train" className="anim-rise" >
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="eyebrow text-pillar">This week</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="num text-7xl text-app">{completed}</span>
                <span className="text-sm font-medium text-muted">of {active.length} done</span>
              </div>
            </div>
            {active.length > 0 && completed >= active.length && <span className="text-sm font-medium text-pillar pb-1.5">Week complete</span>}
          </div>
          <div className="mt-4">
            <WeekStrip days={stripDays} pillar="train" onSelect={selectDay} selected={selectedDay} />
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <Segmented options={TIER_SEGMENTS} value={tier} onChange={changeTier} label="Weekly tier" />
          </div>
        </Card>

        {/* Reflow: calm, previews what will move */}
        {missed.length > 0 && (
          <Card className="anim-rise">
            <div className="flex items-start gap-3" style={rise(1)}>
              <span className="h-9 w-9 rounded-xl bg-pillar-soft text-pillar inline-flex items-center justify-center shrink-0" aria-hidden><RefreshCw size={18} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] leading-tight">{missed.length === 1 ? '1 session to reschedule' : `${missed.length} sessions to reschedule`}</div>
                <p className="text-[13px] text-muted mt-0.5">Missed sessions are rescheduled, not judged.</p>
                {reflowPreview.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {reflowPreview.slice(0, 3).map((m) => (
                      <li key={m.id} className="flex items-start gap-2 text-[13px] leading-snug">
                        {m.drop ? <SkipForward size={14} className="text-muted shrink-0 mt-0.5" aria-hidden /> : <ArrowRight size={14} className="text-pillar shrink-0 mt-0.5" aria-hidden />}
                        <span className={m.drop ? 'text-muted' : undefined}>{m.note}</span>
                      </li>
                    ))}
                    {reflowPreview.length > 3 && <li className="text-[13px] text-muted pl-[22px]">+ {reflowPreview.length - 3} more</li>}
                  </ul>
                )}
                <Button variant="secondary" className="mt-3" icon={<RefreshCw size={16} />} onClick={openReflow}>Reflow week</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Sessions by day */}
        {sessions.length === 0 ? (
          <Card className="anim-rise">
            <p className="voice text-xl text-app">The week is open.</p>
            <p className="text-sm text-muted mt-1.5">Generate it from your tier, then move days around as life requires.</p>
            <Button variant="primary" className="mt-3" icon={<Plus size={16} />} onClick={() => { const n = planWeek(weekStart, tier); toast.show(`${n} sessions planned`, 'success') }}>Plan this week</Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {days.map((d, di) => {
              const rows = sessions.filter((s) => s.scheduledDate === d)
              const isToday = d === today
              return (
                <section key={d} id={`train-day-${d}`} aria-label={`${dayName(d, false)} ${fmtDate(d)}`} className="flex gap-3 anim-rise scroll-mt-24" style={rise(2 + di)}>
                  <div className={cx('w-10 shrink-0 pt-3 text-center', !isToday && rows.length === 0 && 'opacity-60')}>
                    <div className={cx('eyebrow', isToday ? 'text-pillar' : 'text-muted')}>{dayName(d)}</div>
                    <div className={cx('num text-2xl mt-1', isToday ? 'text-pillar' : 'text-app')}>{fmtDate(d).split(' ')[0]}</div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    {rows.length === 0 ? (
                      <div className={cx('min-h-11 flex items-center rounded-[1.25rem] border border-dashed px-4 text-sm', selectedDay === d ? 'border-pillar-line text-app' : 'border-line text-faint')}>
                        {isToday ? 'Rest day — nothing planned' : 'Rest'}
                      </div>
                    ) : rows.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        today={today}
                        highlighted={selectedDay === d}
                        onOpen={() => navigate(`/train/session/${s.id}`)}
                        onMove={() => setReschedule(s)}
                        onSkip={() => setSkipping(s)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        <Button variant="outline" full icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add session</Button>

        {/* Next week */}
        <SectionLabel title="Next week" sub={`From ${dayName(nextWeekStart)} ${fmtDate(nextWeekStart)}`} />
        {nextWeek.length === 0 ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted">Nothing planned yet.</div>
              <Button variant="secondary" icon={<CalendarPlus size={16} />} onClick={() => { const n = planWeek(nextWeekStart, tier); toast.show(`${n} sessions planned for next week`, 'success') }}>
                Plan next week
              </Button>
            </div>
          </Card>
        ) : (
          <Card flush>
            <ul className="divide-y divide-line">
              {nextWeek.map((s) => {
                const Icon = SESSION_TYPE_META[s.type].icon
                return (
                  <li key={s.id} className="flex items-center">
                    <div className="flex-1 min-w-0">
                      <ListRow
                        icon={<Icon size={16} />}
                        title={s.name}
                        subtitle={`${dayName(s.scheduledDate)} ${fmtDate(s.scheduledDate)} · ~${estimateSessionMinutes(s.exercises)} min`}
                        chevron={false}
                        onClick={() => navigate(`/train/session/${s.id}`)}
                      />
                    </div>
                    {s.status === 'planned' && (
                      <button type="button" onClick={() => setReschedule(s)} aria-label={`Move ${s.name}`} className="press shrink-0 h-11 px-3 mr-2 rounded-xl text-sm font-semibold text-muted inline-flex items-center gap-1.5">
                        <CalendarDays size={16} aria-hidden />Move
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {/* Mobility + library entries */}
        <Card flush className="mt-4">
          <ul className="divide-y divide-line">
            <li><ListRow icon={<StretchHorizontal size={18} />} title="Mobility" subtitle="Short guided routines" to="/train/mobility" /></li>
            <li><ListRow icon={<Search size={18} />} title="Exercise library" subtitle="Photos, demos and history" to="/train?view=library" /></li>
          </ul>
        </Card>
      </div>

      <ReflowSheet open={reflowMoves !== null} onClose={() => setReflowMoves(null)} moves={reflowMoves ?? []} onApply={doReflow} />

      <AddSessionSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        today={today}
        weekSessions={[...sessions, ...nextWeek]}
        onAdd={(key, date) => { addSessionFromTemplate(key, date); setAddOpen(false); toast.show('Session added', 'success') }}
      />

      <RescheduleSheet
        open={reschedule !== null}
        onClose={() => setReschedule(null)}
        session={reschedule}
        today={today}
        weekSessions={[...sessions, ...nextWeek]}
        onMove={(id, date) => { updateSession(id, { scheduledDate: date }); setReschedule(null); toast.show(`Moved to ${date === today ? 'today' : dayName(date)}`, 'success') }}
        onRemove={(id) => { deleteSession(id); setReschedule(null); toast.show('Session removed', 'info') }}
      />

      <SkipSheet
        open={skipping !== null}
        onClose={() => setSkipping(null)}
        session={skipping}
        onSkip={doSkip}
        onMoveInstead={() => { const s = skipping; setSkipping(null); if (s) setReschedule(s) }}
      />
    </Screen>
  )
}

/**
 * Exercise library (behind Train → Library): body-area tabs and "your equipment" by default, search across
 * everything, then visual rows that open the exercise detail. The tab and filter live in the URL so Back from an
 * exercise returns to the same view.
 */
export function LibraryView() {
  const library = useQuery(libraryExercises, [])
  const profileEquipment = useQuery(() => getProfile()?.equipment ?? [], [])
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const areaParam = params.get('area')
  const area: LibraryArea = LIBRARY_AREAS.some((a) => a.value === areaParam) ? (areaParam as LibraryArea) : 'all'
  const canFilter = profileEquipment.length > 0
  const mineOnly = canFilter && params.get('equipment') !== 'all'
  const searching = query.trim().length > 0
  const results = useMemo(
    () => libraryResults(library, { query, area, mineOnly, profileEquipment }),
    [library, query, area, mineOnly, profileEquipment],
  )
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value == null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const areaLabel = LIBRARY_AREAS.find((a) => a.value === area)?.label ?? 'All'

  return (
    <Screen pillar="train" title="Library" back="/train" backLabel="Train" eyebrow={searching ? `Searching all ${library.length} exercises` : `${results.length} of ${library.length} exercises`}>
      <div className="flex flex-col gap-3 pb-32">
        <TextInput
          icon={<Search size={16} />}
          placeholder="Name, muscle or alias"
          aria-label="Search the exercise library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="none"
        />
        {!searching && (
          <>
            <div role="group" aria-label="Body area" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              {LIBRARY_AREAS.map((a) => (
                <Chip key={a.value} selected={a.value === area} onClick={() => setParam('area', a.value === 'all' ? null : a.value)} className="shrink-0">
                  {a.label}
                </Chip>
              ))}
            </div>
            {canFilter && (
              <Segmented
                size="sm"
                label="Equipment"
                options={[{ value: 'mine', label: 'My equipment' }, { value: 'all', label: 'All equipment' }]}
                value={mineOnly ? 'mine' : 'all'}
                onChange={(v) => setParam('equipment', v === 'all' ? 'all' : null)}
              />
            )}
          </>
        )}
        {results.length === 0 ? (
          <Card>
            {searching ? (
              <p className="voice text-lg text-muted text-center py-2">Nothing matches “{query}”.</p>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="voice text-lg text-muted">No {areaLabel.toLowerCase()} exercises with your equipment.</p>
                <Button variant="secondary" size="sm" onClick={() => setParam('equipment', 'all')}>Show all equipment</Button>
              </div>
            )}
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((e) => (
              <li key={e.id}>
                <Link to={`/train/exercise/${e.id}`} className="press flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-2.5 min-h-[72px]">
                  <ExerciseVisual exercise={e} size="thumb" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[15px] leading-tight truncate text-app">{e.name}</span>
                    <span className="block text-[13px] text-muted mt-0.5 truncate"><span className="capitalize">{e.equipment} · {e.primaryMuscles.join(', ')}</span>{e.safetyTags.length ? ` · ${e.safetyTags.map((t) => SAFETY_TAG_SHORT[t]).join(', ')}` : ''}</span>
                  </span>
                  <ChevronRight size={18} className="text-faint shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  )
}

function SectionLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pt-4 px-1">
      <h2 className="display text-2xl text-app">{title}</h2>
      {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function SessionCard({ session: s, today, highlighted, onOpen, onMove, onSkip }: { session: WorkoutSession; today: string; highlighted: boolean; onOpen(): void; onMove(): void; onSkip(): void }) {
  const status = sessionStatusInfo(s, today)
  const StatusIcon = status.icon
  const meta = SESSION_TYPE_META[s.type]
  const TypeIcon = meta.icon
  const planned = s.status === 'planned'
  const live = s.status === 'in_progress'
  const dueToday = planned && s.scheduledDate === today
  const done = s.status === 'completed'
  const minutes = done && s.durationMin != null ? `${s.durationMin} min` : `~${estimateSessionMinutes(s.exercises)} min`
  const pillCls = done || live || dueToday ? 'bg-pillar-soft text-pillar' : 'bg-surface-2 text-muted'

  return (
    <div className={cx('rounded-[1.25rem] border bg-surface', highlighted || dueToday || live ? 'border-pillar-line' : 'border-line', s.status === 'skipped' && 'opacity-70')}>
      <button type="button" onClick={onOpen} className="press w-full min-h-[64px] px-3.5 py-3 flex items-center gap-3 text-left">
        <span className={cx('h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0', done ? 'bg-pillar text-accent-fg' : 'bg-surface-2 text-muted')} aria-hidden>
          <TypeIcon size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[16px] leading-tight truncate">{s.name}</span>
          <span className="block text-[13px] text-muted mt-0.5 tnum">{meta.label} · {minutes}{done && s.sessionRpe != null ? ` · RPE ${s.sessionRpe}` : ''}</span>
        </span>
        <span className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold shrink-0', pillCls)}>
          <StatusIcon size={12} strokeWidth={2.5} aria-hidden />{status.label}
        </span>
      </button>
      {(planned || live) && (
        <div className="flex items-center gap-2 px-3.5 pb-3">
          {(dueToday || live) && (
            <Button variant="primary" className="flex-1" icon={<Play size={16} />} onClick={onOpen}>{live ? 'Resume' : 'Start'}</Button>
          )}
          {planned && (
            <>
              <button type="button" onClick={onMove} aria-label={`Move ${s.name} to another day`} className={cx('press h-11 px-3 rounded-xl border border-line-strong text-sm font-semibold inline-flex items-center justify-center gap-1.5', !dueToday && 'flex-1')}>
                <CalendarDays size={16} aria-hidden />Move
              </button>
              <button type="button" onClick={onSkip} aria-label={`Skip ${s.name}`} className={cx('press h-11 px-3 rounded-xl border border-line-strong text-sm font-semibold text-muted inline-flex items-center justify-center gap-1.5', !dueToday && 'flex-1')}>
                <SkipForward size={16} aria-hidden />Skip
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
