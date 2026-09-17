// Meal draft: the editable, in-progress meal shared between the camera flow,
// the review screen and food search. Lives in sessionStorage['meal-draft'] so a
// round trip to /eat/search (or a reload) keeps the user's edits. Pure helpers
// here have no React/DB imports so they are unit-testable in node.

import type { FoodItem, Macros, Meal, MealSource } from '../../domain/types'
import type { AIErrorKind, MealRecognition, RecognizedFood } from '../../ai/types'
import type { MealCorrection } from '../../engine/voice'
import { inferMealType } from '../../engine/voice'
import { isoAt, nowIso, todayStr, toDateStr } from '../../lib/util'

export const DRAFT_KEY = 'meal-draft'

export type MealType = Meal['mealType']
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'drink']
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', drink: 'Drink',
}

export type NewFoodItem = Omit<FoodItem, 'id' | 'mealId'>

export interface DraftItem extends NewFoodItem {
  /** Stable local key for React lists and voice-correction indexes. */
  key: string
  /** Macros per 100 g — the basis for rescaling when the quantity changes. */
  per100g: Macros
  /** Quantity the row started with (AI estimate, serving or logged amount): the "1×" of the portion chips. */
  baseQuantityG: number
}

export type DraftStatus = 'recognizing' | 'ready'

export interface MealDraft {
  status: DraftStatus
  /** Set when editing an existing meal; Confirm then calls updateMeal instead of addMeal. */
  mealId: number | null
  ts: string
  mealType: MealType
  photoDataUrl: string | null
  items: DraftItem[]
  source: MealSource
  /** Overall recognition confidence 0–1, null for manual/search/clone drafts. */
  confidence: number | null
  /** User notes stored on the meal. */
  notes: string
  savedName: string | null
  /** What the recogniser said about the photo (shown as an info line, never saved). */
  recognitionNotes: string | null
  errorKind?: AIErrorKind
  errorMessage?: string
}

// --- numbers -------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

let keySeq = 0
export function draftKey(): string {
  keySeq += 1
  return `${Date.now().toString(36)}-${keySeq}`
}

/** "12.5 g" for small amounts, whole grams otherwise. */
export function fmtG(n: number): string {
  const v = Math.abs(n) >= 10 ? Math.round(n) : round1(n)
  return `${v} g`
}

export function formatMacroLine(m: Macros): string {
  return `${Math.round(m.kcal)} kcal · P ${fmtG(m.proteinG)} · C ${fmtG(m.carbsG)} · F ${fmtG(m.fatG)}`
}

// --- items ---------------------------------------------------------------------

export function macrosPer100g(item: Pick<NewFoodItem, 'quantityG' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>): Macros {
  if (!(item.quantityG > 0)) return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  const k = 100 / item.quantityG
  return { kcal: item.kcal * k, proteinG: item.proteinG * k, carbsG: item.carbsG * k, fatG: item.fatG * k }
}

export function makeDraftItem(item: NewFoodItem, per100g?: Macros, baseQuantityG?: number): DraftItem {
  const quantityG = round1(Math.max(0, num(item.quantityG)))
  return {
    ...item,
    quantityG,
    kcal: Math.round(num(item.kcal)),
    proteinG: round1(num(item.proteinG)),
    carbsG: round1(num(item.carbsG)),
    fatG: round1(num(item.fatG)),
    servingDescription: item.servingDescription ?? '',
    source: item.source || 'manual',
    confidence: item.confidence == null ? null : clamp01(item.confidence),
    uncertaintyReason: item.uncertaintyReason?.trim() ? item.uncertaintyReason : null,
    key: draftKey(),
    per100g: per100g ?? macrosPer100g(item),
    baseQuantityG: baseQuantityG != null && baseQuantityG > 0 ? round1(baseQuantityG) : quantityG,
  }
}

export function itemFromFoodItem(fi: NewFoodItem): DraftItem {
  return makeDraftItem(fi)
}

/** Maps the AI's snake_case record into an editable row (source 'photo'). */
export function itemFromRecognized(rf: RecognizedFood): DraftItem {
  return makeDraftItem({
    foodName: (rf.food_name || 'Unknown food').trim(),
    quantityG: num(rf.estimated_quantity_g),
    servingDescription: (rf.serving_description || '').trim(),
    kcal: num(rf.kcal),
    proteinG: num(rf.protein_g),
    carbsG: num(rf.carbs_g),
    fatG: num(rf.fat_g),
    source: 'photo',
    confidence: clamp01(num(rf.confidence_0_1)),
    uncertaintyReason: rf.uncertainty_reason?.trim() ? rf.uncertainty_reason.trim() : null,
  })
}

/** Rescales kcal/P/C/F from the per-100 g basis. */
export function scaleItem(item: DraftItem, quantityG: number): DraftItem {
  const g = round1(Math.max(0, num(quantityG)))
  const k = g / 100
  return {
    ...item,
    quantityG: g,
    kcal: Math.round(item.per100g.kcal * k),
    proteinG: round1(item.per100g.proteinG * k),
    carbsG: round1(item.per100g.carbsG * k),
    fatG: round1(item.per100g.fatG * k),
  }
}

/** Direct macro edits move the per-100 g basis so later quantity changes scale the edited values. */
export function setItemMacros(item: DraftItem, patch: Partial<Macros>): DraftItem {
  const next: DraftItem = {
    ...item,
    kcal: Math.round(Math.max(0, num(patch.kcal, item.kcal))),
    proteinG: round1(Math.max(0, num(patch.proteinG, item.proteinG))),
    carbsG: round1(Math.max(0, num(patch.carbsG, item.carbsG))),
    fatG: round1(Math.max(0, num(patch.fatG, item.fatG))),
  }
  next.per100g = macrosPer100g(next)
  return next
}

export function draftTotals(items: ReadonlyArray<Pick<Macros, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>>): Macros {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  for (const it of items) {
    t.kcal += num(it.kcal)
    t.proteinG += num(it.proteinG)
    t.carbsG += num(it.carbsG)
    t.fatG += num(it.fatG)
  }
  return { kcal: round1(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) }
}

/** Strips the local-only fields before handing items to the repository. */
export function toNewItems(items: DraftItem[]): NewFoodItem[] {
  return items.map(({ key: _key, per100g: _per100g, baseQuantityG: _base, ...rest }) => rest)
}

// --- portions ------------------------------------------------------------------

/** One-tap portion multipliers, relative to the row's starting quantity. */
export const PORTION_FACTORS = [0.5, 1, 1.5, 2] as const

/** The chip that matches `grams` for a base quantity, or null for a custom amount. */
export function portionFactor(baseG: number, grams: number): number | null {
  if (!(baseG > 0)) return null
  return PORTION_FACTORS.find((f) => Math.abs(baseG * f - grams) < 0.5) ?? null
}

export type ConfidenceTone = 'green' | 'amber' | 'red' | 'neutral'

export function confidenceLabel(c: number | null): { label: string; tone: ConfidenceTone } {
  if (c == null) return { label: 'Manual', tone: 'neutral' }
  if (c >= 0.8) return { label: `High · ${Math.round(c * 100)}%`, tone: 'green' }
  if (c >= 0.5) return { label: `Medium · ${Math.round(c * 100)}%`, tone: 'amber' }
  return { label: `Low · ${Math.round(c * 100)}%`, tone: 'red' }
}

export interface ConfidenceBand { word: 'High' | 'Medium' | 'Low'; level: 1 | 2 | 3; pct: number }

/** Word + 1–3 level for the confidence pill (the word and bar count carry the meaning, not colour). */
export function confidenceBand(c: number | null): ConfidenceBand | null {
  if (c == null) return null
  const pct = Math.round(clamp01(c) * 100)
  if (c >= 0.8) return { word: 'High', level: 3, pct }
  if (c >= 0.5) return { word: 'Medium', level: 2, pct }
  return { word: 'Low', level: 1, pct }
}

// --- drafts --------------------------------------------------------------------

export function newDraft(partial: Partial<MealDraft> = {}): MealDraft {
  const ts = partial.ts ?? nowIso()
  return {
    status: 'ready',
    mealId: null,
    ts,
    mealType: partial.mealType ?? inferMealType(ts),
    photoDataUrl: null,
    items: [],
    source: 'manual',
    confidence: null,
    notes: '',
    savedName: null,
    recognitionNotes: null,
    ...partial,
  }
}

export function draftFromMeal(meal: Meal): MealDraft {
  return newDraft({
    mealId: meal.id,
    ts: meal.ts,
    mealType: meal.mealType,
    photoDataUrl: meal.photoUri,
    items: meal.items.map(({ id: _id, mealId: _mealId, ...it }) => itemFromFoodItem(it)),
    source: meal.source,
    notes: meal.notes ?? '',
    savedName: meal.isSaved ? meal.savedName : null,
  })
}

export function draftFromRecognition(base: MealDraft, r: MealRecognition): MealDraft {
  const items = (r.items ?? []).map(itemFromRecognized)
  const { errorKind: _e, errorMessage: _m, ...rest } = base
  return {
    ...rest,
    status: 'ready',
    items,
    confidence: clamp01(num(r.overall_confidence)),
    recognitionNotes: r.notes?.trim() ? r.notes.trim() : null,
  }
}

export function draftWithError(base: MealDraft, kind: AIErrorKind, message: string): MealDraft {
  return { ...base, status: 'ready', errorKind: kind, errorMessage: message }
}

/** Default favourite name: first three food names. */
export function suggestSavedName(items: ReadonlyArray<Pick<DraftItem, 'foodName'>>): string {
  return items.slice(0, 3).map((i) => i.foodName).join(', ')
}

// --- voice corrections ---------------------------------------------------------

export interface CorrectionResult {
  items: DraftItem[]
  notes: string[]
}

/** Applies parseMealCorrection output. Indexes refer to the input array; removals happen last. */
export function applyCorrections(items: DraftItem[], corrections: MealCorrection[]): CorrectionResult {
  const next = [...items]
  const removed = new Set<number>()
  const notes: string[] = []
  for (const c of corrections) {
    const cur = next[c.itemIndex]
    if (!cur || removed.has(c.itemIndex)) continue
    if (c.op === 'remove') {
      removed.add(c.itemIndex)
      notes.push(c.note)
    } else if (c.op === 'scale' && c.factor != null && c.factor > 0) {
      next[c.itemIndex] = scaleItem(cur, cur.quantityG * c.factor)
      notes.push(c.note)
    } else if (c.op === 'set_quantity' && c.quantityG != null && c.quantityG >= 0) {
      next[c.itemIndex] = scaleItem(cur, c.quantityG)
      notes.push(c.note)
    }
  }
  return { items: next.filter((_, i) => !removed.has(i)), notes }
}

// --- AI refinement ("Describe it") ------------------------------------------------

/** One row of an AI-refined plate. `from_index` points at the row it replaces (-1 = new row). */
export interface RefinedFood {
  from_index: number
  food_name: string
  estimated_quantity_g: number
  serving_description: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence_0_1: number
  uncertainty_reason: string
}

/** Maps the refined rows onto the draft, keeping key / source / 1× basis of the rows they replace. */
export function mergeRefined(before: DraftItem[], refined: RefinedFood[]): DraftItem[] {
  const used = new Set<number>()
  return refined.map((rf) => {
    const next = itemFromRecognized({ ...rf, source_hint: '' })
    const prev = Number.isInteger(rf.from_index) && !used.has(rf.from_index) ? before[rf.from_index] : undefined
    if (!prev) return { ...next, source: 'ai' }
    used.add(rf.from_index)
    return { ...next, key: prev.key, source: prev.source, baseQuantityG: prev.baseQuantityG }
  })
}

/** Plain-language diff between two versions of the plate (rows are matched by key). */
export function diffItems(before: DraftItem[], after: DraftItem[]): string[] {
  const notes: string[] = []
  const kept = new Set(after.map((a) => a.key))
  for (const b of before) if (!kept.has(b.key)) notes.push(`Removed ${b.foodName}`)
  for (const a of after) {
    const b = before.find((x) => x.key === a.key)
    if (!b) {
      notes.push(`Added ${a.foodName} · ${Math.round(a.kcal)} kcal`)
      continue
    }
    const parts: string[] = []
    if (b.foodName !== a.foodName) parts.push(`now “${a.foodName}”`)
    if (Math.abs(b.quantityG - a.quantityG) >= 1) parts.push(`${fmtG(b.quantityG)} → ${fmtG(a.quantityG)}`)
    if (Math.round(b.kcal) !== Math.round(a.kcal)) parts.push(`${Math.round(b.kcal)} → ${Math.round(a.kcal)} kcal`)
    if (parts.length) notes.push(`${b.foodName}: ${parts.join(', ')}`)
  }
  return notes
}

// --- time helpers --------------------------------------------------------------

/** Meal timestamp for a calendar date: now for today, noon for other days. */
export function mealTsForDate(date: string, today: string = todayStr()): string {
  return date === today ? nowIso() : isoAt(date, 12)
}

/** 'HH:MM' (local) for an <input type="time">. */
export function timeValue(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Same calendar day as `ts`, at local 'HH:MM'. Invalid input returns `ts` unchanged. */
export function withTime(ts: string, hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  const d = new Date(ts)
  if (!m || Number.isNaN(d.getTime())) return ts
  return isoAt(toDateStr(d), Math.min(23, Number(m[1])), Math.min(59, Number(m[2])))
}

// --- coach nutrition line (deterministic, PRD §13 "protein materially behind") ------

export const PROTEIN_BEHIND_FRACTION = 0.6

/** Protein the coach expects by `hour`, ramping linearly from 09:00 to 21:00 (breakfast is optional). */
export function proteinPaceExpected(targetG: number, hour: number): number {
  return targetG * Math.min(1, Math.max(0, hour - 9) / 12)
}

export type NutritionLineTone = 'green' | 'amber' | 'accent' | 'neutral'

export interface NutritionLineInput {
  date: string
  today: string
  hour: number
  intake: Macros
  target: Pick<Macros, 'kcal' | 'proteinG'>
  /** Saved meal / high-protein food names to name in the directive. */
  suggestions: string[]
  logged: boolean
}

export interface NutritionLine { text: string; tone: NutritionLineTone }

export function nutritionLine(i: NutritionLineInput): NutritionLine {
  const p = Math.round(i.intake.proteinG)
  const kcal = Math.round(i.intake.kcal)
  const tP = Math.round(i.target.proteinG)
  const tK = Math.round(i.target.kcal)
  const remainingP = Math.max(0, tP - p)
  const kcalLeft = tK - kcal
  const picks = i.suggestions.filter((s, idx, a) => s && a.indexOf(s) === idx).slice(0, 2)
  const sugg = picks.length ? ` — ${picks.join(' or ')}` : ''

  if (i.date > i.today) {
    return { text: `Planning ahead: ${tK.toLocaleString('en-SG')} kcal and ${tP} g protein is the target.`, tone: 'neutral' }
  }
  if (i.date < i.today) {
    if (!i.logged) return { text: 'Nothing logged on this day.', tone: 'neutral' }
    const hit = p >= tP
    return {
      text: `${p} of ${tP} g protein · ${kcal.toLocaleString('en-SG')} of ${tK.toLocaleString('en-SG')} kcal.${hit ? ' Protein target hit.' : ''}`,
      tone: hit ? 'green' : 'neutral',
    }
  }

  if (p >= tP) {
    const tail = kcalLeft >= 0 ? `${kcalLeft.toLocaleString('en-SG')} kcal left for the day.` : `${(-kcalLeft).toLocaleString('en-SG')} kcal over target.`
    return { text: `Protein target hit: ${p} g. ${tail}`, tone: 'green' }
  }
  if (i.hour < 11) {
    if (p < 0.2 * tP) {
      return { text: `Nothing much in yet — line up a high-protein lunch${sugg}. ${remainingP} g protein to go.`, tone: 'accent' }
    }
    return { text: `Good start: ${p} g protein in. ${remainingP} g to go.`, tone: 'green' }
  }
  const expected = proteinPaceExpected(tP, i.hour)
  if (p < PROTEIN_BEHIND_FRACTION * expected) {
    const meal = i.hour < 15 ? 'lunch' : i.hour < 21 ? 'dinner' : 'snack'
    return {
      text: `Protein behind pace: ${p} g in, ~${Math.round(expected)} g expected by now. Make ${meal} high-protein${sugg}. ${remainingP} g to go.`,
      tone: 'amber',
    }
  }
  if (i.hour >= 20) {
    return { text: `${remainingP} g protein still to go — a protein snack closes the gap${sugg}.`, tone: 'accent' }
  }
  return { text: `On pace: ${p} of ${tP} g protein, ${Math.max(0, kcalLeft).toLocaleString('en-SG')} kcal left.`, tone: 'green' }
}

// --- storage -------------------------------------------------------------------
// sessionStorage when available (survives navigation and reload within the tab);
// a module-level copy otherwise (tests, private mode, quota errors). The cached
// object is the snapshot handed to useSyncExternalStore, so it must only change
// identity when the draft actually changes.

type Listener = () => void
const listeners = new Set<Listener>()
let cached: MealDraft | null = null
let hydrated = false
let memory: string | null = null

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function readRaw(): string | null {
  const s = storage()
  if (s) {
    try {
      return s.getItem(DRAFT_KEY)
    } catch {
      /* fall through to memory */
    }
  }
  return memory
}

function writeRaw(raw: string | null): void {
  memory = raw
  const s = storage()
  if (!s) return
  try {
    if (raw === null) s.removeItem(DRAFT_KEY)
    else s.setItem(DRAFT_KEY, raw)
  } catch {
    // Quota exceeded (large photo) — the in-memory copy still serves this tab.
  }
}

function isDraft(v: unknown): v is MealDraft {
  if (!v || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return Array.isArray(d.items) && typeof d.ts === 'string' && typeof d.mealType === 'string'
}

/** Rehydrates a parsed draft: fills defaults and regenerates keys/bases for legacy rows. */
export function normalizeDraft(v: unknown): MealDraft | null {
  if (!isDraft(v)) return null
  const d = v as Partial<MealDraft> & { items: unknown[] }
  const items: DraftItem[] = (d.items as unknown[])
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => {
      const base: NewFoodItem = {
        foodName: String(it.foodName ?? ''),
        quantityG: num(it.quantityG),
        servingDescription: String(it.servingDescription ?? ''),
        kcal: num(it.kcal),
        proteinG: num(it.proteinG),
        carbsG: num(it.carbsG),
        fatG: num(it.fatG),
        source: String(it.source ?? 'manual'),
        confidence: typeof it.confidence === 'number' ? it.confidence : null,
        uncertaintyReason: typeof it.uncertaintyReason === 'string' ? it.uncertaintyReason : null,
      }
      const per = it.per100g as Partial<Macros> | undefined
      const per100g = per && typeof per === 'object'
        ? { kcal: num(per.kcal), proteinG: num(per.proteinG), carbsG: num(per.carbsG), fatG: num(per.fatG) }
        : undefined
      const item = makeDraftItem(base, per100g, num(it.baseQuantityG))
      if (typeof it.key === 'string' && it.key) item.key = it.key
      return item
    })
  return newDraft({
    status: d.status === 'recognizing' ? 'recognizing' : 'ready',
    mealId: typeof d.mealId === 'number' ? d.mealId : null,
    ts: d.ts,
    mealType: MEAL_TYPES.includes(d.mealType as MealType) ? (d.mealType as MealType) : inferMealType(d.ts as string),
    photoDataUrl: typeof d.photoDataUrl === 'string' ? d.photoDataUrl : null,
    items,
    source: (d.source as MealSource) ?? 'manual',
    confidence: typeof d.confidence === 'number' ? clamp01(d.confidence) : null,
    notes: typeof d.notes === 'string' ? d.notes : '',
    savedName: typeof d.savedName === 'string' ? d.savedName : null,
    recognitionNotes: typeof d.recognitionNotes === 'string' ? d.recognitionNotes : null,
    ...(d.errorKind ? { errorKind: d.errorKind, errorMessage: d.errorMessage } : {}),
  })
}

function notify(): void {
  for (const l of listeners) l()
}

export function loadDraft(): MealDraft | null {
  if (!hydrated) {
    hydrated = true
    const raw = readRaw()
    if (raw) {
      try {
        cached = normalizeDraft(JSON.parse(raw))
      } catch {
        cached = null
      }
    }
  }
  return cached
}

export function saveDraft(d: MealDraft): void {
  hydrated = true
  cached = d
  writeRaw(JSON.stringify(d))
  notify()
}

export function updateDraft(fn: (d: MealDraft) => MealDraft): MealDraft | null {
  const cur = loadDraft()
  if (!cur) return null
  const next = fn(cur)
  saveDraft(next)
  return next
}

export function clearDraft(): void {
  hydrated = true
  cached = null
  writeRaw(null)
  notify()
}

/** Snapshot for useSyncExternalStore — same object until the draft changes. */
export function getDraftSnapshot(): MealDraft | null {
  return loadDraft()
}

export function subscribeDraft(cb: Listener): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Test hook: forget the cache and memory copy. */
export function resetDraftStore(): void {
  cached = null
  hydrated = false
  memory = null
  listeners.clear()
}
