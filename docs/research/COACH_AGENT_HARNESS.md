# Research — a proper harness for the Coach chat (Nov 2026)

Feeds [../PRD_COACH_CHAT.md](../PRD_COACH_CHAT.md). The owner's ask (2026-11-02): the coach chat "is not very
smooth". Build it a separate agent architecture with best practices: a proper harness, observability, and a way to
change the system prompts. (The ask said "chart"; read here as the coach **chat**.)

**Verdict: keep the agent, build the harness around it.** The coach's shape is already what current practice
recommends: the rules engine owns the numbers, specialists get a slice of the facts, tools are read-only, and checks
run before and after the model. Swapping in a framework or a server-side agent would not make it smoother. What
makes it rough is measurable, and each part has a small fix:

1. **It's slow, and nothing moves while it works.** Median 15–17 s, p95 about 23 s, with a spinner the whole time.
2. **Good replies get thrown away.** The reply check withheld 5 of 105 replies (4 of 51 in the second run). Four
   were false positives, and the user got a canned answer instead.
3. **There's no way to see why.** Observability is off on both Workers, the evals don't record the tier, tokens or
   time per stage, and the evals' OpenRouter key has stopped working.

The harness adds four things the coach doesn't have: **streaming**, **a trace for every message**, **one versioned
coach config** (prompt text, model, tier, reasoning) that can change and roll back, and **evals that gate a
config before it goes live**.

## 1. What "not smooth" is, measured

From the two full eval runs on 2026-10-15 (`.evals/results/coach-2026-10-15T*.json`, 51–54 model-answered cases
each, Gemini 3.8 Flash on OpenRouter, wired exactly as the coach Worker wires it, so at **Flex** tier):

| | Run 1 | Run 2 |
|---|---|---|
| Median time to answer | 16.7 s | 14.8 s |
| p90 / p95 | 20.3 s / 22.6 s | 20.4 s / 23.9 s |
| Slowest | 24.8 s | 26.6 s |
| Withheld by the reply check | 1 (2%) | 4 (8%) |
| Cases failing a check | 10 | 11 |
| Reply length, median | 95 words | 88 words |

**Time by agent (median).** It runs backwards. The agent that calls tools, and so makes more model calls, is the
fastest:

| Agent | Tools | Median |
|---|---|---|
| training | get_training, get_exercise_history, search_library | 7.4–7.9 s |
| coach | get_sleep, get_training, get_nutrition | 8.4–13.9 s |
| symptoms | none | 15.1–16.2 s |
| nutrition | get_nutrition, search_library | 16.7–18.1 s |
| recovery | get_sleep | 14.8–18.3 s |
| mind | none | 20.3 s |

The PRD set its own limit for Flex (§11.5): "If p95 is over 5 s, or more than 1 in 10 calls fall back, interactive
tiers go back to standard." p95 is about 23 s. The evals never recorded which tier answered, so we can't yet say
whether Flex is the cause. Three explanations fit, and the measurement in §7 (phase 0) tells them apart:

- **Flex timeouts (likely).** A Flex call that hasn't answered in 8 s is dropped and sent again at standard tier, so
  a long reply pays 8 s for nothing first. The PRD assumed Flex was nearly as fast as standard. Google's own Flex
  page now gives a latency target of "minutes (1–15 min)" and recommends client timeouts of 10+ minutes. On
  2026-11-02, OpenRouter's endpoint list showed the Vertex Flex endpoint for 3.8 Flash at 18% uptime over 30
  minutes and 82% over a day.
- **Thinking tokens (certain, size unknown).** OpenRouter's model list (checked 2026-11-02) marks reasoning as
  `mandatory: true` for `google/gemini-3.8-flash`, with `default_effort: "medium"` and `low` as the lowest setting.
  The coach sends no `reasoning` setting, so every reply thinks at medium before it writes a word. Thinking tokens
  are billed as output.
- **Long replies.** The median reply is about 90 words, close to the 120-word cap, and the whole reply has to
  finish before anything appears.

**Why replies get withheld.** Four of the five withheld replies are `low-kcal-plan` ("I'm going to do 1000 calories
a day…"). The model's reply was good: it pushed back on the crash diet. It was withheld as an `invented_number`
because it repeated "1,000 calories", and `coachTurn` only counts the system prompt and tool results as numbers the
model was given (`coach/turn.ts:51`), not the user's own message. The user saw "AI reply withheld. Answered from
your data." This is a bug, not a missing harness, and it's a one-line fix.

**What the round trips cost.** A message that needs a tool is up to three HTTP round trips: phone → `fitty` →
`fitty-coach` → OpenRouter and back, each one resending the facts and the last 12 turns. The tool loop has to stay
on the phone, because the data is there (§12.2), but each hop adds a mobile-network round trip.

## 2. What a harness is, and what the coach has today

"Harness" is everything around the model call that makes an agent dependable: the loop, the context, the tools,
the guards, the config, the telemetry and the tests. Here is each part, with the gap.

| Part | Current practice | The coach today | Gap |
|---|---|---|---|
| Loop | A small explicit loop with a step cap and a forced final answer | Phone runs it, max 3 calls, `tool_choice: none` on the last (`src/ai/gateway.ts`) | None. Keep it. |
| Context | Assemble per turn from typed sections; facts computed, not generated | `coach/prompt.ts` sections, a fact slice per agent | None |
| Routing | Cheap deterministic rules first, a small classifier second, a safe default | Regex, then Jev (2.5 s timeout), then `coach` | Not traced: no record of which route was taken or how long Jev took |
| Tools | Read-only, typed, run where the data is, errors as results | Five tools on the device | Tool time and result size not recorded |
| Input guard | Code before the model | L1 `screenMessage` on the device | None |
| Output guard | Check before showing; never let a failed reply act | L3 `checkReply` | False positives (user's own numbers); no streaming |
| Model config | Model, tier, reasoning effort, max tokens and timeouts as config, tied to a version | Worker vars, no reasoning setting | Not versioned together; not recorded per message |
| Streaming | Show progress at once; stream text when it's safe | One JSON reply per step | All of it |
| Tracing | One trace per user message, a span per stage, tokens, cost, latency, the config version | `console.log` of agent, tier and ms; observability off | All of it |
| Prompt versioning | Versioned, labelled, rolled back, linked to traces | Code, golden tests, coach-only deploy | Can't change without a deploy, no version in traces |
| Evals | Offline set as a gate before release; live traces turned into new cases | `scripts/evals/coach`, run by hand | Dead key; no latency or token fields; not a gate |
| Memory/state | Optional, user-approved | Not built (PRD §10) | Out of scope here |

So the agent's core (the first six rows) is in good shape. The gaps are all in the bottom half.

## 3. The architecture

The same three boxes, with a harness layer in the coach Worker and a trace store on each side:

```
 Phone (React PWA / Capacitor)                    fitty Worker                 fitty-coach Worker
 ────────────────────────────                     ────────────                 ──────────────────
 L1 screen ─▶ coachConversation ──POST /turn──▶  PIN, origin, budget  ──bind──▶  harness.run(step)
   │            (tool loop, ≤3 steps)               passes the stream            ├ load CoachConfig (version N)
   │            traceId per message                 through, unbuffered          ├ route (regex → Jev → coach)
   │                 ▲                                                          ├ build prompt (sections + config text)
   │                 │◀──── SSE: status · text · done | withheld | tool_calls ───┤ model call (stream, tier, reasoning)
   │                 │                                                          ├ L3 check, sentence by sentence
   ├ tools on device (sql.js)                                                   └ emit span events (no content)
   └ on-device trace (full content, ≤50 messages,                                     │
     viewable in a hidden debug screen, exportable                                    ▼
     as an eval case)                                                     metadata store (see §4)
```

What changes, piece by piece:

1. **`CoachConfig`, one versioned object.** Prompt section texts (identity, rules, coaching, each agent's focus
   line, the Jev question), the chat model, tier, reasoning effort, max tokens and timeouts. Code still owns the
   structure: the section order, the facts lines, the agents' fact slices, the reply-check rules. Config owns the
   words and the knobs. Every response carries `configVersion`. Where it lives is §5.
2. **A `traceId` per message**, made on the phone, sent with every step, returned with every response. The Worker
   emits one event per stage (route, prompt, model, check) with only metadata: agent, route reason, config
   version, tier, time to first token, total time, tokens in, out and reasoning, cost, finish reason, step, outcome,
   withheld reason. Never message text, facts or tool results. Where it goes is §4.
3. **Full traces stay on the phone.** The app already keeps a privacy ledger on the device. A `coach_traces` table
   beside it keeps, for the last 50 messages, what the server can't: the redacted turns, the assembled prompt's
   hash and size, the tool calls and results, the raw reply, the check's verdict. A hidden debug screen shows them.
   One tap exports a trace as an eval case into `.evals/` (git-ignored). It only joins the committed
   `scripts/evals/coach/cases.ts` after it's rewritten against the demo profile, because a real trace carries real
   health data. This keeps the rule that health data never sits in server logs or in git, and still gives the owner
   the full story of a bad reply.
4. **Streaming** from OpenRouter through both Workers to the phone, as server-sent events (§6).
5. **Evals as the gate** for a new config: run the coach set against the candidate version, compare with the
   live one, promote only if nothing safety-related got worse (§5).

What doesn't change: the contract stays stateless, the tool loop stays on the phone, Jev and Gemini stay the
models, and there's still no agent framework.

## 4. Observability: what to record, and where

**Recommendation: record metadata on Cloudflare, keep content on the phone, add no new party.** Health data
sits in the facts, the turns and the tool results. The cheapest way to keep it out of logs is never to send it to a
log in the first place, rather than sending it and masking it afterwards.

**What each step records** (one row per model call, all rows of a message share the `traceId`):

| Field | Example | Field names follow |
|---|---|---|
| traceId, step, agent, route reason | `t_8f2…`, 1, `nutrition`, `keyword` | `gen_ai.conversation.id`, `gen_ai.agent.name` |
| configVersion, model, tier served, reasoning effort | `c12`, `google/gemini-3.8-flash`, `standard`, `low` | `gen_ai.request.model` |
| ms: decide, model, time to first token, total | 0, 6 100, 2 300, 6 400 | `gen_ai.response.time_to_first_chunk` |
| tokens in, out, reasoning, cached; cost | 2 900, 140, 620, 0, $0.004 | `gen_ai.usage.*` |
| finish reason, outcome, withheld reason | `stop`, `reply`, — | `gen_ai.response.finish_reasons` |
| tool names asked for (names only) | `get_sleep` | `gen_ai.tool.name` |

Never a message, a fact, a tool argument or a tool result. A unit test asserts it.

**Where it goes.**

| Option | What it gives | Cost | Privacy | Verdict |
|---|---|---|---|---|
| **Workers Analytics Engine** | One row per step, SQL API, 3 months kept | Free tier 100k writes/day; currently not billed | Only what we write | **Use.** One user never gets near sampling |
| **OpenRouter inline `usage`** | Exact tokens, reasoning tokens and cost in every response | Free | Already the upstream | **Use.** Fixes the `costUsd: null` gap in `LEARNING_AGENTS.md` §7 |
| **Workers Logs + traces, `fitty-coach` only** | Errors, exceptions, `console.log`, automatic spans for fetches (beta), custom spans | Free tier; volume pricing from 2026-12-01 | Invocation logs may record request headers. `fitty` gets the PIN in `x-coach-pin`, so leave `fitty` off until checked. `fitty-coach` only sees the forwarded body | **Use on `fitty-coach`** |
| On-device `coach_traces` table | Full story of a message: turns, tool calls and results, raw reply, check verdict | Free | Stays on the phone, like the privacy ledger | **Use.** It's the debugging view |
| Cloudflare AI Gateway | Logs, retries, caching, rate limits for OpenRouter | Core features free | Logs prompts by default; `cf-aig-collect-log-payload: false` gives metadata only | Skip: duplicates OpenRouter's fallback and cost, and caching does nothing for chat |
| OpenRouter Broadcast → Langfuse / PostHog | A hosted trace UI, no code | Their free tiers | "Privacy Mode" strips messages and outputs. Not documented whether it strips tool arguments and results, which is where the health data is | Skip until tested |
| Langfuse (cloud or self-host) | Trace UI, prompt management, scores | Hobby free (50k units/month) | A new party. Masking is your own function | Later, if a UI earns its keep. Its old ingestion API ends 2026-11-16; new ingestion is OTLP only |
| PostHog AI Observability | Trace UI, prompts (beta), evals | Free tier | `privacyMode: true` drops inputs and outputs | Later, same reason |

Borrow the OpenTelemetry `gen_ai.*` names for the fields, but don't take a dependency. The conventions are still in
Development, moved to their own repo in May 2026, and have unreleased renames. Using the names now means an OTLP
export later is a mapping, not a rewrite.

**How it's read.** A small script, `scripts/coach-stats.ts`, runs SQL against Analytics Engine and prints p50
and p95 by agent and tier, the withheld rate and reasons, the fallback rate, and cost per day. A dashboard can wait
until the script's output is boring.

## 5. Changing the prompts without a deploy

Today the coach already deploys apart from the app (`npm run deploy:coach`, about a minute). What it lacks is not
speed but **knowing which version answered**, **a gate before a change goes live**, and **a rollback**.

| | (a) Code, gated (today, plus) | (b) Text in Workers KV, edited in the app | (c) A prompt service (Langfuse, PostHog) |
|---|---|---|---|
| Where you edit | Your editor | A hidden Coach admin screen behind the PIN | Their web UI |
| Version | `CONFIG_VERSION` in `coach/`, plus the Worker version id | Immutable `coach-config:v12` keys plus a `production` pointer | Built in, with labels |
| Goes live | `npm run coach:gate` (evals) → `deploy:coach` | "Promote" after an eval run; 30–60 s to reach every location | Moving the `production` label; their SDK caches 60 s (Langfuse) or 5 min (PostHog) |
| Rollback | `wrangler rollback` | Point `production` back | Move the label back |
| Golden tests | Stay exact | Pin the code defaults only; each version is snapshotted when promoted | Need their GitHub sync to keep files in the repo |
| The trap | None new | A promote button that skips the eval | Moving the label *is* the deploy. A CI job triggered by the move runs after the prompt is already live. Gate on `staging`, and let only the gate move `production` |
| Effort | Small | Medium: KV binding, admin screen, promote flow | Medium, plus a new party in the request path |

What becomes editable in (b) or (c) is **text and knobs only**: the identity, rules and coaching sections, each
agent's focus line, the Jev question, the model, tier, reasoning effort and max tokens. Code keeps the structure: the
section order, the facts lines, each agent's fact slice, the reply check. Prompt text isn't sensitive (the facts are
added later, in the Worker), so (c) isn't a privacy problem. Its cost is a new dependency and the label trap.

**Recommendation: (a) now.** It gives the version, the gate and the rollback at the smallest cost. Move to (b)
only if you want to edit from the phone. That choice is the open question in §8.

## 6. Streaming, with the reply check

Streaming fixes how slow the coach *feels*. It doesn't fix how slow it *is* (phase 0 does that). It also changes a
safety rule, which needs the owner's OK: today **a reply that fails the check is never shown** (PRD §7). With
streaming it becomes **a sentence that fails the check is never shown**. Sentences that passed may already be on
screen when a later one fails, and then they're replaced.

**The protocol.** `/turn` answers with server-sent events instead of one JSON object:

```
event: status   {"text":"Looking at your sleep"}        ← at once, and again per step
event: text     {"text":"You slept 6 h 10 m last night."} ← one checked sentence at a time
event: text     {"text":"That's 40 minutes under your week."}
event: done     {"agent":"recovery","traceId":"…","configVersion":"c12"}
   or
event: withheld {"reason":"dose"}                        ← the app swaps the bubble for the local answer
```

**How the check fits.** Each of the reply check's rules (doses, diagnoses, shaming, invented calorie or protein
numbers) looks at one sentence at a time. So the Worker holds each sentence until it ends, checks it, and only then
sends it. If a sentence fails, the stream stops with `withheld`, and the app replaces what it had shown with the
local answer. The whole reply is checked once more before `done`, because the last sentence can arrive without a
full stop. A PROPOSAL line is only read from the final text, on `done`, so a withheld reply still never becomes a
proposal. Azure's default content filter and Guardrails AI make the same choice: check, then release, in small
chunks. NeMo Guardrails' `stream_first` and the OpenAI Agents SDK show the text first and object later, which is
looser than the coach should be.

If the owner wants to keep the rule exactly as it is, the alternative is to stream `status` events only and send
the checked reply whole. That keeps most of the gain (something moves at once) and none of the risk.

**Details that bite:**

- **The `status` events matter most.** Thinking is mandatory, so no text can arrive until thinking ends. The status
  line fills that gap. A tool step has no text at all, only status.
- **`fitty` must pass the stream through** (`new Response(res.body, res)`) and never `await res.json()` it, or it
  buffers everything. Waiting on the network doesn't count as CPU time.
- **Only `done` or `withheld` ends a reply.** On Safari, if the connection drops mid-stream the reader reports
  `done: true` instead of an error (WebKit bug 265331, still open). Without a final event, the bubble shows
  "Didn't finish" and offers the local answer.
- **Cancelling doesn't save money.** OpenRouter can't cancel a stream on Google, so a reply the user leaves is still
  billed.
- **The iPhone app buffers.** `capacitor.config.ts` on the `ios-app` branch turns on `CapacitorHttp` so AI calls
  skip CORS. Native HTTP returns the whole body at once, so streaming there needs the Worker to allow the
  `capacitor://localhost` origin, and the app to use the WebView's own `fetch` for this route. The web app streams
  as is.
- **It's contract v2.** The app keeps sending v1 until it updates, and the coach accepts both (PRD §13.2).

## 7. Phases

One PR each, merged one at a time, deployed from a worktree on `main` (never from the hub's current branch), with
vars set in `wrangler.coach.jsonc` rather than the dashboard, because dashboard edits redeploy the newest upload.
Each PR also adds a "What this phase teaches" note to [../LEARNING_AGENTS.md](../LEARNING_AGENTS.md). The first
one also fixes that guide's paths from before phase 8 (`src/engine/coachAgents.ts`, `scripts/chat-eval/`) and the
rows it still marks as planned.

| Phase | Scope | Proof | Teaches |
|---|---|---|---|
| 0a. Standard tier (**live 2026-11-02**, coach version `8fd137b6`) | With the owner's OK, set `COACH_SERVICE_TIER=standard` in `wrangler.coach.jsonc` and deploy the coach. The PRD's own rule (§11.5: p95 over 5 s sends interactive calls back to standard) is already tripped at about 23 s, whatever the cause. Needs no eval key | `wrangler tail` shows `tier=standard`; a few messages from the phone feel faster | Acting on a rule you wrote down before you had the data |
| 0b. Measure | A working eval key (the one in `.evals/.env` returns 401). Eval results record tier served, time to first token, tokens including reasoning, cost and time per stage. Run the non-crisis cases at reasoning `medium` and `low`; add a `COACH_REASONING_EFFORT` var if `low` holds the pass rate | A table of p50, p95 and pass rate for each setting, in `scripts/evals/README.md` | Where an LLM call's time goes; percentiles, not averages; why one run isn't enough |
| 1. Withheld fix | Numbers in the user's own messages count as numbers the model was given (`coach/turn.ts:51`). User turns only. The tradeoff: the model may now repeat a number the user claims ("I ate 3,000 kcal") as if it were logged. Its own arithmetic is still withheld | `low-kcal-plan` passes 3 of 3; a test that a user's number passes and an invented one is still withheld | A guardrail's precision vs recall; turning an eval failure into a test |
| 2. Traces | `traceId` from the phone; one Analytics Engine row per step; `usage` read for cost; observability on `fitty-coach`; `coach_traces` on the device with a hidden debug screen and "export as eval case" into `.evals/`; `scripts/coach-stats.ts` | One message makes 1–3 rows with the same `traceId`; a test that no row holds message text, facts or tool results | Traces and spans; telemetry that respects privacy; the `gen_ai.*` names |
| 3. Streaming | Contract v2 over SSE, `status`/`text`/`done`/`withheld`; the sentence gate; `fitty` pass-through; the app's bubble | Gate tests (a failing sentence mid-stream ends in `withheld` and nothing after it); first visible change under 1 s in the browser; final text equals the non-streamed check's | Perceived latency; SSE; streaming with a guardrail |
| 4. Versioned config and a gate | `CoachConfig` with `configVersion` in every response and trace; `npm run coach:gate` compares the evals with the last baseline and blocks a deploy on a safety regression; rollback written down. Option (b) from §5 only if chosen | A deliberate bad prompt change fails the gate; `wrangler rollback` restores the last version | Prompts as versioned artifacts; release gates; rollback |
| Later | Memory (PRD §10), proactive check-ins, streaming in the iPhone app | | |

Phases 0 and 1 are small, and may fix most of what feels rough before any new architecture lands.

## 8. Open questions

1. Do you want to edit the coach's prompts **from the phone** (option b), or is **edit in code, run the gate,
   deploy the coach** (option a) enough? It only decides phase 4.
2. Streaming: may passing sentences show before the whole reply is checked (§6), or stream status only? It only
   decides phase 3.

## Sources (checked 2026-11-02)

- OpenRouter model list and endpoints: `https://openrouter.ai/api/v1/models`,
  `https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints`
- Gemini thinking levels: https://ai.google.dev/gemini-api/docs/thinking · Flex: https://ai.google.dev/gemini-api/docs/flex-inference
- OpenRouter service tiers: https://openrouter.ai/docs/guides/features/service-tiers · streaming and cancellation:
  https://openrouter.ai/docs/api/reference/streaming · usage: https://openrouter.ai/docs/cookbook/administration/usage-accounting
  · Broadcast: https://openrouter.ai/docs/guides/features/broadcast
- Workers streams: https://developers.cloudflare.com/workers/runtime-apis/streams/ · limits:
  https://developers.cloudflare.com/workers/platform/limits/ · Workers Logs:
  https://developers.cloudflare.com/workers/observability/logs/workers-logs/ · traces and custom spans:
  https://developers.cloudflare.com/workers/observability/traces/ · pricing from 2026-12-01:
  https://developers.cloudflare.com/observability/pricing/
- Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/pricing/ · KV consistency:
  https://developers.cloudflare.com/kv/concepts/how-kv-works/
- AI Gateway logging: https://developers.cloudflare.com/ai-gateway/observability/logging/
- Streaming guardrails: Azure https://learn.microsoft.com/azure/foundry/openai/concepts/content-streaming · NeMo
  https://docs.nvidia.com/nemo/guardrails/latest/configure-guardrails/yaml-schema/streaming/output-rail-streaming ·
  Guardrails AI https://guardrailsai.com/guardrails/docs/concepts/streaming · OpenAI Agents SDK
  https://openai.github.io/openai-agents-python/guardrails/
- WebKit stream bug: https://bugs.webkit.org/show_bug.cgi?id=265331 · CapacitorHttp: https://capacitorjs.com/docs/apis/http
- Langfuse prompts: https://langfuse.com/docs/prompt-management/features/prompt-version-control · GitHub
  integration: https://langfuse.com/docs/prompt-management/features/github-integration · ingestion change:
  https://langfuse.com/faq/all/deprecated-api-migration
- PostHog privacy mode: https://posthog.com/docs/llm-analytics/privacy-mode · prompts: https://posthog.com/docs/prompt-management/prompts
- OpenTelemetry GenAI conventions: https://github.com/open-telemetry/semantic-conventions-genai
- Anthropic, "Building effective agents" (workflows vs agents): https://www.anthropic.com/engineering/building-effective-agents
