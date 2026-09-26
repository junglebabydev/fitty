// Reply check, layer L3 in docs/PRD_COACH_CHAT.md §7. Part of the coach (it runs where the model is called), so a
// change to what counts as unsafe ships with a coach deploy, not an app release.
export type ReplyCheck = { ok: true; text: string } | { ok: false; reason: 'empty' | 'shaming' | 'dose' | 'diagnosis' | 'invented_number' }

const SHAMING = /\b(lazy|pathetic|shameful|no excuses?|you failed|disappointed in you|should be ashamed)\b/i

const DRUG = '(creatine|caffeine|ibuprofen|paracetamol|panadol|aspirin|melatonin|vitamin|magnesium|zinc|iron|omega|fish oil|steroids?|testosterone|sarms?|medication|medicine|tablets?|pills?|supplements?|dose|dosage)'
const DOSE_ALWAYS = /\b\d+(\.\d+)?\s?(mg|mcg|µg|iu)\b/i
const DOSE_WITH_DRUG = [
  new RegExp(`\\b\\d+(\\.\\d+)?\\s?ml\\b[^.]*\\b${DRUG}\\b|\\b${DRUG}\\b[^.]*\\b\\d+(\\.\\d+)?\\s?ml\\b`, 'i'),
  new RegExp(`\\b\\d+(\\.\\d+)?\\s?(g|grams?)\\s+(of\\s+)?${DRUG}\\b`, 'i'),
]

const CONDITION =
  '(tendinitis|tendonitis|tendinopathy|bursitis|arthritis|osteoarthritis|meniscus|acl|mcl|ligament|tear|herniat\\w*|slipped disc|bulging disc|sciatica|fracture|sprain|impingement|rotator cuff|plantar fasciitis|shin splints|depression|anxiety|adhd|eating disorder|anorexia|bulimia|diabetes|prediabetes|hypertension|apnoea|apnea|insomnia|thyroid|infection|condition)'
const DIAGNOSIS = [
  new RegExp(`\\byou('ve| have)? (probably |likely |might |may |could |must )?(have |got )?(a |an |some )?(torn |mild |early )?${CONDITION}\\b`, 'i'),
  new RegExp(`\\b(sounds|looks) like (a |an |some )?(torn |mild |early )?${CONDITION}\\b`, 'i'),
  new RegExp(`\\b(probably|likely|classic) (a |an )?${CONDITION}\\b`, 'i'),
]

const MARKDOWN_LINE = /^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+|>\s+)/gm
const MARKDOWN_INLINE = /(\*\*|__|`+|~~)/g
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu

const NUMBER_CLAIMS = [
  /(\d[\d,]*(?:\.\d+)?)\s*(?:kcal|cal|calories)\b/gi,
  /(\d[\d,]*(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?protein\b/gi,
]
const toNum = (s: string) => Number(s.replace(/,/g, ''))

/**
 * Checks a model reply against what the model was given (`received`: the system prompt, later also tool results).
 * Cleans up markdown and emoji; rejects shaming, drug doses, diagnoses and calorie or protein numbers that were not
 * in what it received (±1, numbers under 10 ignored). A rejected reply is never shown and never becomes a proposal.
 */
export function checkReply(reply: string, received: string): ReplyCheck {
  const text = reply.replace(MARKDOWN_LINE, '').replace(MARKDOWN_INLINE, '').replace(EMOJI, '').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) return { ok: false, reason: 'empty' }
  if (SHAMING.test(text)) return { ok: false, reason: 'shaming' }
  if (DOSE_ALWAYS.test(text) || DOSE_WITH_DRUG.some((re) => re.test(text))) return { ok: false, reason: 'dose' }
  if (DIAGNOSIS.some((re) => re.test(text))) return { ok: false, reason: 'diagnosis' }
  const known = (received.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(toNum)
  for (const re of NUMBER_CLAIMS) {
    for (const m of text.matchAll(re)) {
      const v = toNum(m[1])
      if (v >= 10 && !known.some((k) => Math.abs(k - v) <= 1)) return { ok: false, reason: 'invented_number' }
    }
  }
  return { ok: true, text }
}
