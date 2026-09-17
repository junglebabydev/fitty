import { AIError } from './types'
import type { AIProvider, ChatTurn, MealContext, MealImage, MealRecognition, RecognizedFood } from './types'

// Offline, deterministic stand-in used until the user configures a real
// provider. Same photo + same context → same answer. Confidence is capped at
// 0.5 so the review sheet always presents these as rough estimates.

export const MOCK_UNCERTAINTY = 'Demo estimate — no AI provider configured'
export const MOCK_CHAT_REPLY =
  'No AI provider is configured, so I can only answer from your local data. Add a Gemini or Anthropic API key in Settings → AI to chat with the coach.'

type Template = Omit<RecognizedFood, 'confidence_0_1' | 'uncertainty_reason' | 'source_hint'>

// Plausible Singapore meals; macros are per listed portion, rounded.
const MEAL_SETS: { keywords: string[]; mealTypes: string[]; items: Template[] }[] = [
  {
    keywords: ['chicken', 'rice'],
    mealTypes: ['lunch', 'dinner'],
    items: [
      { food_name: 'Steamed chicken (skin removed)', estimated_quantity_g: 120, serving_description: 'hawker portion', kcal: 190, protein_g: 30, carbs_g: 0, fat_g: 7 },
      { food_name: 'Chicken rice (oily rice)', estimated_quantity_g: 200, serving_description: '1 plate', kcal: 330, protein_g: 6, carbs_g: 58, fat_g: 8 },
      { food_name: 'Cucumber slices', estimated_quantity_g: 40, serving_description: 'garnish', kcal: 6, protein_g: 0, carbs_g: 1, fat_g: 0 },
    ],
  },
  {
    keywords: ['fish', 'soup'],
    mealTypes: ['lunch', 'dinner'],
    items: [
      { food_name: 'Sliced fish soup', estimated_quantity_g: 400, serving_description: '1 bowl with vegetables', kcal: 180, protein_g: 26, carbs_g: 6, fat_g: 5 },
      { food_name: 'White rice', estimated_quantity_g: 180, serving_description: '1 bowl', kcal: 235, protein_g: 4, carbs_g: 52, fat_g: 0 },
    ],
  },
  {
    keywords: ['egg', 'toast', 'kaya'],
    mealTypes: ['breakfast'],
    items: [
      { food_name: 'Kaya butter toast', estimated_quantity_g: 80, serving_description: '2 slices', kcal: 260, protein_g: 5, carbs_g: 36, fat_g: 11 },
      { food_name: 'Soft-boiled eggs', estimated_quantity_g: 100, serving_description: '2 eggs', kcal: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
      { food_name: 'Kopi', estimated_quantity_g: 200, serving_description: '1 cup, with condensed milk', kcal: 120, protein_g: 2, carbs_g: 20, fat_g: 3 },
    ],
  },
  {
    keywords: ['yogurt', 'yoghurt', 'berries', 'whey'],
    mealTypes: ['snack', 'breakfast'],
    items: [
      { food_name: 'Greek yogurt (plain)', estimated_quantity_g: 170, serving_description: '1 small tub', kcal: 100, protein_g: 17, carbs_g: 6, fat_g: 0 },
      { food_name: 'Mixed berries', estimated_quantity_g: 80, serving_description: 'handful', kcal: 45, protein_g: 1, carbs_g: 10, fat_g: 0 },
    ],
  },
  {
    keywords: ['salmon', 'salad', 'broccoli'],
    mealTypes: ['lunch', 'dinner'],
    items: [
      { food_name: 'Grilled salmon fillet', estimated_quantity_g: 150, serving_description: '1 fillet', kcal: 310, protein_g: 31, carbs_g: 0, fat_g: 20 },
      { food_name: 'Steamed broccoli', estimated_quantity_g: 100, serving_description: '1 cup', kcal: 35, protein_g: 3, carbs_g: 7, fat_g: 0 },
      { food_name: 'Sweet potato', estimated_quantity_g: 150, serving_description: '1 medium', kcal: 130, protein_g: 2, carbs_g: 30, fat_g: 0 },
    ],
  },
  {
    keywords: ['latte', 'coffee', 'flat white'],
    mealTypes: ['drink'],
    items: [
      { food_name: 'Latte (full cream milk)', estimated_quantity_g: 300, serving_description: 'regular cup', kcal: 150, protein_g: 8, carbs_g: 12, fat_g: 8 },
      { food_name: 'Butter croissant', estimated_quantity_g: 60, serving_description: '1 pastry', kcal: 240, protein_g: 5, carbs_g: 26, fat_g: 13 },
    ],
  },
]

/** Small stable string hash (FNV-1a) so the same photo maps to the same demo answer. */
function hash(s: string): number {
  let h = 0x811c9dc5
  const len = Math.min(s.length, 4096)
  for (let i = 0; i < len; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function pickSet(img: MealImage, context: MealContext) {
  const hint = (context.hint ?? '').toLowerCase()
  if (hint) {
    // Best keyword overlap wins ("fish soup with rice" → fish soup, not chicken rice).
    let best: (typeof MEAL_SETS)[number] | null = null
    let bestScore = 0
    for (const s of MEAL_SETS) {
      const score = s.keywords.filter((k) => hint.includes(k)).length
      if (score > bestScore) { best = s; bestScore = score }
    }
    if (best) return best
  }
  const mealType = (context.mealType ?? '').toLowerCase()
  const candidates = mealType ? MEAL_SETS.filter((s) => s.mealTypes.includes(mealType)) : []
  const pool = candidates.length ? candidates : MEAL_SETS
  return pool[hash(img.base64 + '|' + mealType) % pool.length]
}

export class MockProvider implements AIProvider {
  readonly id = 'mock' as const
  readonly name = 'Demo (on-device, no network)'

  constructor(private readonly latencyMs = 0) {}

  isConfigured(): boolean {
    return true
  }

  async recognizeMeal(img: MealImage, context: MealContext): Promise<MealRecognition> {
    await this.wait()
    const set = pickSet(img, context)
    const h = hash(img.base64)
    const items: RecognizedFood[] = set.items.map((t, i) => ({
      ...t,
      // 0.35–0.50, varies per item but stays deterministic for the same photo.
      confidence_0_1: Math.round((0.35 + (((h >> (i * 4)) & 0xf) / 15) * 0.15) * 100) / 100,
      uncertainty_reason: MOCK_UNCERTAINTY,
      source_hint: 'Demo food table (typical Singapore portion)',
    }))
    const overall = Math.round((items.reduce((a, it) => a + it.confidence_0_1, 0) / items.length) * 100) / 100
    return {
      items,
      overall_confidence: Math.min(0.5, overall),
      notes: 'Demo mode: these portions were not read from your photo. Adjust quantities before saving.',
    }
  }

  async coachChat(_system: string, _turns: ChatTurn[]): Promise<string> {
    await this.wait()
    return MOCK_CHAT_REPLY
  }

  private wait(): Promise<void> {
    return this.latencyMs > 0 ? new Promise((r) => setTimeout(r, this.latencyMs)) : Promise.resolve()
  }

  async completeJson(): Promise<unknown> {
    throw new AIError('not_configured')
  }
}
