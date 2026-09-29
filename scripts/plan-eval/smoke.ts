// Offline sanity check of the prompt + scoring path. No network, no key, not part of npm test.
//   npx vite-node scripts/plan-eval/smoke.ts
import { buildPlannerSystem, plannerPrompt } from '../../src/features/ai/planner'
import { CASES } from './fixtures'

console.log(`${CASES.length} cases\n`)
for (const c of CASES) {
  const sys = buildPlannerSystem(c.input)
  const open = sys.includes('no standing physical constraints')
  console.log(
    `${c.id.padEnd(34)} allowed ${String(c.input.allowed.length).padStart(3)}  ` +
    `prompt ${String(sys.length).padStart(5)} chars  ${open ? 'FULL LIBRARY' : 'constrained: ' + (c.input.baselineAvoid ?? []).join(',')}`,
  )
}
console.log(`\nexample user message: ${JSON.stringify(plannerPrompt(CASES[0].req))}`)
