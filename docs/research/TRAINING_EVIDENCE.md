# Research — the 8 movement patterns, checked against the literature (Sept 2026)

Source of the claim: Dan Go, *"You only need 8 movement patterns"* (YouTube, `l2uB6wTiEiw`) — squat, hinge, lunge/single-leg, vertical press, horizontal press, pull-up, horizontal row, walking; trained 3×/week for ~35 min with progressive overload and minimal exercise rotation.

**Verdict: the programme is sound; two of the stated mechanisms are pop-science; the pattern list itself is a coaching convention, not a research finding.** Adopt it as the planner's skeleton, do not repeat its physiology claims in coach copy.

## 1. Is the taxonomy itself evidence-based?

No — and nothing depends on it being so. "Movement patterns" as a way to organise a programme comes from the Functional Movement Systems lineage (Gray Cook / Mike Boyle, joint-by-joint and the FMS screen) and from Dan John's "five human movements" (push, pull, hinge, squat, loaded carry). These are *organising conventions* that coaches converged on, not hypotheses that were tested against a body-part split in a trial. There is no RCT of "8 patterns vs. bro split."

What that means for us: the list is defensible as a **coverage checklist** — it guarantees both legs, both planes of push, both planes of pull, and a daily-activity floor — and that is exactly what a planner needs. It is not something to cite research for.

Two real gaps versus the standard taxonomies:
- **No loaded carry** (Dan John's fifth movement) — cheap, low-skill, high carryover, already in our exercise library (`farmers_carry` is in `TIMED_IDS`).
- **No core / anti-rotation or rotation pattern.** Relevant for the lower-back condition flag.
- **No direct single-joint work.** Not required (see §3), but it is the one place where "8 is enough" is weakest for a physique goal.

## 2. Frequency and session length: 3 × 35 min — defensible floor, not a ceiling

- 2–3 weekly sessions is the minimum for meaningful strength and hypertrophy gains; 6 days/week shows no significant advantage over 3 for either outcome ([minimal-dose overview, PMC11127831](https://pmc.ncbi.nlm.nih.gov/articles/PMC11127831/); [ACSM H&FJ, minimum-effective doses](https://journals.lww.com/acsm-healthfitness/fulltext/2026/01000/minimum_effective_resistance_training_doses.10.aspx)).
- Minimum effective dose for hypertrophy ≈ **4 hard sets per muscle per week**, loads in the 6–12 rep range, taken to or within ~2 reps of failure.
- **But** volume is dose-responsive: more weekly sets → more hypertrophy, roughly +0.38% per added set, with ~10 sets/muscle/week the common evidence-based benchmark ([Schoenfeld et al. 2017](https://pubmed.ncbi.nlm.nih.gov/27433992/); [Sports Medicine 2025 meta-regression](https://link.springer.com/article/10.1007/s40279-025-02344-w)).
- The minimal-dose reviews explicitly caveat that it is **unknown whether minimalist doses keep working past 8–12 weeks**.

→ App implication: 3×/week is a legitimate *minimum tier*, which is what `STRENGTH_MINIMUM = 3` already encodes. The coach should expect to escalate volume after ~8–12 weeks rather than hold the minimum indefinitely.

## 3. "You don't need hundreds of exercises" — supported

- Multi-joint vs. single-joint: trivial difference for whole-muscle hypertrophy and equivalent for strength ([SCJ 2023 meta-analysis](https://journals.lww.com/nsca-scj/fulltext/2023/02000/hypertrophic_effects_of_single__versus_multi_joint.5.aspx); [Gentil et al.](https://pubmed.ncbi.nlm.nih.gov/26446291/)). Single-joint work retains a niche for *regional* development, not total size.
- Varied vs. constant exercise selection: a 2024 RCT (70 participants, 10 weeks, 3×/week) found **virtually identical** strength and hypertrophy between rotating exercises and repeating the same two ([Kassiano et al. 2024](https://pubmed.ncbi.nlm.nih.gov/39388663/); see also the [2022 systematic review](https://pubmed.ncbi.nlm.nih.gov/35438660/)).

→ App implication: repeating the same 8 patterns and chasing load is not a compromise. Our substitution sheet should be framed as **constraint handling** (pain, equipment) rather than as variety for its own sake.

## 4. Walking — right conclusion, wrong reason

Supported: walking is a large, controllable contributor to daily energy expenditure and is compatible with recovery.

**Not supported as stated: "walking supports fat loss without spiking cortisol."** The cortisol framing is pop-science.
- Exercise raises cortisol as a function of intensity and duration (above ~60% VO₂max, 10–15+ min), but the rise is **transient and returns to baseline during recovery**, unlike psychological stress ([Frontiers 2015](https://www.frontiersin.org/journals/behavioral-neuroscience/articles/10.3389/fnbeh.2015.00013/full)).
- Persistent cortisol elevation tracks **under-eating and chronic energy deficit** far more than it tracks workout intensity.

→ App implication: keep walking in the plan; keep the *reason* as "energy expenditure and recovery-compatible volume." Add "cortisol" to the list of words the coach prompt must not use. A cortisol explanation in our app would be a claim we cannot back, in a product that already promises auditable reasoning.

## 5. "Squats assist with glucose storage" — true but not load-bearing

Resistance training does raise GLUT4 content, insulin-mediated glucose uptake and glycogen storage capacity ([Holten et al. 2004](https://pubmed.ncbi.nlm.nih.gov/14747278/); [APNM 2024 systematic review](https://cdnsciencepub.com/doi/10.1139/apnm-2024-0128)). But this is a property of **resistance training and added muscle mass generally**, not of the squat. It is not a reason to choose one pattern over another, and it should not appear as a per-exercise rationale.

## 6. What to carry into the product

| Claim | Status | Use it? |
|---|---|---|
| 8 patterns as a coverage checklist | Convention, not evidence | Yes — as the planner's skeleton |
| 3×/week minimum | Supported as a floor | Yes — already `STRENGTH_MINIMUM = 3` |
| ~35 min sessions | Supported short-term; unknown past 8–12 weeks | Yes, with a volume-escalation rule |
| Progressive overload, smaller increments near ceiling | Supported | Yes — `src/engine/progression.ts` |
| Few exercises, repeated | Supported | Yes — reframe substitution as constraint handling |
| Walking for fat loss | Supported | Yes |
| "without spiking cortisol" | Pop-science | **No** — ban the word in coach copy |
| "Squats help glucose storage" | True of RT generally | **No** — not a per-exercise reason |
| Pull-ups/rows "for posture" | Not assessed — no search run | Say "upper-back strength" until checked |
| Missing: loaded carry, core/anti-rotation | Gap in the taxonomy | Add as a 9th slot |
