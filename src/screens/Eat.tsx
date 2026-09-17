import { useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, History, Info, Repeat2, Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { Macros, Meal, NutritionTarget } from '../domain/types'
import { Button, Field, IconButton, Illustration, NumberInput, Screen, Sheet, fmtInt, useToast } from '../components'
import { useNow, useQuery } from '../hooks'
import {
  addMeal, cloneMeal, dailyTotals, dailyTotalsRange, getBodyMetrics, getGoals, getMealsForDate, getNutritionTarget,
  getProfile, getSavedMeals, getSetting, latestBodyMetric, recentFoods, setNutritionTarget, setSetting,
} from '../db/repositories'
import { estimateTargets, evaluateNutritionTrend, type TrendFlag } from '../engine/nutrition'
import { inferMealType } from '../engine/voice'
import { addDays, cx, dayName, fmtDate, fmtTime, todayStr } from '../lib/util'
import { draftFromMeal, draftTotals, fmtG, mealTsForDate, nutritionLine, saveDraft, type NewFoodItem } from '../features/meal/draft'
import { FoodRow, IntakeStrip, MacroRing, MealThumb, RowList, SectionLabel, intakeAverage } from '../features/meal/ui'
import { Composer } from '../features/composer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FLAG_LABEL: Record<TrendFlag['kind'], string> = {
  on_track: 'On track', flat: 'Weight flat', rapid_loss: 'Losing fast', under_eating: 'Low intake', low_protein: 'Low protein', insufficient_data: 'More data needed',
}

type EatMode = 'consumed' | 'remaining'
const MODE_KEY = 'eat.mode'
function readMode(): EatMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'remaining' ? 'remaining' : 'consumed'
  } catch {
    return 'consumed'
  }
}

/** A past day with no meals can be marked, without judgement, as a fast or simply left unlogged. */
type DayNote = 'fasting' | 'not_logged'
const DAY_NOTES_KEY = 'eat.dayNotes'
/** Meals on the root screen before "See all" (DESIGN §10.1). */
const MEALS_SHOWN = 3
const DAY_NOTE_LABEL: Record<DayNote, string> = { fasting: 'fasting day', not_logged: 'not logged' }

const rise = (i: number): { className: string; style: CSSProperties } => ({ className: 'anim-rise', style: { '--i': i } as CSSProperties })

interface TargetView extends Macros { id: number | null; missing: boolean }

/** Active target for the date, or an unsaved estimate from the profile so the screen never shows 0 / 0. */
function resolveTarget(date: string): TargetView {
  const t = getNutritionTarget(date)
  if (t) return { id: t.id, kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, missing: false }
  const est = estimateFromProfile()
  return { id: null, missing: true, ...(est ?? { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65 }) }
}

function estimateFromProfile(): Macros | null {
  const p = getProfile()
  const w = latestBodyMetric('weight')
  if (!p || !w) return null
  const goal = getGoals().find((g) => g.type === 'weight' && g.status === 'active')
  const dir = goal ? (goal.targetValue < w.value - 0.5 ? 'cut' : goal.targetValue > w.value + 0.5 ? 'gain' : 'maintain') : 'maintain'
  const e = estimateTargets({ sex: p.sex, dob: p.dob, heightCm: p.heightCm, weightKg: w.value, activity: 'moderate', goal: dir })
  return { kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG }
}

function highProteinNames(items: NewFoodItem[]): string[] {
  return items.filter((i) => i.proteinG >= 20 && i.quantityG > 0 && (i.proteinG / i.quantityG) * 100 >= 8).map((i) => i.foodName)
}

/** The 7 days shown in the strip: the last 7 when the date is recent, otherwise a window around it. */
function stripEnd(date: string, today: string): string {
  if (date > today) return date
  return date >= addDays(today, -6) ? today : addDays(date, 3)
}

function mealName(meal: Meal): string {
  if (meal.isSaved && meal.savedName) return meal.savedName
  const names = meal.items.map((i) => i.foodName)
  if (!names.length) return 'No items'
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

// --- meal card -------------------------------------------------------------------

/** Photo-led card: thumbnail, name, time, kcal and protein. Tapping opens the meal (edit / save / delete live there). */
function MealCard({ meal, onOpen }: { meal: Meal; onOpen: () => void }) {
  const t = draftTotals(meal.items)
  const name = mealName(meal)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${name}, ${fmtTime(meal.ts)}, ${fmtInt(t.kcal)} kcal, ${fmtG(t.proteinG)} protein`}
      className="press w-full flex items-center gap-3 p-3 rounded-[1.25rem] border border-line bg-surface text-left active:bg-surface-2"
    >
      <MealThumb photo={meal.photoUri} name={meal.items[0]?.foodName ?? name} size={64} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium leading-snug line-clamp-2">{name}</span>
        <span className="block tnum text-[13px] text-muted mt-1">{fmtTime(meal.ts)}</span>
      </span>
      <span className="shrink-0 text-right leading-none">
        <span className="block whitespace-nowrap">
          <span className="num text-[26px]">{fmtInt(t.kcal)}</span>
          <span className="text-[12px] text-muted ml-1">kcal</span>
        </span>
        <span className="block whitespace-nowrap text-protein mt-1.5">
          <span className="num text-[26px]">{fmtInt(t.proteinG)}</span>
          <span className="text-[12px] font-semibold ml-1">g protein</span>
        </span>
      </span>
    </button>
  )
}

// --- protein split ---------------------------------------------------------------

/** "62 g + 0 g of 150 g" — how the day's protein is spread across meals. */
function ProteinSplit({ meals, targetG }: { meals: Meal[]; targetG: number }) {
  const parts = meals.map((m) => ({ id: m.id, g: Math.round(draftTotals(m.items).proteinG) }))
  const total = parts.reduce((s, p) => s + p.g, 0)
  const scale = Math.max(targetG, total, 1)
  const over = total - Math.round(targetG)
  return (
    <div>
      <div className="flex h-1.5 gap-[3px] rounded-full bg-surface-2 overflow-hidden" aria-hidden>
        {parts.filter((p) => p.g > 0).map((p) => (
          <span key={p.id} className="h-full rounded-full bg-protein" style={{ width: `${(p.g / scale) * 100}%` }} />
        ))}
      </div>
      <p className="tnum text-[14px] text-muted mt-2">
        <span className="font-semibold text-protein">{parts.map((p) => `${p.g} g`).join(' + ')}</span>
        {' '}of {fmtInt(targetG)} g protein{over > 0 ? ` · +${over} g` : ''}
      </p>
    </div>
  )
}

// --- targets sheet ---------------------------------------------------------------

function TargetSheet({ open, onClose, date, current }: { open: boolean; onClose: () => void; date: string; current: TargetView }) {
  const toast = useToast()
  const [kcal, setKcal] = useState<number | null>(current.kcal)
  const [proteinG, setProteinG] = useState<number | null>(current.proteinG)
  const [carbsG, setCarbsG] = useState<number | null>(current.carbsG)
  const [fatG, setFatG] = useState<number | null>(current.fatG)
  const valid = kcal != null && kcal >= 800 && kcal <= 6000 && proteinG != null && proteinG >= 0 && proteinG <= 400 && carbsG != null && carbsG >= 0 && carbsG <= 800 && fatG != null && fatG >= 0 && fatG <= 300
  const macroKcal = (proteinG ?? 0) * 4 + (carbsG ?? 0) * 4 + (fatG ?? 0) * 9
  const gap = kcal != null ? Math.round(macroKcal - kcal) : 0

  const useEstimate = () => {
    const est = estimateFromProfile()
    if (!est) { toast.show('Add your profile and a weight first', 'info'); return }
    setKcal(est.kcal); setProteinG(est.proteinG); setCarbsG(est.carbsG); setFatG(est.fatG)
  }

  const save = () => {
    if (!valid) return
    const t: Omit<NutritionTarget, 'id'> = {
      startDate: date, endDate: null, kcal: Math.round(kcal), proteinG: Math.round(proteinG), carbsG: Math.round(carbsG), fatG: Math.round(fatG),
      rationale: 'manual edit',
    }
    setNutritionTarget(t)
    toast.show('Targets updated', 'success')
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Daily targets"
      footer={<Button size="lg" full disabled={!valid} onClick={save}>Save from {date === todayStr() ? 'today' : fmtDate(date)}</Button>}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories"><NumberInput value={kcal} onChange={setKcal} unit="kcal" min={800} max={6000} step={50} /></Field>
          <Field label="Protein"><NumberInput value={proteinG} onChange={setProteinG} unit="g" min={0} max={400} step={5} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carbs"><NumberInput value={carbsG} onChange={setCarbsG} unit="g" min={0} max={800} step={5} /></Field>
          <Field label="Fat"><NumberInput value={fatG} onChange={setFatG} unit="g" min={0} max={300} step={5} /></Field>
        </div>
        <p className="tnum text-[13px] text-muted">
          Macros add up to {fmtInt(macroKcal)} kcal{Math.abs(gap) > 100 ? ` — ${fmtInt(Math.abs(gap))} ${gap > 0 ? 'above' : 'below'} the calorie target` : ''}.
        </p>
        <Button variant="secondary" icon={<Sparkles size={16} />} onClick={useEstimate}>Use profile estimate</Button>
      </div>
    </Sheet>
  )
}

// --- screen ----------------------------------------------------------------------

export default function EatScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const today = todayStr()
  const paramDate = params.get('date')
  const date = paramDate && DATE_RE.test(paramDate) ? paramDate : today
  const now = useNow(60_000)
  const hour = now.getHours()

  const [mode, setModeState] = useState<EatMode>(readMode)
  const [moreOpen, setMoreOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)
  const [openFlag, setOpenFlag] = useState<TrendFlag['kind'] | null>(null)

  const end = stripEnd(date, today)

  const day = useQuery(() => {
    const meals = getMealsForDate(date)
    const totals = dailyTotals(date)
    const target = resolveTarget(date)
    const saved = getSavedMeals()
    const recent = recentFoods(12)
    const week = dailyTotalsRange(addDays(end, -6), end)
    const dayNotes = getSetting<Record<string, DayNote>>(DAY_NOTES_KEY, {})
    return { meals, totals, target, saved, recent, week, dayNotes }
  }, [date, end])

  const trendFlags = useQuery(() => {
    const t = getNutritionTarget(today)
    if (!t) return [] as TrendFlag[]
    const from = addDays(today, -20)
    const trend = evaluateNutritionTrend({
      weights: getBodyMetrics('weight', 21),
      waists: getBodyMetrics('waist', 21),
      intake: dailyTotalsRange(from, today),
      target: t,
      today,
    })
    return trend.flags.filter((f) => f.kind !== 'insufficient_data')
  }, [today])

  const { meals, totals, target, saved, recent, week, dayNotes } = day
  const logged = meals.length > 0
  const isToday = date === today
  const isPast = date < today
  const dayNote: DayNote | undefined = dayNotes[date]
  const line = nutritionLine({
    date, today, hour, intake: totals, target, logged,
    suggestions: [...saved.map((m) => m.savedName ?? '').filter(Boolean), ...highProteinNames(recent)],
  })
  const shownFlag = trendFlags.find((f) => f.kind === openFlag)
  const avg = intakeAverage(week)
  // Latest first: the meal just logged is the one on top.
  const latestFirst = [...meals].reverse()

  const toggleMode = () => {
    const m: EatMode = mode === 'remaining' ? 'consumed' : 'remaining'
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* private mode — the toggle still works for this visit */
    }
  }

  const setDate = (d: string) => {
    if (d === today) setParams({}, { replace: true })
    else setParams({ date: d }, { replace: true })
  }

  const setDayNote = (note: DayNote | null) => {
    const next = { ...dayNotes }
    if (note) next[date] = note
    else delete next[date]
    setSetting(DAY_NOTES_KEY, next)
  }

  const yesterday = date === addDays(today, -1)
  const title = isToday ? 'Eat' : yesterday ? 'Yesterday' : `${dayName(date)} ${Number(date.slice(8))}`
  const eyebrow = isToday || yesterday ? `${dayName(date, false)} ${fmtDate(date)}` : fmtDate(date)

  const openMeal = (meal: Meal) => {
    saveDraft(draftFromMeal(meal))
    navigate('/eat/review')
  }

  const logSaved = (meal: Meal) => {
    try {
      cloneMeal(meal.id, mealTsForDate(date, today))
      toast.show(`Logged ${meal.savedName ?? 'saved meal'}`, 'success')
    } catch (e) {
      console.error(e)
      toast.show('Could not log that meal', 'error')
    }
    setRecentOpen(false)
  }

  const logRecent = (item: NewFoodItem) => {
    const ts = mealTsForDate(date, today)
    try {
      addMeal({ ts, mealType: inferMealType(ts), photoUri: null, notes: '', source: 'manual', savedName: null, isSaved: false }, [item])
      toast.show(`Logged ${item.foodName}`, 'success')
    } catch (e) {
      console.error(e)
      toast.show('Could not log that food', 'error')
    }
    setRecentOpen(false)
  }

  const openSearch = () => navigate('/eat/search', { state: { date } })
  const modeWord = mode === 'remaining' ? 'Remaining' : 'Consumed'
  const SHORTCUT = 'press inline-flex items-center gap-1.5 h-11 px-3 rounded-full text-[14px] font-medium text-muted active:bg-surface-2'

  return (
    <Screen
      pillar="eat"
      large
      eyebrow={eyebrow}
      title={title}
      right={
        <>
          {end !== today && <Button variant="ghost" onClick={() => setDate(today)}>Today</Button>}
          <IconButton icon={<ChevronLeft size={22} />} label="Previous day" variant="surface" onClick={() => setDate(addDays(date, -1))} />
          <IconButton icon={<ChevronRight size={22} />} label="Next day" variant="surface" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} />
          <IconButton icon={<Info size={20} />} label="More: pace, trends and targets" variant="ghost" onClick={() => setMoreOpen(true)} />
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-40">
        <div {...rise(0)}>
          <button
            type="button"
            onClick={toggleMode}
            aria-label={`Calories ${fmtInt(totals.kcal)} of ${fmtInt(target.kcal)} kcal. Protein ${fmtInt(totals.proteinG)} of ${fmtInt(target.proteinG)} grams. Showing ${modeWord.toLowerCase()}. Tap to switch.`}
            className="press w-full rounded-[1.25rem] border border-pillar-line bg-surface p-4 text-left"
          >
            <span className="flex items-center justify-between mb-2">
              <span className="eyebrow text-pillar">{modeWord}</span>
              <Repeat2 size={16} className="text-faint" aria-hidden />
            </span>
            <span className="grid grid-cols-2 gap-3">
              <MacroRing label="Calories" unit="kcal" value={totals.kcal} target={target.kcal} mode={mode} tone="text-app" />
              <MacroRing label="Protein" unit="g" value={totals.proteinG} target={target.proteinG} mode={mode} tone="text-protein" />
            </span>
            <span className="flex justify-center gap-8 mt-3 text-[13px] text-muted">
              <span>Carbs <span className="num text-[18px] text-carbs">{fmtInt(totals.carbsG)}</span><span className="tnum"> / {fmtInt(target.carbsG)} g</span></span>
              <span>Fat <span className="num text-[18px] text-fat">{fmtInt(totals.fatG)}</span><span className="tnum"> / {fmtInt(target.fatG)} g</span></span>
            </span>
          </button>
        </div>

        <div {...rise(1)}>
          <IntakeStrip
            days={week}
            kcalTarget={target.kcal}
            proteinTarget={target.proteinG}
            today={today}
            selected={date}
            onSelect={setDate}
            notes={Object.fromEntries(Object.entries(dayNotes).map(([d, n]) => [d, DAY_NOTE_LABEL[n]]))}
          />
        </div>

        <section {...rise(2)} aria-label="Meals">
          <div className="flex items-center justify-between gap-2 pl-1 -mr-1">
            <h2 className="eyebrow text-muted">Meals{logged ? ` · ${meals.length}` : ''}</h2>
            <div className="flex items-center">
              <button type="button" onClick={() => setRecentOpen(true)} className={SHORTCUT}><History size={16} aria-hidden />Recent</button>
              <button type="button" onClick={openSearch} className={SHORTCUT}><Search size={16} aria-hidden />Search</button>
            </div>
          </div>

          {logged ? (
            <div className="flex flex-col gap-2">
              {latestFirst.slice(0, MEALS_SHOWN).map((meal) => <MealCard key={meal.id} meal={meal} onOpen={() => openMeal(meal)} />)}
              {meals.length > MEALS_SHOWN && (
                <button type="button" onClick={() => setAllOpen(true)} className="press h-11 text-[15px] font-medium text-muted">
                  See all {meals.length}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center px-4 py-5 text-muted">
              <Illustration name="plate" size={112} />
              <p className="voice text-[20px] text-app mt-3">
                {dayNote === 'fasting' ? 'Noted as a fasting day.'
                  : isPast ? 'Nothing logged on this day.'
                    : isToday ? 'Nothing logged yet. Snap, say or type a meal.'
                      : 'Planning ahead? Add what you expect to eat.'}
              </p>
            </div>
          )}
        </section>
      </div>

      <Composer context="eat" />

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={isToday ? 'Today in detail' : `${dayName(date)} ${fmtDate(date)}`}>
        <div className="flex flex-col gap-5">
          <p className="voice text-[19px] border-l-2 border-line-strong pl-3.5">{line.text}</p>

          {logged && (
            <div>
              <SectionLabel>Protein by meal</SectionLabel>
              <ProteinSplit meals={meals} targetG={target.proteinG} />
            </div>
          )}

          <div>
            <SectionLabel note={avg.logged ? `${avg.logged} of ${week.length} days logged` : undefined}>7-day average</SectionLabel>
            {avg.logged ? (
              <p className="flex items-baseline gap-5">
                <span><span className="num text-[30px]">{fmtInt(avg.kcal)}</span><span className="text-[13px] text-muted ml-1">kcal</span></span>
                <span className="text-protein"><span className="num text-[30px]">{fmtInt(avg.proteinG)}</span><span className="text-[13px] font-semibold ml-1">g protein</span></span>
              </p>
            ) : <p className="text-[15px] text-muted">No meals logged in these 7 days.</p>}
          </div>

          {trendFlags.length > 0 && (
            <div>
              <SectionLabel>Trends</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {trendFlags.map((f) => (
                  <button
                    key={f.kind}
                    type="button"
                    aria-expanded={openFlag === f.kind}
                    onClick={() => setOpenFlag(openFlag === f.kind ? null : f.kind)}
                    className={cx(
                      'press inline-flex items-center h-11 px-4 rounded-full border text-[14px] font-medium',
                      openFlag === f.kind ? 'border-line-strong bg-surface-2 text-app' : 'border-line text-muted',
                    )}
                  >
                    {FLAG_LABEL[f.kind]}
                  </button>
                ))}
              </div>
              {shownFlag && <p className="text-[14px] text-muted leading-snug mt-2">{shownFlag.message}</p>}
            </div>
          )}

          {isPast && !logged && (
            <div>
              <SectionLabel note="Only a note for you">No meals on this day</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(['fasting', 'not_logged'] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={dayNote === n}
                    onClick={() => setDayNote(dayNote === n ? null : n)}
                    className={cx(
                      'press h-11 px-4 rounded-full border text-[15px] font-medium',
                      dayNote === n ? 'bg-pillar-soft border-pillar-line text-app' : 'border-line bg-surface-2 text-muted',
                    )}
                  >
                    {n === 'fasting' ? 'Fasting day' : 'Not logged'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionLabel note={target.missing ? 'Estimated from your profile' : undefined}>Daily targets</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <p className="tnum text-[15px]">
                {fmtInt(target.kcal)} kcal · <span className="font-semibold text-protein">{fmtInt(target.proteinG)} g protein</span>
              </p>
              <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => { setMoreOpen(false); setTargetOpen(true) }}>
                {target.missing ? 'Set' : 'Edit'}
              </Button>
            </div>
          </div>
        </div>
      </Sheet>

      {targetOpen && <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} date={date} current={target} />}

      <Sheet open={allOpen} onClose={() => setAllOpen(false)} title={`Meals · ${meals.length}`}>
        <div className="flex flex-col gap-2">
          {latestFirst.map((meal) => <MealCard key={meal.id} meal={meal} onOpen={() => openMeal(meal)} />)}
        </div>
      </Sheet>

      <Sheet open={recentOpen} onClose={() => setRecentOpen(false)} title={isToday ? 'Log again' : `Log again · ${fmtDate(date)}`}>
        {saved.length === 0 && recent.length === 0 ? (
          <p className="voice text-[19px] text-muted py-4">Saved meals and foods you log show up here.</p>
        ) : (
          <>
            {saved.length > 0 && (
              <>
                <SectionLabel>Saved meals</SectionLabel>
                <RowList className="mb-5">
                  {saved.map((m) => {
                    const t = draftTotals(m.items)
                    return (
                      <FoodRow
                        key={m.id}
                        name={m.savedName ?? 'Saved meal'}
                        glyph={m.items[0]?.foodName}
                        detail={`${m.items.length} item${m.items.length === 1 ? '' : 's'}`}
                        kcal={t.kcal}
                        proteinG={t.proteinG}
                        actionLabel="Log"
                        onClick={() => logSaved(m)}
                      />
                    )
                  })}
                </RowList>
              </>
            )}
            {recent.length > 0 && (
              <>
                <SectionLabel note="Same amount as last time">Recent foods</SectionLabel>
                <RowList>
                  {recent.map((it) => (
                    <FoodRow
                      key={it.foodName}
                      name={it.foodName}
                      detail={it.servingDescription || fmtG(it.quantityG)}
                      kcal={it.kcal}
                      proteinG={it.proteinG}
                      actionLabel="Log"
                      onClick={() => logRecent(it)}
                    />
                  ))}
                </RowList>
              </>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  )
}
