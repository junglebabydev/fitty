// AI calls for the Eat area: refine the plate from a description, estimate one
// unlisted food. Both go through aiJson (offline check, privacy ledger, timeout)
// and return editable draft rows — nothing is saved here.

import { aiJson, type AIAttachment } from '../../ai'
import { getSetting } from '../../db/repositories/settings'
import { imageFromDataUrl } from './captureMeal'
import { itemFromRecognized, mergeRefined, type DraftItem, type RefinedFood } from './draft'

const FOOD_PROPS = {
  food_name: { type: 'string' },
  estimated_quantity_g: { type: 'number' },
  serving_description: { type: 'string' },
  kcal: { type: 'number' },
  protein_g: { type: 'number' },
  carbs_g: { type: 'number' },
  fat_g: { type: 'number' },
  confidence_0_1: { type: 'number' },
  uncertainty_reason: { type: 'string' },
}
const FOOD_REQUIRED = Object.keys(FOOD_PROPS)

export const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { from_index: { type: 'integer' }, ...FOOD_PROPS },
        required: ['from_index', ...FOOD_REQUIRED],
      },
    },
  },
  required: ['items'],
}

export const ESTIMATE_SCHEMA = { type: 'object', properties: FOOD_PROPS, required: FOOD_REQUIRED }

/** System prompt for a plate correction. Pure. */
export function refineSystem(hasImage: boolean): string {
  return (
    'You correct a meal log for a nutrition tracker. You receive the current items (JSON, each with an index) and what the user says about the meal' +
    (hasImage ? ', plus the meal photo' : '') +
    '. Return the FULL corrected item list. Items the user did not mention stay exactly as they are. ' +
    'from_index is the index of the item a row replaces, or -1 for a new item. Leave out removed items. ' +
    'Quantities are grams; kcal and macros are for that quantity. Use typical Singapore portions when relevant. ' +
    'These are estimates: give an honest confidence_0_1 and a short uncertainty_reason.'
  )
}

type RefineRow = Pick<DraftItem, 'foodName' | 'quantityG' | 'servingDescription' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>

/** User message for a plate correction: the current rows (with their index) and what the user said. Pure. */
export function refinePrompt(items: RefineRow[], text: string): string {
  const current = items.map((it, index) => ({
    index, food_name: it.foodName, quantity_g: it.quantityG, serving_description: it.servingDescription,
    kcal: it.kcal, protein_g: it.proteinG, carbs_g: it.carbsG, fat_g: it.fatG,
  }))
  return `Current items:\n${JSON.stringify(current)}\n\nThe user says: "${text}"`
}

export const ESTIMATE_SYSTEM =
  'Estimate the nutrition of ONE food or dish as typically served (Singapore portions when the name suggests it). ' +
  'Quantity in grams; kcal and macros for that quantity. It is an estimate: give an honest confidence_0_1 and a short uncertainty_reason.'

export function estimatePrompt(query: string): string {
  return `Food: "${query}"`
}

/** Sends the description (and the photo, when sharing photos is on) and returns the corrected rows. */
export async function refineItemsWithAI(items: DraftItem[], text: string, photoDataUrl: string | null): Promise<DraftItem[]> {
  const image = photoDataUrl && getSetting<boolean>('ai.sendMealPhotos', true) ? imageFromDataUrl(photoDataUrl) : null
  const attachments: AIAttachment[] | undefined = image ? [{ base64: image.base64, mediaType: image.mediaType, name: 'meal.jpg' }] : undefined
  const res = await aiJson<{ items?: RefinedFood[] }>(
    {
      system: refineSystem(!!image),
      prompt: refinePrompt(items, text),
      schema: REFINE_SCHEMA,
      attachments,
    },
    { dataType: image ? 'meal_photo' : 'meal_text', purpose: image ? 'Refine the plate from your description and photo' : 'Refine the plate from your description' },
  )
  return mergeRefined(items, Array.isArray(res?.items) ? res.items : [])
}

/** One editable estimate for a food that is not in the local library. */
export async function estimateFoodWithAI(query: string): Promise<DraftItem> {
  const res = await aiJson<Omit<RefinedFood, 'from_index'>>(
    { system: ESTIMATE_SYSTEM, prompt: estimatePrompt(query), schema: ESTIMATE_SCHEMA },
    { dataType: 'food_query', purpose: 'Estimate a food that is not in the library' },
  )
  return { ...itemFromRecognized({ ...res, source_hint: '' }), source: 'ai' }
}
