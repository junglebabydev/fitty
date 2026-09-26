# Research — what other chat products teach the Coach chat (Sept 2026)

Feeds [../PRD_COACH_CHAT.md](../PRD_COACH_CHAT.md). Goal from the owner: **a helpful coach that makes life
easy and motivates you to be healthy. Demanding on adherence, conservative on symptoms.**

**Verdict: the PRD's shape holds up.** Every serious health coach below keeps the numbers out of the
language model, adds memory the user can see and edit, and does proactive check-ins with a cheap
trigger. The one product that let its persona run loose (Grok companions) is the clearest example of
what not to do. Two things to add: a **coaching** section built on motivational interviewing and
"make the next step tiny", and an eval rubric taken from Google's SHARP.

## 1. Product by product

### OpenClaw (open-source personal agent)
- The agent is assembled at session start from separate files: `SOUL.md` (personality, values, tone,
  limits, injected first), `AGENTS.md` (operating rules, scope, security), `USER.md` (stable
  preferences and profile), `MEMORY.md` (long-term facts the agent writes itself), and an optional
  `HEARTBEAT.md` checklist read on every scheduled run.
- Heartbeat: every ~30 minutes a cheap model runs through the checklist. The user only hears about
  real alerts, and a stronger model is used only when something fires.
- Memory is plain markdown and human-readable, not a hidden database.

**Take:** separate identity from rules from user facts (PRD §4.3 already does this, in TypeScript).
For check-ins, a cheap trigger decides and the user only hears about something real.
**Leave:** files that can be edited at runtime. Here that would let a safety rule be edited away.

### Hermes Agent (Nous Research, open source, Feb 2026)
- Memory is two small files with **hard caps**: `MEMORY.md` 2 200 characters, `USER.md` 1 375
  characters. When a write would go over the cap it fails, and the agent has to consolidate first.
  Nothing is silently dropped.
- Memory is injected at session start as a **frozen snapshot**. Writes during a session only take
  effect next session, which also keeps the prompt cache stable.
- `write_approval: true` stages every memory write for the user to approve or reject.
- Users can view, edit and prune what it has learned (`/journey`).

**Take:** caps, a frozen snapshot per conversation, user approval before anything is remembered,
and a place to see and delete it. This is the memory design for PRD §10.
**Leave:** skills the agent writes for itself. A health coach should not rewrite its own behaviour.

### Grok (xAI) companions ("grokbnot")
- Persona companions (Ani, Rudy) launched July 2025. xAI announced in July 2026 that it would retire
  the companion mode.
- A Common Sense Media assessment (reported January 2026) found that Grok **discouraged professional
  help** on mental health, and **went along with** testers who didn't want to talk to an adult. It
  called the content guardrails brittle.

**Take:** this is the case study for rule S3 (don't just agree) and a new rule S9 (never discourage
professional help). A persona has to sit on top of the guardrails, never replace them.

### Meta AI, Muse Spark (April 2026)
- Meta's first Muse model. Meta says it worked with **1 000+ physicians** to curate health training
  data. On HealthBench Hard it reportedly scores 42.8, against 14.8 for Claude Opus 4.6 and 20.6 for
  Gemini 3.1 Pro (Meta's figures, reported by third parties).
- For health answers it can show interactive views (a food's nutrition, the muscles an exercise works).

**Take:** health quality varies a lot between models. That is the case for the Phase 5 eval choosing
the model, rather than assuming one. If Muse Spark is reachable through an API or OpenRouter, add it
as a candidate. "Show, don't tell" (the Train and Eat screens) beats long text replies.

### Google, Gemini-powered Fitbit personal health coach
- Three kinds of agent: a **conversational** agent that runs the dialogue, a **data science** agent
  that does the numerical reasoning on the user's time series, and **domain expert** agents grounded
  in authoritative sources. The coaching agent uses **motivational interviewing** for goals and habits.
- Evaluated with **SHARP**: Safety, Helpfulness, Accuracy, Relevance, Personalization. More than
  1 million human annotations and 100k hours of expert review.
- Answers about the user's data check the data exists, compare against the **personal baseline**,
  then add population context.

**Take:** the split already exists here. The rules engine is the data science agent, the engine's
rules are the domain expert, and the LLM is the conversational agent. Add the motivational
interviewing behaviours to the prompt. Use SHARP as the category names for the Phase 5 eval.
**Update 2026-09-25:** the owner chose the multi-agent shape; see PRD §11. Kept small: no framework, one orchestrator function.

### WHOOP Coach and Oura Advisor
- Both added **memory** in 2026: goals, routines, injuries and limits on time or energy, added by
  text or voice. Both also do **proactive check-ins** (WHOOP's Daily Outlook).
- Both state they are for information and wellness, not medical advice.

**Take:** the kinds of memory worth keeping are goals, routines, injuries and constraints. That's the
seed list for PRD §10.

### ChatGPT Health (OpenAI, Jan 2026)
- A separate Health space with its own memories, kept apart from normal chats. Records and apps are
  connected only if the user opts in. Health data is not used for training. "Not for diagnosis or
  treatment."

**Take:** health memory stays on the device and apart from everything else, which matches the app's
local-first design. Opt-in for each data source, as reports already are.

## 2. Motivation: what the evidence supports

| Technique | Evidence | What it becomes in the prompt |
|---|---|---|
| Motivational interviewing (MI) | Used in digital physical-activity interventions; basis of Google's coach | Reflect what the user said, ask at most one open question, respect their choice (offer two options when there is a real choice) |
| Implementation intentions ("when X, I will Y") | Meta-analytic support for physical activity | Tie the next action to a time or cue from today ("after work, before dinner") |
| Habit formation from repetition cued by context | Systematic reviews of digital habit design | Make the next step **tiny** and repeatable; point to saved meals and templates |
| Chatbots for lifestyle change | npj Digital Medicine meta-analysis: small positive effects | Keep expectations modest; consistency over intensity |
| Empathy in coaching chatbots | 2026 preprint: empathy alone did not change behaviour | Warmth is fine, but a **specific action** is what counts |

## 3. What this changes in the PRD

1. §4.3 gets a new `coaching` section (M1–M6), placed after `style`.
2. §6 gets **S9**: never discourage professional help (the Grok finding).
3. §8, question 1 is settled: demanding on adherence, conservative on symptoms, helpful and motivating.
4. §9, Phase 5 uses the SHARP categories. (Muse Spark was considered and dropped on 2026-09-25: models are Jev + Gemini only.)
5. §10 memory follows the Hermes design: capped, frozen per conversation, user-approved, deletable.

## Sources

- OpenClaw: [workspace files explained](https://capodieci.medium.com/ai-agents-003-openclaw-workspace-files-explained-soul-md-agents-md-heartbeat-md-and-more-5bdfbee4827a), [default AGENTS.md](https://docs.openclaw.ai/reference/AGENTS.default), [Four things OpenClaw got right](https://deadneurons.substack.com/p/four-things-openclaw-got-right)
- Hermes Agent: [persistent memory docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory), [docs](https://hermes-agent.nousresearch.com/docs/)
- Grok: [TechCrunch, Jan 2026 safety report](https://techcrunch.com/2026/01/27/among-the-worst-weve-seen-report-slams-xais-grok-over-child-safety-failures/), [MediaPost on companions](https://www.mediapost.com/publications/article/407451/xais-chatbot-companions-raise-safety-moderatio.html)
- Muse Spark: [Meta announcement](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/), [Meta AI blog](https://ai.meta.com/blog/introducing-muse-spark-msl/), [Healthcare Digital](https://healthcare-digital.com/news/metas-muse-spark-physician-informed-ai-in-healthcare)
- Fitbit / Gemini: [Google Research, building the personal health coach](https://research.google/blog/how-we-are-building-the-personal-health-coach/), [ZenML case study](https://www.zenml.io/llmops-database/ai-powered-personal-health-coach-using-gemini-models)
- WHOOP / Oura: [WHOOP Memory beta](https://gadgetsandwearables.com/2026/05/08/whoop-memory/), [WHOOP Coach](https://www.whoop.com/us/en/thelocker/new-ai-guidance-from-whoop/), [Oura Advisor](https://www.androidcentral.com/wearables/oura-ring/oura-rolls-out-its-ai-powered-personal-trainer)
- ChatGPT Health: [CNBC](https://www.cnbc.com/2026/01/07/openai-chatgpt-health-medical-records.html), [The Hacker News](https://thehackernews.com/2026/01/openai-launches-chatgpt-health-with.html)
- Motivation: [MI for healthy lifestyles (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12526391/), [digital habit formation review (JMIR)](https://www.jmir.org/2024/1/e54375), [chatbots and lifestyle meta-analysis (npj)](https://www.nature.com/articles/s41746-023-00856-1), [empathy in PA chatbots (arXiv)](https://arxiv.org/pdf/2606.26641)
