# Coverage — Nutrition

**Verdict (updated after the cuisine-pack pass): 406 built-in foods. Singapore-specific entries are now 110 of 406 (27%), down from 51%.** Five cuisine packs — Indian (46), Western (42), Chinese (37), Malay (32), Indonesian (34) — were added alongside the existing set. Coverage is now ~85% for a Singapore user, ~80% for an Indian or Chinese user, ~75% for a Western user, and ~80% for a Malay/Indonesian user.

## What ships today

`src/data/foods.ts` — 215 records, per-100 g macros, a typical serving size and label, and tags.

| Origin | Count | Source basis |
|---|---|---|
| SG hawker | 92 | HPB-style estimate, typical stall portion |
| Generic | 97 | USDA FoodData Central |
| Indian | 46 | Typical restaurant/home portion estimate |
| Western | 42 | Typical restaurant portion estimate |
| Chinese | 37 | Typical restaurant portion estimate |
| Indonesian | 34 | Typical warung portion estimate |
| Malay | 32 | Typical portion estimate |
| SG cafe | 18 | HPB-style estimate |
| Branded | 16 | Label values |

Every cuisine entry carries its cuisine as a lower-case tag (`indian`, `western`, `chinese`, `malay`, `indonesian`) via `CUISINE_ORIGINS` in `src/data/foods.ts`, so search and the coach can filter by it.

Tag distribution shows the shape: `hawker` 65, `drink` 55, `lunch` 41, `snack` 36, `high protein` 33, `dinner` 31, `breakfast` 30, `kopitiam` 22, `rice` 21, `chicken` 21, `noodles` 20, `coffee` 17.

Everything the user described in item 5 already works:

| Ask | Where | Status |
|---|---|---|
| Photo → description + calorie estimate | `src/features/meal/captureMeal.ts` → `/eat/review` | Built |
| Text-only description → estimate | `src/features/composer/*` | Built |
| Ask which meal it was (lunch / dinner / snack) | Meal review sheet | Built |
| Give a range / best guess | `MEAL_RECOGNITION_SCHEMA` returns per-item macros | **Point estimate, not a range** |
| Voice correction ("half the rice, no skin") | `src/features/meal/refine.ts` | Built |
| Re-log a saved meal | `cloneMeal` | Built |
| Targets and trend adjustment | `src/engine/nutrition.ts` (Mifflin-St Jeor), `trends.ts` | Built |
| Barcode | — | Not built |

So item 5 is **not new work — it is one change plus a content problem.**

## The one change: estimates should be ranges

The user asked for "a range or some kind of guess." The schema currently returns a single kcal number per item, which reads as false precision on a photo estimate. Two options:

- **A — confidence band.** The model returns `kcalLow` / `kcalHigh`; the UI shows "480–620 kcal" and stores the midpoint. Honest, one schema field, one UI change.
- **B — single number + a confidence chip** (`high` / `medium` / `low`). Cheaper, keeps every downstream calculation unchanged, less honest.

A is the better fit for a product that already labels the SG values as estimates. It is a schema field, a UI change and a migration-free storage decision (keep storing the midpoint).

## Delta to 80–90% for a non-SG user

The library is the gap, and it is a content problem with a clear decision attached.

1. ~~Generic-first core~~ — **largely addressed** by the Western pack (42) plus the existing 97 generic entries. Remaining gap is breadth of cooking-method variants, ~60 entries.
1. *(was)* **Generic-first core — ~250 entries.** Staples by cooking method (chicken breast grilled / fried / roasted, beef mince by fat %, rice by type, pasta, bread, eggs, oils, dairy, common vegetables and fruit), plus the restaurant archetypes people actually eat: burger, pizza slice, burrito, sandwich, salad-with-dressing, stir-fry, curry-with-rice, fish and chips, pad thai, sushi roll.
2. **Locale-aware ordering — still open.** All 406 entries currently load for everyone. Ranking search by the user's cuisine preference (or splitting into lazily-loaded packs) is the next step, and it needs the tiering decision first. Obvious next packs: Japanese, Korean, Thai, Vietnamese, Middle Eastern, Mexican.
3. **Branded / barcode — out of scope for built-in data.** 16 branded entries is a rounding error against the real universe and it is not a gap you close by hand. Either integrate an external database (Open Food Facts is the open-licence option and fits the OSS build) or accept that branded items go through the AI estimator like everything else.

## Where the line sits: library vs. model

| Deterministic, always (no AI) | AI-generated |
|---|---|
| Macro math, per-serving scaling | Reading a photo into items and portions |
| Daily targets (Mifflin-St Jeor), protein floor | Parsing "half the rice, no skin" |
| Trend-based target adjustment | Estimating an unlisted food from a description |
| Search, recents, saved meals, cloning | Naming the dish |
| Totals, adherence, weekly review numbers | — |

**Tier implication, and it is the strongest one in the product:** every food in the library is a lookup the model does not have to guess. A weak open-weights model on the $9 tier will be noticeably worse at *estimating an unlisted food* and only marginally worse at *identifying a food that exists in the library*. Growing the library is therefore the highest-leverage way to make the cheap tier acceptable — better value per unit of work than prompt tuning.

This is also the eval harness's main job: measure kcal error against known-value meals, per model, with and without a library hit.
