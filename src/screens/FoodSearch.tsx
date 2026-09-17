import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { ChevronDown, Plus, Search, Sparkles, X } from 'lucide-react'
import type { Macros, Meal } from '../domain/types'
import { aiConnected, isAIError } from '../ai'
import { AIBadge, Button, Field, NumberInput, Screen, Sheet, Stepper, TextInput, useToast } from '../components'
import { useQuery } from '../hooks'
import { FOODS, searchFoods, servingMacros, toFoodItem, type FoodRecord } from '../data'
import { addMeal, cloneMeal, getSavedMeals, recentFoods } from '../db/repositories'
import { fmtDate, todayStr } from '../lib/util'
import {
  draftTotals, fmtG, getDraftSnapshot, itemFromFoodItem, makeDraftItem, mealTsForDate, scaleItem, setItemMacros, subscribeDraft,
  toNewItems, updateDraft, type DraftItem, type MealType, type NewFoodItem,
} from '../features/meal/draft'
import { estimateFoodWithAI } from '../features/meal/refine'
import { useAIStatus } from '../features/ai/config'
import { ConfidencePill, FoodRow, MacroReadout, MealTypeSelect, PortionControl, RowList, SectionLabel } from '../features/meal/ui'
import { inferMealType } from '../engine/voice'
import { cx } from '../lib/util'

const PREVIEW_ROWS = 8
/** Shown when a query has no close match at all. */
const FALLBACK_QUERIES = ['chicken rice', 'eggs', 'fish soup', 'yogurt', 'whey', 'kopi']

type Pick =
  | { kind: 'food'; food: FoodRecord }
  | { kind: 'recent'; item: NewFoodItem }
  /** One AI estimate for a food the library does not have — always editable. */
  | { kind: 'estimate'; item: DraftItem }
  | { kind: 'custom'; name: string }

interface SearchState {
  returnTo?: string
  date?: string
  mealType?: MealType
}

function PreviewList<T>({ items, render, keyOf, expanded, onExpand }: {
  items: T[]
  render: (item: T) => ReactNode
  keyOf: (item: T) => string
  expanded: boolean
  onExpand: () => void
}) {
  const shown = expanded ? items : items.slice(0, PREVIEW_ROWS)
  return (
    <RowList>
      {shown.map((it) => <div key={keyOf(it)}>{render(it)}</div>)}
      {!expanded && items.length > PREVIEW_ROWS && (
        <button type="button" onClick={onExpand} className="w-full h-12 text-[15px] font-medium text-muted active:bg-surface-2 transition-colors">
          Show all {items.length}
        </button>
      )}
    </RowList>
  )
}

/** Foods that match any single word of a query that matched nothing as a whole. */
function closeMatches(q: string): FoodRecord[] {
  const seen = new Set<string>()
  const out: FoodRecord[] = []
  for (const token of q.toLowerCase().split(/\s+/).filter((t) => t.length >= 3)) {
    for (const f of [...searchFoods(token, 3), ...searchFoods(token.slice(0, Math.max(3, token.length - 2)), 2)]) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      out.push(f)
    }
  }
  return out.slice(0, 5)
}

// --- quantity sheet ------------------------------------------------------------

function QuantityForm({ pick, reviewMode, defaultMealType, onAdd }: {
  pick: Pick
  reviewMode: boolean
  defaultMealType: MealType
  onAdd: (item: DraftItem, mealType: MealType) => void
}) {
  const baseG = pick.kind === 'food' ? pick.food.servingG : pick.kind === 'recent' ? pick.item.quantityG : pick.kind === 'estimate' ? pick.item.baseQuantityG : 0
  const [grams, setGrams] = useState<number | null>(pick.kind === 'custom' ? null : baseG)
  const [mealType, setMealType] = useState<MealType>(defaultMealType)
  // AI estimate: the row itself is editable (macros move the per-100 g basis, grams rescale it)
  const [est, setEst] = useState<DraftItem | null>(pick.kind === 'estimate' ? pick.item : null)
  const [estOpen, setEstOpen] = useState(false)
  // custom food fields
  const [servings, setServings] = useState(1)
  const [name, setName] = useState(pick.kind === 'custom' ? pick.name : '')
  const [servingLabel, setServingLabel] = useState('1 serving')
  const [servingG, setServingG] = useState<number | null>(100)
  const [kcal, setKcal] = useState<number | null>(null)
  const [proteinG, setProteinG] = useState<number | null>(null)
  const [carbsG, setCarbsG] = useState<number | null>(null)
  const [fatG, setFatG] = useState<number | null>(null)

  const item: DraftItem | null = useMemo(() => {
    if (pick.kind === 'food') {
      if (!grams || grams <= 0) return null
      const base = itemFromFoodItem(toFoodItem(pick.food, grams))
      return { ...base, baseQuantityG: pick.food.servingG }
    }
    if (pick.kind === 'recent') {
      if (!grams || grams <= 0) return null
      return scaleItem(itemFromFoodItem(pick.item), grams)
    }
    if (pick.kind === 'estimate') {
      if (!est || !grams || grams <= 0) return null
      return scaleItem(est, grams)
    }
    if (!name.trim() || kcal == null || servingG == null || servingG <= 0) return null
    const desc = servings === 1 ? servingLabel : `${servings} × ${servingLabel}`
    return makeDraftItem({
      foodName: name.trim(),
      quantityG: servingG * servings,
      servingDescription: desc.trim(),
      kcal: kcal * servings,
      proteinG: (proteinG ?? 0) * servings,
      carbsG: (carbsG ?? 0) * servings,
      fatG: (fatG ?? 0) * servings,
      source: 'manual',
      confidence: null,
      uncertaintyReason: null,
    }, undefined, servingG)
  }, [pick, est, grams, servings, name, servingLabel, servingG, kcal, proteinG, carbsG, fatG])

  return (
    <div className="flex flex-col gap-4">
      {pick.kind !== 'custom' && (
        <>
          <div className="rounded-[1.25rem] border border-line bg-surface-2 p-4">
            {pick.kind === 'estimate' && (
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-muted"><AIBadge label="AI estimate" />Edit anything</span>
                <ConfidencePill confidence={pick.item.confidence} />
              </div>
            )}
            {item ? <MacroReadout m={item} size="lg" /> : <p className="text-[15px] text-muted">Enter an amount.</p>}
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
              <span className="eyebrow text-muted">Portion</span>
              <span className="text-[13px] text-muted truncate">
                1× = {pick.kind === 'food' ? `${pick.food.servingLabel} · ${fmtG(baseG)}` : `${pick.item.servingDescription || (pick.kind === 'recent' ? 'last time' : 'serving')} · ${fmtG(baseG)}`}
              </span>
            </div>
            <PortionControl
              name={pick.kind === 'food' ? pick.food.name : pick.item.foodName}
              baseG={baseG}
              grams={grams}
              onChange={setGrams}
            />
          </div>
          {pick.kind === 'food' && pick.food.tags.includes('HPB-style estimate') && (
            <p className="text-[13px] text-muted -mt-1 px-1">≈ HPB-style estimate — portions vary by stall.</p>
          )}
          {pick.kind === 'estimate' && est && item && (
            <div>
              <button
                type="button"
                onClick={() => setEstOpen((v) => !v)}
                aria-expanded={estOpen}
                className="press inline-flex items-center gap-1 h-11 px-1 text-[14px] font-medium text-muted"
              >
                Edit name and macros
                <ChevronDown size={16} className={cx('transition-transform', estOpen && 'rotate-180')} aria-hidden />
              </button>
              {estOpen && (
                <div className="flex flex-col gap-3 mt-1">
                  <Field label="Name" htmlFor="est-name">
                    <TextInput id="est-name" value={est.foodName} onChange={(e) => setEst({ ...est, foodName: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    {([['Calories', 'kcal', 'kcal'], ['Protein', 'proteinG', 'g'], ['Carbs', 'carbsG', 'g'], ['Fat', 'fatG', 'g']] as [string, keyof Macros, string][]).map(([label, k, unit]) => (
                      <Field key={k} label={label}>
                        {/* shown for the chosen amount; an edit becomes the new per-100 g basis */}
                        <NumberInput value={item[k]} unit={unit} min={0} step={1} onChange={(n) => setEst(setItemMacros(item, { [k]: n ?? 0 }))} />
                      </Field>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {pick.kind === 'custom' && (
        <>
          <Field label="Name" htmlFor="custom-name">
            <TextInput id="custom-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mum's fish curry" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serving" htmlFor="custom-serving">
              <TextInput id="custom-serving" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} placeholder="1 bowl" />
            </Field>
            <Field label="Serving size">
              <NumberInput value={servingG} onChange={setServingG} unit="g" min={1} step={10} />
            </Field>
          </div>
          <span className="eyebrow text-muted -mb-2">Per serving</span>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories"><NumberInput value={kcal} onChange={setKcal} unit="kcal" min={0} step={1} /></Field>
            <Field label="Protein"><NumberInput value={proteinG} onChange={setProteinG} unit="g" min={0} step={1} /></Field>
            <Field label="Carbs"><NumberInput value={carbsG} onChange={setCarbsG} unit="g" min={0} step={1} /></Field>
            <Field label="Fat"><NumberInput value={fatG} onChange={setFatG} unit="g" min={0} step={1} /></Field>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[15px] text-muted">Servings</div>
            <Stepper value={servings} onChange={setServings} step={0.5} min={0.5} max={20} format={(n) => `${n} ×`} label="Servings" />
          </div>
          <div className="rounded-[1.25rem] border border-line bg-surface-2 p-4">
            {item ? <MacroReadout m={item} size="lg" /> : <p className="text-[15px] text-muted">Name, serving size and calories are needed.</p>}
          </div>
        </>
      )}

      {!reviewMode && (
        <Field label="Meal type" htmlFor="log-meal-type">
          <MealTypeSelect id="log-meal-type" value={mealType} onChange={setMealType} />
        </Field>
      )}

      <Button size="lg" full disabled={!item} onClick={() => item && onAdd(item, mealType)}>
        {reviewMode ? 'Add to the plate' : item ? `Log ${Math.round(item.kcal)} kcal · ${fmtG(item.proteinG)} protein` : 'Log'}
      </Button>
    </div>
  )
}

// --- screen --------------------------------------------------------------------

export default function FoodSearchScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const state = (location.state ?? {}) as SearchState
  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftSnapshot)
  const reviewMode = state.returnTo === '/eat/review' && !!draft
  const today = todayStr()
  const date = state.date && /^\d{4}-\d{2}-\d{2}$/.test(state.date) ? state.date : today
  const defaultMealType: MealType = reviewMode && draft ? draft.mealType : (state.mealType ?? inferMealType(mealTsForDate(date, today)))

  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [estimating, setEstimating] = useState(false)
  useAIStatus() // re-render when the AI connection changes
  const connected = aiConnected()

  const recent = useQuery(() => recentFoods(10), [])
  const saved = useQuery(() => getSavedMeals(), [])
  const query = q.trim()
  const results = useMemo(() => (query ? searchFoods(query, 30) : []), [query])
  const near = useMemo(() => (query && !results.length ? closeMatches(query) : []), [query, results.length])
  const { sg, generic } = useMemo(() => ({
    sg: FOODS.filter((f) => f.brandOrOrigin === 'SG hawker' || f.brandOrOrigin === 'SG cafe'),
    generic: FOODS.filter((f) => f.brandOrOrigin === 'generic' || f.brandOrOrigin === 'branded'),
  }), [])

  const expand = (k: string) => setExpanded((e) => ({ ...e, [k]: true }))
  const verb = reviewMode ? 'Add' : 'Log'

  const finish = (msg: string) => {
    toast.show(msg, 'success')
    if (reviewMode) navigate(-1)
    else navigate(`/eat?date=${date}`, { replace: true })
  }

  const addItem = (item: DraftItem, mealType: MealType) => {
    setPick(null)
    if (reviewMode) {
      updateDraft((d) => ({ ...d, items: [...d.items, item] }))
      finish(`Added ${item.foodName}`)
      return
    }
    try {
      addMeal(
        { ts: mealTsForDate(date, today), mealType, photoUri: null, notes: '', source: 'search', savedName: null, isSaved: false },
        toNewItems([item]),
      )
    } catch (e) {
      console.error(e)
      toast.show('Could not log that food', 'error')
      return
    }
    finish(`Logged ${item.foodName} · ${Math.round(item.kcal)} kcal · P ${fmtG(item.proteinG)}`)
  }

  const addSavedMeal = (meal: Meal) => {
    if (reviewMode) {
      const items = meal.items.map(({ id: _id, mealId: _m, ...it }) => itemFromFoodItem(it))
      updateDraft((d) => ({ ...d, items: [...d.items, ...items] }))
      finish(`Added ${meal.savedName ?? 'saved meal'}`)
      return
    }
    try {
      cloneMeal(meal.id, mealTsForDate(date, today), state.mealType)
    } catch (e) {
      console.error(e)
      toast.show('Could not log that meal', 'error')
      return
    }
    finish(`Logged ${meal.savedName ?? 'saved meal'}`)
  }

  /** No local match: ask the model for ONE estimate, then hand it to the quantity sheet as an editable row. */
  const estimateWithAI = async () => {
    if (!query || estimating) return
    setEstimating(true)
    try {
      const item = await estimateFoodWithAI(query)
      setPick({ kind: 'estimate', item })
    } catch (e) {
      toast.show(isAIError(e) && e.message ? e.message : 'AI could not estimate that — add it as a custom food', 'info')
    } finally {
      setEstimating(false)
    }
  }

  const foodRow = (f: FoodRecord) => {
    const m = servingMacros(f)
    return (
      <FoodRow
        name={f.name}
        detail={`${f.servingLabel} · ${fmtG(f.servingG)}`}
        kcal={m.kcal}
        proteinG={m.proteinG}
        actionLabel="Choose"
        onClick={() => setPick({ kind: 'food', food: f })}
      />
    )
  }

  const customButton = (label: string, name: string) => (
    <button
      type="button"
      onClick={() => setPick({ kind: 'custom', name })}
      className="press w-full inline-flex items-center justify-center gap-2 h-[52px] rounded-[1.25rem] border border-dashed border-line-strong text-[16px] font-medium"
    >
      <Plus size={18} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )

  const sheetTitle = pick?.kind === 'food' ? pick.food.name : pick?.kind === 'recent' || pick?.kind === 'estimate' ? pick.item.foodName : pick?.kind === 'custom' ? 'Add custom food' : ''
  const pickKey = pick?.kind === 'food' ? `food:${pick.food.id}` : pick?.kind === 'recent' ? `recent:${pick.item.foodName}` : pick?.kind === 'estimate' ? `estimate:${pick.item.key}` : pick ? 'custom' : 'none'

  return (
    <Screen
      pillar="eat"
      eyebrow={reviewMode ? 'Adds to the plate' : date === today ? undefined : `Logs to ${fmtDate(date)}`}
      title={reviewMode ? 'Add item' : 'Search'}
      back={reviewMode ? true : '/eat'}
    >
      <div className="relative mb-5">
        <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chicken rice, eggs, latte…"
          autoFocus
          autoCorrect="off"
          autoCapitalize="none"
          enterKeyHint="search"
          aria-label="Search foods"
          className="w-full h-14 pl-12 pr-12 rounded-2xl bg-surface-2 border border-line text-[19px] text-app focus:bg-surface focus:border-line-strong transition-colors"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="press absolute right-1.5 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center rounded-xl text-muted"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-6 pb-32">
        {query ? (
          results.length ? (
            <section>
              <SectionLabel note="per serving">{results.length} result{results.length === 1 ? '' : 's'}</SectionLabel>
              <RowList className="mb-3">{results.map((f) => <div key={f.id}>{foodRow(f)}</div>)}</RowList>
              {customButton(`Add “${query}” as a custom food`, query)}
            </section>
          ) : (
            <section>
              <p className="voice text-[21px] px-1">No match for “{query}”.</p>
              {connected ? (
                <div className="mt-4 flex flex-col items-start gap-2">
                  <Button variant="pillar" icon={<Sparkles size={18} />} loading={estimating} onClick={() => void estimateWithAI()}>Estimate with AI</Button>
                  <span className="inline-flex items-center gap-2 px-1 text-[13px] text-muted"><AIBadge />One editable estimate</span>
                </div>
              ) : (
                <Link to="/settings#ai" className="inline-flex items-center gap-1.5 h-11 px-1 text-[14px] text-muted underline underline-offset-4 decoration-line-strong">
                  <Sparkles size={14} aria-hidden />Connect AI to estimate unlisted foods
                </Link>
              )}
              {near.length > 0 ? (
                <>
                  <SectionLabel className="mt-5" note="per serving">Closest matches</SectionLabel>
                  <RowList>{near.map((f) => <div key={f.id}>{foodRow(f)}</div>)}</RowList>
                </>
              ) : (
                <>
                  <SectionLabel className="mt-5">Try searching</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {FALLBACK_QUERIES.map((s) => (
                      <button key={s} type="button" onClick={() => setQ(s)} className="press h-11 px-4 rounded-full border border-line bg-surface text-[15px] font-medium">
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-5">{customButton(`Add “${query}” as a custom food`, query)}</div>
            </section>
          )
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <SectionLabel>Recent</SectionLabel>
                <PreviewList
                  items={recent}
                  keyOf={(it) => it.foodName}
                  expanded={!!expanded.recent}
                  onExpand={() => expand('recent')}
                  render={(it) => (
                    <FoodRow
                      name={it.foodName}
                      detail={it.servingDescription ? `${it.servingDescription} · ${fmtG(it.quantityG)}` : fmtG(it.quantityG)}
                      kcal={it.kcal}
                      proteinG={it.proteinG}
                      actionLabel="Choose"
                      onClick={() => setPick({ kind: 'recent', item: it })}
                    />
                  )}
                />
              </section>
            )}

            {saved.length > 0 && (
              <section>
                <SectionLabel note={reviewMode ? 'Adds every item' : 'One tap logs the meal'}>Saved</SectionLabel>
                <PreviewList
                  items={saved}
                  keyOf={(m) => String(m.id)}
                  expanded={!!expanded.saved}
                  onExpand={() => expand('saved')}
                  render={(m) => {
                    const t = draftTotals(m.items)
                    return (
                      <FoodRow
                        name={m.savedName ?? 'Saved meal'}
                        glyph={m.items[0]?.foodName}
                        detail={`${m.items.length} item${m.items.length === 1 ? '' : 's'}`}
                        kcal={t.kcal}
                        proteinG={t.proteinG}
                        actionLabel={verb}
                        onClick={() => addSavedMeal(m)}
                      />
                    )
                  }}
                />
              </section>
            )}

            <section>
              <SectionLabel note="≈ HPB-style">Singapore</SectionLabel>
              <PreviewList items={sg} keyOf={(f) => f.id} expanded={!!expanded.sg} onExpand={() => expand('sg')} render={foodRow} />
            </section>

            <section>
              <SectionLabel>Generic</SectionLabel>
              <PreviewList items={generic} keyOf={(f) => f.id} expanded={!!expanded.generic} onExpand={() => expand('generic')} render={foodRow} />
            </section>

            {customButton('Add custom food', '')}
          </>
        )}
      </div>

      <Sheet open={pick !== null} onClose={() => setPick(null)} title={sheetTitle}>
        {pick && <QuantityForm key={pickKey} pick={pick} reviewMode={reviewMode} defaultMealType={defaultMealType} onAdd={addItem} />}
      </Sheet>
    </Screen>
  )
}
