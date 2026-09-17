import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Meal } from '../../../domain/types'
import type { RecognizedFood } from '../../../ai/types'
import {
  applyCorrections, clearDraft, confidenceBand, confidenceLabel, diffItems, draftFromMeal, draftFromRecognition, draftTotals, getDraftSnapshot,
  itemFromRecognized, loadDraft, macrosPer100g, makeDraftItem, mergeRefined, newDraft, normalizeDraft, nutritionLine,
  portionFactor, proteinPaceExpected, resetDraftStore, saveDraft, scaleItem, setItemMacros, subscribeDraft, suggestSavedName,
  timeValue, toNewItems, updateDraft, withTime, type DraftItem, type RefinedFood,
} from '../draft'

function chickenRice(): DraftItem {
  return makeDraftItem({
    foodName: 'Chicken rice, no skin', quantityG: 380, servingDescription: '1 plate',
    kcal: 521, proteinG: 27, carbsG: 74.1, fatG: 14.1, source: 'search', confidence: 0.8, uncertaintyReason: 'HPB-style estimate',
  })
}

function latte(): DraftItem {
  return makeDraftItem({
    foodName: 'Latte', quantityG: 300, servingDescription: 'regular cup',
    kcal: 150, proteinG: 8, carbsG: 12, fatG: 8, source: 'photo', confidence: 0.4, uncertaintyReason: null,
  })
}

describe('item scaling', () => {
  it('derives a per-100 g basis and rescales proportionally', () => {
    const it = chickenRice()
    expect(macrosPer100g(it).kcal).toBeCloseTo(137.1, 1)
    const half = scaleItem(it, 190)
    expect(half.quantityG).toBe(190)
    expect(half.kcal).toBe(261)
    expect(half.proteinG).toBeCloseTo(13.5, 1)
    expect(half.per100g).toEqual(it.per100g)
    expect(half.key).toBe(it.key)
  })

  it('zero quantity gives zero macros and a zero basis for zero-gram rows', () => {
    expect(scaleItem(chickenRice(), 0).kcal).toBe(0)
    expect(macrosPer100g({ quantityG: 0, kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 })).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })

  it('direct macro edits move the basis so later scaling keeps them', () => {
    const edited = setItemMacros(chickenRice(), { proteinG: 40 })
    expect(edited.proteinG).toBe(40)
    expect(edited.kcal).toBe(521)
    const doubled = scaleItem(edited, 760)
    expect(doubled.proteinG).toBe(80)
    expect(doubled.kcal).toBe(1042)
  })

  it('clamps negatives and rounds on creation', () => {
    const it = makeDraftItem({
      foodName: 'x', quantityG: -5, servingDescription: '', kcal: 10.6, proteinG: 0.333, carbsG: 0.05, fatG: 0,
      source: '', confidence: 1.7, uncertaintyReason: '  ',
    })
    expect(it.quantityG).toBe(0)
    expect(it.kcal).toBe(11)
    expect(it.proteinG).toBe(0.3)
    expect(it.confidence).toBe(1)
    expect(it.uncertaintyReason).toBeNull()
    expect(it.source).toBe('manual')
  })
})

describe('portion chips', () => {
  it('keeps the starting quantity as the 1× base while scaling', () => {
    const it = chickenRice()
    expect(it.baseQuantityG).toBe(380)
    const doubled = scaleItem(it, 760)
    expect(doubled.baseQuantityG).toBe(380)
    expect(portionFactor(doubled.baseQuantityG, doubled.quantityG)).toBe(2)
    expect(portionFactor(380, 400)).toBeNull()
    expect(portionFactor(0, 0)).toBeNull()
    expect(toNewItems([doubled])[0]).not.toHaveProperty('baseQuantityG')
  })

  it('survives a storage round trip and defaults for legacy rows', () => {
    const half = scaleItem(chickenRice(), 190)
    const d = normalizeDraft(JSON.parse(JSON.stringify(newDraft({ items: [half] }))))
    expect(d?.items[0].baseQuantityG).toBe(380)
    const { baseQuantityG: _b, ...legacy } = half
    expect(normalizeDraft(JSON.parse(JSON.stringify(newDraft({ items: [legacy as DraftItem] }))))?.items[0].baseQuantityG).toBe(190)
  })

  it('labels confidence with a word and a level, not a colour', () => {
    expect(confidenceBand(null)).toBeNull()
    expect(confidenceBand(0.95)).toEqual({ word: 'High', level: 3, pct: 95 })
    expect(confidenceBand(0.6)?.word).toBe('Medium')
    expect(confidenceBand(0.4)).toEqual({ word: 'Low', level: 1, pct: 40 })
  })
})

describe('totals and conversions', () => {
  it('sums items with one-decimal rounding', () => {
    const t = draftTotals([chickenRice(), latte()])
    expect(t).toEqual({ kcal: 671, proteinG: 35, carbsG: 86.1, fatG: 22.1 })
    expect(draftTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })

  it('maps the AI record and clamps confidence', () => {
    const rf: RecognizedFood = {
      food_name: ' Steamed chicken ', estimated_quantity_g: 120, serving_description: 'hawker portion', kcal: 190,
      protein_g: 30, carbs_g: 0, fat_g: 7, confidence_0_1: 1.4, uncertainty_reason: '', source_hint: 'demo',
    }
    const it = itemFromRecognized(rf)
    expect(it.foodName).toBe('Steamed chicken')
    expect(it.source).toBe('photo')
    expect(it.confidence).toBe(1)
    expect(it.uncertaintyReason).toBeNull()
    expect(it.per100g.proteinG).toBeCloseTo(25, 5)
  })

  it('strips local fields for the repository', () => {
    const rows = toNewItems([chickenRice()])
    expect(rows[0]).not.toHaveProperty('key')
    expect(rows[0]).not.toHaveProperty('per100g')
    expect(rows[0].foodName).toBe('Chicken rice, no skin')
  })

  it('builds an editing draft from a meal and back', () => {
    const meal: Meal = {
      id: 7, ts: '2026-09-10T04:30:00.000Z', mealType: 'lunch', photoUri: 'data:image/jpeg;base64,abc', notes: 'extra cucumber',
      source: 'photo', savedName: 'Chicken rice', isSaved: true,
      items: [{ id: 1, mealId: 7, foodName: 'Chicken rice, no skin', quantityG: 380, servingDescription: '1 plate', kcal: 521, proteinG: 27, carbsG: 74.1, fatG: 14.1, source: 'photo', confidence: 0.6, uncertaintyReason: null }],
    }
    const d = draftFromMeal(meal)
    expect(d.mealId).toBe(7)
    expect(d.mealType).toBe('lunch')
    expect(d.photoDataUrl).toBe(meal.photoUri)
    expect(d.savedName).toBe('Chicken rice')
    expect(d.items).toHaveLength(1)
    expect(d.items[0].per100g.kcal).toBeCloseTo(137.1, 1)
    expect(d.status).toBe('ready')
  })

  it('applies a recognition result and clears a previous error', () => {
    const base = { ...newDraft({ status: 'recognizing', source: 'photo' }), errorKind: 'offline' as const, errorMessage: 'x' }
    const d = draftFromRecognition(base, {
      items: [{ food_name: 'Eggs', estimated_quantity_g: 100, serving_description: '2 eggs', kcal: 140, protein_g: 12, carbs_g: 1, fat_g: 10, confidence_0_1: 0.45, uncertainty_reason: 'Demo', source_hint: '' }],
      overall_confidence: 0.45,
      notes: 'Demo mode.',
    })
    expect(d.status).toBe('ready')
    expect(d.items[0].foodName).toBe('Eggs')
    expect(d.confidence).toBe(0.45)
    expect(d.recognitionNotes).toBe('Demo mode.')
    expect(d.errorKind).toBeUndefined()
  })

  it('labels confidence bands', () => {
    expect(confidenceLabel(null).label).toBe('Manual')
    expect(confidenceLabel(0.95).tone).toBe('green')
    expect(confidenceLabel(0.6).tone).toBe('amber')
    expect(confidenceLabel(0.4).tone).toBe('red')
    expect(suggestSavedName([chickenRice(), latte()])).toBe('Chicken rice, no skin, Latte')
  })
})

describe('voice corrections', () => {
  it('halves, removes and sets quantities by original index', () => {
    const items = [chickenRice(), latte(), makeDraftItem({ foodName: 'Chicken skin', quantityG: 30, servingDescription: '', kcal: 135, proteinG: 4, carbsG: 0, fatG: 13, source: 'photo', confidence: 0.5, uncertaintyReason: null })]
    const r = applyCorrections(items, [
      { itemIndex: 2, op: 'remove', note: 'Removed Chicken skin' },
      { itemIndex: 0, op: 'scale', factor: 0.5, note: 'Halved Chicken rice' },
      { itemIndex: 1, op: 'set_quantity', quantityG: 200, note: 'Latte: 300 g → 200 g' },
    ])
    expect(r.items).toHaveLength(2)
    expect(r.items[0].quantityG).toBe(190)
    expect(r.items[0].kcal).toBe(261)
    expect(r.items[1].quantityG).toBe(200)
    expect(r.items[1].kcal).toBe(100)
    expect(r.notes).toHaveLength(3)
  })

  it('ignores out-of-range or malformed corrections', () => {
    const items = [latte()]
    const r = applyCorrections(items, [
      { itemIndex: 5, op: 'remove', note: 'nope' },
      { itemIndex: 0, op: 'scale', note: 'no factor' },
      { itemIndex: 0, op: 'set_quantity', quantityG: -1, note: 'negative' },
    ])
    expect(r.items).toHaveLength(1)
    expect(r.items[0].quantityG).toBe(300)
    expect(r.notes).toEqual([])
  })
})

describe('time helpers', () => {
  it('round-trips a local time on the same day', () => {
    const ts = new Date(2026, 8, 10, 12, 40).toISOString()
    expect(timeValue(ts)).toBe('12:40')
    const moved = withTime(ts, '19:05')
    const d = new Date(moved)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 10, 19, 5])
    expect(withTime(ts, 'garbage')).toBe(ts)
  })
})

describe('nutrition line', () => {
  const target = { kcal: 2050, proteinG: 150 }
  const base = { date: '2026-09-10', today: '2026-09-10', target, suggestions: ['Fish soup with rice', 'Greek yogurt, whey & berries'], logged: true }

  it('protein pace ramps 09:00 → 21:00', () => {
    expect(proteinPaceExpected(150, 8)).toBe(0)
    expect(proteinPaceExpected(150, 15)).toBe(75)
    expect(proteinPaceExpected(150, 22)).toBe(150)
  })

  it('names a high-protein lunch before 11:00 when almost nothing is in', () => {
    const l = nutritionLine({ ...base, hour: 9, intake: { kcal: 5, proteinG: 0, carbsG: 0, fatG: 0 } })
    expect(l.tone).toBe('accent')
    expect(l.text).toMatch(/high-protein lunch — Fish soup with rice or Greek yogurt/)
    expect(l.text).toMatch(/150 g protein to go/)
  })

  it('flags protein behind pace after 11:00', () => {
    const l = nutritionLine({ ...base, hour: 15, intake: { kcal: 300, proteinG: 10, carbsG: 40, fatG: 5 } })
    expect(l.tone).toBe('amber')
    expect(l.text).toMatch(/behind pace: 10 g in, ~75 g expected/)
    expect(l.text).toMatch(/Make dinner high-protein/)
  })

  it('reports on pace and target hit without moralising', () => {
    const on = nutritionLine({ ...base, hour: 15, intake: { kcal: 900, proteinG: 70, carbsG: 90, fatG: 30 } })
    expect(on.tone).toBe('green')
    expect(on.text).toMatch(/On pace: 70 of 150 g protein/)
    const hit = nutritionLine({ ...base, hour: 19, intake: { kcal: 2200, proteinG: 155, carbsG: 200, fatG: 70 } })
    expect(hit.tone).toBe('green')
    expect(hit.text).toMatch(/Protein target hit: 155 g\. 150 kcal over target\./)
    for (const t of [on.text, hit.text]) expect(t).not.toMatch(/lazy|guilt|shame|bad|cheat/i)
  })

  it('summarises past days and stays neutral for empty ones', () => {
    const past = nutritionLine({ ...base, date: '2026-09-08', hour: 12, intake: { kcal: 1800, proteinG: 120, carbsG: 150, fatG: 60 } })
    expect(past.tone).toBe('neutral')
    expect(past.text).toMatch(/120 of 150 g protein · 1,800 of 2,050 kcal/)
    const empty = nutritionLine({ ...base, date: '2026-09-08', hour: 12, logged: false, intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } })
    expect(empty.text).toBe('Nothing logged on this day.')
    const future = nutritionLine({ ...base, date: '2026-09-12', hour: 12, intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } })
    expect(future.text).toMatch(/Planning ahead/)
  })
})

describe('draft store (memory fallback in node)', () => {
  beforeEach(() => resetDraftStore())
  afterEach(() => resetDraftStore())

  it('round-trips save/load/clear and notifies subscribers', () => {
    let calls = 0
    const unsub = subscribeDraft(() => { calls += 1 })
    expect(loadDraft()).toBeNull()
    const d = newDraft({ items: [chickenRice()], mealType: 'lunch' })
    saveDraft(d)
    expect(getDraftSnapshot()).toBe(d)
    expect(loadDraft()?.items[0].foodName).toBe('Chicken rice, no skin')
    const next = updateDraft((cur) => ({ ...cur, notes: 'edited' }))
    expect(next?.notes).toBe('edited')
    expect(getDraftSnapshot()).toBe(next)
    clearDraft()
    expect(loadDraft()).toBeNull()
    expect(calls).toBe(3)
    unsub()
  })

  it('normalises a stored draft, regenerating bases and keeping keys', () => {
    const stored = {
      status: 'ready', ts: '2026-09-10T04:30:00.000Z', mealType: 'lunch',
      items: [{ key: 'k1', foodName: 'Eggs', quantityG: 100, kcal: 140, proteinG: 12, carbsG: 1, fatG: 10, source: 'voice' }],
      source: 'voice', errorKind: 'offline', errorMessage: 'off',
    }
    const d = normalizeDraft(stored)
    expect(d).not.toBeNull()
    expect(d!.items[0].key).toBe('k1')
    expect(d!.items[0].per100g.kcal).toBe(140)
    expect(d!.items[0].confidence).toBeNull()
    expect(d!.errorKind).toBe('offline')
    expect(d!.notes).toBe('')
    expect(normalizeDraft({ nope: true })).toBeNull()
    expect(normalizeDraft(null)).toBeNull()
  })

  it('infers the meal type from the timestamp when missing', () => {
    const d = normalizeDraft({ status: 'ready', ts: new Date(2026, 8, 10, 12, 0).toISOString(), mealType: 'brunch', items: [] })
    expect(d!.mealType).toBe('lunch')
  })
})

describe('AI refinement', () => {
  const refined = (from_index: number, food_name: string, g: number, kcal: number): RefinedFood => ({
    from_index, food_name, estimated_quantity_g: g, serving_description: '', kcal, protein_g: 10, carbs_g: 10, fat_g: 5,
    confidence_0_1: 0.7, uncertainty_reason: '',
  })

  it('keeps the key, source and 1× basis of the rows it replaces and flags new rows as AI', () => {
    const before = [chickenRice(), latte()]
    const after = mergeRefined(before, [refined(0, 'Chicken rice, no skin', 570, 780), refined(-1, 'Fried egg', 50, 90)])
    expect(after).toHaveLength(2)
    expect(after[0].key).toBe(before[0].key)
    expect(after[0].source).toBe('search')
    expect(after[0].baseQuantityG).toBe(380)
    expect(after[0].quantityG).toBe(570)
    expect(after[1].source).toBe('ai')
    expect(after[1].key).not.toBe(before[1].key)
  })

  it('describes the diff in plain language', () => {
    const before = [chickenRice(), latte()]
    const after = mergeRefined(before, [refined(0, 'Chicken rice, no skin', 570, 780), refined(-1, 'Fried egg', 50, 90)])
    expect(diffItems(before, after)).toEqual([
      'Removed Latte',
      'Chicken rice, no skin: 380 g → 570 g, 521 → 780 kcal',
      'Added Fried egg · 90 kcal',
    ])
    expect(diffItems(before, before)).toEqual([])
  })
})
