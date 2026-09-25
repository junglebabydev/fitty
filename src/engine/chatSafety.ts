// Chat safety screen, layer L1 in docs/PRD_COACH_CHAT.md §5. Runs on every typed or spoken message before any
// routing, parsing or model call, and works offline. A hit gets a fixed reply and the Support sheet; the message
// never reaches a model. Patterns are phrase-level and err toward triggering: a false positive costs one closed
// sheet, a miss costs more.

export type SafetyKind = 'self_harm' | 'medical_emergency' | 'disordered_eating'

export interface SafetyHit { kind: SafetyKind; reply: string }

const PATTERNS: Record<SafetyKind, RegExp[]> = {
  self_harm: [
    /\bsuicid/,
    /\bkill(ing)? myself\b/,
    /\b(want|going|plan(ning)?|thinking (about|of)|feel like)\s+(to\s+)?(hurt(ing)?|harm(ing)?)\s+myself\b/,
    /\bcutting myself\b/,
    /\bself[- ]?harm/,
    /\bend(ing)? (it all|my life|things)\b/,
    /\btake my (own )?life\b/,
    /\bno (point|reason) (in )?(living|to live|being alive|going on)\b/,
    /\bbetter off dead\b/,
    /\b(want|wish) (to|i could|i was|i were) (die|be dead|disappear)\b/,
    /\b(don'?t|do not) want to (live|be alive|be here anymore|wake up)\b/,
  ],
  medical_emergency: [
    /\bchest\s+(pain|pains|tight(ness)?|pressure|hurts?|is hurting)\b/,
    /\b(tight|pain in (my|the)|pressure (in|on) (my|the)) chest\b/,
    /\b(passed out|fainted|blacked out|lost consciousness)\b/,
    /\bi (just )?collapsed\b/,
    /\b(can'?t|cannot|can not|couldn'?t|struggling to|trouble|hard to) breath(e|ing)\b/,
    /\bface (is |was )?(drooping|droopy|droops)\b/,
    /\bslurr(ed|ing)\b/,
    /\bsudden(ly)? (weakness|numbness|numb|weak)\b/,
    /\bworst headache\b/,
    /\bthunderclap\b/,
    /\bheart\b[^.]*\b(racing|pounding)\b[^.]*\b(won'?t|not|doesn'?t|isn'?t)\s+(slow|stop|settle|calm)/,
  ],
  disordered_eating: [
    /\bmak(e|ing) myself (sick|throw up|vomit|puke)\b/,
    /\b(threw|throw|throwing) up\b[^.]*\b(on purpose|so it (doesn'?t|does not|won'?t) count|to (lose|get rid|burn))/,
    /\bpurg(e|ed|es|ing)\b/,
    /\blaxatives?\b/,
    /\bstarv(e|ing) myself\b/,
    /\b(eat|eating|only have|just have|live on|limit myself to|stick to)\s+(only\s+|just\s+)?([1-7]\d{2}|[1-9]\d?)\s*(k?cals?|calories)\b(?!\s*(left|remaining|to go|more|of))/,
    /\bnot eat(ing)? (anything )?for (\d+|two|three|four|five|six|seven|a few|several) days\b/,
  ],
}

export const SAFETY_REPLIES: Record<SafetyKind, string> = {
  self_harm:
    "I'm really glad you told me. You don't have to handle this alone. The people at 1771 and SOS 1767 are there any time, day or night. If you're in danger right now, call 995.",
  medical_emergency:
    "Stop exercising now and sit or lie down. Chest pain, fainting, trouble breathing or sudden weakness need a doctor today. If it's severe or not settling, call 995 or go to A&E.",
  disordered_eating:
    "Thank you for telling me. I won't help with that plan: it isn't safe and it won't get you where you want to go. Talking to someone can really help, and the numbers on the Support sheet are a good start.",
}

/** Checked in this order, so a message that matches more than one gets the most urgent reply. */
const ORDER: SafetyKind[] = ['self_harm', 'medical_emergency', 'disordered_eating']

export function screenMessage(text: string): SafetyHit | null {
  const t = text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ')
  for (const kind of ORDER) {
    if (PATTERNS[kind].some((re) => re.test(t))) return { kind, reply: SAFETY_REPLIES[kind] }
  }
  return null
}

/** Stands in for a screened message in any history sent to a model: the raw text never leaves the device. */
export const REDACTED_SAFETY_TURN = '[The user raised a safety concern. The app showed support resources.]'

const SAFETY_WORDS: Record<SafetyKind, string> = {
  self_harm: 'self-harm or feeling unsafe',
  medical_emergency: 'possible emergency symptoms',
  disordered_eating: 'unsafe eating',
}

/** Prompt note while a recent message was screened (PRD §5.4). */
export function safetyNoteLine(kind: SafetyKind): string {
  return `SAFETY NOTE: The user recently raised a concern about ${SAFETY_WORDS[kind]}; the app showed support resources. Be gentle. Do not push training or diet targets in this conversation. If it comes up again, point them to the Support sheet and, if they are in danger, 995.`
}

export function isSafetyKind(v: unknown): v is SafetyKind {
  return v === 'self_harm' || v === 'medical_emergency' || v === 'disordered_eating'
}
