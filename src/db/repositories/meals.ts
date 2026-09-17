import { db } from '../database'
import type { FoodItem, Macros, Meal, NutritionTarget } from '../../domain/types'
import { addDays, dateOf } from '../../lib/util'
import { updateById, type ColumnMap } from './common'
import {
  dayRange, fillDates, mapFoodItem, mapMacros, mapMeal, mapTarget, placeholders, sinceIso,
  type DailyTotal, type FoodItemRow, type MacrosRow, type MealRow, type TargetRow,
} from './mappers'

type NewItem = Omit<FoodItem, 'id' | 'mealId'>
type NewMeal = Omit<Meal, 'id' | 'items'>

const MEAL_COLS: ColumnMap<NewMeal> = {
  ts: 'ts', mealType: 'meal_type', photoUri: 'photo_uri', notes: 'notes', source: 'source', savedName: 'saved_name', isSaved: 'is_saved',
}

const IN_CHUNK = 500

// --- internal ----------------------------------------------------------------

function insertItems(mealId: number, items: NewItem[]): void {
  for (const it of items) {
    db.run(
      `INSERT INTO food_items (meal_id, food_name, quantity_g, serving_description, kcal, protein_g, carbs_g, fat_g, source, confidence, uncertainty_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mealId, it.foodName, it.quantityG, it.servingDescription ?? '', it.kcal, it.proteinG, it.carbsG, it.fatG,
        it.source ?? 'manual', it.confidence ?? null, it.uncertaintyReason ?? null,
      ],
    )
  }
}

/** Attach food items to meal rows with one IN query per chunk, preserving row order. */
function withItems(rows: MealRow[]): Meal[] {
  if (!rows.length) return []
  const byMeal = new Map<number, FoodItem[]>()
  for (let i = 0; i < rows.length; i += IN_CHUNK) {
    const ids = rows.slice(i, i + IN_CHUNK).map((r) => r.id)
    const items = db.all<FoodItemRow>(`SELECT * FROM food_items WHERE meal_id IN (${placeholders(ids.length)}) ORDER BY id ASC`, ids)
    for (const row of items) {
      const item = mapFoodItem(row)
      const list = byMeal.get(item.mealId)
      if (list) list.push(item)
      else byMeal.set(item.mealId, [item])
    }
  }
  return rows.map((r) => mapMeal(r, byMeal.get(r.id) ?? []))
}

// --- meals -------------------------------------------------------------------

export function addMeal(meal: NewMeal, items: NewItem[]): number {
  return db.transaction(() => {
    const id = db.run(
      `INSERT INTO meals (ts, meal_type, photo_uri, notes, source, saved_name, is_saved) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [meal.ts, meal.mealType, meal.photoUri ?? null, meal.notes ?? '', meal.source, meal.savedName ?? null, meal.isSaved ? 1 : 0],
    )
    insertItems(id, items)
    return id
  })
}

/** Patches meal columns; when `items` is given the meal's items are replaced wholesale. */
export function updateMeal(id: number, patch: Partial<NewMeal>, items?: NewItem[]): void {
  db.transaction(() => {
    updateById('meals', MEAL_COLS, id, patch)
    if (items) {
      db.run('DELETE FROM food_items WHERE meal_id = ?', [id])
      insertItems(id, items)
    }
  })
}

/** Items are removed explicitly: ON DELETE CASCADE depends on PRAGMA foreign_keys, which is per-connection state. */
export function deleteMeal(id: number): void {
  db.transaction(() => {
    db.run('DELETE FROM food_items WHERE meal_id = ?', [id])
    db.run('DELETE FROM meals WHERE id = ?', [id])
  })
}

export function getMeal(id: number): Meal | null {
  const row = db.get<MealRow>('SELECT * FROM meals WHERE id = ?', [id])
  return row ? withItems([row])[0] : null
}

/** Meals eaten on the local calendar date, chronological, with items. */
export function getMealsForDate(date: string): Meal[] {
  const [start, end] = dayRange(date)
  return withItems(db.all<MealRow>('SELECT * FROM meals WHERE ts >= ? AND ts < ? ORDER BY ts ASC, id ASC', [start, end]))
}

/** Meals within the last `days` calendar days (today inclusive), most recent first, with items. */
export function getMeals(days: number): Meal[] {
  return withItems(db.all<MealRow>('SELECT * FROM meals WHERE ts >= ? ORDER BY ts DESC, id DESC', [sinceIso(days)]))
}

/** Saved (favourite) meals, alphabetical by saved name, with items. */
export function getSavedMeals(): Meal[] {
  return withItems(db.all<MealRow>('SELECT * FROM meals WHERE is_saved = 1 ORDER BY saved_name COLLATE NOCASE ASC, id DESC'))
}

/** Save a meal under a name, or pass null to unsave it. */
export function setMealSaved(id: number, savedName: string | null): void {
  const name = savedName?.trim() || null
  db.run('UPDATE meals SET saved_name = ?, is_saved = ? WHERE id = ?', [name, name ? 1 : 0, id])
}

/** Copy a meal (and its items, marked source 'clone') to a new timestamp. Returns the new meal id. */
export function cloneMeal(id: number, ts: string, mealType?: Meal['mealType']): number {
  const source = getMeal(id)
  if (!source) throw new Error(`Meal ${id} not found`)
  return addMeal(
    { ts, mealType: mealType ?? source.mealType, photoUri: null, notes: '', source: 'clone', savedName: null, isSaved: false },
    source.items.map((it) => ({
      foodName: it.foodName, quantityG: it.quantityG, servingDescription: it.servingDescription,
      kcal: it.kcal, proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG,
      source: 'clone', confidence: it.confidence, uncertaintyReason: it.uncertaintyReason,
    })),
  )
}

// --- totals ------------------------------------------------------------------

export function dailyTotals(date: string): Macros {
  const [start, end] = dayRange(date)
  const row = db.get<MacrosRow>(
    `SELECT SUM(fi.kcal) AS kcal, SUM(fi.protein_g) AS protein_g, SUM(fi.carbs_g) AS carbs_g, SUM(fi.fat_g) AS fat_g
     FROM food_items fi JOIN meals m ON m.id = fi.meal_id
     WHERE m.ts >= ? AND m.ts < ?`,
    [start, end],
  )
  return mapMacros(row)
}

/** One row per date in [from, to] inclusive; `logged` is true when at least one meal exists that day. */
export function dailyTotalsRange(from: string, to: string): DailyTotal[] {
  const start = dayRange(from)[0]
  const end = dayRange(to)[1]
  const rows = db.all<{ ts: string; kcal: number | null; protein_g: number | null }>(
    `SELECT m.ts AS ts, SUM(fi.kcal) AS kcal, SUM(fi.protein_g) AS protein_g
     FROM meals m LEFT JOIN food_items fi ON fi.meal_id = m.id
     WHERE m.ts >= ? AND m.ts < ?
     GROUP BY m.id`,
    [start, end],
  )
  return fillDates(from, to, rows.map((r) => ({ date: dateOf(r.ts), kcal: r.kcal ?? 0, proteinG: r.protein_g ?? 0 })))
}

/** Distinct foods (by name, case-insensitive) from the most recently logged meals, most recent first. */
export function recentFoods(limit = 20): NewItem[] {
  const rows = db.all<FoodItemRow>(
    `SELECT fi.* FROM food_items fi JOIN meals m ON m.id = fi.meal_id ORDER BY m.ts DESC, m.id DESC, fi.id ASC LIMIT ?`,
    [Math.max(limit * 10, 100)],
  )
  const seen = new Set<string>()
  const out: NewItem[] = []
  for (const row of rows) {
    const key = row.food_name.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const { id: _id, mealId: _mealId, ...item } = mapFoodItem(row)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

// --- nutrition targets -------------------------------------------------------

/** The target active on `date` (start_date <= date and not yet ended). */
export function getNutritionTarget(date: string): NutritionTarget | null {
  const row = db.get<TargetRow>(
    `SELECT * FROM nutrition_targets WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?)
     ORDER BY start_date DESC, id DESC LIMIT 1`,
    [date, date],
  )
  return row ? mapTarget(row) : null
}

/** Inserts a new target and closes any target still active on its start date (end_date = day before). */
export function setNutritionTarget(t: Omit<NutritionTarget, 'id'>): number {
  return db.transaction(() => {
    db.run(
      `UPDATE nutrition_targets SET end_date = ? WHERE start_date <= ? AND (end_date IS NULL OR end_date >= ?)`,
      [addDays(t.startDate, -1), t.startDate, t.startDate],
    )
    return db.run(
      `INSERT INTO nutrition_targets (start_date, end_date, kcal, protein_g, carbs_g, fat_g, rationale) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [t.startDate, t.endDate ?? null, t.kcal, t.proteinG, t.carbsG, t.fatG, t.rationale ?? ''],
    )
  })
}

/** All targets, most recent first. */
export function getNutritionTargets(): NutritionTarget[] {
  return db.all<TargetRow>('SELECT * FROM nutrition_targets ORDER BY start_date DESC, id DESC').map(mapTarget)
}
