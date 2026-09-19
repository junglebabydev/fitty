# DESIGN — "Ink & Bone" (v2 UI/UX)

One wellness product, five pillars, one coach. This spec is binding for every screen. Sources: the `ui-ux-pro-max` skill's rules for Fitness, Nutrition, Sleep, Mood, Meditation and Mental-Health products; teardowns of Whoop, Oura, Hevy, Strong, Runna, Gentler Streak, MacroFactor, Cal AI, Foodnoms, How We Feel, Headspace, Apple State of Mind (see `docs/research/`).

## 1. Concept

**A performance instrument that knows when to be quiet.** Dark, dense and numeric where you train and eat; calm, spacious and serif where you rest and reflect. The same tokens produce both moods — the *pillar hue* and the *type role* change, nothing else.

Memorable things:
1. **The Pillar Dial** on Today — four concentric arcs (Train, Eat, Rest, Mind) around the readiness decision.
2. **Condensed athletic numerals** (Barlow Condensed) — one huge number per card, tiny tracked label.
3. **The coach speaks in serif italic** (Lora). Whenever the coach talks, it looks like a voice, not a UI string.
4. **Pillar atmospheres** — a soft hue glow at the top of each screen (ember / lime / moon-blue / lavender) over film grain.

## 2. Tokens (defined in `src/index.css` — never hardcode hex in screens)

| Role | Tailwind utility | Notes |
|---|---|---|
| Page bg / text | `bg-app` `text-app` | ink `#0a0b0d` / bone `#f3efe7` in dark; warm paper / ink in light |
| Surfaces | `bg-surface` `bg-surface-2` `bg-surface-3` | card, inset/field, pressed/raised |
| Lines | `border-line` `border-line-strong` | hairlines carry structure; **no drop shadows on cards** |
| Text | `text-muted` `text-faint` | faint only for non-essential text |
| Primary action | `bg-accent text-accent-fg` | **monochrome** (bone on ink / ink on paper). One primary button per view |
| Current pillar | `text-pillar` `bg-pillar` `bg-pillar-soft` `border-pillar-line` `stroke-pillar` `fill-pillar` | follows the nearest `data-pillar` ancestor (`Screen pillar=…`) |
| Named pillars | `text-train` `text-eat` `text-rest` `text-mind` (+ `bg-`, `stroke-`, `fill-`) | for multi-pillar views (Today, Progress, Coach) |
| Macros | `text-protein` `text-carbs` `text-fat` (+ `bg-`) | protein blue, carbs orange, fat yellow; **kcal is neutral bone** |
| Status | `text-ok` `text-warn` `text-stop` (+ `bg-`) | readiness & safety ONLY, always with icon + word. Existing emerald/amber/rose tone classes remain valid |

Colour rules: pillar hue = identity and progress fills for that pillar. Status colours never decorate. **Nutrition never turns red**: over-target keeps the same hue and shows `+120`. No purple-pink gradients, no neon glows beyond `glow-pillar` on one hero element.

Theme: `<html data-theme>` via `src/lib/theme.ts` (`getThemePref`, `setThemePref('system'|'dark'|'light')`). Default dark. Every screen must be legible in both (≥ 4.5:1 body text).

## 3. Type roles (utilities in index.css)

| Utility | Use | Size guidance |
|---|---|---|
| `num` | every metric numeral (Barlow Condensed 600, tabular) | hero `text-7xl`/`text-6xl`; card `text-4xl`/`text-5xl`; inline `text-2xl` |
| `eyebrow` | label above a number / section kicker (11px uppercase tracked) | colour `text-muted` or `text-pillar` |
| `display` | screen titles & hero statements (condensed uppercase) | `text-4xl`–`text-5xl` |
| `voice` | coach statements, Mind prompts, journal, empty-state sentences (Lora italic) | `text-xl`–`text-2xl` |
| default sans (Barlow) | body, controls | body **16px**, secondary 14px, never below 12px |

Units sit beside numerals in `text-muted text-sm font-medium`, baseline-aligned. Line-height 1.45 body.

## 4. Layout & components

- Column `max-w-[430px]`, 16px gutters (`px-4`), cards `rounded-[1.25rem] border border-line bg-surface p-4`, vertical rhythm `gap-3` between cards, `gap-6` between sections.
- One **hero** per screen (big number, dial or decision), then supporting cards, then history. Progressive disclosure: card → detail screen → raw data (Whoop three-tier).
- Every chart has an **interpreted headline sentence above it** ("Down 0.6 kg in 30 days") and direct labels; never colour alone (Apple WWDC22 charts guidance).
- Touch targets ≥ 44px, ≥ 8px apart. Icon-only buttons need `aria-label`. Inputs have visible labels and borders/fills. Visible `:focus-visible` (global). Confirm destructive actions. Buttons show loading + disabled states.
- Motion: one staggered entrance per screen — wrap top-level cards in `className="anim-rise" style={{'--i': n}}`. Rings/arcs draw once (`anim-draw`). Press feedback via `press`. Success moments use `anim-pop`. Nothing loops except skeletons, the breathing orb and `anim-drift` ambient blobs in Mind. `prefers-reduced-motion` is handled globally; never depend on `animationend` for state.
- Floating chrome (tab bar, sticky bars) uses `glass shadow-float`. Content gets `pb-32` so nothing hides behind the tab bar / quick actions.
- Icons: lucide-react only. **No emoji as icons.**
- Empty states: a `voice` sentence + one action; charts show a ghost state with a calibration count ("Day 3 of 14").

### Existing components keep their props. New/extended API (exported from `src/components`)

```ts
type Pillar = 'today'|'train'|'eat'|'rest'|'mind'|'coach'|'neutral'
PILLARS: Record<'train'|'eat'|'rest'|'mind', { label: string; icon: LucideIcon; text: string; bg: string; stroke: string }>

Screen        + pillar?: Pillar   // sets data-pillar + atmosphere (atmo / atmo-calm for rest & mind)
              + eyebrow?: string  // kicker above the title
              + large?: boolean   // big `display` title (tab roots use large)
Card          + pillar?: Pillar (tints border/eyebrow), + eyebrow?: string, + flush?: boolean (no padding)
Button        unchanged API; primary = monochrome accent, new variant 'pillar' (bg-pillar, dark text)
TabBar        floating glass pill; tabs: Today '/', Train '/train', Eat '/eat', Mind '/mind', Coach '/coach'; active tab shows its pillar hue
QuickActions  compact vertical glass stack (camera, mic) above the tab bar

Ring          { value: number; max?: number; size?: number; stroke?: number; pillar?: Pillar; trackOpacity?: number; children?: ReactNode; ariaLabel: string }
PillarDial    { pillars: { key: 'train'|'eat'|'rest'|'mind'; label: string; value: number /*0..1*/; caption: string; onClick?: () => void }[]; center: ReactNode; size?: number }
              // four concentric arcs (270° sweep, rounded caps), legend rendered below as 4 tappable chips with caption
ArcGauge      { value: number; max: number; size?: number; label?: string; sub?: string; pillar?: Pillar; tone?: 'green'|'amber'|'red' }
HeroNumber    { value: string|number; unit?: string; label?: string; sub?: ReactNode; size?: 'md'|'lg'|'xl'; pillar?: Pillar; align?: 'left'|'center' }
StatTile      { label: string; value: string|number; unit?: string; sub?: string; icon?: LucideIcon; pillar?: Pillar; trend?: 'up'|'down'|'flat'; onClick?: () => void }
LineChart     { points: { x: string; y: number|null }[]; height?: number; target?: number; band?: [number, number]; average?: (number|null)[]; pillar?: Pillar; yFormat?: (n: number) => string; ariaLabel: string; showDots?: boolean }
              // faint raw dots + bold average line when `average` given; dashed target; shaded baseline band; min/max + last-value labels; ghost state when < 2 points
BarChart      { bars: { label: string; value: number|null; target?: number; highlight?: boolean }[]; height?: number; pillar?: Pillar; yFormat?: (n: number) => string; ariaLabel: string }
WeekStrip     { days: { date: string; label: string; value: number /*0..1*/; state?: 'done'|'planned'|'missed'|'rest'|'today' }[]; pillar?: Pillar; onSelect?: (date: string) => void; selected?: string }
RangeTabs<T>  { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }   // compact W / M / 3M switcher
CoachQuote    { children: ReactNode; evidence?: { label: string; value: string }[]; actions?: ReactNode; compact?: boolean }  // serif voice block with a thin bone rule
Skeleton      { className?: string }
Celebrate     { show: boolean; title: string; body?: string; onDone: () => void; pillar?: Pillar }  // brief full-width burst + pop, auto-dismiss 1.8 s
MoodSlider    { value: number /* -3..3 */; onChange: (v: number) => void }  // valence slider: morphing blob/face + word ("Very unpleasant" … "Very pleasant"), hue shifts rest-blue → mind-lavender → eat-lime
BreathOrb     { phase: 'inhale'|'hold'|'exhale'|'rest'|'idle'; seconds: number; label?: string; size?: number }  // scale transitions driven by `seconds` via inline transition-duration
MacroRow      same props; new look: kcal + protein as two equal hero blocks (num + thin bar), carbs/fat small numerals; supports `mode?: 'consumed'|'remaining'`
ReadinessBadge same props; adds icon + word always
```

## 5. Navigation

Tabs: **Today · Train · Eat · Mind · Coach**. Progress (`/progress`) is reached from the Today header (chart icon, `aria-label="Progress"`), the Today Body card, and Coach's weekly review. Settings via the Today header gear. Sleep (`/sleep`) is reached from Today and from Mind ("Rest").

## 6. Screen blueprints

**Today (`pillar="today"`)** — the decision hub.
1. Header: eyebrow date, `display` greeting by time of day, icons Progress + Settings.
2. Hero: `PillarDial` with centre = readiness word (READY / MODIFY / RECOVER mapped from GREEN/AMBER/RED) + status icon; below it 2–3 reason chips (tap → sheet with full reasons + link to check-in).
3. `CoachQuote`: headline + directives + "Why" evidence + pending-proposal banner.
4. Next action card (pillar train): today's session, est. time, big **Start** (or late-evening 30-min version).
5. Fuel card (pillar eat): MacroRow remaining/consumed. 6. Rest card (last night vs baseline). 7. Mind card (mood today or "Check in" + 1-tap breathe). 8. Body card (weight trend sparkline → /progress).
Quick actions camera + mic persist.

**Train / Workout (`pillar="train"`)** — Hevy-fast.
- Train: week as a *bucket* — `WeekStrip`, tier Segmented (Minimum/Target/Stretch), session cards by day with status, distinct **Move** vs **Skip** actions, "Reflow week" when something is missed (copy: "Skipping a session isn't a failure of discipline" tone — no guilt), mobility + library entries.
- Workout: sticky glass header (timer, sets done, finish). Exercise card = name, target line, progression chip (Go up / Hold / Deload) with reason, **PREVIOUS column** + set rows: `set# | previous | kg | reps | RIR | ✓`. Inputs prefilled/ghosted from last session; tapping ✓ commits and **starts the rest timer in a sticky bottom bar** (−15 / +15 / skip), computed from timestamps. RIR as 0–4 chips. Logged row fills with pillar-soft and pops; PR → `Celebrate`. Substitute + Pain/Issue stay on every card (Pain uses status colours). Symptom gate sheet stays first. Finish summary: volume, duration, PRs, RPE, symptom change.
- ExerciseDetail: e1RM `LineChart`, best set, plain-language safety flags, substitutions. Mobility: routine cards, step-through player with big timer.

**Eat (`pillar="eat"`)** — MacroFactor-calm, no moralising.
- Header week strip of intake (7 mini bars, today boxed). Hero: MacroRow with Consumed/Remaining toggle (persist in localStorage). **No Breakfast/Lunch/Dinner buckets**: time-stamped meal cards (photo thumb, name, kcal, **protein**), per-meal protein split line ("62 g + 0 g of 150 g"). Add bar: Camera · Voice · Search · Recent (4 equal tiles). Over-target stays the same hue with `+N`.
- MealReview ("the Plate"): photo hero, item rows with **0.5× 1× 1.5× 2× chips + grams field**, live macros, confidence as a small labelled pill with the uncertainty reason, sticky bottom total (kcal + protein) + Log. Voice correction + add item. Estimates are always editable.
- FoodSearch: big search field, Recent/Saved first, Singapore vs generic sections, quantity sheet with the same portion chips.

**Mind (`pillar="mind"`, calm atmosphere)** — new pillar, non-clinical.
- Mind home: `voice` greeting, today's State of Mind (MoodSlider summary or "Check in" CTA), Breathe row (technique cards with minutes + purpose), Journal prompt card, Rest card (last night → /sleep, wind-down), 14-day mood `LineChart`, insights ("On days after 7 h+ sleep your mood tends to be higher · 9 days"), mindful minutes this week, Support row (always visible, quiet).
- Check-in sheet (< 20 s): MoodSlider → label chips (by valence band) → context chips → optional note → Save. Also captures stress/energy when today's check-in lacks them.
- Breathe (`/mind/breathe?technique=`): full-screen, tabs hidden, `BreathOrb`, phase word in `voice`, cycle counter, duration picker (1/3/5 min), pause/end, completion → minutes logged + one-tap mood re-rate.
- Journal (`/mind/journal`): prompt carousel, large serif textarea, local-only privacy line, entries list with edit/delete.
- Safety: never diagnose, never name a condition, never score clinical questionnaires. A **Support sheet** is reachable in ≤ 2 taps from Mind home (always-visible quiet row) and is **hard-coded and offline** (no network, no AI on that path): national mindline **1771** (24/7; `tel:1771`, WhatsApp `https://wa.me/6566691771`, webchat `https://mindline.sg/fsmh`), Samaritans of Singapore 24-hour hotline **1767** (`tel:1767`), SOS CareText WhatsApp **9151 1767** (`https://wa.me/6591511767`), and "If you are in immediate danger call **995** or go to A&E" (`tel:995`). Do NOT list the retired IMH 6389 2222 number. If `supportSignal` fires, show a gentle, dismissible card: observation + option ("Low mood on 5 of the last 7 days. Talking to someone can help.") linking to the Support sheet. No confetti or celebration on low-mood logs. No streaks: show "days checked in this week" and weekly mindful minutes. Journal text is local-only and is **never sent to the AI coach**.
- Breathing presets (one config array): Box 4-4-4-4; 4-7-8 (cap 4 cycles); Physiological sigh (inhale 2 s, top-up inhale 1 s, exhale 6 s); Coherent 5.5 s in / 5.5 s out. Orb motion 500–800 ms decelerating; quiet completion (1 s scale, no confetti) with a before/after mood delta.
- Insights are gated: show a correlation only with ≥ 5 days with the factor and ≥ 5 without; show both averages and n; wording "on days when … tends to"; add "other factors can influence this".

**Progress (`pillar="neutral"`, multi-pillar)** — headline sentence + `LineChart` (weight: faint raw dots + bold 7-day average + dashed 74 kg target, `RangeTabs` 14/30/90), waist, strength e1RM tiles, adherence as `BarChart`/rows per pillar, mood + sleep trend minis, photos grid/compare.

**Coach (`pillar="coach"`)** — brief in `CoachQuote`, weekly review as three pillar rings + a sentence, proposals as decision cards (Why · Evidence · Impact · Accept / Keep current), history, chat with suggested-prompt chips, evidence chips under coach replies, serif for coach bubbles.

**Sleep (`pillar="rest"`)**, **CheckIn**, **Onboarding** (one question per step, big type, progress bar, pillar hue per step), **Settings** family (grouped lists, Appearance: System/Dark/Light via `setThemePref`).

## 7. Voice & copy

Demanding, specific, evidence-linked, never shaming. State → reason → action. No "cheat", "bad", "earned", "fail", "lazy". Missed sessions are rescheduled, not judged. Numbers are estimates when AI-derived ("≈"). Mind copy is warm, plain and non-clinical.

## 8. Pre-delivery checklist (from the skill)

No emoji icons · `cursor-pointer` on clickables (global) · 4.5:1 text contrast in both themes · visible focus · reduced motion respected · 44px targets, 8px gaps · labels on inputs · loading/empty/error states · colour never the only signal · ≤ 5 tabs · safe-area padding · text reflows at 375px without clipping · destructive actions confirmed.

## 9. Mind + pillars data contract (owner: mind-backend agent; everyone else imports by these names)

Types (additive, `src/domain/types.ts`):
```ts
interface MoodLog { id: number; ts: string; kind: 'momentary'|'daily'; valence: number /* -3..3 integer */; labels: string[]; contexts: string[]; note: string }
interface MindSession { id: number; ts: string; kind: 'breathing'|'winddown'|'meditation'; technique: string; durationSec: number; completed: boolean; valenceBefore: number|null; valenceAfter: number|null }
interface JournalEntry { id: number; ts: string; promptId: string; prompt: string; text: string; tags: string[] }
```
Schema: append ONE new migration to `MIGRATIONS` creating `mood_logs`, `mind_sessions`, `journal_entries` (never edit earlier migrations).

Repositories (`src/db/repositories/mind.ts`, re-exported from the index; synchronous):
`addMoodLog(m: Omit<MoodLog,'id'>): number`, `getMoodLogs(days: number): MoodLog[]` (ascending), `moodLogsForDate(date: string): MoodLog[]`, `latestMoodLog(): MoodLog|null`, `deleteMoodLog(id)`, `addMindSession(s: Omit<MindSession,'id'>): number`, `getMindSessions(days): MindSession[]`, `mindfulMinutes(from: string, to: string): number`, `addJournalEntry(e: Omit<JournalEntry,'id'>): number`, `updateJournalEntry(id, patch: Partial<Omit<JournalEntry,'id'>>)`, `deleteJournalEntry(id)`, `getJournalEntries(limit = 50): JournalEntry[]` (newest first).

Engine (`src/engine/mind.ts`, pure, exported from `src/engine/index.ts`):
`VALENCE_WORDS: Record<number,string>` (-3 'Very unpleasant' … 0 'Neutral' … 3 'Very pleasant'), `MOOD_LABELS: Record<'low'|'neutral'|'high', string[]>` (≤ 8 each), `labelsForValence(v): string[]`, `MOOD_CONTEXTS: string[]` (Work, Family, Health, Sleep, Training, Food, Money, Social, Weather…), `suggestContexts(facts: {trainedToday: boolean; sleepMin: number|null; painToday: boolean}): string[]`, `BREATHING_TECHNIQUES: { id: 'box'|'478'|'sigh'|'coherent'; name: string; purpose: string; phases: { phase: 'inhale'|'hold'|'exhale'|'rest'; seconds: number; label: string }[]; maxCycles?: number; note: string }[]`, `JOURNAL_PROMPTS: { id: string; kind: 'gratitude'|'win'|'reflection'|'reframe'; text: string }[]` (≥ 12), `promptForDate(date): JournalPrompt`, `moodSummary(logs: MoodLog[], today: string): { todayValence: number|null; avg7: number|null; prevAvg7: number|null; trend: 'up'|'down'|'flat'|null; daysCheckedIn7: number }`, `mindInsights(input: { moods: MoodLog[]; sleep: SleepRecord[]; sessions: WorkoutSession[]; mindSessions: MindSession[]; today: string }): { id: string; text: string; withAvg: number; withoutAvg: number; nWith: number; nWithout: number; caveat: string }[]`, `supportSignal(logs: MoodLog[], today: string): { show: boolean; message: string }` (≥ 4 days with a log ≤ -2 in the last 7, or ≥ 9 of last 14), `suggestTechnique(i: { stress: number|null; valence: number|null; hourNow: number; sleepLastNightMin: number|null }): { techniqueId: string; why: string }`.

Pillars (`src/engine/pillars.ts`): `computePillars(i: { sessionsDone: number; sessionsTarget: number; proteinG: number; proteinTarget: number; kcal: number; kcalTarget: number; sleepMin: number|null; sleepGoalMin?: number /*450*/; moodLoggedToday: boolean; mindfulMinToday: number }): Record<'train'|'eat'|'rest'|'mind', { value: number /*0..1*/; caption: string }>` — train = done/target; eat = 0.7·protein ratio + 0.3·kcal-in-range; rest = sleep/goal; mind = 0.5 if checked in + 0.5·min(1, mindful/5).

Coach (additive in `src/engine/coach.ts`): `CoachFacts.mind?: { stressToday: number|null; valenceToday: number|null; mindfulMinToday: number; support: boolean }`; when stress ≥ 7 or valence ≤ -2 the daily priority gains ONE directive suggesting a short breathing session (technique from `suggestTechnique`) — never a diagnosis, never blocks training on mood alone. `src/features/coach/facts.ts` fills `mind` and exports `buildPillars(): ReturnType<typeof computePillars>`.

Seed: 8 days of mood logs (mostly 0..2, one -1 after the short-sleep night), 3 breathing sessions, 2 journal entries; top up existing demo databases once (setting `seed.mindDemo`).

## 10. v3 — quiet, visual, AI-native (supersedes anything above that conflicts)

Owner feedback on v2: "too much info, not a whole lot of visuals; camera and voice don't work; it should feel like an AI-native wellness / fitness / nutrition app — plan workouts with visuals, links to exercises, routines, onboarding that understands the user's current state, upload reports." Measured v2 density: Today 3.2 screens tall / 246 words / 0 images; Coach 3.7 screens / 467 words.

### 10.1 Density budget (hard limits, measured at 375 × 812 with the seed data)
- Tab roots (Today, Train, Eat, Mind, Coach): **≤ 1.6 screens tall (≤ 1300 px) and ≤ 110 words** by default. Everything else moves behind a tap: sheets, detail screens, "See all".
- A card = **one visual + one number or one short line (≤ 12 words)**. No explanatory paragraphs on surfaces; put explanations in an info sheet behind an `Info` icon button.
- Max 5 blocks per tab root. Lists show 3 rows then "See all". No more than one `voice` sentence per screen.
- Delete, do not shrink: if a block is not needed to decide or act today, it leaves the root screen.

### 10.2 Visuals first
- Exercises always show an `ExerciseVisual` (photo when mapped, otherwise the `MuscleMap` illustration). Workouts and routines show a muscle map of what they train. Meals lead with their photo (or a `FoodGlyph` tile). Progress and Rest lead with a chart or ring, not text. Empty states use a simple line illustration (inline SVG) + one sentence + one button.
- New visual components (owner: visuals agent; exported from `src/components`):
```ts
MuscleMap      { primary: string[]; secondary?: string[]; view?: 'both'|'front'|'back'; size?: number; pillar?: Pillar; ariaLabel?: string }
               // stylised front/back body; accepts the free-text muscle names used in src/data/exercises.ts (primaryMuscles / secondaryMuscles)
ExerciseVisual { exercise: Exercise; size?: 'thumb'|'card'|'hero'; className?: string }   // thumb 56px, card 16:10, hero full-width; photo → onError → MuscleMap tile
FoodGlyph      { name: string; size?: number }   // rounded tile with a lucide food icon chosen from keywords (rice, noodle, egg, coffee, fish, chicken, fruit, dessert…)
AIBadge        { label?: string }                // tiny sparkle + "AI" eyebrow for anything model-generated
AIStatusChip   { onClick?: () => void }          // reads useAIStatus(): Connected · Claude / Sign in needed / Demo mode
Illustration   { name: 'plate'|'dumbbell'|'moon'|'breath'|'report'|'chart'|'chat'; size?: number }   // line illustrations for empty states
```
- `src/data/exerciseMedia.ts` (visuals agent): `exerciseMedia(id: string): { images: string[]; demoUrl: string; source: string|null }` and `demoUrl(name: string): string` (a YouTube search link: `https://www.youtube.com/results?search_query=` + encodeURIComponent(name + ' proper form')). Photos come from the public-domain free-exercise-db (`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<ID>/0.jpg`, `/1.jpg`); only IDs verified to exist are mapped.

### 10.3 AI-native
- AI layer (already built): `import { aiJson, aiConnected, coachChat, recognizeMeal } from '../../ai'` and `import { useAIStatus, refreshAI } from '../features/ai/config'`. `aiJson<T>({ system, prompt, schema, attachments? }, { dataType, purpose })` returns parsed JSON and writes the privacy ledger; attachments are `{ base64, mediaType, name? }` (images or `application/pdf`). Providers: Claude through Claude Code on the owner's Mac (their subscription, via the same-origin `/api/ai` bridge), an Anthropic API key, or on-device demo. **Every AI feature needs a deterministic fallback** when `!aiConnected()` and a one-line "Connect AI" hint linking to `/settings#ai`. AI output is always an editable draft; nothing is saved or changed without a tap. Safety gates stay deterministic.
- **Composer** (owner: composer agent; `import { Composer } from '../features/composer'`): `Composer({ context: 'today'|'eat'|'coach'|'train'|'mind'; placeholder?: string })` — a glass bar fixed above the tab bar: `+` (sheet: Snap a meal · Choose a photo · Upload a report) · text field "Ask or log anything…" · mic · send. It replaces the floating camera/mic buttons on Today and Eat. Submitted text goes to the deterministic parser first, then the AI router; the result is a preview card (what I understood → Apply / Edit / Cancel) or a coach answer.
- **AI workout planner** (train agent): "Plan with AI" → time (20/30/45/60), focus (Upper/Lower/Full/Conditioning/Mobility), optional note → AI returns a plan restricted to library exercise IDs → deterministic validation + symptom gate → visual preview (ExerciseVisual cards, MuscleMap summary, sets × reps, demo links) → Start or Save as routine. Routines gallery = visual cards.
- **Onboarding = intake conversation** (onboarding agent): one question per screen, big tap targets, understands the current state (goal, body, training history, injuries/conditions, equipment, schedule, eating pattern, sleep, stress, what has and has not worked), lets the user **upload reports**, can be **skipped for now** from the welcome screen (the app opens, but training and photo capture stay locked behind a sheet that says why, with one tap back into setup), and ends with an AI-written **Starting point** (where you are · what to watch · your first week) stored in setting `profile.baseline` `{ summary: string; strengths: string[]; watchouts: string[]; firstWeek: string[]; generatedBy: 'ai'|'local'; ts: string }`.
- **Reports** (reports agent): table `health_reports`; `import { ReportUploader } from '../features/reports'` → `ReportUploader({ compact?: boolean; onDone?: (id: number) => void })`; repositories `addReport, updateReport, deleteReport, getReport, listReports(): HealthReport[]`; type `HealthReport { id; ts; kind: 'blood'|'body_composition'|'clinical_note'|'imaging'|'other'; title; fileName; mediaType; fileDataUrl: string|null; status: 'extracted'|'manual'|'failed'; summary: string; markers: ReportMarker[]; notes: string }`, `ReportMarker { name; value: number|null; valueText: string; unit: string; refLow: number|null; refHigh: number|null; flag: 'low'|'normal'|'high'|'unknown'; category: string }`. Routes `/reports`, `/reports/:id`. Markers are shown as value-on-range bars using ONLY the reference range printed on the report. Never diagnose; every report screen says "Discuss results with your clinician." The coach may use report summaries as context only if setting `ai.shareReports` is true (default false, asked at upload).
- Camera & voice must work on an iPhone over plain HTTP: camera = a real `<input type="file" accept="image/*" capture="environment">` activated directly by the tap (label or synchronous click, never after an await). Voice = Web Speech when available (secure context: `npm run dev:https`), otherwise focus the composer text field with the hint "Tap the mic on your keyboard to dictate." When AI is not connected, the meal review says so plainly instead of presenting demo numbers as real.
