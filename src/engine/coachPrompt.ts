// The coach system prompt as ordered sections (docs/PRD_COACH_CHAT.md §4). Each section is a pure function of the
// context that returns its lines, or null to leave itself out. The assembler joins sections with one blank line.
// Order is a contract: guardrails first, variable-length context (reports) last, because the Worker cuts the
// prompt from the end (MAX_SYSTEM_CHARS).
import { safetyNoteLine, type SafetyKind } from './chatSafety'
import type { CoachFacts, CoachPriority } from './coach'
import { VALENCE_WORDS } from './mind'
import { regionLabel } from './symptomGate'
import { dayName, fmtDuration } from '../lib/util'

/**
 * Optional extra context: the onboarding baseline, one line per shared health report (only when the user opted in),
 * and the kind of a recent safety screen hit (never its text).
 */
export interface CoachPromptExtras { baseline?: string; reports?: string[]; safetyKind?: SafetyKind }

export interface PromptContext {
  facts: CoachFacts
  profileSummary: string
  /** computeDailyPriority(facts), computed once by the caller. */
  priority: CoachPriority
  extras: CoachPromptExtras
}

/** A section returns its lines, or null to leave itself out. No I/O, no clock. */
export type PromptSection = (ctx: PromptContext) => string[] | null

export const REPORTS_CONTEXT_RULE =
  "Reports are context for coaching conversations only: never diagnose, never contradict the user's clinician, suggest discussing out-of-range values with their clinician."

const fmtN = (n: number) => Math.round(n).toLocaleString('en-SG')

function mindFactLine(m: NonNullable<CoachFacts['mind']>): string {
  const stress = m.stressToday != null ? `${m.stressToday}/10` : 'not logged'
  const mood = m.valenceToday != null ? `${VALENCE_WORDS[m.valenceToday] ?? m.valenceToday} (${m.valenceToday} on a -3..3 scale)` : 'not logged'
  const support = m.support ? '; mood has been low on several recent days — mention once, gently, that talking to someone can help' : ''
  return `- Mind today: stress ${stress}; mood ${mood}; mindful minutes ${m.mindfulMinToday}${support}`
}

// --- sections ------------------------------------------------------------------------------------------

export const identitySection: PromptSection = () => [
  'You are a personal fitness coach for one user. You are demanding, proactive and direct about adherence, and conservative about pain, injury and recovery.',
]

export const rulesSection: PromptSection = () => [
  'RULES',
  '- Be specific: one clear next action, not generic motivation. Call out missed workouts and unlogged meals plainly, without guilt or shaming.',
  '- Evidence-linked: cite the logged facts below when you make a claim. Do not invent data.',
  '- Never pressure the user to train through joint, spine or neck pain. Locking, giving way, numbness, weakness or radiating symptoms mean stop the provocative work and suggest a clinical assessment. Never diagnose.',
  '- Symptoms: use plain words, never clinical terms (no "pathology", "mechanical symptoms", "inflammation", "degeneration"), and never guess at a cause. When the user mentions a new or changed symptom, tell them to log it in the app (pain score, plus any locking, giving way, numbness or weakness) so the symptom gate re-checks the plan; until then the conservative call is to skip the movements that provoke it, not the whole session.',
  '- Deterministic rules own the numbers. Do NOT do calorie or macro arithmetic, do not compute progression loads, and do not change targets or the plan. If a change seems warranted, describe it as a proposal the user can accept or reject in the app.',
  '- Respect the user\'s eating pattern (1–2 meals/day, skips breakfast). Never moralize about food, coffee or snacks.',
  '- Mood and stress are context, not findings. Never diagnose, never name a condition, never score how the user feels. When mood is low or stress is high, be warm and plain: suggest a short breathing session in Mind or talking to someone they trust. Never cancel or block training on mood alone. The journal is private and is not part of your context; do not ask to see it.',
  '- Metric units. Keep answers short (under 120 words) unless asked for detail. Plain text only: no markdown, no headings, no bullet lists. No emoji.',
]

/** Present only while a recent message was screened by L1 (docs/PRD_COACH_CHAT.md §5.4). */
export const safetyNoteSection: PromptSection = ({ extras }) => (extras.safetyKind ? [safetyNoteLine(extras.safetyKind)] : null)

export const profileSection: PromptSection = (ctx) => [`PROFILE: ${ctx.profileSummary}`]

export const factsSection: PromptSection = ({ facts: f }) => {
  const week = f.sessionsThisWeek.map((s) => `${dayName(s.scheduledDate)} ${s.name} [${s.status}]`).join('; ') || 'none planned'
  const trend = f.nutritionTrend
  return [
    'FACTS (from the local database)',
    `- Date/time: ${f.today} ${String(f.hourNow).padStart(2, '0')}:00`,
    `- Readiness: ${f.readiness.state} — ${f.readiness.reasons.join('; ')}`,
    `- Symptom gate: ${f.gate.overall}${f.gate.regions.length ? ' — ' + f.gate.regions.map((r) => `${regionLabel(r.region)} ${r.level} (pain ${r.painScore}/10${r.redFlags.length ? ', ' + r.redFlags.join(', ') : ''})`).join('; ') : ''}${f.gate.avoidTags.length ? `; avoid: ${f.gate.avoidTags.join(', ')}` : ''}`,
    `- Today's session: ${f.plannedToday ? `${f.plannedToday.name} [${f.plannedToday.status}]` : 'none'}`,
    `- This week (${f.weekTier} tier): ${week}; missed: ${f.missedThisWeek}`,
    `- Intake today: ${fmtN(f.intakeToday.kcal)} / ${fmtN(f.target.kcal)} kcal, protein ${Math.round(f.intakeToday.proteinG)} / ${f.target.proteinG} g (expected ~${Math.round(f.proteinPaceExpected)} g by now)`,
    `- Saved meals: ${f.savedMealNames.join('; ') || 'none'}; recent high-protein foods: ${f.recentHighProteinFoods.join(', ') || 'none'}`,
    `- Weight: ${f.weight.latest != null ? `${f.weight.latest.toFixed(1)} kg` : 'unknown'}, 7-day avg ${f.weight.avg7 != null ? f.weight.avg7.toFixed(1) : '—'} kg (prev ${f.weight.prevAvg7 != null ? f.weight.prevAvg7.toFixed(1) : '—'} kg), goal ${f.weight.goal ?? '—'} kg`,
    `- Sleep: ${f.sleepLastNightMin != null ? fmtDuration(f.sleepLastNightMin) : 'unknown'} last night, 7-day avg ${f.sleepAvg7Min != null ? fmtDuration(f.sleepAvg7Min) : '—'}`,
    `- Meal logging: ${f.loggedMealDaysLast7} of the last 7 days`,
    `- Nutrition trend: ${trend ? trend.flags.map((x) => `${x.kind}: ${x.message}`).join(' | ') || 'no flags' : 'not evaluated'}${trend?.proposal ? ` | pending proposal: ${trend.proposal.summary}` : ''}`,
    `- Stalls: ${f.stalls.map((s) => s.exerciseName).join(', ') || 'none'}`,
    ...(f.mind ? [mindFactLine(f.mind)] : []),
  ]
}

export const prioritySection: PromptSection = ({ priority }) => [
  "TODAY'S COMPUTED PRIORITY (from the rules engine — reinforce it, do not contradict it)",
  `- ${priority.headline}`,
  ...priority.directives.map((d) => `- ${d}`),
]

export const proposalContractSection: PromptSection = () => [
  'When the user asks for a plan or target change, answer with the reasoning and end with a single line starting "PROPOSAL:" describing the change in one sentence; the app turns it into an Accept/Reject card.',
]

export const baselineSection: PromptSection = ({ extras }) => {
  const baseline = extras.baseline?.trim()
  return baseline ? ['STARTING POINT (from onboarding)', baseline] : null
}

export const reportsSection: PromptSection = ({ extras }) => {
  const reports = (extras.reports ?? []).map((r) => r.trim()).filter(Boolean)
  if (!reports.length) return null
  return ['HEALTH REPORTS (shared by the user; values and ranges exactly as printed on each report)', ...reports.map((r) => `- ${r}`), REPORTS_CONTEXT_RULE]
}

// --- assembly ------------------------------------------------------------------------------------------

export const SECTION_ORDER: PromptSection[] = [
  identitySection,
  rulesSection,
  safetyNoteSection,
  profileSection,
  factsSection,
  prioritySection,
  proposalContractSection,
  baselineSection,
  reportsSection,
]

export function assembleCoachPrompt(ctx: PromptContext, sections: PromptSection[] = SECTION_ORDER): string {
  return sections
    .map((section) => section(ctx))
    .filter((lines): lines is string[] => lines !== null)
    .map((lines) => lines.join('\n'))
    .join('\n\n')
}
