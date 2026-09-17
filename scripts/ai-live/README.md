# Live AI smoke test (manual)

Sends every AI feature's real prompt and schema through the local bridge (`server/aiBridge.ts`, Claude Code on this Mac) and checks each reply with the app's own validators: `validateAIPlan`, `parseExtraction`, `actionFromRouter`, `parseMealRecognition` (through `recognizeMeal`), `mergeRefined`, `sanitizeBaseline`. It makes real model calls on the owner's Claude subscription, so it is never part of `npm test`.

```bash
npm run dev:https          # or npm run dev; note the port it prints
COACH_BRIDGE_URL=https://localhost:5173 NODE_TLS_REJECT_UNAUTHORIZED=0 npx vite-node scripts/ai-live/run.ts
```

- `COACH_BRIDGE_URL` is required; `COACH_BRIDGE_PIN` only when the server was started with one. `NODE_TLS_REJECT_UNAUTHORIZED=0` is for the self-signed dev certificate and for this one command only.
- Pick features by name: `health coach router planner meal meal-drawn refine report report-image intake`. `router:0,2` runs only those cases. A full run is 13 calls, one or two at a time (the bridge allows two).
- `AI_LIVE_VERBOSE=1` prints every reply. A failed check always prints the reply. Exit code 1 when any check fails.
- Inputs are synthetic and built in memory by `fixtures.ts`: two hand-drawn PNGs (not food; a drawing of an egg) and a one-page PDF "lab report" with printed ranges, one value outside its range and one value with no range. `report-image` rasterises that PDF with macOS `sips`. Nothing is downloaded and no real health data is involved.
- Typecheck: `npx tsc -p scripts/ai-live/tsconfig.json --noEmit`.
