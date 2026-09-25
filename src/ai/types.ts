// AI provider contract (docs/CONTRACTS.md → src/ai/types.ts).
// Field names on RecognizedFood mirror PRD §10.2 exactly (snake_case, as returned by the model).

export interface RecognizedFood {
  food_name: string
  estimated_quantity_g: number
  serving_description: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  /** 0–1. Always shown to the user as an estimate, never as fact. */
  confidence_0_1: number
  uncertainty_reason: string
  /** Where the estimate came from, e.g. "SG hawker typical portion", "USDA generic". */
  source_hint: string
}

export interface MealRecognition {
  items: RecognizedFood[]
  overall_confidence: number
  notes: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type AIProviderId = 'mock' | 'anthropic' | 'claude-code' | 'gemini'

export interface MealImage {
  /** Raw base64 (no data: URL prefix). */
  base64: string
  /** e.g. 'image/jpeg' */
  mediaType: string
}

export interface MealContext {
  mealType?: string
  hint?: string
}

/** A file handed to the model: images (jpeg/png/webp/gif) or a PDF. Raw base64, no data: prefix. */
export interface AIAttachment {
  base64: string
  mediaType: string
  name?: string
}

/** Generic structured call: every AI feature (meal photo, reports, workout plans, command routing) builds on this. */
export interface JsonRequest {
  system: string
  prompt: string
  /** JSON Schema the reply must satisfy (object at the root). */
  schema: Record<string, unknown>
  attachments?: AIAttachment[]
}

/** One choice question for a decision model (docs/PRD_COACH_CHAT.md §11.6): only `state` is user text. */
export interface DecideRequest {
  state: string
  instructions: string
  /** option name (snake_case) → one-line description */
  options: Record<string, string>
}

export interface DecideResult { choice: string; confidence: number }

export interface AIProvider {
  id: AIProviderId
  name: string
  isConfigured(): boolean
  recognizeMeal(img: MealImage, context: MealContext): Promise<MealRecognition>
  coachChat(system: string, turns: ChatTurn[]): Promise<string>
  /** Returns the parsed JSON object. Throws AIError('not_configured') on providers that cannot do it (mock). */
  completeJson(req: JsonRequest): Promise<unknown>
  /** Only providers with a decision model (the Cloudflare Worker on OpenRouter). Absent elsewhere. */
  decide?(req: DecideRequest): Promise<DecideResult>
}

// --- errors -----------------------------------------------------------------
// Defined here (not in gateway.ts) so anthropic.ts can throw it without a
// gateway ↔ anthropic import cycle. gateway.ts re-exports it per the contract.

export type AIErrorKind = 'offline' | 'not_configured' | 'auth' | 'rate_limit' | 'network' | 'refusal' | 'unknown'

export const AI_ERROR_MESSAGES: Record<AIErrorKind, string> = {
  offline: "You're offline. AI features need a connection — everything else keeps working locally.",
  not_configured: 'AI is not connected. Add a Gemini or Anthropic API key in Settings → AI, or sign in to Claude Code on your Mac.',
  auth: 'The AI service rejected the API key. Check it in Settings → AI.',
  rate_limit: 'The AI service is rate-limiting requests. Wait a minute and try again.',
  network: "Couldn't reach the AI service. Check your connection and try again.",
  refusal: 'The AI declined to answer this request.',
  unknown: 'Something went wrong talking to the AI service.',
}

export class AIError extends Error {
  readonly kind: AIErrorKind
  override readonly cause?: unknown

  constructor(kind: AIErrorKind, message?: string, cause?: unknown) {
    super(message ?? AI_ERROR_MESSAGES[kind])
    this.name = 'AIError'
    this.kind = kind
    this.cause = cause
  }
}

export function isAIError(e: unknown): e is AIError {
  return e instanceof AIError
}
