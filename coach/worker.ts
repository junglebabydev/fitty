// The coach Worker, `fitty-coach` (docs/PRD_COACH_CHAT.md §13): prompts, agents, routing, the reply check and the
// model calls. Deployed on its own (wrangler.coach.jsonc), so a coach update never rebuilds or redeploys the app.
//
//   app ──/api/ai/coach/turn──▶ fitty Worker (HTTPS, origin, PIN, rate limit, daily budget) ──service binding──▶ here
//
// No public URL (workers_dev false, no routes): the only way in is the COACH service binding on the fitty Worker,
// which has already done every access check. The OpenRouter transport is shared code from worker/.
// Secrets: OPENROUTER_API_KEY. Vars: COACH_OPENROUTER_MODEL, COACH_OPENROUTER_DATA_COLLECTION, COACH_MODEL_ROUTER,
// COACH_SERVICE_TIER.
import { BridgeError, openRouterKeyOf, parseBody, parseChatRequest, readTextCapped, type CoachEnv } from '../worker/guard'
import { dataCollection, openRouterChat, openRouterDecide, openRouterModel, routerModel, serviceTier } from '../worker/openrouter'
import type { CoachTurnTurn } from './contract'
import { CoachRequestError, coachTurn, parseCoachTurnRequest, type CoachDeps } from './turn'

export type CoachWorkerEnv = Pick<CoachEnv, 'OPENROUTER_API_KEY' | 'GEMINI_API_KEY' | 'COACH_OPENROUTER_MODEL' | 'COACH_OPENROUTER_DATA_COLLECTION' | 'COACH_MODEL_ROUTER' | 'COACH_SERVICE_TIER'>

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

export function openRouterDeps(env: CoachWorkerEnv, fetcher: typeof fetch = fetch): CoachDeps {
  const key = openRouterKeyOf(env)
  if (!key) throw new BridgeError('auth', 'The coach Worker has no OPENROUTER_API_KEY secret.', 503)
  const model = openRouterModel(env.COACH_OPENROUTER_MODEL)
  const policy = dataCollection(env.COACH_OPENROUTER_DATA_COLLECTION)
  return {
    chat: async (system, turns, tools, toolChoice) => {
      const r = await openRouterChat(
        key, model, policy,
        { system, turns, attachments: [], ...(tools.length ? { tools, ...(toolChoice ? { toolChoice } : {}) } : {}) },
        fetcher, serviceTier(env.COACH_SERVICE_TIER),
      )
      if (r.tier) console.log(`coach chat tier=${r.tier}`)
      return { text: r.text, toolCalls: r.toolCalls ?? [] }
    },
    decide: (d) => openRouterDecide(key, routerModel(env.COACH_MODEL_ROUTER), d, fetcher),
  }
}

export default {
  async fetch(request: Request, env: CoachWorkerEnv): Promise<Response> {
    try {
      const { pathname } = new URL(request.url)
      if (pathname !== '/turn' || request.method !== 'POST') throw new BridgeError('bad_request', 'Unknown endpoint.', 404)
      const body = parseBody(await readTextCapped(request.body, request.headers.get('content-length')))
      const turns = parseChatRequest({ turns: body.turns }).turns as CoachTurnTurn[]
      const req = parseCoachTurnRequest(body, turns)
      const started = Date.now()
      const res = await coachTurn(req, openRouterDeps(env))
      console.log(`coach turn step=${req.step} agent=${res.agent} kind=${res.kind} ms=${Date.now() - started}`)
      return json(200, { ok: true, ...res })
    } catch (e) {
      if (e instanceof CoachRequestError) return json(400, { ok: false, kind: 'bad_request', message: e.message })
      if (e instanceof BridgeError) return json(e.status, { ok: false, kind: e.kind, message: e.message })
      console.error('coach error:', e instanceof Error ? e.name : typeof e)
      return json(500, { ok: false, kind: 'failed', message: 'The coach hit an unexpected error.' })
    }
  },
}
