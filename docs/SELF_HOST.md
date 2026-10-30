# Self-host on Coolify (Docker)

The same app and AI endpoint as the Cloudflare deploy (docs/DEPLOY.md), in one Node container. `server/host.ts` runs `worker/index.ts` and `coach/worker.ts` unchanged and replaces the Workers bindings:

| Cloudflare | Self-hosted |
| --- | --- |
| Static assets (`ASSETS`) | Files from `dist/`. Client-side routes get `index.html`. Hashed `/assets/*` are cached for a year, everything else is revalidated. |
| `fitty-coach` service binding (`COACH`) | The coach Worker called in-process. It has no URL of its own here either. |
| `DailyBudget` Durable Object | The same class, stored in `$DATA_DIR/daily-budget.json` |
| `AI_LIMITER` rate limit | Not used. One process, so the in-memory limits in `worker/index.ts` already hold. |

## Coolify app

- Build pack **Dockerfile**, base directory `/`, port **8080**.
- Persistent volume mounted at **`/data`**.
- Memory limit 256 MB is plenty.
- Runtime-only environment variables, the same names as the Worker secrets and vars (docs/DEPLOY.md §2):
  - `OPENROUTER_API_KEY` (or `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`)
  - `COACH_BRIDGE_PIN`
  - optional: `OWNER_PROFILE`, `COACH_PROVIDER`, `COACH_OPENROUTER_MODEL`, `COACH_OPENROUTER_DATA_COLLECTION`, `COACH_MODEL_ROUTER`, `COACH_SERVICE_TIER`

## Rules

1. **Behind Cloudflare Access before the key is set.** The same reasons as docs/DEPLOY.md §4 apply, and `/api/ai/reauth` works the same way.
2. **Only reachable through the reverse proxy.** The server rebuilds the request URL from `X-Forwarded-Proto` and `Host`, so the Worker's HTTPS and same-origin checks only mean something when the proxy sets those headers. Don't publish port 8080 on the host.
3. **A new address is a new, empty app** (docs/DEPLOY.md §6). Export from the old address first if you want to keep anything.

## Run it locally

```sh
npm run build
npx esbuild server/start.ts --bundle --platform=node --format=esm --outfile=build/server.mjs
COACH_BRIDGE_PIN=… OPENROUTER_API_KEY=… node build/server.mjs   # http://localhost:8080
```
