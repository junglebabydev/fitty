import Anthropic from '@anthropic-ai/sdk'
import { AIError, type AIProvider, type ChatTurn, type JsonRequest, type MealContext, type MealImage, type MealRecognition, type RecognizedFood } from './types'

// Anthropic provider, called directly from the browser (single-user, local-first
// app; the key lives in local settings). Built against @anthropic-ai/sdk 0.124.x:
// output_config.format (structured outputs), adaptive thinking and the
// 'refusal' stop reason all exist in the installed types.

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5'
export const ANTHROPIC_TIMEOUT_MS = 60_000

type ImageMediaType = Anthropic.Base64ImageSource['media_type']
const IMAGE_MEDIA_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function toImageMediaType(mediaType: string): ImageMediaType {
  const mt = mediaType.toLowerCase().trim()
  if (mt === 'image/jpg') return 'image/jpeg'
  return (IMAGE_MEDIA_TYPES as string[]).includes(mt) ? (mt as ImageMediaType) : 'image/jpeg'
}

/** Accepts either raw base64 or a data: URL and returns raw base64. */
export function stripDataUrl(base64: string): string {
  const i = base64.indexOf('base64,')
  return i >= 0 ? base64.slice(i + 7) : base64
}

// JSON schema for MealRecognition (PRD §10.2). Kept free of numeric constraints
// because structured outputs only guarantee shape; ranges are clamped client-side.
export const MEAL_RECOGNITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          food_name: { type: 'string', description: 'Specific food or drink, e.g. "Chicken rice (steamed chicken, skin removed)"' },
          estimated_quantity_g: { type: 'number', description: 'Estimated weight in grams (ml for drinks)' },
          serving_description: { type: 'string', description: 'Human-readable portion, e.g. "1 hawker plate", "2 slices"' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          confidence_0_1: { type: 'number', description: 'Honest confidence 0–1 for this item' },
          uncertainty_reason: { type: 'string', description: 'What could not be seen: hidden sauce, oil, portion depth, etc.' },
          source_hint: { type: 'string', description: 'Basis for the estimate, e.g. "SG hawker typical portion", "USDA generic"' },
        },
        required: ['food_name', 'estimated_quantity_g', 'serving_description', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence_0_1', 'uncertainty_reason', 'source_hint'],
        additionalProperties: false,
      },
    },
    overall_confidence: { type: 'number' },
    notes: { type: 'string', description: 'One or two short sentences the user should know before saving' },
  },
  required: ['items', 'overall_confidence', 'notes'],
  additionalProperties: false,
}

export const MEAL_SYSTEM_PROMPT = `You estimate nutrition from a single meal photo for a Singapore-based user who logs meals for a fat-loss phase.
Identify each distinct food or drink as its own item. Estimate grams, kcal, protein, carbs and fat per item using typical Singapore hawker/cafe portions where the dish is local, otherwise generic (USDA-style) values.
Be honest about uncertainty: hidden oil, sauces, portion depth, and cooking method are common unknowns — say so in uncertainty_reason and lower confidence_0_1 accordingly.
Never moralise about food choices. Do not add items you cannot see. If the photo contains no food, return an empty items array and explain in notes.
A drawing, a screenshot, packaging with no visible food, or a photo too dark or blurred to identify is not a meal photo: return an empty items array, or items with confidence_0_1 of 0.3 or less, and say why in notes.
notes is at most two short sentences. uncertainty_reason is at most 12 words. Plain text only. No emoji.
Respond with a single JSON object matching this shape and nothing else — no prose, no code fences:
{"items":[{"food_name":string,"estimated_quantity_g":number,"serving_description":string,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence_0_1":number,"uncertainty_reason":string,"source_hint":string}],"overall_confidence":number,"notes":string}`

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v)
}
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Extracts the first JSON object from model text (tolerates code fences / stray prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      /* fall through */
    }
  }
  throw new AIError('unknown', 'The AI reply was not valid JSON.')
}

/** Coerces arbitrary parsed JSON into a well-formed MealRecognition. Throws AIError('unknown') when unusable. */
export function parseMealRecognition(text: string): MealRecognition {
  const raw = extractJson(text)
  if (!raw || typeof raw !== 'object') throw new AIError('unknown', 'The AI reply was not a meal object.')
  const obj = raw as Record<string, unknown>
  const rawItems = Array.isArray(obj.items) ? obj.items : []
  const items: RecognizedFood[] = rawItems
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => ({
      food_name: str(it.food_name, 'Unknown food').trim() || 'Unknown food',
      estimated_quantity_g: Math.max(0, Math.round(num(it.estimated_quantity_g))),
      serving_description: str(it.serving_description),
      kcal: Math.max(0, Math.round(num(it.kcal))),
      protein_g: Math.max(0, Math.round(num(it.protein_g) * 10) / 10),
      carbs_g: Math.max(0, Math.round(num(it.carbs_g) * 10) / 10),
      fat_g: Math.max(0, Math.round(num(it.fat_g) * 10) / 10),
      confidence_0_1: clamp01(num(it.confidence_0_1, 0.5)),
      uncertainty_reason: str(it.uncertainty_reason),
      source_hint: str(it.source_hint),
    }))
  const overall =
    obj.overall_confidence == null && items.length
      ? items.reduce((a, it) => a + it.confidence_0_1, 0) / items.length
      : clamp01(num(obj.overall_confidence, 0.5))
  return { items, overall_confidence: Math.round(overall * 100) / 100, notes: str(obj.notes) }
}

/** Maps SDK exceptions to AIError kinds. AIErrors pass through untouched. */
export function mapAnthropicError(e: unknown): AIError {
  if (e instanceof AIError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AIError('auth', undefined, e)
  }
  if (e instanceof Anthropic.RateLimitError) return new AIError('rate_limit', undefined, e)
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIError('network', 'The AI service took too long to respond. Try again.', e)
  }
  if (e instanceof Anthropic.APIConnectionError) return new AIError('network', undefined, e)
  if (e instanceof Anthropic.InternalServerError) {
    return new AIError('network', 'The AI service is temporarily unavailable. Try again shortly.', e)
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new AIError('unknown', `The AI service rejected the request: ${e.message}`, e)
  }
  if (e instanceof Anthropic.APIError) return new AIError('unknown', e.message, e)
  if (e instanceof Error && e.name === 'AbortError') return new AIError('network', 'The request was cancelled.', e)
  return new AIError('unknown', undefined, e)
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

function assertNotRefused(message: Anthropic.Message): void {
  if (message.stop_reason === 'refusal') {
    const why = message.stop_details?.explanation
    throw new AIError('refusal', why ? `The AI declined this request: ${why}` : undefined)
  }
}

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const
  readonly name = 'Anthropic Claude'
  readonly model: string
  private readonly apiKey: string
  private client: Anthropic | null = null

  constructor(apiKey: string, model: string = DEFAULT_ANTHROPIC_MODEL) {
    this.apiKey = (apiKey ?? '').trim()
    this.model = (model ?? '').trim() || DEFAULT_ANTHROPIC_MODEL
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private getClient(): Anthropic {
    if (!this.isConfigured()) throw new AIError('not_configured')
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.apiKey,
        dangerouslyAllowBrowser: true,
        timeout: ANTHROPIC_TIMEOUT_MS,
        maxRetries: 1,
      })
    }
    return this.client
  }

  async recognizeMeal(img: MealImage, context: MealContext): Promise<MealRecognition> {
    const client = this.getClient()
    const parts: string[] = ['Identify the foods in this photo and estimate portions and nutrition.']
    if (context.mealType) parts.push(`Meal type: ${context.mealType}.`)
    if (context.hint?.trim()) parts.push(`User note: ${context.hint.trim()}`)
    parts.push('Return the JSON object only.')

    const base: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 2048,
      system: MEAL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: toImageMediaType(img.mediaType), data: stripDataUrl(img.base64) } },
            { type: 'text', text: parts.join(' ') },
          ],
        },
      ],
    }
    // Structured output + no thinking for a fast, schema-shaped answer. Older
    // models may 400 on either param, so fall back to prompt-only JSON once.
    const withStructured: Anthropic.MessageCreateParamsNonStreaming = {
      ...base,
      thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema', schema: MEAL_RECOGNITION_SCHEMA } },
    }

    let message: Anthropic.Message
    try {
      message = await this.createWithFallback(client, withStructured, base)
    } catch (e) {
      throw mapAnthropicError(e)
    }
    assertNotRefused(message)
    const text = textOf(message)
    if (!text) {
      throw new AIError('unknown', message.stop_reason === 'max_tokens' ? 'The AI reply was cut off. Try again.' : 'The AI returned an empty reply.')
    }
    return parseMealRecognition(text)
  }

  /** Generic structured call (reports, plans, routing). Images and PDFs ride along as content blocks. */
  async completeJson(req: JsonRequest): Promise<unknown> {
    const client = this.getClient()
    const blocks: Anthropic.ContentBlockParam[] = []
    for (const a of req.attachments ?? []) {
      if (a.mediaType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: stripDataUrl(a.base64) } })
      } else {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: toImageMediaType(a.mediaType), data: stripDataUrl(a.base64) } })
      }
    }
    blocks.push({ type: 'text', text: `${req.prompt}\n\nReturn the JSON object only.` })

    const base: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 8192,
      system: req.system,
      messages: [{ role: 'user', content: blocks }],
    }
    const withStructured: Anthropic.MessageCreateParamsNonStreaming = {
      ...base,
      output_config: { format: { type: 'json_schema', schema: req.schema } },
    }
    let message: Anthropic.Message
    try {
      message = await this.createWithFallback(client, withStructured, base)
    } catch (e) {
      throw mapAnthropicError(e)
    }
    assertNotRefused(message)
    const text = textOf(message)
    if (!text) throw new AIError('unknown', 'The AI returned an empty reply.')
    try {
      return extractJson(text)
    } catch {
      throw new AIError('unknown', 'The AI reply was not valid JSON. Try again.')
    }
  }

  async coachChat(system: string, turns: ChatTurn[]): Promise<string> {
    const client = this.getClient()
    // The API requires the first message to be from the user; drop any leading assistant turns.
    const firstUser = turns.findIndex((t) => t.role === 'user')
    const usable = firstUser >= 0 ? turns.slice(firstUser) : []
    const messages: Anthropic.MessageParam[] = usable
      .filter((t) => t.content.trim().length > 0)
      .map((t) => ({ role: t.role, content: t.content }))
    if (!messages.length || messages[0].role !== 'user') {
      throw new AIError('unknown', 'Nothing to send to the coach yet.')
    }

    const base: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      // ~2048 for the visible answer; adaptive thinking tokens also count toward this budget.
      max_tokens: 4096,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    }
    const withThinking: Anthropic.MessageCreateParamsNonStreaming = { ...base, thinking: { type: 'adaptive' } }

    let message: Anthropic.Message
    try {
      message = await this.createWithFallback(client, withThinking, base)
    } catch (e) {
      throw mapAnthropicError(e)
    }
    assertNotRefused(message)
    const text = textOf(message)
    if (!text) {
      throw new AIError('unknown', message.stop_reason === 'max_tokens' ? 'The coach reply was cut off. Try a shorter question.' : 'The coach returned an empty reply.')
    }
    return text
  }

  /** Tries the preferred params; on a 400 (unsupported param for this model) retries once with the plain params. */
  private async createWithFallback(
    client: Anthropic,
    preferred: Anthropic.MessageCreateParamsNonStreaming,
    fallback: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    try {
      return await client.messages.create(preferred)
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && preferred !== fallback) {
        return await client.messages.create(fallback)
      }
      throw e
    }
  }
}
