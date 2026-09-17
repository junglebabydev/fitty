# Deploy to Cloudflare (Worker + static assets)

The app deploys as **one Cloudflare Worker named `fitty`**: the built PWA (`./dist`) is served as static assets, and the Worker script (`worker/index.ts`) answers only `/api/ai/*`, the hosted AI endpoint. Everything is described in `wrangler.jsonc`; the GitHub repo `junglebabydev/fitty` is connected through **Workers Builds**, so every push to the production branch deploys.

Checked against the Cloudflare and Google docs on 2026-09-18 (links at the end).

## 1. Workers Builds form (dashboard values)

| Field | Value |
|---|---|
| Build command | leave empty, or `npm run build` (optional: `wrangler.jsonc` has `build.command = "npm run build"`, so Wrangler builds before every deploy anyway) |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Path (root directory) | `/` |
| Worker name | `fitty` (it must equal `name` in `wrangler.jsonc`, or the build fails with "The name in your Wrangler configuration file must match the name of your Worker") |

Notes:
1. Workers Builds installs dependencies from `package-lock.json` by itself. Node comes from `.nvmrc` (22); Wrangler 4 needs Node 22 or newer.
2. If you also fill in the dashboard build command, the app is built twice (once by that step, once by Wrangler). Leaving the dashboard field empty is the simplest setup.
3. From your own machine: `npm run deploy` (build + `wrangler deploy`, needs `npx wrangler login` once) and `npm run cf:dry` (bundles the Worker into `.wrangler/dry` without logging in or uploading).

## 2. Secrets (required for hosted AI)

The site works without any of these; AI through the Worker stays off until both a key and a PIN exist.

| Name | Type | What it is |
|---|---|---|
| `COACH_BRIDGE_PIN` | Secret | The passphrase the app sends as `x-coach-pin`. **At least 8 characters**; use a long random phrase, not a 4-digit PIN. No PIN, no AI: the Worker refuses every call. |
| `GEMINI_API_KEY` | Secret | Google AI Studio key. Used by default when present. |
| `ANTHROPIC_API_KEY` | Secret | Anthropic key. Used when there is no Gemini key, or when `COACH_PROVIDER` is `anthropic`. |

Add them in either place:
1. **Dashboard:** Workers & Pages → `fitty` → Settings → Variables and Secrets → Add → type **Secret** → name and value → Deploy.
2. **CLI:** `npx wrangler secret put COACH_BRIDGE_PIN`, then `npx wrangler secret put GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`). Wrangler prompts for the value; it is never written to disk.

Never commit a key or the PIN, and never put them in `wrangler.jsonc` `vars` or in `VITE_*` variables (those end up in the public bundle). Secrets survive deploys.

Optional plain settings go in `wrangler.jsonc` → `vars` (dashboard-only text variables are overwritten by the next `wrangler deploy`):

| Var | Default | Meaning |
|---|---|---|
| `COACH_PROVIDER` | unset | `gemini` or `anthropic`. Unset = Gemini if its key exists, else Anthropic. |
| `COACH_GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model code. |
| `COACH_MODEL` | `claude-opus-5` | Claude model id. |

Then open the site → **Settings → AI**, enter the same PIN once per device. The status line should read connected, with the provider name.

### Local `wrangler dev`

Create `.dev.vars` next to `wrangler.jsonc` (it is git-ignored) and run `npx wrangler dev`:

```
COACH_BRIDGE_PIN=some-long-local-passphrase
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
3. This covers the `workers.dev` hostname, preview URLs and any custom domain of this Worker.

Keep the PIN anyway: it is the second lock. When an Access session expires, AI calls start failing with a network error; reload the app to sign in again.

## 5. What works where

| Where you open the app | AI options |
|---|---|
| Hosted (Cloudflare) | 1. AI through the Worker: `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` on the server plus the PIN on each device. 2. Or a per-device Gemini or Anthropic key typed into Settings → AI (the browser calls the provider directly; the Worker is not involved). 3. Or the on-device demo. |
| Local Mac (`npm run dev`, phone on the same Wi-Fi) | Claude through Claude Code on the Mac, i.e. your Claude subscription, no API key (README → "AI: run it on your Claude subscription"). Per-device keys work here too. |

The Claude subscription cannot be used from the hosted site: it needs Claude Code running on your Mac.

What the Worker enforces on `/api/ai/*`: PIN on every call (constant-time check, 8 wrong tries from one address = 10-minute lockout), same-origin requests only, no CORS headers, bodies up to 20 MB, at most 4 attachments (JPEG, PNG, WebP, GIF, PDF), system prompt cut at 40,000 characters, 30 AI calls per 5 minutes and 2 at a time per isolate, reply caps of 2,048 tokens (chat) and 8,192 (JSON). Health reveals nothing about keys without the right PIN. Keys, the PIN and upstream error text are never sent to the browser or logged.

## 6. Your data stays in each browser

1. There is no account and no server database. Everything (profile, workouts, meals, sleep, mood, reports, settings, per-device API keys, the PIN) lives in that browser's IndexedDB **for that exact origin**. The Worker stores nothing.
2. **No sync between devices.** Phone and laptop are two separate databases. On iPhone the home-screen app and Safari also keep separate storage.
3. A new origin is a new, empty app: `fitty.<account>.workers.dev`, a preview URL and a custom domain do not share data. Decide on the final address before you start logging.
4. To move or back up data use **Settings → Data & storage**: export the SQLite file or JSON on the old device or origin, and bring it in with the import option on the same screen on the new one. If your build shows no import option yet, treat the export as a backup only.
5. Clearing site data, or iOS evicting storage of a site you have not opened for weeks, deletes the database. Export now and then.

## 7. Custom domain

Workers & Pages → `fitty` → Settings → Domains & Routes → Add → **Custom Domain** (the domain's zone must be on the same Cloudflare account; DNS record and certificate are created for you). Or in `wrangler.jsonc`: `"routes": [{ "pattern": "fit.example.com", "custom_domain": true }]`. Mind point 6.3: moving to a custom domain starts with an empty database, so export first.

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Build fails: name must match | Rename the Worker in the dashboard to `fitty`, or change `name` in `wrangler.jsonc`. |
| Settings → AI says a PIN is needed | Enter `COACH_BRIDGE_PIN` on this device. After 8 wrong tries wait 10 minutes. |
| "AI is switched off on this server" | `COACH_BRIDGE_PIN` is missing or shorter than 8 characters. |
| "No AI key is configured on the server" | Add `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` as a Secret and redeploy. |
| "Google rejected the Gemini API key" / "Anthropic rejected the API key" | Wrong or revoked key, or the API is not enabled for that project. |
| "Too many AI requests" (HTTP 429) | The per-isolate brake (30 calls / 5 min) or the provider's own rate limit. Wait. |
| Error 1102 on a large PDF | Workers Free allows 10 ms CPU per request; parsing a multi-megabyte upload can exceed it. Use a smaller file or the Workers Paid plan. |
| Deep links (`/train/...`) 404 | `assets.not_found_handling` must stay `single-page-application`. |

Logs: Workers & Pages → `fitty` → Logs (observability is on). The Worker logs only an error name for unexpected failures, never prompts, keys or the PIN.

## Sources

- Workers static assets and `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/ , https://developers.cloudflare.com/workers/static-assets/binding/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Access for Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Limits: https://developers.cloudflare.com/workers/platform/limits/
- Gemini API terms: https://ai.google.dev/gemini-api/terms
- Gemini generateContent, structured output, models: https://ai.google.dev/api/generate-content , https://ai.google.dev/gemini-api/docs/structured-output , https://ai.google.dev/gemini-api/docs/models
