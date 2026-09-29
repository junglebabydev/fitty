// Cross-model planner evaluation (manual). Sends the app's REAL planner prompt and schema to several
// models through OpenRouter and scores every reply with the app's own deterministic validator.
// There is no LLM judge here: every number below is computed from validateAIPlan and the library.
//
//   OPENROUTER_API_KEY=sk-or-... npx vite-node scripts/plan-eval/run.ts [model ...]
//
// It makes real, paid API calls, so it is never part of `npm test`. See README.md.
import { buildJsonRequest, openRouterModel, parseOpenRouterResponse, OPENROUTER_BASE } from '../../worker/openrouter'
import { EXERCISES } from '../../src/data'
import { extractJson } from '../../worker/guard'
import { planMinutes, validateAIPlan } from '../../src/engine'
import { PLAN_SCHEMA, buildPlannerSystem, plannerPrompt } from '../../src/features/ai/planner'
import { CASES, type EvalCase } from './fixtures'

const KEY = process.env.OPENROUTER_API_KEY ?? ''
if (!KEY) throw new Error('Set OPENROUTER_API_KEY (an OpenRouter key, sk-or-...) to run the evaluation.')

/** Default line-up: the two candidates for each paid tier plus the open-weights options. */
export const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.4',
  'google/gemini-3.8-flash',
  'deepseek/deepseek-chat',
  'meta-llama/llama-4-maverick',
  'qwen/qwen3-235b-a22b',
]

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]))
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const EMOJI = /\p{Extended_Pictographic}/u

export interface CaseScore {
  caseId: string
  ok: boolean
  error?: string
  ms: number
  /** Ids the model returned that are not in the allowed library. */
  hallucinated: number
  returned: number
  /** Ids the validator had to drop or swap because the gate forbade them. */
  gateViolations: number
  /** |estimated minutes − requested| */
  minutesOff: number
  /** Distinct movement patterns in the final plan. */
  patterns: number
  exercises: number
  copyOk: boolean
  expectationsOk: boolean
  notes: string[]
}

/** Every number here comes from the app's own validator — no model judges another model. */
export function scoreReply(raw: unknown, c: EvalCase, ms: number): CaseScore {
  const notes: string[] = []
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const returnedList = Array.isArray(obj.exercises) ? (obj.exercises as Record<string, unknown>[]) : []
  const allowedIds = new Set(c.input.allowed.map((e) => e.id))
  const hallucinated = returnedList.filter((e) => typeof e.exerciseId !== 'string' || !allowedIds.has(e.exerciseId)).length

  const checked = validateAIPlan({ ...obj, focus: c.req.focus }, c.input.allowed, c.input.gate, c.req.minutes)
  const plan = checked.plan
  const chosen = plan.exercises.map((e) => BY_ID.get(e.exerciseId)).filter((e): e is NonNullable<typeof e> => Boolean(e))

  const copyOk =
    words(plan.name) <= 5 &&
    words(plan.rationale) <= 22 &&
    plan.exercises.every((e) => !e.note || words(e.note) <= 10) &&
    !EMOJI.test(JSON.stringify(plan))
  if (!copyOk) notes.push('copy limits exceeded')

  let expectationsOk = true
  if (c.expect?.usesEquipment?.length) {
    const hit = chosen.some((e) => c.expect!.usesEquipment!.includes(e.equipment))
    if (!hit) { expectationsOk = false; notes.push(`no ${c.expect.usesEquipment.join('/')} exercise chosen`) }
  }
  if (c.expect?.forbidTags?.length) {
    const bad = chosen.filter((e) => e.safetyTags.some((t) => c.expect!.forbidTags!.includes(t)))
    if (bad.length) { expectationsOk = false; notes.push(`forbidden tags survived: ${bad.map((e) => e.id).join(', ')}`) }
  }

  return {
    caseId: c.id,
    ok: plan.exercises.length > 0,
    ms,
    hallucinated,
    returned: returnedList.length,
    gateViolations: checked.dropped.length + checked.substituted.length,
    minutesOff: Math.abs(planMinutes(plan.exercises, c.input.allowed) - c.req.minutes),
    patterns: new Set(chosen.map((e) => e.pattern)).size,
    exercises: plan.exercises.length,
    copyOk,
    expectationsOk,
    notes,
  }
}

async function callModel(model: string, c: EvalCase): Promise<{ raw: unknown; ms: number; error?: string }> {
  const body = buildJsonRequest(
    { system: buildPlannerSystem(c.input), prompt: plannerPrompt(c.req), schema: PLAN_SCHEMA, attachments: [] },
    openRouterModel(model), 'deny', true,
  )
  const t0 = Date.now()
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const ms = Date.now() - t0
    if (!res.ok) return { raw: null, ms, error: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` }
    const reply = parseOpenRouterResponse(await res.json())
    return { raw: extractJson(reply.text), ms }
  } catch (e) {
    return { raw: null, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }
  }
}

function summarise(model: string, scores: CaseScore[]): string {
  const n = scores.length
  const sum = (f: (s: CaseScore) => number) => scores.reduce((a, s) => a + f(s), 0)
  const pct = (k: number) => `${Math.round((k / n) * 100)}%`
  const returned = sum((s) => s.returned)
  return [
    model.padEnd(34),
    `usable ${pct(scores.filter((s) => s.ok).length).padStart(4)}`,
    `halluc ${(returned ? Math.round((sum((s) => s.hallucinated) / returned) * 100) : 0).toString().padStart(3)}%`,
    `gate-violations ${sum((s) => s.gateViolations).toString().padStart(3)}`,
    `min-off ${(sum((s) => s.minutesOff) / n).toFixed(1).padStart(5)}`,
    `patterns ${(sum((s) => s.patterns) / n).toFixed(1)}`,
    `copy ${pct(scores.filter((s) => s.copyOk).length).padStart(4)}`,
    `expects ${pct(scores.filter((s) => s.expectationsOk).length).padStart(4)}`,
    `p50 ${[...scores].sort((a, b) => a.ms - b.ms)[Math.floor(n / 2)].ms} ms`,
  ].join('  ')
}

async function main() {
  const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS
  console.log(`${CASES.length} cases × ${models.length} models = ${CASES.length * models.length} calls\n`)
  const table: string[] = []
  for (const model of models) {
    const scores: CaseScore[] = []
    for (const c of CASES) {
      const { raw, ms, error } = await callModel(model, c)
      if (error) {
        scores.push({ caseId: c.id, ok: false, error, ms, hallucinated: 0, returned: 0, gateViolations: 0, minutesOff: c.req.minutes, patterns: 0, exercises: 0, copyOk: false, expectationsOk: false, notes: [error] })
        console.log(`  ✗ ${model} ${c.id}: ${error}`)
        continue
      }
      const s = scoreReply(raw, c, ms)
      scores.push(s)
      const flag = s.ok && s.expectationsOk && s.copyOk && s.hallucinated === 0 ? '✓' : '·'
      console.log(`  ${flag} ${model} ${c.id.padEnd(32)} ${s.exercises} ex, ${s.patterns} patterns, ${s.hallucinated} bad ids, ${s.minutesOff} min off${s.notes.length ? ` — ${s.notes.join('; ')}` : ''}`)
    }
    table.push(summarise(model, scores))
    console.log('')
  }
  console.log('\n' + table.join('\n'))
  console.log('\nLower is better for halluc / gate-violations / min-off. Higher is better for usable / copy / expects / patterns.')
}

main().catch((e) => { console.error(e); process.exit(1) })
