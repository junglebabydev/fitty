// Voice command parser (PRD §7.4). Maps a transcript to a strict, previewable command
// before any data mutation. Pure functions; exercise aliases are local so the parser
// does not depend on the data package.
import type { Exercise, RedFlags, Region } from '../domain/types'
import { addDays, dateOf, isoAt } from '../lib/util'

export type VoiceIntent =
  | 'log_body_metric' | 'log_meal' | 'log_set' | 'start_workout' | 'log_symptom'
  | 'request_substitution' | 'clone_meal' | 'coach_query' | 'unknown'

export interface ParsedCommand {
  intent: VoiceIntent
  payload: Record<string, unknown>
  confidence: number
  preview: string
  needsConfirmation: boolean
}

export interface VoiceContext {
  exercises: Exercise[]
  savedMeals: string[]
  /** ISO timestamp used for "today", meal-type inference and day references. */
  now: string
}

export interface MealCorrection {
  itemIndex: number
  op: 'scale' | 'remove' | 'set_quantity'
  factor?: number
  quantityG?: number
  note: string
}

export interface ParsedMealItem { name: string; qty: number; unit?: string; quantityG?: number }

// --- numbers -------------------------------------------------------------------

const UNIT_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
}
const TENS_WORDS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

const isUnitWord = (w: string) => Object.prototype.hasOwnProperty.call(UNIT_WORDS, w)
const isTensWord = (w: string) => Object.prototype.hasOwnProperty.call(TENS_WORDS, w)
const isNumberWord = (w: string) => isUnitWord(w) || isTensWord(w) || w === 'hundred' || w === 'thousand'

/** "eighty three point four" → "83.4"; "a hundred and five" → "105"; digits pass through. */
export function wordsToDigits(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    const startsNumber = isNumberWord(t) || (t === 'a' && tokens[i + 1] === 'hundred')
    if (!startsNumber) { out.push(t); i++; continue }
    let value = 0
    let seen = false
    let j = i
    while (j < tokens.length) {
      const w = tokens[j]
      if (isUnitWord(w) && !(isTensWord(w) && seen && value % 10 !== 0)) { value += UNIT_WORDS[w]; seen = true; j++ }
      else if (isTensWord(w)) { value += TENS_WORDS[w]; seen = true; j++ }
      else if (w === 'hundred') { value = (value || 1) * 100; seen = true; j++ }
      else if (w === 'thousand') { value = (value || 1) * 1000; seen = true; j++ }
      else if (w === 'and' && seen && j + 1 < tokens.length && (isUnitWord(tokens[j + 1]) || isTensWord(tokens[j + 1]))) { j++ }
      else if (w === 'a' && tokens[j + 1] === 'hundred' && !seen) { j++ }
      else break
    }
    let str = String(value)
    if (tokens[j] === 'point' && j + 1 < tokens.length && isUnitWord(tokens[j + 1]) && UNIT_WORDS[tokens[j + 1]] < 10) {
      j++
      let dec = ''
      while (j < tokens.length && isUnitWord(tokens[j]) && UNIT_WORDS[tokens[j]] < 10) { dec += UNIT_WORDS[tokens[j]]; j++ }
      str += '.' + dec
    }
    out.push(str)
    i = j
  }
  let joined = out.join(' ')
  joined = joined.replace(/\b(\d+) point (\d+)\b/g, '$1.$2')
  joined = joined.replace(/\b(\d+) and a half\b/g, (_, n: string) => String(Number(n) + 0.5))
  joined = joined.replace(/\b(\d+(?:\.\d+)?) ?(?:x|×) ?(\d+)\b/g, '$1 for $2')
  return joined
}

/** Lowercase, strip possessives/punctuation (commas kept as separators), collapse whitespace, convert word numbers. */
export function normalizeTranscript(text: string): string {
  let t = text.toLowerCase()
  t = t.replace(/\blet['’]s\b/g, 'lets')
  t = t.replace(/['’]s\b/g, '').replace(/['’]/g, '')
  t = t.replace(/(\d),(\d)/g, '$1$2')
  t = t.replace(/,/g, ' , ')
  t = t.replace(/[^\w\s,./%-]/g, ' ')
  t = t.replace(/(\d)\/(\d)/g, '$1 / $2')
  t = t.replace(/\s+/g, ' ').trim()
  return wordsToDigits(t)
}

// --- exercise matching ----------------------------------------------------------

/** alias → canonical exercise IDs in priority order. */
export const VOICE_EXERCISE_ALIASES: Record<string, string[]> = {
  'bench press': ['db_bench_press', 'machine_chest_press'],
  'dumbbell bench': ['db_bench_press'],
  'db bench': ['db_bench_press'],
  'flat bench': ['db_bench_press'],
  bench: ['db_bench_press', 'machine_chest_press'],
  'machine chest press': ['machine_chest_press'],
  'chest press': ['machine_chest_press', 'db_bench_press'],
  'incline press': ['incline_db_press'],
  'incline bench': ['incline_db_press'],
  'incline dumbbell': ['incline_db_press'],
  incline: ['incline_db_press'],
  'cable fly': ['cable_fly'],
  fly: ['cable_fly'],
  flyes: ['cable_fly'],
  flys: ['cable_fly'],
  'lat pulldown': ['lat_pulldown'],
  pulldown: ['lat_pulldown'],
  'pull down': ['lat_pulldown'],
  pulldowns: ['lat_pulldown'],
  lats: ['lat_pulldown'],
  'chest supported row': ['chest_supported_db_row'],
  'one arm row': ['one_arm_db_row'],
  'single arm row': ['one_arm_db_row'],
  'dumbbell row': ['one_arm_db_row', 'chest_supported_db_row'],
  'cable row': ['seated_cable_row'],
  'seated row': ['seated_cable_row'],
  row: ['seated_cable_row', 'chest_supported_db_row', 'one_arm_db_row'],
  rows: ['seated_cable_row', 'chest_supported_db_row', 'one_arm_db_row'],
  'machine shoulder press': ['machine_shoulder_press'],
  'shoulder press': ['db_shoulder_press', 'machine_shoulder_press'],
  'overhead press': ['db_shoulder_press', 'machine_shoulder_press'],
  'military press': ['db_shoulder_press'],
  ohp: ['db_shoulder_press', 'machine_shoulder_press'],
  'lateral raise': ['lateral_raise'],
  'lateral raises': ['lateral_raise'],
  'side raise': ['lateral_raise'],
  laterals: ['lateral_raise'],
  'face pull': ['face_pull'],
  'face pulls': ['face_pull'],
  'cable curl': ['cable_curl'],
  'bicep curl': ['db_curl'],
  'biceps curl': ['db_curl'],
  'dumbbell curl': ['db_curl'],
  'hammer curl': ['db_curl'],
  'seated leg curl': ['seated_leg_curl'],
  'lying leg curl': ['lying_leg_curl'],
  'hamstring curl': ['lying_leg_curl', 'seated_leg_curl'],
  'leg curl': ['lying_leg_curl', 'seated_leg_curl'],
  'leg curls': ['lying_leg_curl', 'seated_leg_curl'],
  curl: ['db_curl', 'cable_curl'],
  curls: ['db_curl', 'cable_curl'],
  'triceps pushdown': ['triceps_pushdown'],
  'tricep pushdown': ['triceps_pushdown'],
  pushdown: ['triceps_pushdown'],
  pushdowns: ['triceps_pushdown'],
  'push down': ['triceps_pushdown'],
  'overhead triceps': ['overhead_cable_triceps'],
  'overhead tricep': ['overhead_cable_triceps'],
  'triceps extension': ['overhead_cable_triceps'],
  'overhead extension': ['overhead_cable_triceps'],
  'leg press': ['leg_press'],
  'hack squat': ['hack_squat'],
  'goblet squat': ['goblet_squat'],
  goblet: ['goblet_squat'],
  'split squat': ['db_split_squat'],
  'split squats': ['db_split_squat'],
  lunge: ['db_split_squat'],
  lunges: ['db_split_squat'],
  squat: ['goblet_squat', 'hack_squat', 'leg_press'],
  squats: ['goblet_squat', 'hack_squat', 'leg_press'],
  'hip thrust': ['hip_thrust'],
  'hip thrusts': ['hip_thrust'],
  thrust: ['hip_thrust'],
  thrusts: ['hip_thrust'],
  'glute bridge': ['glute_bridge'],
  bridge: ['glute_bridge'],
  bridges: ['glute_bridge'],
  'romanian deadlift': ['db_rdl'],
  'dumbbell deadlift': ['db_rdl'],
  deadlift: ['db_rdl'],
  deadlifts: ['db_rdl'],
  rdl: ['db_rdl'],
  rdls: ['db_rdl'],
  'leg extension': ['leg_extension'],
  'leg extensions': ['leg_extension'],
  extension: ['leg_extension'],
  extensions: ['leg_extension'],
  'seated calf': ['seated_calf_raise'],
  'seated calf raise': ['seated_calf_raise'],
  'standing calf': ['standing_calf_raise'],
  'calf raise': ['standing_calf_raise', 'seated_calf_raise'],
  'calf raises': ['standing_calf_raise', 'seated_calf_raise'],
  calf: ['standing_calf_raise', 'seated_calf_raise'],
  calves: ['standing_calf_raise', 'seated_calf_raise'],
  'pull through': ['cable_pull_through'],
  'pull throughs': ['cable_pull_through'],
  'hip abduction': ['hip_abduction_machine'],
  abduction: ['hip_abduction_machine'],
  abductions: ['hip_abduction_machine'],
  'dead bug': ['dead_bug'],
  'dead bugs': ['dead_bug'],
  'side plank': ['side_plank'],
  plank: ['plank'],
  planks: ['plank'],
  'pallof press': ['pallof_press'],
  pallof: ['pallof_press'],
  'cable crunch': ['cable_crunch'],
  crunch: ['cable_crunch'],
  crunches: ['cable_crunch'],
  'bird dog': ['bird_dog'],
  'bird dogs': ['bird_dog'],
  'farmers carry': ['farmers_carry'],
  'farmer carry': ['farmers_carry'],
  'farmers walk': ['farmers_carry'],
  carry: ['farmers_carry'],
  carries: ['farmers_carry'],
  'stationary bike': ['stationary_bike'],
  'exercise bike': ['stationary_bike'],
  bike: ['stationary_bike'],
  bicycle: ['stationary_bike'],
  cycling: ['stationary_bike'],
  spin: ['stationary_bike'],
  'incline walk': ['incline_walk'],
  'incline walking': ['incline_walk'],
  treadmill: ['incline_walk'],
  walk: ['incline_walk'],
  walking: ['incline_walk'],
  'easy swim': ['swim_easy'],
  freestyle: ['swim_freestyle'],
  swim: ['swim_freestyle', 'swim_easy'],
  swimming: ['swim_freestyle', 'swim_easy'],
  laps: ['swim_freestyle'],
}

const ALIAS_ENTRIES = Object.entries(VOICE_EXERCISE_ALIASES)
  .map(([alias, ids]) => ({ alias, tokens: alias.split(' '), ids }))
  .sort((a, b) => b.tokens.length - a.tokens.length || b.alias.length - a.alias.length)

function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Optimal string alignment distance (edits + adjacent transpositions), so "pulldwon" ≈ "pulldown". */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => { const row = new Array<number>(n + 1).fill(0); row[0] = i; return row })
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

function tokenEq(a: string, b: string, fuzzy: boolean): boolean {
  if (a === b) return true
  if (singular(a) === singular(b)) return true
  if (fuzzy && a.length >= 5 && b.length >= 5 && levenshtein(singular(a), singular(b)) <= 1) return true
  return false
}

function phraseAt(tokens: string[], phrase: string[], fuzzy: boolean): number {
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let k = 0; k < phrase.length; k++) if (!tokenEq(tokens[i + k], phrase[k], fuzzy)) continue outer
    return i
  }
  return -1
}

export interface ExerciseMatch { exercise: Exercise; alias: string; score: number; index: number }

/** Find the exercise named in the transcript via local aliases, then library names. */
export function matchExercise(text: string, exercises: Exercise[], fuzzy = false): ExerciseMatch | null {
  const tokens = normalizeTranscript(text).split(' ').filter(Boolean)
  const byId = new Map(exercises.map((e) => [e.id, e]))
  // 1. alias table (longest phrase first)
  for (const entry of ALIAS_ENTRIES) {
    const idx = phraseAt(tokens, entry.tokens, false)
    if (idx < 0) continue
    for (const id of entry.ids) {
      const exo = byId.get(id)
      if (exo) return { exercise: exo, alias: entry.alias, score: 1, index: idx }
    }
    const byName = exercises.find((e) => e.name.toLowerCase().includes(entry.alias))
    if (byName) return { exercise: byName, alias: entry.alias, score: 0.8, index: idx }
  }
  // 2. library names: fraction of name tokens present
  let best: ExerciseMatch | null = null
  for (const exo of exercises) {
    const nameTokens = exo.name.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w && !['the', 'a', 'of', 'with', 'and'].includes(w))
    if (!nameTokens.length) continue
    let hits = 0
    let firstIdx = -1
    for (const nt of nameTokens) {
      const idx = tokens.findIndex((t) => tokenEq(t, nt, fuzzy))
      if (idx >= 0) { hits++; if (firstIdx < 0 || idx < firstIdx) firstIdx = idx }
    }
    const score = hits / nameTokens.length
    const enough = nameTokens.length === 1 ? hits === 1 : hits >= 2 && score >= 0.6
    if (enough && (!best || score > best.score)) best = { exercise: exo, alias: exo.name, score: score * 0.9, index: firstIdx }
  }
  // 3. fuzzy alias pass (only when explicitly requested, e.g. with a load/reps signal)
  if (!best && fuzzy) {
    for (const entry of ALIAS_ENTRIES) {
      const idx = phraseAt(tokens, entry.tokens, true)
      if (idx < 0) continue
      for (const id of entry.ids) {
        const exo = byId.get(id)
        if (exo) return { exercise: exo, alias: entry.alias, score: 0.7, index: idx }
      }
    }
  }
  return best
}

// --- regions / symptoms ----------------------------------------------------------

export interface RegionParse { region: Region; group: string; side: 'left' | 'right' | null; regions: Region[] }

export function parseRegion(text: string): RegionParse | null {
  const t = normalizeTranscript(text)
  const regions: Region[] = []
  let first: RegionParse | null = null
  const push = (region: Region, group: string, side: 'left' | 'right' | null) => {
    if (!regions.includes(region)) regions.push(region)
    if (!first) first = { region, group, side, regions }
  }
  const sided = /\b(left|right)\s+(knee|shoulder|hip)s?\b/g
  let m: RegExpExecArray | null
  while ((m = sided.exec(t))) {
    const side = m[1] as 'left' | 'right'
    if (m[2] === 'knee') push(side === 'left' ? 'knee_left' : 'knee_right', 'knee', side)
    else if (m[2] === 'shoulder') push('shoulder', 'shoulder', side)
    else push('hip', 'hip', side)
  }
  if (/\bknees?\b/.test(t) && !regions.some((r) => r.startsWith('knee'))) push('knee_left', 'knee', null)
  if (/\bboth knees\b/.test(t)) { push('knee_left', 'knee', null); push('knee_right', 'knee', null) }
  if (/\b(lower|low)\s+back\b|\blumbar\b/.test(t)) push('back_lower', 'back', null)
  if (/\b(mid|middle)\s+back\b|\bthoracic\b/.test(t)) push('back_mid', 'back', null)
  if (/\bupper\s+back\b/.test(t)) push('back_upper', 'back', null)
  if (/\bback\b/.test(t) && !regions.some((r) => r.startsWith('back'))) push('back_lower', 'back', null)
  if (/\bneck\b|\btraps?\b/.test(t)) push('neck', 'neck', null)
  if (/\bshoulders?\b/.test(t) && !regions.includes('shoulder')) push('shoulder', 'shoulder', null)
  if (/\bhips?\b/.test(t) && !regions.includes('hip')) push('hip', 'hip', null)
  if (/\b(elbow|wrist|ankle|foot|calf|hamstring|quad|groin)s?\b/.test(t) && !regions.length) push('other', 'other', null)
  return first
}

export function parsePainScore(text: string): number | undefined {
  const t = normalizeTranscript(text)
  let m = t.match(/\b(\d+(?:\.\d)?)\s*(?:out of|\/|over)\s*(?:10|ten)\b/)
  if (m) return clampPain(Number(m[1]))
  m = t.match(/\bpain\s*(?:is|of|at|level|score|about|around)?\s*(?:a\s+)?(\d+(?:\.\d)?)\b/)
  if (m) return clampPain(Number(m[1]))
  m = t.match(/\b(\d+(?:\.\d)?)\s*(?:on the pain scale|pain)\b/)
  if (m) return clampPain(Number(m[1]))
  m = t.match(/\b(?:its|it is|about|around|maybe)\s+(?:a\s+)?(\d+(?:\.\d)?)\b(?!\s*(?:kg|kilos?|lbs?|reps?|sets?|minutes?|mins?|seconds?|secs?|out of))/)
  if (m) return clampPain(Number(m[1]))
  if (/\b(severe|really bad|very bad|terrible|awful|badly|a lot|excruciating|sharp)\b/.test(t)) return 6
  if (/\b(moderate|quite|fairly|pretty)\b/.test(t)) return 4
  if (/\b(mild|slight|slightly|a bit|a little|little|bit|niggle|niggly|twinge|tight|stiff|sore|soreness|ache|achy|aching)\b/.test(t)) return 2
  return undefined
}

function clampPain(n: number): number { return Math.max(0, Math.min(10, Math.round(n))) }

export function parseRedFlags(text: string): RedFlags {
  const t = normalizeTranscript(text)
  const flags: RedFlags = {}
  if (/\b(lock(?:s|ed|ing)?|locked up|catches|catching)\b/.test(t)) flags.locking = true
  if (/\b(gave way|giving way|gives way|buckl(?:ed|es|ing)|collaps(?:ed|es|ing)|unstable)\b/.test(t)) flags.givingWay = true
  if (/\b(numb|numbness|tingl(?:e|es|ing|y)|pins and needles)\b/.test(t)) flags.numbness = true
  if (/\b(weak|weakness|cant lift|no strength|gave out)\b/.test(t)) flags.weakness = true
  if (/\b(radiat(?:e|es|ing)|shooting|shoots|down (?:my|the) (?:leg|arm)|sciatica|into (?:my|the) (?:leg|arm|hand|foot))\b/.test(t)) flags.radiating = true
  if (/\b(swollen|swelling|puffy|inflamed)\b/.test(t)) flags.swelling = true
  return flags
}

const SYMPTOM_WORDS = /\b(hurt|hurts|hurting|pain|painful|pains|sore|soreness|ache|aches|aching|achy|tight|tightness|stiff|stiffness|twinge|niggle|niggly|tweak|tweaked|strain|strained|lock|locked|locking|gave way|giving way|buckled|numb|numbness|tingling|weak|weakness|radiating|shooting|swollen|swelling|flared|flare|flaring|bothering|injured|injury|discomfort|uncomfortable)\b/

const REGION_WORDS = /\b(knee|knees|back|neck|shoulder|shoulders|hip|hips|lumbar|traps|elbow|wrist|ankle|hamstring|quad|groin|calf)\b/

// --- day references -----------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_SHORT: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }

/** Resolve "tuesday" / "yesterday" / "last friday" to the most recent matching date on or before today (weekdays strictly before). */
export function resolveDayRef(ref: string, today: string): string | null {
  const r = ref.toLowerCase().replace(/^last\s+/, '').trim()
  if (r === 'today') return today
  if (r === 'yesterday') return addDays(today, -1)
  if (r === 'day before yesterday') return addDays(today, -2)
  let dow = WEEKDAYS.indexOf(r)
  if (dow < 0 && r in WEEKDAY_SHORT) dow = WEEKDAY_SHORT[r]
  if (dow < 0) return null
  const [y, m, d] = today.split('-').map(Number)
  const todayDow = new Date(y, m - 1, d).getDay()
  let back = (todayDow - dow + 7) % 7
  if (back === 0) back = 7
  return addDays(today, -back)
}

const DAY_REF_RE = /\b(yesterday|today|day before yesterday|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/

// --- meals ---------------------------------------------------------------------

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink'

const DRINK_WORDS = /\b(kopi|coffee|latte|cappuccino|americano|espresso|flat white|teh|tea|milo|juice|water|beer|wine|coke|cola|soda|shake|smoothie|milk|soya|soy milk|oat milk)\b/
const FOOD_LEXICON = /\b(egg|eggs|rice|chicken|toast|bread|coffee|kopi|teh|tea|latte|salad|fish|soup|noodle|noodles|mee|mian|prata|thosai|roti|yogurt|yoghurt|whey|shake|protein|banana|apple|oats|oatmeal|milk|beer|wine|snickers|bar|sandwich|burger|pizza|pasta|curry|nasi|lemak|laksa|tofu|tempeh|beef|pork|prawn|prawns|salmon|tuna|cheese|nuts|almonds|water|juice|coke|chocolate|biscuit|biscuits|cake|fruit|vegetable|vegetables|veg|broccoli|spinach|potato|potatoes|kway|teow|hokkien|bak|chor|wanton|briyani|biryani|yong|tau|foo|kueh|chwee|carrot|economy|kaya|sausage|bacon|ham|steak|lamb|duck|dumpling|dumplings|dim sum|bao|porridge|congee|cereal|granola|muesli|smoothie|avocado|peanut|butter|honey|sugar|cream|ice cream|dessert|cookie|cookies|crisps|chips|fries|wrap|kebab|sushi|ramen|pho|udon|bibimbap|tacos|burrito|quinoa|lentils|dal|dhal|beans|hummus|olive|oil|milo|soya|soy|snack|meal|lunch|dinner|breakfast)\b/

const UNIT_RE = /^(cups?|bowls?|plates?|slices?|pieces?|pcs?|scoops?|servings?|portions?|glass(?:es)?|cans?|bottles?|packs?|packets?|handfuls?|tbsp|tablespoons?|tsp|teaspoons?|g|grams?|gm|ml|millilit(?:er|re)s?|oz|ounces?|sticks?|bars?)\b(?:\s+of)?\s+(.+)$/

export function inferMealType(now: string): MealType {
  const h = new Date(now).getHours() + new Date(now).getMinutes() / 60
  if (h >= 5 && h < 10.5) return 'breakfast'
  if (h >= 10.5 && h < 15) return 'lunch'
  if (h >= 17 && h < 21.5) return 'dinner'
  return 'snack'
}

function parseQuantity(item: string): { qty: number; rest: string } {
  let s = item.trim()
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:x\s+)?(.*)$/)
  if (m) return { qty: Number(m[1]), rest: m[2] }
  m = s.match(/^(?:a couple of|a couple|couple of)\s+(.*)$/)
  if (m) return { qty: 2, rest: m[1] }
  m = s.match(/^(?:a few|few)\s+(.*)$/)
  if (m) return { qty: 3, rest: m[1] }
  m = s.match(/^(?:half an?|half a|half of an?|half)\s+(.*)$/)
  if (m) return { qty: 0.5, rest: m[1] }
  m = s.match(/^(?:a|an|one|some|the)\s+(.*)$/)
  if (m) return { qty: 1, rest: m[1] }
  return { qty: 1, rest: s }
}

export function parseMealItems(text: string): ParsedMealItem[] {
  const parts = text.split(/\s*(?:,|;|\band\b|\bplus\b|&)\s*/).map((p) => p.trim()).filter(Boolean)
  const items: ParsedMealItem[] = []
  for (const part of parts) {
    const { qty, rest } = parseQuantity(part)
    let name = rest.trim()
    let unit: string | undefined
    let quantityG: number | undefined
    const um = name.match(UNIT_RE)
    if (um) {
      unit = um[1]
      name = um[2].trim()
      if (/^(g|grams?|gm|ml|millilit)/.test(unit)) { quantityG = qty; }
    }
    name = name.replace(/\b(please|thanks|thank you)\b/g, '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    if (quantityG != null) items.push({ name, qty: 1, unit, quantityG })
    else items.push({ name, qty, ...(unit ? { unit } : {}) })
  }
  return items
}

function stripMealPrefix(t: string): string {
  let s = t
  const lead = /^(?:(?:ok|okay|so|hey|please|coach)\s+)?(?:(?:i|we)\s+)?(?:just\s+)?(?:had|ate|eat|eating|having|have|log|logged|logging|add|adding|record|track|note|put down|drank|took)\b\s*(?:a\s+)?(?:(?:for|at)\s+(?:breakfast|lunch|dinner|snack|supper)\s*)?(?:i\s+had\s+)?/
  s = s.replace(lead, '')
  s = s.replace(/^(?:for|at)\s+(?:breakfast|lunch|dinner|snack|supper)\s*(?:i\s+(?:had|ate)\s+)?/, '')
  s = s.replace(/\b(?:for|as|at)\s+(?:breakfast|lunch|dinner|snack|supper)\b/g, ' ')
  s = s.replace(/\b(?:today|tonight|this morning|this afternoon|this evening|just now|earlier|right now|now)\b/g, ' ')
  s = s.replace(/^\s*(?:my|the)\s+/, '')
  return s.replace(/\s+/g, ' ').trim()
}

function matchSavedMeal(t: string, savedMeals: string[]): string | null {
  const textTokens = t.split(' ').map(singular)
  let best: { name: string; score: number } | null = null
  for (const name of savedMeals) {
    const nameTokens = name.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w && !['the', 'a', 'of', 'with', 'and', 'no', 'extra'].includes(w)).map(singular)
    if (!nameTokens.length) continue
    const hits = nameTokens.filter((nt) => textTokens.includes(nt)).length
    const score = hits / nameTokens.length
    const enough = nameTokens.length === 1 ? hits === 1 : hits >= 2 && score >= 0.6
    if (enough && (!best || score > best.score)) best = { name, score }
  }
  return best?.name ?? null
}

// --- main parser -----------------------------------------------------------------

const LOAD_RE = /\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|lb|lbs|pound|pounds)\b/
const REPS_RE = /\bfor\s+(\d+)\b(?!\s*(?:minutes?|mins?|seconds?|secs?))|\b(\d+)\s*reps?\b|\b(\d+)\s*times\b/
const RIR_RE = /\brir\s*(?:of\s*)?(\d+)\b|\b(\d+)\s*rir\b(?!\s*\d)|\b(\d+)\s*(?:reps?\s+)?(?:in the tank|left in the tank|in reserve)\b/
const RPE_RE = /\brpe\s*(?:of\s*)?(\d+(?:\.\d)?)\b|\b(\d+(?:\.\d)?)\s*rpe\b(?!\s*\d)/
const SETS_RE = /\b(\d+)\s*sets?\b/
const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/

export const LBS_TO_KG = 0.45359237

function fmtQty(q: number): string { return Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100) }

export function parseVoiceCommand(transcript: string, ctx: VoiceContext): ParsedCommand {
  const raw = transcript.trim()
  const t = normalizeTranscript(raw)
  const today = dateOf(ctx.now)
  if (!t) return unknown(raw)

  // 1. start / finish workout
  if (/\b(start|begin|kick off|launch|open|lets (?:do|start|go|train|lift))\b.*\b(workout|session|training|lifting|gym|todays)\b/.test(t) || /^(?:lets\s+)?(?:train|lift|work ?out)\b/.test(t)) {
    return { intent: 'start_workout', payload: { action: 'start' }, confidence: 0.95, preview: "Start today's workout", needsConfirmation: false }
  }
  if (/\b(finish|end|complete|done with|wrap up)\b.*\b(workout|session|training)\b/.test(t)) {
    return { intent: 'start_workout', payload: { action: 'finish' }, confidence: 0.9, preview: 'Finish the current workout', needsConfirmation: true }
  }

  // 2. coach query
  if (/^(how|what|why|when|where|which|should|could|can|am i|is my|are my|do i|did i|have i|whats|hows|tell me|give me|show me|explain|any)\b/.test(t) || raw.includes('?')) {
    return { intent: 'coach_query', payload: { question: raw }, confidence: 0.85, preview: `Ask coach: “${raw.replace(/\?+$/, '')}?”`, needsConfirmation: false }
  }

  // 3. substitution
  if (/\b(swap|substitute|substitution|replace|switch|alternative|instead of|easier on|something easier|different exercise|change)\b/.test(t)) {
    const exm = matchExercise(t, ctx.exercises, true)
    const reg = parseRegion(t)
    const payload: Record<string, unknown> = {
      exerciseId: exm?.exercise.id ?? null,
      exerciseName: exm?.exercise.name ?? null,
      region: reg?.region ?? null,
      regionGroup: reg?.group ?? null,
      regions: reg?.regions ?? [],
      sideUnspecified: reg ? reg.side == null && reg.group === 'knee' : false,
      reason: raw,
    }
    const preview = exm
      ? `Swap ${exm.exercise.name} for something ${reg ? `easier on the ${reg.group}` : 'easier'}`
      : `Swap which exercise?${reg ? ` (${reg.group})` : ''}`
    return { intent: 'request_substitution', payload, confidence: exm ? 0.85 : 0.4, preview, needsConfirmation: true }
  }

  // 4. symptom
  if (SYMPTOM_WORDS.test(t) && REGION_WORDS.test(t)) {
    const reg = parseRegion(t)
    if (reg) {
      const painScore = parsePainScore(t)
      const redFlags = parseRedFlags(t)
      const flagNames = Object.keys(redFlags)
      const label = regionText(reg)
      const payload: Record<string, unknown> = {
        region: reg.region,
        regions: reg.regions,
        side: reg.side,
        sideUnspecified: reg.side == null && reg.group === 'knee',
        ...(painScore != null ? { painScore } : {}),
        redFlags,
        notes: raw,
        context: 'voice',
        date: today,
      }
      const preview = `Log ${label} symptom${painScore != null ? ` — pain ${painScore}/10` : ' — pain score?'}${flagNames.length ? ` (${flagNames.join(', ')})` : ''}`
      return { intent: 'log_symptom', payload, confidence: painScore != null ? 0.85 : 0.7, preview, needsConfirmation: true }
    }
  }

  // 5. set
  const loadM = t.match(LOAD_RE)
  const repsM = t.match(REPS_RE)
  const durM = t.match(DURATION_RE)
  const setSignal = !!(loadM || repsM || durM)
  const hasBodyWord = /\b(weight|weigh|weighed|weighing|waist|body ?fat|scale)\b/.test(t) && !/\bbody ?weight\s+\w+/.test(t)
  if (setSignal && !(hasBodyWord && !repsM)) {
    const exm = matchExercise(t, ctx.exercises, true)
    if (exm) return buildSet(raw, t, exm, loadM, repsM, durM)
  }

  // 6. body metric
  if (hasBodyWord) {
    const bm = parseBodyMetric(t, today, ctx.now)
    if (bm) return bm
  }

  // 7. clone meal
  const mealWord = t.match(/\b(breakfast|lunch|dinner|snack|supper)\b/)
  const dayRef = t.match(DAY_REF_RE)
  const saved = matchSavedMeal(t, ctx.savedMeals)
  if (/\b(same|repeat|copy|again|clone|like|usual)\b/.test(t) && (mealWord || saved || dayRef)) {
    const mealType = (mealWord?.[1] === 'supper' ? 'dinner' : mealWord?.[1]) as MealType | undefined
    const ref = dayRef?.[1] ?? null
    const date = ref ? resolveDayRef(ref, today) : null
    const payload: Record<string, unknown> = {
      mealType: mealType ?? inferMealType(ctx.now),
      dayRef: ref ? ref.replace(/^last\s+/, '') : saved ? null : 'yesterday',
      date: date ?? (saved ? null : addDays(today, -1)),
      savedMealName: saved,
    }
    const preview = saved
      ? `Log saved meal “${saved}”`
      : `Log the same ${mealType ?? 'meal'} as ${ref ?? 'yesterday'}${date ? ` (${date})` : ''}`
    return { intent: 'clone_meal', payload, confidence: saved || date ? 0.85 : 0.6, preview, needsConfirmation: true }
  }
  if (saved && !/\b\d+\b/.test(t)) {
    const mealType = (mealWord?.[1] === 'supper' ? 'dinner' : mealWord?.[1]) as MealType | undefined
    return {
      intent: 'clone_meal',
      payload: { mealType: mealType ?? inferMealType(ctx.now), dayRef: null, date: null, savedMealName: saved },
      confidence: 0.8,
      preview: `Log saved meal “${saved}”`,
      needsConfirmation: true,
    }
  }

  // 8. meal
  const mealTypeWord = mealWord?.[1]
  const body = stripMealPrefix(t)
  const mealVerb = /\b(had|ate|eat|eating|having|log|logged|add|drank)\b/.test(t)
  const foodish = FOOD_LEXICON.test(body) || DRINK_WORDS.test(body)
  const tokens = body.split(' ').filter(Boolean)
  const looksLikeMeal = body.length > 0 && (mealVerb || foodish || !!mealTypeWord || /\d/.test(body) || (tokens.length <= 4 && !SYMPTOM_WORDS.test(t)))
  if (looksLikeMeal) {
    const items = parseMealItems(body)
    if (items.length) {
      const onlyDrinks = items.every((i) => DRINK_WORDS.test(i.name))
      const mealType: MealType = mealTypeWord ? ((mealTypeWord === 'supper' ? 'dinner' : mealTypeWord) as MealType) : onlyDrinks ? 'drink' : inferMealType(ctx.now)
      const confidence = foodish || mealVerb || mealTypeWord ? 0.75 : 0.5
      const preview = `Log ${mealType}: ${items.map((i) => `${i.quantityG != null ? `${i.quantityG} g` : fmtQty(i.qty)}${i.unit && i.quantityG == null ? ` ${i.unit}` : ' ×'} ${i.name}`).join(', ')}`
      return { intent: 'log_meal', payload: { items, mealType, notes: raw, ts: ctx.now }, confidence, preview, needsConfirmation: true }
    }
  }

  // 9. exercise with no numbers → incomplete set
  const exm = matchExercise(t, ctx.exercises, false)
  if (exm) {
    return {
      intent: 'log_set',
      payload: { exerciseId: exm.exercise.id, exerciseName: exm.exercise.name, loadKg: null, reps: null, rir: null },
      confidence: 0.35,
      preview: `Log a set of ${exm.exercise.name} — how much and how many reps?`,
      needsConfirmation: true,
    }
  }
  return unknown(raw)
}

function unknown(raw: string): ParsedCommand {
  return {
    intent: 'unknown',
    payload: { transcript: raw },
    confidence: 0,
    preview: "Didn't catch that — try “Weight today 83.4 kilos”, “Three eggs and a latte” or “Bench 70 kilos for eight”.",
    needsConfirmation: true,
  }
}

function regionText(reg: RegionParse): string {
  if (reg.group === 'knee' && reg.side == null) return 'knee (side not specified)'
  if (reg.side && (reg.group === 'shoulder' || reg.group === 'hip')) return `${reg.side} ${reg.group}`
  switch (reg.region) {
    case 'knee_left': return 'left knee'
    case 'knee_right': return 'right knee'
    case 'back_lower': return 'lower back'
    case 'back_mid': return 'mid back'
    case 'back_upper': return 'upper back'
    default: return reg.region
  }
}

function buildSet(raw: string, t: string, exm: ExerciseMatch, loadM: RegExpMatchArray | null, repsM: RegExpMatchArray | null, durM: RegExpMatchArray | null): ParsedCommand {
  let loadKg: number | null = null
  let loadUnit: 'kg' | 'lbs' = 'kg'
  if (loadM) {
    const n = Number(loadM[1])
    if (/^(lb|lbs|pound|pounds)$/.test(loadM[2])) { loadUnit = 'lbs'; loadKg = Math.round(n * LBS_TO_KG * 2) / 2 }
    else loadKg = n
  } else {
    const at = t.match(/\b(?:at|with|@)\s+(\d+(?:\.\d+)?)\b(?!\s*(?:reps?|rir|rpe|seconds?|secs?|minutes?|mins?))/)
    const before = t.match(/\b(\d+(?:\.\d+)?)\s+for\s+\d+\b/)
    if (at) loadKg = Number(at[1])
    else if (before) loadKg = Number(before[1])
  }
  if (/\bbody ?weight\b/.test(t)) loadKg = null
  let reps: number | null = repsM ? Number(repsM[1] ?? repsM[2] ?? repsM[3]) : null
  let durationSec: number | null = null
  if (durM) {
    const n = Number(durM[1])
    durationSec = /^min/.test(durM[2]) ? Math.round(n * 60) : Math.round(n)
  }
  if (reps == null && durationSec == null) {
    const bare = t.match(/\b(\d+)\s*$/)
    if (bare && loadKg != null && Number(bare[1]) !== loadKg) reps = Number(bare[1])
  }
  const rirM = t.match(RIR_RE)
  const rir = rirM ? Number(rirM[1] ?? rirM[2] ?? rirM[3]) : null
  const rpeM = t.match(RPE_RE)
  const rpe = rpeM ? Number(rpeM[1] ?? rpeM[2]) : null
  const setsM = t.match(SETS_RE)
  const sets = setsM ? Number(setsM[1]) : 1
  const painFlag = SYMPTOM_WORDS.test(t)
  const timed = exm.exercise.timed || (durationSec != null && reps == null)
  const complete = timed ? durationSec != null : reps != null
  const payload: Record<string, unknown> = {
    exerciseId: exm.exercise.id,
    exerciseName: exm.exercise.name,
    loadKg,
    reps,
    rir,
    rpe,
    durationSec,
    sets,
    painFlag,
    ...(loadUnit === 'lbs' ? { loadUnit: 'lbs', originalLoad: Number(loadM![1]) } : {}),
  }
  const bits: string[] = []
  if (loadKg != null) bits.push(`${loadKg} kg`)
  if (reps != null) bits.push(`× ${reps}`)
  if (durationSec != null) bits.push(durationSec >= 120 && durationSec % 60 === 0 ? `${durationSec / 60} min` : `${durationSec} s`)
  if (rir != null) bits.push(`RIR ${rir}`)
  if (rpe != null) bits.push(`RPE ${rpe}`)
  if (sets > 1) bits.push(`(${sets} sets)`)
  const preview = `Log set: ${exm.exercise.name} ${bits.join(' ')}`.trim() + (complete ? '' : ' — reps?')
  const confidence = Math.min(0.95, (complete ? 0.8 : 0.5) + (exm.score >= 1 ? 0.12 : 0) + (rir != null ? 0.03 : 0))
  return { intent: 'log_set', payload, confidence, preview, needsConfirmation: confidence < 0.85 || painFlag }
}

function parseBodyMetric(t: string, today: string, now: string): ParsedCommand | null {
  const date = /\byesterday\b/.test(t) ? addDays(today, -1) : today
  const ts = date === today ? now : isoAt(date, 8)
  if (/\bwaist\b/.test(t)) {
    const m = t.match(/\b(\d+(?:\.\d+)?)\s*(cm|centimet(?:er|re)s?|inch|inches|in)?\b/)
    if (!m) return null
    let value = Number(m[1])
    let unit: 'cm' | 'in' = 'cm'
    if (m[2] && /^in/.test(m[2])) unit = 'in'
    else if (!m[2] && value < 60) unit = 'in'
    const original = value
    if (unit === 'in') value = Math.round(value * 2.54 * 10) / 10
    return {
      intent: 'log_body_metric',
      payload: { type: 'waist', value, unit: 'cm', date, ts, source: 'voice', ...(unit === 'in' ? { originalValue: original, originalUnit: 'in' } : {}) },
      confidence: m[2] ? 0.92 : 0.75,
      preview: `Log waist ${value} cm${unit === 'in' ? ` (${original} in)` : ''} — ${date === today ? 'today' : date}`,
      needsConfirmation: !m[2],
    }
  }
  if (/\bbody ?fat\b/.test(t)) {
    const m = t.match(/\b(\d+(?:\.\d+)?)\s*(%|percent)?/)
    if (!m) return null
    const value = Number(m[1])
    return {
      intent: 'log_body_metric',
      payload: { type: 'bodyfat', value, unit: '%', date, ts, source: 'voice' },
      confidence: 0.85,
      preview: `Log body fat ${value}% — ${date === today ? 'today' : date}`,
      needsConfirmation: false,
    }
  }
  const m = t.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|kilograms|lb|lbs|pound|pounds)?\b/)
  if (!m) return null
  let value = Number(m[1])
  const unitWord = m[2]
  let unit: 'kg' | 'lbs' = unitWord && /^(lb|lbs|pound|pounds)$/.test(unitWord) ? 'lbs' : 'kg'
  if (!unitWord && value > 140 && value < 450) unit = 'lbs'
  const original = value
  if (unit === 'lbs') value = Math.round(value * LBS_TO_KG * 10) / 10
  if (value < 25 || value > 300) return null
  return {
    intent: 'log_body_metric',
    payload: { type: 'weight', value, unit: 'kg', date, ts, source: 'voice', ...(unit === 'lbs' ? { originalValue: original, originalUnit: 'lbs' } : {}), ...(unitWord ? {} : { unitAssumed: true }) },
    confidence: unitWord ? 0.92 : 0.8,
    preview: `Log weight ${value} kg${unit === 'lbs' ? ` (${original} lb)` : ''} — ${date === today ? 'today' : date}`,
    needsConfirmation: !unitWord,
  }
}

// --- meal corrections ----------------------------------------------------------

const CORRECTION_STOP = new Set(['the', 'a', 'an', 'of', 'my', 'that', 'this', 'it', 'was', 'is', 'were', 'on', 'in', 'with', 'to', 'just', 'only', 'some', 'bit', 'little', 'portion', 'serving', 'piece', 'pieces', 'much', 'lot', 'one', 'and', 'please'])
const OP_WORDS = new Set(['half', 'halve', 'halved', 'double', 'doubled', 'twice', 'triple', 'quarter', 'third', 'no', 'without', 'remove', 'removed', 'delete', 'drop', 'skip', 'minus', 'take', 'out', 'didnt', 'did', 'not', 'have', 'dont', 'count', 'scratch', 'forget', 'less', 'smaller', 'fewer', 'more', 'extra', 'bigger', 'larger', 'times', 'x', 'grams', 'gram', 'g', 'ml', 'make', 'set', 'change', 'instead', 'actually', 'about', 'around', 'roughly', 'add'])

function contentTokens(text: string): string[] {
  return text.split(' ').filter((w) => w && !CORRECTION_STOP.has(w) && !OP_WORDS.has(w) && !/^\d/.test(w)).map(singular)
}

function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  return false
}

export function parseMealCorrection(transcript: string, items: { foodName: string; quantityG: number }[]): MealCorrection[] {
  const t = normalizeTranscript(transcript)
  const clauses = t.split(/\s*(?:,|;|\band\b|\bthen\b|\balso\b|\bbut\b)\s*/).map((c) => c.trim()).filter(Boolean)
  const itemTokens = items.map((it) => it.foodName.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w && !CORRECTION_STOP.has(w)).map(singular))
  const out: MealCorrection[] = []
  const usedIdx = new Set<number>()

  for (const clause of clauses) {
    let op: MealCorrection['op'] | null = null
    let factor: number | undefined
    let quantityG: number | undefined

    const grams = clause.match(/\b(\d+(?:\.\d+)?)\s*(g|grams?|gm|ml)\b/)
    if (grams) { op = 'set_quantity'; quantityG = Number(grams[1]) }
    else if (/\b(no|without|remove|delete|drop|skip|minus|take out|didnt (?:have|eat)|did not (?:have|eat)|dont count|scratch|forget|not the|wasnt any|there was no)\b/.test(clause)) op = 'remove'
    else {
      const times = clause.match(/\b(\d+(?:\.\d+)?)\s*(?:x|times)\b|\bx\s*(\d+(?:\.\d+)?)\b/)
      if (/\b(half|halve|halved)\b/.test(clause)) factor = 0.5
      else if (/\b(a third|third of|one third)\b/.test(clause)) factor = 1 / 3
      else if (/\b(quarter|a quarter|one quarter)\b/.test(clause)) factor = 0.25
      else if (/\b(double|doubled|twice|two times)\b/.test(clause)) factor = 2
      else if (/\b(triple|tripled|three times)\b/.test(clause)) factor = 3
      else if (times) factor = Number(times[1] ?? times[2])
      else if (/\b(a bit less|little less|bit less|less|smaller|fewer|not that much|not so much)\b/.test(clause)) factor = 0.75
      else if (/\b(a bit more|little more|bit more|more|extra|bigger|larger|big)\b/.test(clause)) factor = 1.25
      if (factor != null) op = 'scale'
    }
    if (!op) continue

    const ct = contentTokens(clause)
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < items.length; i++) {
      const toks = itemTokens[i]
      const hits = ct.filter((w) => toks.some((iw) => tokenSimilar(w, iw))).length
      if (!hits) continue
      const head = toks.length ? toks[toks.length - 1] : ''
      const headHit = ct.some((w) => tokenSimilar(w, head)) ? 0.25 : 0 // "the chicken" → "Roast chicken" over "Chicken skin"
      const score = hits + hits / Math.max(1, toks.length) + headHit - (usedIdx.has(i) ? 0.01 : 0)
      if (score > bestScore) { bestScore = score; bestIdx = i }
    }
    if (bestIdx < 0 && ct.length === 0 && items.length === 1) bestIdx = 0
    if (bestIdx < 0) continue
    usedIdx.add(bestIdx)
    const item = items[bestIdx]
    if (op === 'remove') out.push({ itemIndex: bestIdx, op, note: `Removed ${item.foodName}` })
    else if (op === 'set_quantity') out.push({ itemIndex: bestIdx, op, quantityG, note: `${item.foodName}: ${item.quantityG} g → ${quantityG} g` })
    else {
      const f = factor as number
      const newG = Math.round(item.quantityG * f)
      const verb = f === 0.5 ? 'Halved' : f === 2 ? 'Doubled' : f < 1 ? 'Reduced' : 'Increased'
      out.push({ itemIndex: bestIdx, op, factor: Math.round(f * 100) / 100, note: `${verb} ${item.foodName} (${item.quantityG} g → ${newG} g)` })
    }
  }
  return out
}
