# Security & privacy

Coach is a local-first, single-user app. This note says where data lives, what leaves the device, how a hosted copy should be protected, and what must never be committed to this repository.

## 1. What is stored where

| Data | Location | Leaves the device? |
|---|---|---|
| Profile, goals, condition flags, workouts, sets, meals, body metrics, sleep, mood, journal, uploaded health reports, coach history, privacy ledger, settings | SQLite (sql.js) image in the browser's IndexedDB for this origin (`coach-local`) | No, except the parts of an AI request listed in section 2 |
| AI provider API key, bridge PIN (only if you add them) | The same local `settings` table, in plain text; included in a JSON/SQLite export | Only inside the provider's own request |
| Theme, Eat display mode | `localStorage` | No |
| In-flight drafts (meal review, workout), the `?demo=1` choice | `sessionStorage` (cleared when the tab closes) | No |
| App shell, exercise photos | Service-worker caches | No |

There is no account, no server-side database, no analytics and no telemetry. Each browser profile and device holds its own separate copy. **Settings → Data & storage → Delete all data** (or clearing site data) removes everything; export first if you want a backup. Treat an export as sensitive: it contains all of the above.

## 2. What leaves the device

- **AI calls, all of them logged.** `src/ai/gateway.ts` is the single path that sends user data off the device. Every attempt (sent, failed, or handled on-device by the demo provider) writes a row to **Settings → Privacy ledger**: time, provider, data type (`meal_photo`, `coach_context`, `composer_text`, `food_query`, `training_context`, `intake_answers`, `health_report`), purpose, size and status. Payloads are minimal: a downscaled meal photo plus meal type; a profile summary, today's facts and the conversation for the coach. Journal text is never sent. A health report is sent for extraction only after you agree at upload, and report summaries reach the coach only if you switch that on. Progress photos never leave the device.
- **Where AI calls go.** To the provider shown in Settings → AI, and named on every ledger row. That is one of: the same-origin `/api/ai` endpoint (on your own machine, the local Claude Code bridge in `server/aiBridge.ts`; on a hosted deployment, that deployment's own backend, which forwards the request to the model provider configured there with a server-side key — see README → Deploy); a model provider's API called straight from the browser with an API key you added in Settings; or nowhere at all (the on-device demo provider, which sends nothing and is the fallback whenever no real provider is connected).
- **Requests without personal data.** Exercise photos load from `raw.githubusercontent.com` (the request reveals only which exercise image was fetched). Exercise "demo" links and the support lines in Mind open third-party sites in a new tab only when you tap them.
- **Speech.** Dictation uses the platform's Web Speech engine; on some devices and languages the OS routes audio to its vendor (Apple). The app itself sends no audio anywhere.

## 3. Hosting it publicly

- Put the deployment behind **Cloudflare Access** (Zero Trust → Access → Applications → self-hosted application covering the whole hostname, including `/api/*`), with a policy that allows only your own identity. The app is a personal tool: without Access, anyone with the URL can load it and, if the deployment exposes a server-side AI endpoint, spend your AI quota.
- Keep provider credentials in the host's secret store (for Cloudflare: `wrangler secret put …` or the dashboard). Never in the repo, never in `VITE_*` variables (those are compiled into the public bundle).
- A production build starts clean: reference data only, empty profile, onboarding first. The fictional demo loads only with `?demo=1` or from Settings → Reseed demo data (`shouldSeedDemo` in `src/db/seed.ts`).
- The local Claude Code bridge accepts same-origin requests from private-network addresses only and can require a PIN (`COACH_BRIDGE_PIN`). It is meant for your own machine and network, not for the internet.

## 4. What must never be in this repository

- Real names, birth dates, body measurements, conditions, symptoms or any other health detail of a real person. The seed (`src/db/seed.ts`), test fixtures and docs use a fictional persona, "Alex Tan".
- Database exports (`.sqlite`, `.json`), Apple Health exports, meal or progress photos, uploaded reports.
- API keys, tokens, PINs, `.env` files (`*.local` is git-ignored).
- Machine details: absolute local paths (use paths relative to the repo root), LAN IP addresses (write `<your-mac-ip>`), hostnames.

Check before pushing:

```bash
git grep -n -I -E '/[U]sers/|/[h]ome/|192[.]168[.]|sk-ant-[A-Za-z0-9]' -- ':!package-lock.json'
```

## 5. Reporting a problem

Open a GitHub issue for anything that is safe to discuss in public. For a vulnerability or an accidental data exposure, use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability) instead of a public issue, and do not include personal data in the report.
