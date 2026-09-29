# Cross-model planner evaluation (manual)

Sends the app's **real** planner prompt (`buildPlannerSystem` + `plannerPrompt`) and **real** schema
(`PLAN_SCHEMA`) to several models through OpenRouter, and scores every reply with the app's own
deterministic validator. It answers one question: **is a cheap open-weights model good enough to run
the $9 tier, or does that tier need a frontier model?**

```bash
OPENROUTER_API_KEY=sk-or-... npx vite-node scripts/plan-eval/run.ts
OPENROUTER_API_KEY=sk-or-... npx vite-node scripts/plan-eval/run.ts deepseek/deepseek-chat qwen/qwen3-235b-a22b
```

It makes real, paid API calls, so it is **never** part of `npm test`. Typecheck with
`npx tsc -p scripts/plan-eval/tsconfig.json --noEmit`.

## No LLM judge

Every number is computed from `validateAIPlan` and the exercise library. No model grades another
model, so the scores are reproducible and cannot drift with a judge's mood.

| Metric | Meaning | Better |
|---|---|---|
| `usable` | Replies that survived validation with at least one exercise | higher |
| `halluc` | Share of returned ids that are not in the allowed library | lower |
| `gate-violations` | Exercises the validator had to drop or substitute because the symptom gate forbade them | lower |
| `min-off` | Mean \|estimated session minutes − requested\| | lower |
| `patterns` | Mean distinct movement patterns per session — a proxy for a balanced session | higher |
| `copy` | Name ≤5 words, rationale ≤22 words, note ≤10 words, no emoji | higher |
| `expects` | Per-case expectations met (see below) | higher |
| `p50` | Median latency | lower |

`gate-violations` is the safety metric and the one that should decide the tier. The validator always
catches these, so a violation is never shipped to a user — but a model that produces them constantly
is a model that needs the deterministic layer to save it on every call.

## Cases

12 fixtures in `fixtures.ts`, spanning focus × minutes × gate state × condition flags × equipment.
Synthetic, built in memory, no database and no real health data. Two carry extra expectations:

- **`healthy-commercial-lower-45`** is a regression. `plannerLibrary()` used to filter the model's
  allowed list through a hard-coded `PROFILE_AVOID = ['deep_knee_flexion', 'impact']` — the reference
  persona's constraints, applied to everyone — and `buildPlannerSystem` told every user "prefer
  machines… no deep knee flexion… no running or jumping" regardless of their history. Between them,
  every barbell lift was unreachable. This case asserts a healthy user with a commercial gym gets
  free-weight work.
- **`knee-history-condo-lower-45`**, **`knee-amber-today-lower-45`** and **`back-history-commercial-full-45`**
  assert the opposite direction: forbidden tags must not survive into the final plan.

## Interpreting the result

A model is a credible $9 tier if it reaches ~0% `halluc`, near-zero `gate-violations`, `min-off`
under about 5, and `expects` at 100%. Latency matters less than it looks — the plan is generated
once per session, not per interaction.
