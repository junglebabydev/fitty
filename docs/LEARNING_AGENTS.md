# Learning agents through this app

A study guide. Each common "AI agent engineer" skill is matched to the small piece of this app
that teaches it. Everything is plain TypeScript: no agent framework, so every step is code you can
read. Build plan: [PRD_COACH_CHAT.md](PRD_COACH_CHAT.md). Each phase's PR adds a
**"What this phase teaches"** note to the matching section below.

Status legend: **planned** (in the PRD, not built), **built** (merged, with file links), **skipped** (and why).

---

## Phase notes

### Phase 1: prompt as sections (built)
**Teaches:** prompt composition, and golden tests for prompts.
**Read, in order:** `src/engine/__tests__/coachPrompt.test.ts` (golden files in `__golden__/`), then
`src/engine/coachPrompt.ts` (`PromptSection`, `SECTION_ORDER`, `assembleCoachPrompt`), then
`buildCoachSystemPrompt` in `src/engine/coach.ts`, which is now three lines.
**The idea:** a prompt is code. Split it into pure functions, and pin the output with a golden file
so a refactor can't change a word by accident. Frameworks call these "prompt templates". Here they
are plain functions you can unit test.
**Try:** change one word in `rulesSection`, run `npx vitest run coachPrompt` and read the diff.

### Phase 2: safety screen before the model (built)
**Teaches:** input guardrails, and keeping sensitive text away from the model.
**Read, in order:** `src/engine/__tests__/chatSafety.test.ts` (the trigger and false-positive
tables), then `src/engine/chatSafety.ts`, then `toModelTurns` and `tagSafety` in
`src/features/coach/chat.ts`, then the first lines of `send()` in `src/screens/Coach.tsx` and
`submit()` in `src/features/composer/Composer.tsx`.
**The idea:** the cheapest, most reliable guardrail is code that runs before any model. It is
deterministic, works offline and can't be talked out of its job. Frameworks offer "input rails"
(NeMo Guardrails) or moderation APIs; a regex table with tests is the simple version. The screened
text is replaced in history, so later model calls never see it.
**Try:** add a phrase to `MUST_NOT_TRIGGER` that you think is a false positive, and see whether it passes.

### Phase 3: reply check after the model (built)
**Teaches:** output guardrails, and grounding numbers.
**Read, in order:** the `checkReply (L3)` tests in `src/engine/__tests__/chatSafety.test.ts` (the
must-pass and must-reject tables), then `checkReply` in `src/engine/chatSafety.ts`, then the
lines after `coachChat` in `send()` in `src/screens/Coach.tsx`.
**The idea:** don't trust the model's output. Clean up what's harmless (markdown, emoji), reject
what's unsafe (doses, diagnoses, shaming), and check every calorie or protein number against what
the model was actually given, so it can't make figures up. Rejected replies fall back to the
deterministic answer. In frameworks this is an "output parser" or "output rail".
**Also learned while building:** the Phase 2 safety note first said "do not push training or diet
targets", and the model then refused ordinary questions. Prompt wording changes behaviour a lot,
which is why Phase 7 (the eval) exists.
**Try:** ask the coach "how many calories in 3 eggs?". If it answers with a number that isn't in
your facts, you'll see "AI reply withheld".

### Phase 4: specialist agents and keyword routing (built)
**Teaches:** multi-agent routing without a framework.
**Read, in order:** `src/engine/__tests__/coachAgents.test.ts` (the routing table), then
`src/engine/coachAgents.ts` (`agentSections`, `routeDeterministic`), then `factLines` and
`factsSectionFor` in `src/engine/coachPrompt.ts`, then the three routing lines in `send()` in
`src/screens/Coach.tsx`.
**The idea:** an "agent" here is just a different prompt: the same guardrails, a FOCUS line, and
a slice of the facts. The router is a function that returns an agent id. Rules go first because
they're free and testable; only undecided messages will need a model (Phase 5). In LangGraph, this
function is a conditional edge, and each agent is a node.
**Try:** type "back squat or leg press?" and then "my back hurts". Watch the FOCUS line change in
the request body (DevTools → Network → `/api/ai/chat`).

### Phase 4b: the coaching prompt (built)
**Teaches:** turning behaviour-change research into prompt rules, and changing a golden file on purpose.
**Read:** `identitySection`, `rulesSection` (S1–S9 at the end) and `coachingSection` in
`src/engine/coachPrompt.ts`, then `git show` on this commit's `__golden__/` diff.
**The idea:** each rule traces back to evidence (docs/research/COACH_CHAT_REFERENCES.md §2):
motivational interviewing (M4, M5), implementation intentions (M1: an action tied to a time or
cue), habits (M6). The golden diff is the review: you see every word the model will now read.

### Phase 5: decision-model classifier and Flex tier (built)
**Teaches:** a classifier as a separate, cheap model; minimising what leaves the device; cost tiers with graceful fallback.
**Read, in order:** `worker/__tests__/tiers.test.ts`, then `openRouterChat` (Flex then standard)
and `openRouterDecide` in `worker/openrouter.ts`, then the `/decide` branch in `worker/index.ts`,
then `aiDecide` in `src/ai/gateway.ts`, then `AGENT_QUESTION` and `agentFromDecision` in
`src/engine/coachAgents.ts`, then the routing lines in `send()` in `src/screens/Coach.tsx`.
**The idea:** routing doesn't need a chat model. A decision model answers a typed question with a
calibrated probability, so "under 0.6 → generalist" is a meaningful rule. It only sees the single
message. For cost, try the cheap tier with a short timeout and fall back once, so the user never
waits minutes.
**Try:** after deploying, run `npx wrangler tail` and send a few messages: you'll see `decide ms=`
and `chat tier=flex` or `tier=standard` lines.

### Phase 6: tool calling (built)
**Teaches:** the ReAct loop by hand, read-only tools, RAG in its simplest form.
**Read, in order:** the `coachChatWithTools` tests in `src/ai/__tests__/gateway.test.ts`, then
`coachChatWithTools` in `src/ai/gateway.ts` (the loop), then `src/features/coach/tools.ts` (specs,
summarisers, `runCoachTool`) and its tests, then `AGENT_TOOLS` in `src/engine/coachAgents.ts`, then
the tool pass-through in `worker/guard.ts` (`parseTools`, `parseChatRequest`) and `worker/openrouter.ts`
(`buildChatRequest`, `readToolCalls`).
**The idea:** the model never touches your data. It asks ("get_sleep, days 14"), your code runs
the query on the phone and returns numbers it computed, and the model writes the answer. The loop
has a hard cap; on the last call the tools are still declared but `tool_choice: "none"` forces
text. `search_library` is RAG without embeddings: keyword scoring over a small library, pasted
back as a tool result. Vercel AI SDK's `maxSteps`, or LangChain's AgentExecutor, is this loop.
**Try:** after deploying, ask "how did I sleep the last two weeks?" and open the Privacy Ledger:
two coach calls, the second "with data the coach looked up".

## 1. Agents: tool calling, planning, reasoning, memory

**The idea.** An agent is a loop: a model reads the conversation, then either answers or asks to
run a tool. Your code runs the tool and hands back the result, and the loop repeats until it
answers. That's "ReAct" (reason + act, Yao et al., 2022). Planning and reasoning are the model
deciding which tool to call and when it has enough to answer.

**In this app.**
| Piece | Where | Status |
|---|---|---|
| Specialist agents: a system prompt plus a fact slice | `src/engine/coachAgents.ts` | built (Phase 4) |
| Tool calling loop, max 3 steps, read-only tools | `coachChatWithTools` in `src/ai/gateway.ts`, `src/features/coach/tools.ts` | built (Phase 6) |
| Short-term memory: the last N messages | `src/screens/Coach.tsx` (`toTurns`, `MAX_TURNS`) | built |
| Long-term memory: capped, user-approved | PRD §10 | planned (later) |

**Try it.** Once Phase 6 lands, ask "how did I sleep the last two weeks?" and read the privacy
ledger. You'll see 2 model calls: one asking for `get_sleep`, one answering with the result.

**What a framework adds.** LangChain's `AgentExecutor` or the Vercel AI SDK's `maxSteps` run the
same loop for you. Writing it by hand once is how you learn what they hide: the step cap, tool
errors going back to the model, and a forced final answer.

## 2. Multi-agent orchestration (LangGraph, CrewAI, AutoGen, LangChain)

**The idea.** Several specialised prompts, plus something that decides who handles what. The
shapes are: a **router** (pick one agent), a **supervisor** (one agent delegates to others), or a
**crew or conversation** (agents talk to each other). The router is the simplest and the easiest
to test.

**In this app.** A router: the L1 safety screen, then deterministic rules, then Jev, then the
`coach` fallback (PRD §11.2). One agent answers each message.

**Map to the frameworks.**
| Concept | LangGraph | CrewAI | AutoGen | Here |
|---|---|---|---|---|
| Agent | node | `Agent` | `AssistantAgent` | `AgentSpec` |
| Routing | conditional edge | `Process.hierarchical` manager | `GroupChat` speaker selection | `routeMessage()` |
| Shared state | `StateGraph` state | task context | chat history | turns + `CoachFacts` |

**Try it (optional, outside the app).** Rebuild `routeMessage` as a LangGraph graph in a notebook,
with a classifier node, six agent nodes and a conditional edge, and run the Phase 7 routing set
through both. Same results, more code: that's the lesson.

**Skipped in the app:** the frameworks themselves. They're Python-first, heavy for a phone app
plus a Worker, and they'd hide what you're trying to learn.

## 3. RAG, memory, knowledge graphs

**The idea.** RAG (retrieval-augmented generation) means fetching relevant text, pasting it into
the prompt, then letting the model answer. Retrieval can be keywords, full-text search or vector
embeddings. Choose by how much data you have.

**In this app.**
| Piece | Where | Status |
|---|---|---|
| RAG-lite: keyword search over the exercise library and food packs | `searchLibrary` in `src/features/coach/tools.ts` | built (Phase 6) |
| Structured "retrieval": today's facts from SQLite | `src/features/coach/facts.ts` | built |
| A small knowledge graph: exercise → pattern → region → avoid tags → substitutes | `src/data`, `src/engine/symptomGate.ts` | built (as plain data) |

**Skipped:** embeddings and a vector database (a few hundred items don't need them), and a graph
database (the graph above is a few arrays). Revisit when there's a real corpus, such as the
research docs plus reports.

## 4. APIs and backend for agents

**In this app, already built.** The Cloudflare Worker (`worker/index.ts`, `worker/guard.ts`)
covers the hard parts: auth (the PIN), same-origin checks, body limits, rate limiting (sliding
window), a concurrency cap, a global daily budget (Durable Object), provider fallback and error
mapping. Phases 5–6 add model tiers, a `/api/ai/decide` route for Jev, and tool pass-through.

**Read.** `worker/guard.ts` top to bottom. It's the checklist of what an agent API needs before
the model call.

## 5. From paper to production (reasoning, planning, RL)

| Paper idea | Simple version here | Status |
|---|---|---|
| ReAct (reason and act with tools) | The Phase 6 tool loop | planned |
| Self-check or critique (Reflexion-style) | The L3 reply check, deterministic, not a second model | planned (Phase 3) |
| Calibrated classification | Jev's probabilities and the 0.6 threshold | planned (Phase 5) |
| RL from feedback | Accept and Reject decisions logged in `coach_decisions`. Analyse them; don't train | built (data only) |

**Skipped:** training anything. One user can't produce enough data, and it's the wrong risk for health advice.

## 6. Event-driven, scalable agent platforms

**Skipped.** Queues, streams and orchestration clusters solve many users and many services. This
app has one user, and the data lives on the phone. The simple event-driven version is proactive
check-ins (PRD §10): a deterministic trigger runs when a log is saved or the app opens, and only
then calls the model.

## 7. Evals, observability, cost

**The idea.** An eval is a fixed set of inputs with checks on the outputs, run on every change.
Prefer deterministic checks (did it call `get_sleep`? did it say 995?) over a model grading a
model, because they're reproducible and free.

**In this app.**
| Piece | Where | Status |
|---|---|---|
| Planner eval, the pattern to copy | `scripts/plan-eval/` | built |
| Chat and routing eval, SHARP categories | `scripts/chat-eval/`, PRD Phase 7 | planned |
| Observability: agent, tier, model, duration, tokens, never content | Worker logs, PRD §11.5 | planned |
| Cost: deterministic routing first, Jev at $0.042 per M, Gemini Flex with fallback | PRD §11.2, §11.5 | planned |
| Per-call privacy log | Privacy Ledger screen, `src/screens/PrivacyLedger.tsx` | built |

**Known gap.** The Worker returns `costUsd: null` on every call. OpenRouter reports cost in the
response's `usage`, so recording it is a small, useful first observability task.

---

## How to read a phase PR

1. Read the "What this phase teaches" note added here.
2. Read the tests first. They state the behaviour in plain examples.
3. Then the code, in the order the note lists.
4. Run `npm test`, then break one thing on purpose and watch which test fails.
