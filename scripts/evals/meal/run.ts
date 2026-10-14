// Meal-photo accuracy (manual). Sends meal photos through the app's REAL meal prompt, user prompt and schema to the
// model production uses (Gemini 3.8 Flash, called the way the app Worker calls it), parses the reply with the app's own
// parser, and scores the totals against known nutrition. No LLM judge: every number is arithmetic on the parsed reply.
//
//   npx vite-node scripts/evals/meal/run.ts                       # every set that has data
//   npx vite-node scripts/evals/meal/run.ts --set n5k --limit 12  # a quick look
//
// Sets: n5k (Nutrition5k overhead photos, measured), own (the owner's phone photos in .evals/own, labelled by hand),
// neg (not meals: drawings, and very dark or blurred copies of real plates). Real, paid calls: never part of
// `npm test`. See ../README.md.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { MEAL_RECOGNITION_SCHEMA, MEAL_SYSTEM_PROMPT, mealUserPrompt, parseMealRecognition } from '../../../src/ai/anthropic'
import type { MealRecognition } from '../../../src/ai/types'
import { JPEG_QUALITY, MAX_EDGE } from '../../../src/native/camera'
import { DEFAULT_GEMINI_MODEL, geminiJson } from '../../../worker/gemini'
import { DEFAULT_OPENROUTER_MODEL, openRouterJson } from '../../../worker/openrouter'
import type { JsonRequest } from '../../../worker/guard'
import { drawnEggPng, notFoodPng } from '../../ai-live/fixtures'
import { evalDir, evalKey, median, pool, stamp } from '../env'
import { DISHES, N5K_IMAGE_BASE } from './nutrition5k'

// --- arguments and upstream ------------------------------------------------------------------------------------

const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const SETS = (arg('set') ?? 'n5k,own,neg').split(',')
const LIMIT = Number(arg('limit') ?? DISHES.length)
const CONCURRENCY = Number(arg('concurrency') ?? 3)

const GEMINI_KEY = evalKey('GEMINI_API_KEY')
const OPENROUTER_KEY = evalKey('OPENROUTER_API_KEY')
// Production calls Gemini directly from the app Worker (no OPENROUTER_API_KEY there, so pickProvider picks 'gemini').
// Through OpenRouter it is the same model with a different request shape: a proxy, and the report says so.
const VIA = (arg('via') ?? (GEMINI_KEY ? 'gemini' : 'openrouter')) as 'gemini' | 'openrouter'
const MODEL = arg('model') ?? (VIA === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENROUTER_MODEL)
if (VIA === 'gemini' && !GEMINI_KEY) throw new Error('Set GEMINI_API_KEY in .evals/.env (or use --via openrouter).')
if (VIA === 'openrouter' && !OPENROUTER_KEY) throw new Error('Set GEMINI_API_KEY or OPENROUTER_API_KEY in .evals/.env.')

async function recognise(jpeg: Buffer): Promise<{ rec: MealRecognition; ms: number }> {
  const req: JsonRequest = {
    system: MEAL_SYSTEM_PROMPT,
    prompt: mealUserPrompt({}),
    schema: MEAL_RECOGNITION_SCHEMA,
    attachments: [{ base64: jpeg.toString('base64'), mediaType: 'image/jpeg', name: 'meal' }],
  }
  const started = Date.now()
  const reply = VIA === 'gemini' ? await geminiJson(GEMINI_KEY, MODEL, req) : await openRouterJson(OPENROUTER_KEY, MODEL, 'deny', req)
  return { rec: parseMealRecognition(reply.text), ms: Date.now() - started }
}

/** What the app does to every photo, camera or library (src/native/camera.ts downscaleImage): ≤1280 px, JPEG 85. */
function asTheAppSendsIt(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: Math.round(JPEG_QUALITY * 100) }).toBuffer()
}

// --- cases ------------------------------------------------------------------------------------------------------

interface Truth { kcal: number; protein?: number; carbs?: number; fat?: number; g?: number }
interface Case { set: 'n5k' | 'own' | 'neg'; id: string; label: string; load: () => Promise<Buffer>; truth?: Truth }

async function n5kImage(id: string): Promise<Buffer> {
  const file = join(evalDir('nutrition5k'), `${id}.png`)
  if (!existsSync(file)) {
    const res = await fetch(`${N5K_IMAGE_BASE}/${id}/rgb.png`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Nutrition5k ${id}: HTTP ${res.status}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(file)
}

const n5kCases = (): Case[] => DISHES.slice(0, LIMIT).map((d) => ({
  set: 'n5k', id: d.id, label: d.ingredients, load: () => n5kImage(d.id),
  truth: { kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat, g: d.g },
}))

/**
 * The owner's own photos: .evals/own/labels.csv with the header file,name,kcal,protein_g,carbs_g,fat_g,grams. Only
 * file and kcal are required; leave the rest blank when unknown. Photos sit next to it.
 */
function ownCases(): Case[] {
  const dir = evalDir('own')
  const csv = join(dir, 'labels.csv')
  if (!existsSync(csv)) return []
  const [head, ...rows] = readFileSync(csv, 'utf8').trim().split(/\r?\n/)
  const cols = head.split(',').map((c) => c.trim())
  const n = (v: string | undefined) => (v && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
  return rows.filter((r) => r.trim()).map((r) => {
    const v = Object.fromEntries(r.split(',').map((x, i) => [cols[i], x.trim()]))
    const file = join(dir, v.file)
    return {
      set: 'own' as const, id: v.file, label: v.name || v.file, load: async () => readFileSync(file),
      truth: { kcal: n(v.kcal) ?? NaN, protein: n(v.protein_g), carbs: n(v.carbs_g), fat: n(v.fat_g), g: n(v.grams) },
    }
  }).filter((c) => readdirSync(dir).includes(c.id) && Number.isFinite(c.truth.kcal))
}

/** Not meal photos: the prompt says return no items, or items at confidence 0.3 or less. */
const negCases = (): Case[] => [
  { set: 'neg', id: 'not-food', label: 'a drawing that is not food', load: async () => notFoodPng() },
  { set: 'neg', id: 'drawn-egg', label: 'a drawing of an egg', load: async () => drawnEggPng() },
  ...DISHES.slice(0, 3).flatMap((d): Case[] => [
    { set: 'neg', id: `${d.id}-dark`, label: `${d.ingredients}, nearly black`, load: async () => sharp(await n5kImage(d.id)).modulate({ brightness: 0.05 }).png().toBuffer() },
    { set: 'neg', id: `${d.id}-blur`, label: `${d.ingredients}, blurred out`, load: async () => sharp(await n5kImage(d.id)).blur(40).png().toBuffer() },
  ]),
]

// --- scoring ----------------------------------------------------------------------------------------------------

interface Row {
  set: Case['set']; id: string; label: string; ms: number; error?: string
  truth?: Truth; est?: { kcal: number; protein: number; carbs: number; fat: number; g: number }
  items?: string[]; confidence?: number; notes?: string; negPass?: boolean
}

function totals(rec: MealRecognition) {
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'estimated_quantity_g') => rec.items.reduce((a, it) => a + it[k], 0)
  return { kcal: sum('kcal'), protein: sum('protein_g'), carbs: sum('carbs_g'), fat: sum('fat_g'), g: sum('estimated_quantity_g') }
}

const negPassed = (rec: MealRecognition) => rec.items.length === 0 || rec.items.every((it) => it.confidence_0_1 <= 0.3)

async function runCase(c: Case): Promise<Row> {
  try {
    const { rec, ms } = await recognise(await asTheAppSendsIt(await c.load()))
    const base = { set: c.set, id: c.id, label: c.label, ms, items: rec.items.map((it) => it.food_name), confidence: rec.overall_confidence, notes: rec.notes }
    return c.set === 'neg' ? { ...base, negPass: negPassed(rec) } : { ...base, truth: c.truth, est: totals(rec) }
  } catch (e) {
    return { set: c.set, id: c.id, label: c.label, ms: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Spearman rank correlation; ties share their average rank. */
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0])
    const r = new Array<number>(xs.length)
    for (let i = 0; i < order.length;) {
      let j = i
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2
      i = j + 1
    }
    return r
  }
  const ra = rank(a), rb = rank(b), ma = mean(ra), mb = mean(rb)
  const cov = mean(ra.map((x, i) => (x - ma) * (rb[i] - mb)))
  const sd = (r: number[], m: number) => Math.sqrt(mean(r.map((x) => (x - m) ** 2)))
  return cov / (sd(ra, ma) * sd(rb, mb))
}

function summary(rows: Row[]) {
  const ok = rows.filter((r) => r.est && r.truth)
  const ape = ok.map((r) => Math.abs(r.est!.kcal - r.truth!.kcal) / r.truth!.kcal)
  const mae = (k: keyof Truth) => {
    const xs = ok.filter((r) => r.truth![k] != null).map((r) => Math.abs(r.est![k] - r.truth![k]!))
    return xs.length ? mean(xs) : NaN
  }
  return {
    scored: ok.length, failed: rows.length - ok.length,
    kcalMAE: mae('kcal'), kcalMAPE: mean(ape), kcalMedianAPE: median(ape),
    within20: mean(ape.map((x) => (x <= 0.2 ? 1 : 0))), within30: mean(ape.map((x) => (x <= 0.3 ? 1 : 0))),
    kcalBias: mean(ok.map((r) => (r.est!.kcal - r.truth!.kcal) / r.truth!.kcal)),
    proteinMAE: mae('protein'), carbsMAE: mae('carbs'), fatMAE: mae('fat'), gramsMAE: mae('g'),
    // Negative is good: the model is less sure where it is more wrong.
    confidenceVsError: ok.length > 2 ? spearman(ok.map((r) => r.confidence ?? 0), ape) : NaN,
    p50ms: median(ok.map((r) => r.ms)),
  }
}

// --- run --------------------------------------------------------------------------------------------------------

const cases = [...(SETS.includes('n5k') ? n5kCases() : []), ...(SETS.includes('own') ? ownCases() : []), ...(SETS.includes('neg') ? negCases() : [])]
console.log(`Meal-photo eval: ${cases.length} photos via ${VIA} (${MODEL})${VIA === 'openrouter' ? ', a proxy: production calls Gemini directly' : ''}`)
let done = 0
const rows = await pool(cases, CONCURRENCY, async (c) => {
  const r = await runCase(c)
  done++
  const line = r.error ? `ERROR ${r.error}` : r.set === 'neg' ? (r.negPass ? 'pass' : `FAIL (${r.items?.join(', ')})`)
    : `${Math.round(r.est!.kcal)} kcal vs ${r.truth!.kcal} (${Math.round(((r.est!.kcal - r.truth!.kcal) / r.truth!.kcal) * 100)}%)`
  console.log(`[${done}/${cases.length}] ${r.set} ${r.id}: ${line}`)
  return r
})

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '-')
const g = (x: number) => (Number.isFinite(x) ? `${Math.round(x)}` : '-')
console.log('\nset   scored  kcal MAE  MAPE  median  ±20%  ±30%  bias   P/C/F MAE (g)   grams MAE  conf~err  p50')
const report: Record<string, unknown> = { via: VIA, model: MODEL, at: new Date().toISOString() }
for (const set of ['n5k', 'own'] as const) {
  const rs = rows.filter((r) => r.set === set)
  if (!rs.length) continue
  const s = summary(rs)
  report[set] = s
  console.log(`${set.padEnd(5)} ${`${s.scored}/${rs.length}`.padStart(6)}  ${g(s.kcalMAE).padStart(8)}  ${pct(s.kcalMAPE).padStart(4)}  ${pct(s.kcalMedianAPE).padStart(6)}  ${pct(s.within20).padStart(4)}  ${pct(s.within30).padStart(4)}  ${pct(s.kcalBias).padStart(4)}   ${`${g(s.proteinMAE)}/${g(s.carbsMAE)}/${g(s.fatMAE)}`.padStart(11)}   ${g(s.gramsMAE).padStart(9)}  ${Number.isFinite(s.confidenceVsError) ? s.confidenceVsError.toFixed(2) : '-'}      ${(s.p50ms / 1000).toFixed(1)}s`)
}
const neg = rows.filter((r) => r.set === 'neg')
if (neg.length) {
  const passed = neg.filter((r) => r.negPass).length
  report.neg = { passed, of: neg.length, failed: neg.filter((r) => !r.negPass).map((r) => r.id) }
  console.log(`neg   ${passed}/${neg.length} not-a-meal photos returned no items or confidence ≤ 0.3`)
}
const out = join(evalDir('results'), `meal-${stamp()}.json`)
writeFileSync(out, JSON.stringify({ ...report, rows }, null, 2))
console.log(`\nEvery photo, estimate and note: ${out}`)
