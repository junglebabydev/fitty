# Deploy to Cloudflare (Worker + static assets)

The app deploys as **one Cloudflare Worker named `fitty`**: the built PWA (`./dist`) is served as static assets, and the Worker script (`worker/index.ts`) answers only `/api/ai/*`, the hosted AI endpoint. The **coach** (prompts, agents, routing, reply check, model calls) is a **second Worker, `fitty-coach`**, deployed on its own (section 1b), so a coach update never touches the app. Everything is described in `wrangler.jsonc`; the GitHub repo `junglebabydev/fitty` is connected through **Workers Builds**, so every push to the production branch deploys.

Checked against the Cloudflare and Google docs on 2026-09-18 (links at the end).

## 1. Workers Builds form (dashboard values)

| Field | Value |
|---|---|
| Build command | leave empty, or `npm run build` (optional: `wrangler.jsonc` has `build.command = "npm run build"`, so Wrangler builds before every deploy anyway) |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | leave empty (see note 4) |
| Path (root directory) | `/` |
| Worker name | `fitty` (it must equal `name` in `wrangler.jsonc`, or the build fails with "The name in your Wrangler configuration file must match the name of your Worker") |

Notes:
1. Workers Builds installs dependencies from `package-lock.json` by itself with `npm ci`, so a build gets exactly the locked versions. Keep the lockfile committed, and do not replace the install step with `npm install`. Node comes from `.nvmrc` (22); Wrangler 4 needs Node 22 or newer.
2. If you also fill in the dashboard build command, the app is built twice (once by that step, once by Wrangler). Leaving the dashboard field empty is the simplest setup.
3. From your own machine: `npm run deploy` (build + `wrangler deploy`, needs `npx wrangler login` once) and `npm run cf:dry` (bundles the Worker into `.wrangler/dry` without logging in or uploading).
4. **No preview deploys.** Every preview build is one more public `*-fitty.<subdomain>.workers.dev` origin with the production `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` and `COACH_BRIDGE_PIN` bound and its own set of in-memory limiters, and any branch pushed to the repo would run its Worker code with those secrets. `wrangler.jsonc` therefore sets `"preview_urls": false`, and the non-production deploy command stays empty. If you really need previews, set `preview_urls` to `true`, use `npx wrangler versions upload` there, and make sure the Access policy in section 4 covers previews.
5. The first `wrangler deploy` also creates the `DailyBudget` Durable Object (the `migrations` entry in `wrangler.jsonc`). SQLite-backed Durable Objects are available on the Workers Free plan, and nothing has to be created by hand. Both bindings are optional in the code: if a first deploy is refused because of the `ratelimits` or the `durable_objects` + `migrations` entries, remove that entry and the Worker runs without that one limit.

## 1b. The coach Worker (`fitty-coach`)

`fitty` forwards `POST /api/ai/coach/turn` to `fitty-coach` through a **service binding** (`COACH` in `wrangler.jsonc`), after its own HTTPS, origin, PIN, rate-limit and daily-budget checks. `fitty-coach` has no public URL (`workers_dev: false`, no routes), no build step and no assets (`wrangler.coach.jsonc`), so deploying it never runs `npm run build` and never changes what phones load.

**First time (before the PR that adds the binding merges).** Cloudflare refuses to deploy a Worker whose service binding points at a Worker that does not exist yet, so `fitty-coach` goes first, from your Mac:

```bash
export CLOUDFLARE_ACCOUNT_ID=<the jungle.baby account id>
npx wrangler secret put OPENROUTER_API_KEY --config wrangler.coach.jsonc
npm run deploy:coach
```

Then merge: Workers Builds deploys `fitty` with the binding.

**Updating the coach.** Change files under `coach/`, run `npm test` and `npm run typecheck:coach`, merge, then `npm run deploy:coach` from `main`. The app is not rebuilt. `npm run coach:dry` bundles it into `.wrangler/coach-dry` without uploading. The contract test (`coach/__tests__/turn.test.ts`, fixture `turn-request-v1.json`) fails if a coach change would stop understanding what the deployed app sends. Optionally, connect a second Workers Builds project to the same repo with Worker name `fitty-coach`, deploy command `npx wrangler deploy --config wrangler.coach.jsonc`, and build watch paths `coach/*` and `worker/*`, so coach changes deploy on merge like the app does.

**Coach settings** (vars in `wrangler.coach.jsonc`, secret with `--config wrangler.coach.jsonc`):

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Secret | none | Required. The coach calls OpenRouter only. |
| `COACH_OPENROUTER_MODEL` | Var | `google/gemini-3.8-flash` | Chat model for every agent. |
| `COACH_OPENROUTER_DATA_COLLECTION` | Var | `deny` | Same meaning as on `fitty`. |
| `COACH_SERVICE_TIER` | Var | `flex` | Flex first with an 8 s timeout, then standard. `standard` turns Flex off. |
| `COACH_MODEL_ROUTER` | Var | `typesafe/jev-1.13` | Decision model that picks the agent for an undecided message. Pinned. |

**Budget.** One coach turn counts once against `fitty`'s daily budget and rate limit, but step 1 can make two OpenRouter calls (Jev, then chat). A message with tools is 2–3 turns.

**Without the coach Worker** (binding missing, or its key unset) coach chat answers from local data; every other AI feature is unaffected. Coach chat also needs the hosted Worker or the Mac bridge: with a Gemini or Anthropic key entered directly in the app, it answers from local data.

## 2. Secrets (required for hosted AI)

The site works without any of these; AI through the Worker stays off until both a key and a PIN exist.

| Name | Type | What it is |
|---|---|---|
| `COACH_BRIDGE_PIN` | Secret | The token the app sends as `x-coach-pin`. Treat it as a bearer token, not a PIN you remember: **at least 8 characters**; longer is better, generated with `openssl rand -base64 24` and pasted once per device. ASCII only (a browser cannot send other characters in a request header). Its length is what stops guessing. No PIN, no AI: the Worker refuses every call. |
| `OPENROUTER_API_KEY` | Secret | OpenRouter key (`sk-or-…`). Used first when present. Default model `google/gemini-3.8-flash`; change it with the plain variable `COACH_OPENROUTER_MODEL`. Every request sends `provider.data_collection = "deny"`, so OpenRouter routes only to providers that do not retain or train on prompts (set `COACH_OPENROUTER_DATA_COLLECTION=allow` to lift that). An OpenRouter key saved under `GEMINI_API_KEY` is recognised by its prefix and is never sent to Google. |
| `GEMINI_API_KEY` | Secret | Google AI Studio key. Used when there is no OpenRouter key. |
| `ANTHROPIC_API_KEY` | Secret | Anthropic key. Used when there is no Gemini key, or when `COACH_PROVIDER` is `anthropic`. |
| `OWNER_PROFILE` | Secret (optional) | The owner's profile as JSON (shape: `OwnerSetup` in `src/config/owner.ts`). On a phone with no profile yet, the hosted app asks for the PIN, loads this from `GET /api/ai/owner` and skips onboarding. Personal data: it lives only here and in the git-ignored `src/config/owner.local.ts`, which only dev builds read, so it is never in the repo or in any production bundle (including `npm run deploy` from the Mac). Set or update it from the Mac with `npm run owner:secret` (reads `owner.local.ts`, pipes the JSON to `wrangler secret put`). Changing it later does not touch a phone that already has a profile. |

Add them in either place:
1. **Dashboard:** Workers & Pages → `fitty` → Settings → Variables and Secrets → Add → type **Secret** → name and value → Deploy.
2. **CLI:** `npx wrangler secret put COACH_BRIDGE_PIN`, then `npx wrangler secret put GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`). Wrangler prompts for the value; it is never written to disk.

Never commit a key or the PIN, and never put them in `wrangler.jsonc` `vars` or in `VITE_*` variables (those end up in the public bundle). `.env`, `.env.*` and `.dev.vars*` are git-ignored. Secrets survive deploys.

### Before you add a key: set a hard spend limit at the provider (required)

The PIN is one static secret. It sits in plain text in every device's local database and in the raw SQLite export, so plan for the day it leaks. The Worker's own limits (section 5) only slow a caller down; the cap that holds is the provider's.

1. **Anthropic:** in the Console, create the key in a workspace of its own and set a monthly spend limit on that workspace (Settings → Limits).
2. **Google:** create the Gemini key in a Cloud project used for nothing else. In that project lower the per-day request quota of the Generative Language API (APIs & Services → Generative Language API → Quotas) and add a billing budget with an alert.
3. If the PIN or a key may have leaked: replace `COACH_BRIDGE_PIN` (`npx wrangler secret put COACH_BRIDGE_PIN`), revoke the key at the provider, then enter the new PIN on each device.

Optional plain settings go in `wrangler.jsonc` → `vars` (dashboard-only text variables are overwritten by the next `wrangler deploy`):

| Var | Default | Meaning |
|---|---|---|
| `COACH_PROVIDER` | unset | `gemini` or `anthropic`. Unset = Gemini if its key exists, else Anthropic. |
| `COACH_GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model code. |
| `COACH_MODEL` | `claude-opus-5` | Claude model id. Opus is the most expensive tier; `claude-sonnet-5` or `claude-haiku-4-5` cost a fraction of it per call. Only matters when the Worker uses the Anthropic key. |
| `COACH_SERVICE_TIER` | `flex` | OpenRouter only, `/api/ai/chat` on `fitty`. The coach Worker has its own copy (section 1b); this one only matters for app versions from before the coach Worker. |
| `COACH_MODEL_ROUTER` | `typesafe/jev-1.13` | OpenRouter only, `/api/ai/decide` on `fitty`, kept for app versions from before the coach Worker. The coach Worker has its own copy (section 1b). |

Then open the site → **Settings → AI**, enter the same PIN once per device. The status line should read connected, with the provider name.

### Local `wrangler dev`

Create `.dev.vars` next to `wrangler.jsonc` (it is git-ignored) and run `npx wrangler dev`:

```
COACH_BRIDGE_PIN=<8 or more characters; a long passphrase is best>
GEMINI_API_KEY=<your key>
```

For everyday development keep using `npm run dev`: there `/api/ai` is the Mac bridge (Claude Code, your Claude subscription), not the Worker.

## 3. Read this before using a free Gemini key: it is health data

From the Gemini API Additional Terms of Service (effective 2026-03-23):

1. **Free (unpaid) tier** — a key on a Google Cloud project *without* an active billing account. Google uses what you send and what comes back to improve and develop its products and machine-learning technology, human reviewers may read and annotate it, and the terms say: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." Meal photos, lab reports and coach conversations are exactly that.
2. **Paid tier** — the same API through a Cloud project *with* an active billing account. Google does not use prompts, files or responses to improve its products, processes them under its data processing addendum, and logs them for a limited period only for abuse detection and legal requirements.
3. In the EEA, Switzerland and the UK the paid-tier data terms apply to the free quota as well.

**Recommendation:** enable billing on the project behind `GEMINI_API_KEY` (the Flash model costs little at personal volume), or use an Anthropic key instead. Do not send reports or photos through a free-tier key unless you accept the terms above. Whatever you pick, every call is listed in Settings → Privacy ledger, journal text is never sent, and report summaries reach the coach only if you switched that on.

## 4. Switch on Cloudflare Access (strongly recommended)

This is a personal health app on a public URL. Without Access, anyone who finds the address can load the app shell and hammer the AI endpoint; the PIN, the same-origin rule and the rate limits slow that down, but Access stops it before the Worker even runs.

1. Workers & Pages → `fitty` → **Access** tab → **Protect this Worker behind Access**. If the setup form you are on shows a "Protect with Cloudflare Access" switch, it is the same feature: turn it on. Zero Trust must be enabled on the account first.
2. Choose **All traffic** (production and previews), and a policy that allows only your own email address.
3. This covers the `workers.dev` hostname, preview URLs and any custom domain of this Worker. Check the policy again after you add a custom domain or change `workers_dev` / `preview_urls`: open every hostname of the Worker in a private window and make sure each one shows the Access login.
4. Set the application's **session duration** to the longest you are comfortable with (up to 1 month). The default is 24 hours, and every expiry costs one more sign-in on every device.

Keep the PIN anyway: it is the second lock.

**When an Access session expires**, AI calls fail with a network error (the browser is redirected to the Access login, which a background request cannot follow) and app updates stop arriving. Reloading does not help: the service worker serves the app shell from its cache, so a reload never reaches Access. Open **`/api/ai/reauth`** on the site instead, for example `https://fitty.<subdomain>.workers.dev/api/ai/reauth`. That path always goes to the network, so Access shows its login and the Worker then sends you back to the app. In the iPhone home-screen app there is no address bar: use the "Sign in again" action the app shows when a hosted AI call cannot reach the server. Do not delete the home-screen app to get out of this state, because that also deletes its local database.

## 5. What works where

| Where you open the app | AI options |
|---|---|
| Hosted (Cloudflare) | 1. AI through the Worker: `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` on the server plus the PIN on each device. 2. Or a per-device Gemini or Anthropic key typed into Settings → AI (the browser calls the provider directly; the Worker is not involved). 3. Or the on-device demo. |
| Local Mac (`npm run dev`, phone on the same Wi-Fi) | Claude through Claude Code on the Mac, i.e. your Claude subscription, no API key (README → "AI: run it on your Claude subscription"). Per-device keys work here too. |

The Claude subscription cannot be used from the hosted site: it needs Claude Code running on your Mac.

What the Worker enforces on `/api/ai/*`: PIN on every call (constant-time check), HTTPS and same-origin requests only, no CORS headers, bodies up to 1.5 MB (about a 1 MB file; see section 8 for larger uploads), at most 4 attachments (JPEG, PNG, WebP, GIF, PDF), system prompt cut at 40,000 characters, reply caps of 2,048 tokens (chat) and 8,192 (JSON). Health reveals nothing about keys without the right PIN. Keys, the PIN and upstream error text are never sent to the browser or logged.

Rate limits, and how much each one is worth:

| Limit | Where it is counted | What it is |
|---|---|---|
| 300 AI calls per UTC day (`DAILY_CALL_LIMIT` in `worker/guard.ts`) | The `DailyBudget` Durable Object: one counter for every location and isolate, kept across restarts | The Worker's own spend cap. The provider-side limit from section 2 is still the one to rely on. |
| 30 requests per minute per client address (`ratelimits` in `wrangler.jsonc`) | Cloudflare's rate limiting binding, per Cloudflare location | A brake, not a quota: Cloudflare documents it as approximate. An IPv6 client counts as its /64. |
| 8 wrong PINs per address (IPv6: per /64) = 10 minutes locked out; 30 AI calls per 5 minutes; 2 calls at a time | Memory of one isolate | A brake only. Isolates are per location and are recycled, and an attacker with many addresses gets a fresh count for each, so none of this is a guarantee. Guessing is stopped by the length of the PIN, which is why it must be a random 16+ character token. |

For a limit in front of the Worker, add a WAF rate limiting rule on the zone of a custom domain (Security → WAF → Rate limiting rules, expression `starts_with(http.request.uri.path, "/api/ai/")`). `workers.dev` hostnames have no WAF.

## 6. Your data stays in each browser

1. There is no account and no server database. Everything (profile, workouts, meals, sleep, mood, reports, settings, per-device API keys, the PIN) lives in that browser's IndexedDB **for that exact origin**. The Worker stores nothing.
2. **No sync between devices.** Phone and laptop are two separate databases. On iPhone the home-screen app and Safari also keep separate storage.
3. A new origin is a new, empty app: `fitty.<account>.workers.dev`, a preview URL and a custom domain do not share data. Decide on the final address before you start logging.
4. To move or back up data use **Settings → Data & storage**: export the SQLite file or JSON on the old device or origin, and bring it in with the import option on the same screen on the new one. If your build shows no import option yet, treat the export as a backup only.
5. Clearing site data, or iOS evicting storage of a site you have not opened for weeks, deletes the database. Export now and then.

## 7. Custom domain

Workers & Pages → `fitty` → Settings → Domains & Routes → Add → **Custom Domain** (the domain's zone must be on the same Cloudflare account; DNS record and certificate are created for you). Or in `wrangler.jsonc`: `"routes": [{ "pattern": "fit.example.com", "custom_domain": true }]`. Mind point 6.3: moving to a custom domain starts with an empty database, so export first.

After adding the domain:
1. Turn on **Always Use HTTPS** for the zone (SSL/TLS → Edge Certificates). The Worker refuses AI calls over plain `http://`, and the app sends `Strict-Transport-Security`, but only this setting redirects the first visit.
2. Set `"workers_dev": false` in `wrangler.jsonc` (the commented line is already there) and redeploy, so the Access-protected domain is the only origin. Do this only once the custom domain works.
3. Re-check the Access policy (section 4, point 3).

Security headers for the app itself live in `public/_headers` (HSTS, `nosniff`, `Referrer-Policy: no-referrer` and a Content-Security-Policy). `connect-src` there is the list of hosts the app may talk to: itself, `generativelanguage.googleapis.com`, `api.anthropic.com` and `raw.githubusercontent.com` (exercise photos). A new external host has to be added there or the browser blocks it. If Cloudflare Web Analytics or Rocket Loader is switched on for the zone, the script they inject is blocked by this policy; leave them off.

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails: name must match | Rename the Worker in the dashboard to `fitty`, or change `name` in `wrangler.jsonc`. |
| Settings → AI says a PIN is needed | Enter `COACH_BRIDGE_PIN` on this device. After several wrong tries the Worker may refuse that address for about 10 minutes. |
| "AI is switched off on this server" | `COACH_BRIDGE_PIN` is missing or shorter than 8 characters. |
| AI worked yesterday, now "Couldn't reach the AI bridge" on a good connection | The Cloudflare Access session expired. Open `/api/ai/reauth` (section 4). |
| "No AI key is configured on the server" | Add `OPENROUTER_API_KEY`, `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` as a Secret and redeploy. |
| "The OpenRouter account has no credits left" | Add credits at openrouter.ai. |
| "OpenRouter has no provider for this model under the current privacy setting" | Pick another `COACH_OPENROUTER_MODEL`, or set `COACH_OPENROUTER_DATA_COLLECTION=allow`. |
| "Google rejected the Gemini API key" / "Anthropic rejected the API key" | Wrong or revoked key, or the API is not enabled for that project. |
| "Too many AI requests" / "Too many requests from this address" (HTTP 429) | A brake from section 5 (30 calls / 5 min, or 30 requests / min per address) or the provider's own rate limit. Wait. |
| "Today's AI budget on this server is used up" (HTTP 429) | The daily cap (300 calls). It resets at midnight UTC; change `DAILY_CALL_LIMIT` in `worker/guard.ts` if it is too low for you. |
| "Too large for the hosted AI endpoint" (HTTP 413) | The body limit is 1.5 MB, sized for Workers Free: it allows 10 ms CPU per request, and decoding a multi-megabyte upload exceeds that (Cloudflare error 1102, an HTML page the app cannot read). Use a photo of the page, or a per-device key (the browser then talks to the provider directly). On **Workers Paid**: uncomment `"limits": { "cpu_ms": 300 }` in `wrangler.jsonc`, raise `MAX_BODY_BYTES` in `worker/guard.ts` (8 MB at most) and redeploy. |
| Deep links (`/train/...`) 404 | `assets.not_found_handling` must stay `single-page-application`. |

Logs: **off on purpose.** `wrangler.jsonc` sets `observability.enabled` to `false`, so Cloudflare keeps no request logs for this Worker and the dashboard's Logs tab stays empty. To debug, run `npx wrangler tail fitty` while you reproduce the problem: it streams live and stores nothing. The Worker logs only an error name for unexpected failures, never prompts, keys or the PIN. Setting `observability.enabled` to `true` makes Cloudflare store request metadata (URL, status, timing, client details) for every call of a personal health app; if you ever need it, switch it on for the debugging session and off again.

## Sources

- Workers static assets and `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/ , https://developers.cloudflare.com/workers/static-assets/binding/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Access for Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Limits: https://developers.cloudflare.com/workers/platform/limits/
- Rate limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Durable Objects (SQLite-backed, Free plan): https://developers.cloudflare.com/durable-objects/
- `_headers` for static assets: https://developers.cloudflare.com/workers/static-assets/headers/
- Gemini API terms: https://ai.google.dev/gemini-api/terms
- Gemini generateContent, structured output, models: https://ai.google.dev/api/generate-content , https://ai.google.dev/gemini-api/docs/structured-output , https://ai.google.dev/gemini-api/docs/models
