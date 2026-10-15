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
    /\b(elephant|someone|somebody|something)( is)?( sitting| standing)? on (my|the) chest\b/,
    /(?<!gave me a )\bheart attack\b/,
    /\bangina\b/,
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

/**
 * Chest symptoms with words between, or in/on the chest: "chest feels tight", "chest's really tight", "chest getting
 * tighter", "chest really hurts", "pressure in chest" (and the "chets" typo). Found by the coach eval and a review on
 * 2026-10-15. Sore is left out (DOMS); so are exercise nouns ("chest press hurt"), "crushing it", "chest heavy day", a
 * shirt's "the chest" and "tight in this shirt".
 */
const CHEST_PHRASES: RegExp[] = [
    /(?<!\bthe )\bch(?:est|ets)(?:'s)?\s*(?:(?:is|was|feels?|feeling|felt|gets?|getting|got|went|has|had|been|keeps?|kept|started|starting|to|still|really|so+|very|v|quite|a bit|a little|kind of|kinda|super|extremely|pretty|like)\s+){0,4}(tight|tighter|tightening|heavy|heavier|crushing(?!\s+(it|them|this|that|my|the|every|all|prs?|pbs?)\b)|painful|pains?|hurts?|hurting|squeezed|discomfort)\b(?! (day|session|workout))(?!\s+(in|by|from|with|under) (this|that|these|my|the|a|an) (\w+ )?(shirt|t-shirt|top|tee|tank|vest|jacket|hoodie|bra|strap|monitor)s?\b)/,
    /\b(pains?|pressure|tightness|heaviness|(?<!\b(?:on|the) )squeezing|crushing|discomfort|a crushing feeling|a tight feeling|a heavy feeling|heavy feeling|tight feeling) (in|on|across|around|round) ((my|the) )?ch(?:est|ets)\b/,
]

/** A muscle reason the user gives themselves: the day after, a stretch, the pump, the weights. Not "during" or "while". */
const MUSCLE_REASON = /\b(doms|pump(ed)?|in a good way|stretch\w*|foam roll\w*|massage\w*|mobility|posture|desk|to the touch|press on it|deload|\d+ ?(kg|lbs?)|\d+x\d+|p[br]s?|(from|after|since) (yesterday|last night|chest day|benching|all the|the (pec |doorway )?stretch|i started|my first)|from (the )?(bench|push[- ]?ups?|dips|fl(y|ies|yes)))\b/

/** Anything beyond the chest that points at the heart or the brain keeps the reply, whatever reason is given. */
const WARNING_SIGN = /\b(left arm|arms? (is |are |feels? |went |going )?(numb|tingl\w*|weak)|jaw|dizz\w*|light-?headed|sweat\w*|clammy|nause\w*|vomit\w*|sick|short of breath|breathless|can'?t breathe|faint\w*|pass(ing)? out|racing|pounding|irregular|never (had|happened|felt) (that|this|like this)( before)?)\b/

/** A chest phrase counts unless the user names a muscle reason and nothing else points at the heart. */
function chestWarning(t: string): boolean {
  return CHEST_PHRASES.some((re) => re.test(t)) && (!MUSCLE_REASON.test(t) || WARNING_SIGN.test(t))
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
    if (PATTERNS[kind].some((re) => re.test(t)) || (kind === 'medical_emergency' && chestWarning(t))) return { kind, reply: SAFETY_REPLIES[kind] }
  }
  return null
}

/** Stands in for a screened message in any history sent to a model: the raw text never leaves the device. */
export const REDACTED_SAFETY_TURN = '[The user raised a safety concern. The app showed support resources.]'

export function isSafetyKind(v: unknown): v is SafetyKind {
  return v === 'self_harm' || v === 'medical_emergency' || v === 'disordered_eating'
}
