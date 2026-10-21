// Coach chat eval (manual). Runs each case the way the Coach screen does (src/screens/Coach.tsx): the safety screen on
// the device first, then the coach's own turn loop (coach/turn.ts: routing, the agent's prompt, the model, the reply
// check) wired to OpenRouter exactly as the coach Worker wires it, with tools answered by the app's real tool runner
// against the seeded demo database. Scores are pattern checks on what comes back; no model grades another.
//
//   npx vite-node scripts/evals/coach/run.ts                 # every case, 3 times each
//   npx vite-node scripts/evals/coach/run.ts --repeat 1 --only protein-left,knee-squat
//
// Real, paid calls (Gemini 3.8 Flash and the Jev router through OpenRouter): never part of `npm test`. See ../README.md.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { coachTurn, type CoachDeps } from '../../../coach/turn'
import { COACH_CONTRACT_VERSION, MAX_COACH_STEPS, type CoachTurnRequest, type CoachTurnResponse, type CoachTurnTurn } from '../../../coach/contract'
import { openRouterDeps, type CoachWorkerEnv } from '../../../coach/worker'
import { db } from '../../../src/db/database'
import { reseed } from '../../../src/db/seed'
import { buildCoachFacts, profileSummary } from '../../../src/features/coach/facts'
import { runCoachTool } from '../../../src/features/coach/tools'
import { computeDailyPriority, type CoachFacts } from '../../../src/engine/coach'
import { screenMessage } from '../../../src/engine/chatSafety'
import { evalDir, evalKey, median, pool, stamp } from '../env'
import { CASES, SUPPORT, type CoachCase } from './cases'

const args = process.argv.slice(2)
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const REPEAT = Number(arg('repeat') ?? 3)
const ONLY = arg('only')?.split(',')
const VERBOSE = args.includes('--verbose')

const KEY = evalKey('OPENROUTER_API_KEY')
if (!KEY) throw new Error('Set OPENROUTER_API_KEY in .evals/.env: the coach runs on OpenRouter.')
const deps: CoachDeps = openRouterDeps({ OPENROUTER_API_KEY: KEY } as CoachWorkerEnv)

// --- the demo user, in memory ----------------------------------------------------------------------------------

const quiet = console.error
console.error = () => {} // no IndexedDB in node: persist() logs its failure path
await db.init()
await reseed()
console.error = quiet
const facts: CoachFacts = buildCoachFacts()
const summary = profileSummary()

// --- one conversation turn, as src/ai/gateway.ts coachConversation runs it -------------------------------------

interface Outcome { screened?: string; res?: Exclude<CoachTurnResponse, { kind: 'tool_calls' }>; tools: string[]; ms: number; error?: string }

async function converse(c: CoachCase): Promise<Outcome> {
  const hit = screenMessage(c.message)
  if (hit) return { screened: hit.kind, tools: [], ms: 0 }
  const started = Date.now()
  const turns: CoachTurnTurn[] = [...(c.history ?? []), { role: 'user', content: c.message }]
  const tools: string[] = []
  let agent: CoachTurnRequest['agent']
  try {
    for (let step = 1 as CoachTurnRequest['step']; step <= MAX_COACH_STEPS; step++) {
      const res = await coachTurn({
        v: COACH_CONTRACT_VERSION, turns: [...turns], facts, priority: computeDailyPriority(facts), profileSummary: summary,
        extras: {}, previousAgent: c.previousAgent ?? null, step, ...(agent ? { agent } : {}),
      }, deps)
      if (res.kind !== 'tool_calls') return { res, tools, ms: Date.now() - started }
      agent = res.agent
      turns.push({ role: 'assistant', content: '', toolCalls: res.toolCalls })
      for (const call of res.toolCalls) {
        tools.push(call.name)
        turns.push({ role: 'tool', toolCallId: call.id, content: runCoachTool(call.name, call.arguments, facts.today) })
      }
    }
    return { tools, ms: Date.now() - started, error: 'no answer after the last step' }
  } catch (e) {
    return { tools, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) }
  }
}

// --- checks -----------------------------------------------------------------------------------------------------

type Check = 'screen' | 'support' | 'agent' | 'answered' | 'mentions' | 'avoid' | 'tools' | 'length'

function check(c: CoachCase, o: Outcome): { fails: Check[]; notes: string[] } {
  const fails: Check[] = []
  const notes: string[] = []
  const e = c.expect
  if (e.screen) {
    if (o.screened !== e.screen) { fails.push('screen'); notes.push(`screen: got ${o.screened ?? 'nothing'}, want ${e.screen}`) }
    return { fails, notes }
  }
  if (o.screened) {
    // The screen caught it: support shown, no model call. Fine where the case allows it.
    if (!e.mayScreen) { fails.push('screen'); notes.push(`screened as ${o.screened} unexpectedly`) }
    return { fails, notes }
  }
  if (o.error) { fails.push('answered'); notes.push(o.error); return { fails, notes } }
  const res = o.res!
  if (e.agent && !e.agent.includes(res.agent)) { fails.push('agent'); notes.push(`agent ${res.agent}, want ${e.agent.join(' or ')}`) }
  if (res.kind === 'withheld') { fails.push('answered'); notes.push(`withheld by the reply check (${res.reason})`); return { fails, notes } }
  const text = res.text.replace(/(\d),(\d{3})\b/g, '$1$2')
  if (e.support && !SUPPORT.test(text)) {
    fails.push('support'); notes.push('reached the model and the reply did not point to support')
  }
  for (const re of e.mentions?.(facts) ?? []) if (!re.test(text)) { fails.push('mentions'); notes.push(`missing ${re}`) }
  if (e.mentionsAny && !e.mentionsAny.some((re) => re.test(text))) { fails.push('mentions'); notes.push(`none of ${e.mentionsAny.join(' ')}`) }
  for (const re of e.avoid ?? []) if (re.test(text)) { fails.push('avoid'); notes.push(`said ${re}`) }
  if (e.tools && !e.tools.some((t) => o.tools.includes(t))) { fails.push('tools'); notes.push(`tools ${o.tools.join(', ') || 'none'}, want ${e.tools.join(' or ')}`) }
  const words = text.trim().split(/\s+/).length
  if (e.maxWords && words > e.maxWords) { fails.push('length'); notes.push(`${words} words, max ${e.maxWords}`) }
  return { fails, notes }
}

// --- run --------------------------------------------------------------------------------------------------------

const cases = CASES.filter((c) => !ONLY || ONLY.includes(c.id))
const jobs = cases.flatMap((c) => Array.from({ length: REPEAT }, (_, run) => ({ c, run })))
console.log(`Coach eval: ${cases.length} cases × ${REPEAT} against the demo profile (${facts.today}), via OpenRouter`)

const results = await pool(jobs, 3, async ({ c, run }) => {
  const o = await converse(c)
  const { fails, notes } = check(c, o)
  const reply = o.screened ? `[screened: ${o.screened}]` : o.res?.kind === 'reply' ? o.res.text : o.res ? `[${o.res.kind}]` : `[error]`
  console.log(`${fails.length ? 'FAIL' : 'pass'} ${c.id} #${run + 1}${o.res ? ` (${o.res.agent}${o.tools.length ? `, ${o.tools.join('+')}` : ''})` : ''}${notes.length ? `: ${notes.join('; ')}` : ''}`)
  if (VERBOSE || fails.length) console.log(`     ${reply.replace(/\n+/g, ' ')}`)
  return { id: c.id, about: c.about, run, agent: o.res?.agent ?? null, kind: o.screened ? 'screened' : o.res?.kind ?? 'error', tools: o.tools, ms: o.ms, fails, notes, reply }
})

const rate = (xs: boolean[]) => (xs.length ? `${Math.round((xs.filter(Boolean).length / xs.length) * 100)}%` : '-')
console.log('\ncase                      pass   about')
for (const c of cases) {
  const rs = results.filter((r) => r.id === c.id)
  console.log(`${c.id.padEnd(25)} ${`${rs.filter((r) => !r.fails.length).length}/${rs.length}`.padStart(4)}   ${c.about}`)
}
const modelRuns = results.filter((r) => r.kind !== 'screened')
const byCheck = (k: Check) => results.filter((r) => r.fails.includes(k)).length
console.log(`\nall checks passed ${rate(results.map((r) => !r.fails.length))} of ${results.length} runs`)
console.log(`withheld by the reply check ${rate(modelRuns.map((r) => r.kind === 'withheld'))} of ${modelRuns.length} model replies; p50 ${(median(modelRuns.map((r) => r.ms)) / 1000).toFixed(1)}s`)
console.log(`failures by check: ${(['screen', 'support', 'agent', 'answered', 'mentions', 'avoid', 'tools', 'length'] as Check[]).map((k) => `${k} ${byCheck(k)}`).join(', ')}`)
const out = join(evalDir('results'), `coach-${stamp()}.json`)
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), today: facts.today, repeat: REPEAT, results }, null, 2))
console.log(`Every reply: ${out}`)
