# Research — Exercise movement media (GIF / short video), Sept 2026

Companion to [FOLLOW_ALONG.md](FOLLOW_ALONG.md). Goal: a looping clip for **every movement we
program**, meaning 170 exercise ids in `src/data/exercises.ts` plus the ~60 free-text mobility
movements in `src/data/mobility.ts`. The clips have to work **offline at the gym** and play on
**iPhone in Low Power Mode**, which rules out autoplaying MP4 alone (see FOLLOW_ALONG §3).

## TL;DR

1. **Gym Visual is the best fit.** It has the biggest catalogue (6,500+ animated GIFs, male and
   female), a perpetual commercial licence that explicitly allows iOS/Android apps, and allows
   self-hosting. A la carte, our whole library costs about **$150–210**.
   Two unknowns: GIF resolution isn't published, and one licence clause ("on-demand services")
   needs a written answer.
2. **hasaneyldrm/exercises-dataset is Gym Visual's art, not a free source.** The media is
   © Gym Visual, redistributed "with permission", at 180×180. Reusing it needs your own Gym Visual
   licence. It's still useful as a free **catalogue for mapping our ids before buying**.
3. **Hevy can't be used.** Its API returns no media at all (exercise templates carry only id,
   title, type and muscles), it needs a Pro account, and its animations are proprietary.
4. **Runner-up for quality: Exercise Animatic.** $349 one-time buys 2,600+ MP4 clips up to 4K,
   including vertical 9:16. It's MP4 only, so we'd have to convert to animated WebP (check that the
   licence allows it).
5. **Closest to BFT's look, but the wrong model: MuscleWiki API.** Real people, front and side
   views. But it's a subscription, and its terms forbid storing videos for offline playback.

## Comparison

| Source | What you get | Format / res | Licence (for our use) | Offline / self-host | Cost for our ~230 moves |
|---|---|---|---|---|---|
| **[Gym Visual](https://gymvisual.com/)** | 6,554 animated GIFs (4,511 male / 2,034 female), plus videos and illustrations | GIF (res. not published); MP4 videos | N-CRFL: perpetual, worldwide, **apps explicitly allowed**, no attribution; no resale/redistribution, no AI training, **no "on-demand services"** | Yes: you download the files | GIF: $3.60 each for 1–9, **$0.90 each at 10+** → 170 × $0.90 ≈ **$153** (+ ~$55 for mobility). Video: $6 each at 5+. Packs: "contact us" |
| **[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)** | 1,324 exercises, JSON + 1 GIF + 1 thumbnail each | 180×180 GIF | Code/metadata MIT; **media © Gym Visual, "obtain your own license there before reusing"** | Files in the repo, but not licensed to us | Free to browse; media needs a Gym Visual licence |
| **[Hevy library](https://www.hevyapp.com/features/exercise-library/)** | 400+ exercises with in-app animations | n/a | Proprietary; no licensing offered | No | **Not available.** The API's `ExerciseTemplate` has no media fields and needs a Pro key |
| [ExerciseDB](https://exercisedb.io/faq) | 1,500+ (v1) to 11,000+ | GIF 180p free; 360p Starter; 720/1080p Pro | Free v1 = non-commercial + attribution; paid = commercial, perpetual, self-host, no redistribution | Yes (paid) | ~$300 one-time (per vendor listings) |
| [Exercise Animatic](https://www.exerciseanimatic.com/product-page/complete-2000-exercise-videos-lifetime-unlimited-license-workout-yoga-animation-exercise-fitness-gym) | 2,600+ clips (1,700 male / 900 female), 5,000 illustrations, green-screen versions | MP4 H.264, 720p to 4K, **9:16 vertical available**, 5–30 s loops | "Lifetime business licence, unlimited use", apps included | Yes (Dropbox, download within 30 days) | **$349** bundle (sale; list price $599) |
| [MuscleWiki API](https://api.musclewiki.com/faq) | 1,900+ exercises, 7,700+ **real-person** videos, front + side, M/F | Streaming video | Commercial on paid plans; **videos may not be stored for offline playback** | **No** | From $10/month; streaming only |
| [MoveKit](https://movekit.com/blog/best-exercise-animation-libraries-2026) | 412 3D-mannequin animations | MP4 | Commercial included | Yes | $299 complete pack. Source is their own blog; unverified |
| free-exercise-db (current) | 2 photos per exercise | JPG | Unlicense (public domain) | Yes | $0; covers 74 of our 170 ids |

## Notes and caveats

- **Gym Visual's "on-demand services" clause.** The licence bans use "in on-demand services" but
  also explicitly allows apps. A workout app that plays clips on demand could fall on either side.
  **Get a written yes from Gym Visual before a bulk buy**, especially if the app may ever charge.
  Also ask for a pack price for about 230 items and the pixel size of their GIFs.
- **Resolution is the biggest unknown for Gym Visual.** Full-width on a phone is ~390 pt, which is
  ~1,170 px at 3×. Anything under ~400 px will look soft when enlarged. Buy the 10-GIF minimum
  (~$9–36) as a test batch before committing.
- **The GitHub dataset probably shares its art with ExerciseDB's free tier.** Both have 1,324
  exercises at 180×180, and the art matches Gym Visual's style. This is **not confirmed**. If it's
  true, ExerciseDB's GIFs carry the same third-party copyright.
- **Safety review still applies** (FOLLOW_ALONG §4). Stock clips often show full depth or range.
  Every id we map needs a check against our knee/back/neck-safe instructions, the same rule as
  `exerciseMedia.ts`.
- **Format conversion.** GIFs are big. Converting purchased GIFs/MP4s to animated WebP (roughly ⅓
  the size) is modification, not redistribution. Gym Visual's terms don't forbid it. Confirm for
  Exercise Animatic.
- **Hosting.** Put the purchased files on our own Cloudflare (R2 or static assets, behind the
  existing Access setup) and never in the public git repo: a public repo counts as redistribution
  under every paid licence here.

## Recommended path

1. Use the free GitHub dataset's JSON to map our 170 ids → Gym Visual exercise names, offline and
   at no cost.
2. Email Gym Visual: licence clause, GIF resolution, and a pack quote for about 230 items.
3. Buy 10 GIFs covering our hardest-to-match moves (knee-friendly squat, bird dog, suitcase carry,
   the mobility moves) and check quality and range on a real phone in the follow-along screen.
4. If resolution is too low → Exercise Animatic ($349, 4K vertical MP4 → convert to WebP).
   If the licence answer is no → ExerciseDB paid or Exercise Animatic.

## Sources

- Gym Visual: [home](https://gymvisual.com/) · [price rules](https://gymvisual.com/content/6-price-rules) · [licence (N-CRFL)](https://gymvisual.com/content/9-license) · [terms](https://gymvisual.com/content/3-terms-and-conditions-of-use) · [animated GIF catalogue](https://gymvisual.com/16-animated-gifs)
- [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (README + NOTICE)
- Hevy: [exercise library](https://www.hevyapp.com/features/exercise-library/) · [API docs](https://api.hevyapp.com/docs/) · [OpenAPI spec mirror (hevy-mcp)](https://github.com/chrisdoc/hevy-mcp/blob/main/openapi-spec.json)
- [ExerciseDB FAQ](https://exercisedb.io/faq) · [Exercise Animatic bundle](https://www.exerciseanimatic.com/product-page/complete-2000-exercise-videos-lifetime-unlimited-license-workout-yoga-animation-exercise-fitness-gym) · [MuscleWiki API FAQ](https://api.musclewiki.com/faq) · [MuscleWiki API terms](https://api.musclewiki.com/api-terms) · [MoveKit comparison (vendor blog)](https://movekit.com/blog/best-exercise-animation-libraries-2026)
