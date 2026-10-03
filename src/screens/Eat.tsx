import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ChevronLeft, ChevronRight, Ellipsis, Flame, Plus, Search, Sparkles } from 'lucide-react'
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
import { FoodRow, IntakeStrip, MealThumb, RowList, SectionLabel, intakeAverage } from '../features/meal/ui'
import { captureMealFromFile } from '../features/meal/captureMeal'
import { usePhotoPicker } from '../native/PhotoInput'
import { Composer } from '../features/composer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FLAG_LABEL: Record<TrendFlag['kind'], string> = {
  on_track: 'On track', flat: 'Weight flat', rapid_loss: 'Losing fast', under_eating: 'Low intake', low_protein: 'Low protein', insufficient_data: 'More data needed',
}

/** A past day with no meals can be marked, without judgement, as a fast or simply left unlogged. */
type DayNote = 'fasting' | 'not_logged'
const DAY_NOTES_KEY = 'eat.dayNotes'
const DAY_NOTE_LABEL: Record<DayNote, string> = { fasting: 'fasting day', not_logged: 'not logged' }

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

// --- sections --------------------------------------------------------------------

/** MyFitnessPal-style sections, derived from the meal's time (not the stored type). */
type Section = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const SECTIONS: Section[] = ['breakfast', 'lunch', 'dinner', 'snack']
const SECTION_LABEL: Record<Section, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' }
const sectionOf = (ts: string): Section => {
  const t = inferMealType(ts)
  return t === 'drink' ? 'snack' : t
}

/** One row in a section: thumbnail, name, time, kcal and protein. Tapping opens the meal. */
function MealRow({ meal, onOpen }: { meal: Meal; onOpen: () => void }) {
  const t = draftTotals(meal.items)
  const name = mealName(meal)
  const protein = Math.round(t.proteinG)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${name}, ${fmtTime(meal.ts)}, ${fmtInt(t.kcal)} kcal${protein > 0 ? `, ${fmtG(t.proteinG)} protein` : ''}`}
      className="w-full min-h-[64px] flex items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2 transition-colors"
    >
      <MealThumb photo={meal.photoUri} name={meal.items[0]?.foodName ?? name} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium leading-tight line-clamp-2">{name}</span>
        <span className="block tnum text-[13px] text-muted mt-0.5">{fmtTime(meal.ts)}</span>
      </span>
      <span className="shrink-0 text-right leading-tight">
        <span className="block whitespace-nowrap"><span className="num text-[19px]">{fmtInt(t.kcal)}</span><span className="text-[12px] text-muted ml-1">kcal</span></span>
        {protein > 0 && <span className="block whitespace-nowrap text-[13px] font-medium text-protein">{protein} g protein</span>}
      </span>
    </button>
  )
}

// --- calorie equation ------------------------------------------------------------

/** One term of "Goal − Food = Remaining": a rounded numeral with a small label under it. */
function Term({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <span className="flex flex-col items-center min-w-0">
      <span className={cx('num leading-none', strong ? 'text-[30px] text-app' : 'text-[26px] text-app')}>{value}</span>
      <span className="text-[12px] text-muted mt-1.5">{label}</span>
    </span>
  )
}

const Op = ({ children }: { children: string }) => <span className="num text-[22px] text-faint pb-5" aria-hidden>{children}</span>

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

  const [moreOpen, setMoreOpen] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [quick, setQuick] = useState<{ kcal: number | null; proteinG: number | null } | null>(null)
  const [openFlag, setOpenFlag] = useState<TrendFlag['kind'] | null>(null)

  // Persistent camera input: opened synchronously by the tap (DESIGN §10.3), outside the sheet.
  const photos = usePhotoPicker((file) => { void captureMealFromFile(navigate, file, mealTsForDate(date, today)) })

  const end = stripEnd(date, today)

  const day = useQuery(() => {
    const meals = getMealsForDate(date)
    const totals = dailyTotals(date)
    const target = resolveTarget(date)
    const saved = getSavedMeals()
    // Quick-add rows have no weight to repeat; they stay out of Recent.
    const recent = recentFoods(12).filter((it) => it.quantityG > 0)
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

  const sections = SECTIONS
    .map((s) => ({ key: s, meals: meals.filter((m) => sectionOf(m.ts) === s) }))
    .filter((s) => s.meals.length > 0)

  const food = Math.round(totals.kcal)
  const goal = Math.round(target.kcal)
  const left = goal - food
  const proteinLeft = Math.round(target.proteinG - totals.proteinG)
  const proteinPct = target.proteinG > 0 ? Math.min(100, (totals.proteinG / target.proteinG) * 100) : 0
  const carbs = Math.round(totals.carbsG)
  const fat = Math.round(totals.fatG)

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
  const eyebrow = isToday ? `${dayName(date, false)} ${fmtDate(date)}` : fmtDate(date)

  const openMeal = (meal: Meal) => {
    saveDraft(draftFromMeal(meal))
    navigate('/eat/review')
  }

  const closeAdd = () => {
    setAddOpen(false)
    setQuick(null)
  }

  const logSaved = (meal: Meal) => {
    try {
      cloneMeal(meal.id, mealTsForDate(date, today))
      toast.show(`Logged ${meal.savedName ?? 'saved meal'}`, 'success')
    } catch (e) {
      console.error(e)
      toast.show('Could not log that meal', 'error')
    }
    closeAdd()
  }

  const logItem = (item: NewFoodItem) => {
    const ts = mealTsForDate(date, today)
    try {
      addMeal({ ts, mealType: inferMealType(ts), photoUri: null, notes: '', source: 'manual', savedName: null, isSaved: false }, [item])
      toast.show(`Logged ${item.foodName}`, 'success')
    } catch (e) {
      console.error(e)
      toast.show('Could not log that food', 'error')
    }
    closeAdd()
  }

  const logQuick = () => {
    if (!quick?.kcal || quick.kcal <= 0) return
    logItem({
      foodName: 'Quick add', quantityG: 0, servingDescription: '', kcal: Math.round(quick.kcal), proteinG: Math.max(0, quick.proteinG ?? 0),
      carbsG: 0, fatG: 0, source: 'manual', confidence: null, uncertaintyReason: null,
    })
  }

  const snap = () => {
    photos.openCamera() // first statement: iOS only opens the camera from the tap itself
    closeAdd()
  }

  const openSearch = () => {
    closeAdd()
    navigate('/eat/search', { state: { date } })
  }

  const ACTION = 'press flex flex-col items-center justify-center gap-1.5 h-[76px] rounded-2xl bg-surface-2 text-[14px] font-medium active:bg-surface-3'

  return (
    <Screen
      pillar="eat"
      large
      eyebrow={eyebrow}
      title={title}
      right={
        <>
          {!isToday && !yesterday && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>}
          <IconButton icon={<ChevronLeft size={22} />} label="Previous day" variant="ghost" onClick={() => setDate(addDays(date, -1))} />
          <IconButton icon={<ChevronRight size={22} />} label="Next day" variant="ghost" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} />
          <IconButton icon={<Ellipsis size={22} />} label="Week, trends and targets" variant="ghost" onClick={() => setMoreOpen(true)} />
        </>
      }
    >
      {photos.inputs}
      <div className="flex flex-col gap-6 pb-40">
        <section aria-label="Calories and protein" className="flex flex-col gap-4">
          <div
            role="group"
            className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-1"
            aria-label={`Goal ${fmtInt(goal)} minus food ${fmtInt(food)} equals ${left < 0 ? `${fmtInt(-left)} kcal over` : `${fmtInt(left)} kcal remaining`}`}
          >
            <button type="button" onClick={() => setTargetOpen(true)} aria-label={`Goal ${fmtInt(goal)} kcal. Edit daily targets`} className="press rounded-xl py-1">
              <Term value={fmtInt(goal)} label={target.missing ? 'Goal (est.)' : 'Goal'} />
            </button>
            <Op>−</Op>
            <span className="py-1"><Term value={fmtInt(food)} label="Food" /></span>
            <Op>=</Op>
            <span className="py-1"><Term value={left < 0 ? `+${fmtInt(-left)}` : fmtInt(left)} label={left < 0 ? 'Over' : 'Remaining'} strong /></span>
          </div>

          <div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
              <div className="h-full rounded-full bg-protein" style={{ width: `${proteinPct}%`, transition: 'width 600ms var(--ease-out-soft)' }} />
            </div>
            <p className="flex items-baseline justify-between gap-3 mt-2 text-[14px] tnum">
              <span className="text-muted"><span className="font-semibold text-protein">{fmtInt(totals.proteinG)}</span> of {fmtInt(target.proteinG)} g protein</span>
              <span className="text-muted">{proteinLeft >= 0 ? `${proteinLeft} g left` : `+${-proteinLeft} g`}</span>
            </p>
            {(carbs > 0 || fat > 0) && (
              <p className="tnum text-[13px] text-faint mt-0.5">Carbs {carbs} g · Fat {fat} g</p>
            )}
          </div>
        </section>

        {sections.map((s) => (
          <section key={s.key} aria-label={SECTION_LABEL[s.key]}>
            <SectionLabel note={<span className="tnum">{fmtInt(draftTotals(s.meals.flatMap((m) => m.items)).kcal)} kcal</span>}>
              {SECTION_LABEL[s.key]}
            </SectionLabel>
            <RowList>
              {s.meals.map((meal) => <MealRow key={meal.id} meal={meal} onOpen={() => openMeal(meal)} />)}
            </RowList>
          </section>
        ))}

        {!logged && (
          <div className="flex flex-col items-center text-center px-4 text-muted">
            <Illustration name="plate" size={96} />
            <p className="text-[15px] mt-2">
              {dayNote === 'fasting' ? 'Noted as a fasting day.' : isPast ? 'Nothing logged on this day.' : 'Nothing logged yet.'}
            </p>
          </div>
        )}

        <Button size="lg" full icon={<Plus size={20} />} onClick={() => setAddOpen(true)}>Add food</Button>
      </div>

      <Composer context="eat" />

      <Sheet
        open={addOpen}
        onClose={closeAdd}
        title={quick ? 'Quick add' : isToday ? 'Add food' : `Add to ${fmtDate(date)}`}
        footer={quick ? (
          <Button size="lg" full disabled={!quick.kcal || quick.kcal <= 0} onClick={logQuick}>Log</Button>
        ) : undefined}
      >
        {quick ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories"><NumberInput value={quick.kcal} onChange={(n) => setQuick({ ...quick, kcal: n })} unit="kcal" min={0} max={5000} step={10} autoFocus /></Field>
            <Field label="Protein" hint="Optional"><NumberInput value={quick.proteinG} onChange={(n) => setQuick({ ...quick, proteinG: n })} unit="g" min={0} max={400} step={1} /></Field>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={snap} className={ACTION}><Camera size={22} aria-hidden />Photo</button>
              <button type="button" onClick={openSearch} className={ACTION}><Search size={22} aria-hidden />Search</button>
              <button type="button" onClick={() => setQuick({ kcal: null, proteinG: null })} className={ACTION}><Flame size={22} aria-hidden />Quick add</button>
            </div>

            {recent.length > 0 && (
              <div>
                <SectionLabel>Recent</SectionLabel>
                <RowList>
                  {recent.slice(0, 6).map((it) => (
                    <FoodRow
                      key={it.foodName}
                      name={it.foodName}
                      detail={it.servingDescription || fmtG(it.quantityG)}
                      kcal={it.kcal}
                      proteinG={it.proteinG}
                      actionLabel="Log"
                      onClick={() => logItem(it)}
                    />
                  ))}
                </RowList>
              </div>
            )}

            {saved.length > 0 && (
              <div>
                <SectionLabel>Saved meals</SectionLabel>
                <RowList>
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
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={isToday ? 'Today in detail' : `${dayName(date)} ${fmtDate(date)}`}>
        <div className="flex flex-col gap-5">
          <p className="voice text-[19px]">{line.text}</p>

          <div>
            <SectionLabel>This week</SectionLabel>
            <IntakeStrip
              days={week}
              kcalTarget={target.kcal}
              proteinTarget={target.proteinG}
              today={today}
              selected={date}
              onSelect={(d) => { setDate(d); setMoreOpen(false) }}
              notes={Object.fromEntries(Object.entries(dayNotes).map(([d, n]) => [d, DAY_NOTE_LABEL[n]]))}
            />
          </div>

          {avg.logged > 0 && (
            <div>
              <SectionLabel note={`${avg.logged} of ${week.length} days logged`}>7-day average</SectionLabel>
              <p className="flex items-baseline gap-5">
                <span><span className="num text-[28px]">{fmtInt(avg.kcal)}</span><span className="text-[13px] text-muted ml-1">kcal</span></span>
                <span className="text-protein"><span className="num text-[28px]">{fmtInt(avg.proteinG)}</span><span className="text-[13px] font-semibold ml-1">g protein</span></span>
              </p>
            </div>
          )}

          {meals.length > 1 && (
            <div>
              <SectionLabel>Protein by meal</SectionLabel>
              <ProteinSplit meals={meals} targetG={target.proteinG} />
            </div>
          )}

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
              <Button variant="secondary" onClick={() => { setMoreOpen(false); setTargetOpen(true) }}>
                {target.missing ? 'Set' : 'Edit'}
              </Button>
            </div>
          </div>
        </div>
      </Sheet>

      {targetOpen && <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} date={date} current={target} />}
    </Screen>
  )
}
