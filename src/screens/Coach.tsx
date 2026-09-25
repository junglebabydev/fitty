// Coach screen (DESIGN §10, v3): a conversation, not a dashboard. The root holds one brief (a single `voice` sentence),
// one compact proposals card and the chat. Directives, evidence, the weekly rings and the decision history live in the
// Details sheet; proposals open a decision sheet (Why · Evidence · Impact · Accept / Keep current).
// The coach never mutates data silently - every plan change goes through Accept.
// Privacy: only chat turns, CoachFacts, the onboarding baseline and (when `ai.shareReports` is on) report summaries reach
// the provider. Journal text and mood notes are never read here.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronRight, CircleAlert, Eraser, Lightbulb, RotateCcw, TriangleAlert, Undo2, X } from 'lucide-react'
import type { CoachDecision, CoachMessage, Evidence } from '../domain/types'
import {
  AIBadge, AIStatusChip, Button, Card, Chip, CoachQuote, IconButton, Illustration, PILLARS, ReadinessBadge, Ring, Screen, Sheet,
  Skeleton, StatusPill,
  type Tone,
} from '../components'
import { useNow, useOnline, useQuery, useToast } from '../hooks'
import {
  addDecision, addMessage, clearMessages, dailyTotalsRange, getConditionFlags, getDecisions, getGoals, getMessages, getMoodLogs,
  getNutritionTarget, getPendingDecisions, getProfile, getSession, getSetting, getSleepRecords,
} from '../db/repositories'
import {
  ageAt, answerLocally, buildAgentPrompt, computeDailyPriority, checkReply, routeDeterministic, moodSummary, regionLabel, screenMessage, weeklyReview,
  type CoachFacts, type CoachPriority, type CoachPromptExtras,
} from '../engine'
import { aiConnected, coachChat, isAIError } from '../ai'
import { useAIStatus } from '../features/ai/config'
import { COMPOSER_CLEARANCE, Composer } from '../features/composer'
import { reportContextLines } from '../features/reports'
import { addDays, cx, dateOf, fmtDate, fmtTime, nowIso, todayStr } from '../lib/util'
import { buildCoachFacts } from '../features/coach/facts'
import {
  acceptDecision, decisionKindLabel, extractProposalLine, isReversible, numberOr, rejectDecision, revertDecision, syncProposals,
} from '../features/coach/apply'
import {
  baselineContext, firstSentence, isLongReply, latestAgent, latestSafetyKind, proposalsLabel, readSafety, readSource, tagAgent, tagSafety, tagSource,
  toModelTurns,
} from '../features/coach/chat'
import { SupportSheet } from '../features/mind/SupportSheet'

const MAX_TURNS = 12
/** A safety screen hit in this many recent messages keeps the prompt's safety note on. */
const SAFETY_LOOKBACK = 10
/** Messages shown on the root before "Earlier messages". */
const RECENT_MESSAGES = 3
/** At most four suggested prompts (DESIGN §10.1). */
const SUGGESTIONS = ['How is my week going?', 'What should I eat next?', 'Should I train today?', 'I feel stressed']
const KEPT_NOTE = 'Kept current. Nothing changed.'

// Decision status is not a readiness / safety state, so pills stay neutral and carry an icon + word.
const STATUS_TONE: Record<CoachDecision['status'], Tone> = { proposed: 'default', accepted: 'default', rejected: 'neutral', reverted: 'neutral' }
const STATUS_LABEL: Record<CoachDecision['status'], string> = { proposed: 'Pending', accepted: 'Accepted', rejected: 'Kept current', reverted: 'Reverted' }

type RingKey = keyof typeof PILLARS

/** Staggered entrance (DESIGN §4 motion). */
function rise(i: number): { style: CSSProperties } {
  return { style: { '--i': i } as CSSProperties }
}

function safeFacts(): CoachFacts | null {
  try {
    return buildCoachFacts()
  } catch (e) {
    console.warn('buildCoachFacts failed', e)
    return null
  }
}

function profileSummary(): string {
  const p = getProfile()
  if (!p) return 'No profile yet.'
  const flags = getConditionFlags()
  const goals = getGoals().filter((g) => g.status === 'active')
  return [
    `${p.name || 'User'}, ${p.sex}, ${ageAt(p.dob)} y, ${p.heightCm} cm, ${p.experience}`,
    `diet: ${p.dietPattern || 'not specified'}`,
    `equipment: ${p.equipment.join(', ') || 'not specified'}`,
    `mobility priorities: ${p.mobilityPriorities.join(', ') || 'none'}`,
    `conditions: ${flags.map((f) => `${f.label} (${regionLabel(f.region)})`).join('; ') || 'none'}`,
    `goals: ${goals.map((g) => `${g.type} ${g.targetValue} ${g.unit}`).join(', ') || 'none'}`,
    `coach style: ${p.coachStyle}`,
    `training days min/target/stretch ${p.trainingDaysMin}/${p.trainingDaysTarget}/${p.trainingDaysStretch}`,
  ].join('; ') + '.'
}

/**
 * Extra prompt context: the onboarding baseline, report summaries only when the user allowed it, and the kind of a
 * recent safety screen hit (never its text). Never journal text.
 */
function promptExtras(recent: CoachMessage[]): CoachPromptExtras {
  const extras: CoachPromptExtras = {}
  const safetyKind = latestSafetyKind(recent)
  if (safetyKind) extras.safetyKind = safetyKind
  const baseline = baselineContext(getSetting<unknown>('profile.baseline', null))
  if (baseline) extras.baseline = baseline
  try {
    // Empty unless the user turned on `ai.shareReports` (the reports feature owns that gate).
    const lines = reportContextLines()
    if (lines.length) extras.reports = lines
  } catch (e) {
    console.warn('reportContextLines failed', e)
  }
  return extras
}

function weekInputs(today: string) {
  const intake = dailyTotalsRange(addDays(today, -6), today)
  const sleep = getSleepRecords(7)
  const avgSleepMin = sleep.length ? Math.round(sleep.reduce((a, r) => a + r.durationMin, 0) / sleep.length) : null
  return { loggedDays: intake.filter((d) => d.logged).length, sleepNights: sleep.length, avgSleepMin }
}

/** Mind ring: share of the last 7 days with a check-in. Null (no ring) until there is a mood log. Valence only - notes are not read. */
function mindWeekPct(today: string): number | null {
  const logs = getMoodLogs(7)
  if (!logs.length) return null
  return Math.round((moodSummary(logs, today).daysCheckedIn7 / 7) * 100)
}

// --- small presentational pieces -----------------------------------------------------

/** Evidence as label · value chips. Wrap-safe for long values. */
function EvidenceChips({ evidence, className }: { evidence: Evidence[]; className?: string }) {
  if (!evidence.length) return <p className={cx('m-0 text-sm text-muted', className)}>No evidence attached.</p>
  return (
    <dl className={cx('m-0 flex flex-wrap gap-1.5', className)} aria-label="Evidence">
      {evidence.map((e, i) => (
        <div key={`${e.label}-${i}`} className="inline-flex max-w-full items-baseline gap-1.5 rounded-2xl border border-line bg-surface-2 px-2.5 py-1">
          <dt className="eyebrow shrink-0 text-[0.625rem] text-muted">{e.label}</dt>
          <dd className="num m-0 min-w-0 break-words text-[15px] leading-tight text-app">{e.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="eyebrow mb-1.5 text-muted">{label}</div>
      {children}
    </div>
  )
}

function ReviewList({ label, icon, items }: { label: string; icon: ReactNode; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <div className="eyebrow mb-1.5 text-muted">{label}</div>
      <ul className="m-0 list-none space-y-1.5 p-0">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-snug">
            <span className="mt-[3px] shrink-0 text-muted" aria-hidden>{icon}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Weekly review: pillar rings + one interpreting sentence. Lives in the Details sheet. */
function WeekReview({ facts, extras, mindPct }: { facts: CoachFacts; extras: ReturnType<typeof weekInputs>; mindPct: number | null }) {
  const completed = facts.sessionsThisWeek.filter((s) => s.status === 'completed').length
  const review = useMemo(
    () => weeklyReview({ ...facts, completedSessions: completed, plannedSessions: facts.sessionsThisWeek.length, ...extras }),
    [facts, extras, completed],
  )
  const rings: { key: RingKey; pct: number }[] = [
    { key: 'train', pct: review.training },
    { key: 'eat', pct: review.nutrition },
    { key: 'rest', pct: review.sleep },
  ]
  if (mindPct != null) rings.push({ key: 'mind', pct: mindPct })
  const size = rings.length > 3 ? 64 : 80
  // The rings already carry the percentages; keep the part of the sentence that interprets them.
  const sentence = review.summary.replace(/^Training \d+%, nutrition \d+%, sleep \d+%\.\s*/, '') || review.summary

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-muted">This week · {completed} of {facts.sessionsThisWeek.length} sessions</span>
        <Link to="/progress" className="press -mr-2 inline-flex h-11 items-center gap-0.5 rounded-xl px-2 text-sm font-semibold text-app">
          Trends <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      <div className="mt-2 flex items-start justify-around gap-2">
        {rings.map(({ key, pct }) => {
          const meta = PILLARS[key]
          const Icon = meta.icon
          return (
            <div key={key} className="flex min-w-0 flex-col items-center gap-2">
              <Ring value={pct} max={100} size={size} stroke={7} pillar={key} ariaLabel={`${meta.label} ${pct} percent this week`}>
                <span className="flex items-baseline">
                  <span className={cx('num', size > 70 ? 'text-2xl' : 'text-xl')}>{pct}</span>
                  <span className="text-[11px] font-medium text-muted">%</span>
                </span>
              </Ring>
              <span className={cx('eyebrow flex items-center gap-1', meta.text)}>
                <Icon size={12} strokeWidth={2.25} aria-hidden />
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
      <p className="m-0 mt-4 text-[15px] leading-snug text-pretty">{sentence}</p>
      {(review.highlights.length > 0 || review.concerns.length > 0) && (
        <div className="mt-4 space-y-4">
          <ReviewList label="Going well" icon={<Check size={15} />} items={review.highlights} />
          <ReviewList label="Needs attention" icon={<CircleAlert size={15} />} items={review.concerns} />
        </div>
      )}
    </div>
  )
}

function ProposalBlock({ d, busy, onAccept, onReject }: { d: CoachDecision; busy: boolean; onAccept: () => void; onReject: () => void }) {
  return (
    <section aria-label={d.title} className="border-t border-line py-5 first:border-t-0 first:pt-1">
      <div className="eyebrow text-muted">{decisionKindLabel(d.action.kind)} · {fmtDate(dateOf(d.ts))}</div>
      <h3 className="m-0 mt-1.5 text-xl font-semibold leading-snug tracking-tight text-pretty">{d.title}</h3>
      <Labelled label="Why">
        <p className="m-0 whitespace-pre-line text-[15px] leading-snug text-pretty">{d.rationale}</p>
      </Labelled>
      <Labelled label="Evidence">
        <EvidenceChips evidence={d.evidence} />
      </Labelled>
      <Labelled label="Impact">
        <p className="m-0 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[15px] leading-snug">{d.action.summary || 'No plan change - informational only.'}</p>
      </Labelled>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" full icon={<Check size={18} />} onClick={onAccept} loading={busy}>Accept</Button>
        <Button variant="secondary" full onClick={onReject} disabled={busy}>Keep current</Button>
      </div>
    </section>
  )
}

const STATUS_ICON: Record<CoachDecision['status'], ReactNode> = {
  proposed: <CircleAlert size={12} />,
  accepted: <Check size={12} />,
  rejected: <X size={12} />,
  reverted: <Undo2 size={12} />,
}

function HistoryItem({ d, reversible, last, onRevert }: { d: CoachDecision; reversible: boolean; last: boolean; onRevert: () => void }) {
  return (
    <li className="relative py-3 pl-6">
      {!last && <span className="absolute bottom-0 left-[3px] top-7 w-px bg-line" aria-hidden />}
      <span className={cx('absolute left-0 top-[1.1rem] h-[7px] w-[7px] rounded-full', d.status === 'accepted' ? 'bg-accent' : 'border border-line-strong bg-surface')} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-faint">{fmtDate(dateOf(d.decidedAt ?? d.ts))} · {decisionKindLabel(d.action.kind)}</div>
          <div className="mt-1 text-[15px] font-medium leading-snug">{d.title}</div>
          {d.resultNotes && <div className="mt-1 whitespace-pre-line text-sm leading-snug text-muted">{d.resultNotes}</div>}
        </div>
        <StatusPill tone={STATUS_TONE[d.status]} size="sm" icon={STATUS_ICON[d.status]} className="mt-0.5 shrink-0">{STATUS_LABEL[d.status]}</StatusPill>
      </div>
      {reversible && (
        <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={onRevert} className="-ml-3 mt-1 text-app">Revert to previous</Button>
      )}
    </li>
  )
}

function UserBubble({ m }: { m: CoachMessage }) {
  return (
    <div className="flex flex-col items-end">
      <span className="sr-only">You</span>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[1.25rem] rounded-br-md border border-line bg-surface-2 px-3.5 py-2.5 text-base leading-snug">
        {m.content}
      </div>
    </div>
  )
}

/** Coach reply in the serif voice: at most three evidence chips, long replies clamp, and a tag says who wrote it. */
function CoachReply({ m, onSupport }: { m: CoachMessage; onSupport: () => void }) {
  const [open, setOpen] = useState(false)
  const { source, evidence } = readSource(m.evidence)
  const safety = readSafety(m.evidence) !== null
  const long = isLongReply(m.content)
  return (
    <div className="max-w-[94%]">
      <CoachQuote
        compact
        evidence={evidence.length > 0 && (!long || open) ? evidence : undefined}
        actions={safety ? (
          <Button variant="secondary" onClick={onSupport}>Open support</Button>
        ) : long ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="press -my-2 -ml-2 inline-flex h-11 items-center rounded-xl px-2 text-sm font-semibold text-app"
          >
            {open ? 'Show less' : 'Read more'}
          </button>
        ) : undefined}
      >
        <span className={cx('whitespace-pre-wrap break-words', long && !open ? 'line-clamp-3' : 'block')}>{m.content}</span>
      </CoachQuote>
      <div className="mt-1.5 flex items-center gap-2 pl-4 text-[11px] text-faint tnum">
        {source === 'ai' && <AIBadge />}
        {source === 'local' && <span className="eyebrow text-[0.625rem] text-muted">Local answer</span>}
        <span>{fmtTime(m.ts)}</span>
      </div>
    </div>
  )
}

function TypingSkeleton() {
  return (
    <div className="max-w-[94%] border-l border-accent/60 pl-3.5" role="status" aria-label="Coach is thinking">
      <div className="mt-1 space-y-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  )
}

// --- sheets -----------------------------------------------------------------------------

interface HistoryEntry { d: CoachDecision; reversible: boolean }

function DetailsSheet({ open, onClose, facts, priority, extras, mindPct, history, onRevert }: {
  open: boolean
  onClose: () => void
  facts: CoachFacts
  priority: CoachPriority
  extras: ReturnType<typeof weekInputs>
  mindPct: number | null
  history: HistoryEntry[]
  onRevert: (d: CoachDecision) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? history : history.slice(0, 3)
  return (
    <Sheet open={open} onClose={onClose} title={`Today's brief · ${fmtDate(facts.today)}`}>
      <div className="space-y-6 pb-2 pt-1">
        <div>
          <p className="m-0 text-[17px] font-semibold leading-snug text-pretty">{priority.headline}</p>
          {priority.directives.length > 0 && (
            <ul className="m-0 mt-3 list-none space-y-2 p-0">
              {priority.directives.map((d, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
                  <span className="mt-[0.65em] h-px w-3 shrink-0 bg-line-strong" aria-hidden />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
          {priority.evidence.length > 0 && <EvidenceChips evidence={priority.evidence} className="mt-4" />}
        </div>

        <div className="border-t border-line pt-5">
          <WeekReview facts={facts} extras={extras} mindPct={mindPct} />
        </div>

        {history.length > 0 && (
          <div className="border-t border-line pt-5">
            <div className="eyebrow text-muted">Decision history · {history.length}</div>
            <ol className="m-0 mt-1 list-none p-0">
              {shown.map(({ d, reversible }, i) => (
                <HistoryItem key={d.id} d={d} reversible={reversible} last={i === shown.length - 1} onRevert={() => onRevert(d)} />
              ))}
            </ol>
            {history.length > 3 && !showAll && (
              <Button variant="ghost" onClick={() => setShowAll(true)} className="-ml-3 text-app">See all</Button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// --- screen ---------------------------------------------------------------------------

export default function CoachScreen() {
  const toast = useToast()
  const navigate = useNavigate()
  const online = useOnline()
  const ai = useAIStatus()
  const now = useNow(60_000)
  const today = todayStr()
  const hour = now.getHours()

  const facts = useQuery(() => safeFacts(), [today, hour])
  const summary = useQuery(() => profileSummary(), [today])
  const extras = useQuery(() => weekInputs(today), [today])
  const mindPct = useQuery(() => mindWeekPct(today), [today])
  const pending = useQuery(() => getPendingDecisions(), [])
  const history = useQuery<HistoryEntry[]>(() => {
    const currentTarget = getNutritionTarget(today)
    return getDecisions(40)
      .filter((d) => d.status !== 'proposed')
      .map((d) => {
        const sessionId = d.action.kind === 'volume' ? numberOr(d.action.payload.sessionId, NaN) : NaN
        const session = Number.isFinite(sessionId) ? getSession(sessionId) : null
        return { d, reversible: isReversible(d, { currentTarget, session: d.action.kind === 'volume' ? session : undefined }) }
      })
  }, [today])
  const messages = useQuery(() => getMessages(60), [])

  const priority = useMemo(() => (facts ? computeDailyPriority(facts) : null), [facts])

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [proposalsOpen, setProposalsOpen] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const [busyDecision, setBusyDecision] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  const factsRef = useRef(facts)
  const summaryRef = useRef(summary)
  useEffect(() => { factsRef.current = facts }, [facts])
  useEffect(() => { summaryRef.current = summary }, [summary])

  // Proposals are generated deterministically from today's facts; duplicates are filtered in syncProposals.
  useEffect(() => {
    try {
      syncProposals()
    } catch (e) {
      console.warn('syncProposals failed', e)
    }
  }, [])

  // The proposals sheet closes itself once every proposal has been decided.
  useEffect(() => {
    if (pending.length === 0) setProposalsOpen(false)
  }, [pending.length])

  // --- decisions (nothing changes without Accept) ---
  const onAccept = useCallback((d: CoachDecision) => {
    setBusyDecision(d.id)
    try {
      const note = acceptDecision(d)
      toast.show(note, 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not apply this proposal', 'error')
    } finally {
      setBusyDecision(null)
    }
  }, [toast])

  const onReject = useCallback((d: CoachDecision) => {
    rejectDecision(d, KEPT_NOTE)
    toast.show('Kept your current plan. Nothing changed.', 'info')
  }, [toast])

  const onRevert = useCallback((d: CoachDecision) => {
    try {
      const note = revertDecision(d)
      toast.show(note, 'success')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not revert this decision', 'error')
    }
  }, [toast])

  // --- chat ---
  const endRef = useRef<HTMLDivElement>(null)
  const initialCount = useRef<number | null>(null)
  useEffect(() => {
    if (initialCount.current === null) { initialCount.current = messages.length; return }
    if (messages.length > initialCount.current || thinking) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, thinking])

  const busyRef = useRef(false)
  const send = useCallback(async (raw: string) => {
    const q = raw.trim()
    if (!q || busyRef.current) return
    setNotice(null)
    addMessage({ ts: nowIso(), role: 'user', content: q, evidence: [] })

    // L1 safety screen (docs/PRD_COACH_CHAT.md §5): before anything else, offline too. No model sees this message.
    const hit = screenMessage(q)
    if (hit) {
      addMessage({ ts: nowIso(), role: 'coach', content: hit.reply, evidence: tagSafety(hit.kind) })
      setSupportOpen(true)
      return
    }

    const f = factsRef.current
    if (!f) {
      addMessage({ ts: nowIso(), role: 'coach', content: 'I need your profile and a nutrition target before I can answer from your data. Finish setup first.', evidence: tagSource([], 'local') })
      return
    }

    const replyLocally = (why: string | null) => {
      if (why) setNotice(why)
      const local = answerLocally(q, f)
      addMessage({ ts: nowIso(), role: 'coach', content: local.content, evidence: tagSource(local.evidence, 'local') })
    }

    // Not connected: the one-line "Connect AI" hint on the screen already says so.
    if (!aiConnected()) { replyLocally(null); return }
    if (!online) { replyLocally('Offline. Answered from your data.'); return }

    busyRef.current = true
    setThinking(true)
    try {
      const recent = getMessages(SAFETY_LOOKBACK)
      // Pick the specialist (docs/PRD_COACH_CHAT.md §11.2). Undecided goes to the generalist coach.
      const agent = routeDeterministic(q, latestAgent(recent)).agent ?? 'coach'
      const system = buildAgentPrompt(agent, { facts: f, profileSummary: summaryRef.current, priority: computeDailyPriority(f), extras: promptExtras(recent) })
      const turns = toModelTurns(getMessages(MAX_TURNS + 1)).slice(-MAX_TURNS)
      // L3 reply check (docs/PRD_COACH_CHAT.md §7): a rejected reply is never shown and never becomes a proposal.
      const checked = checkReply(await coachChat(system, turns), system)
      if (!checked.ok) { replyLocally('AI reply withheld. Answered from your data.'); return }
      const reply = checked.text
      const evidence = computeDailyPriority(f).evidence
      addMessage({ ts: nowIso(), role: 'coach', content: reply, evidence: tagSource(tagAgent(evidence, agent), 'ai') })
      const proposal = extractProposalLine(reply)
      if (proposal) {
        // A suggestion only: it becomes a pending proposal the user can Accept or keep current.
        addDecision({
          ts: nowIso(),
          kind: 'chat_suggestion',
          title: proposal.length > 90 ? `${proposal.slice(0, 87)}...` : proposal,
          rationale: reply,
          evidence: evidence.slice(0, 3),
          action: { kind: 'note', payload: { text: proposal, source: 'chat' }, summary: proposal },
          status: 'proposed',
          resultNotes: '',
          decidedAt: null,
        })
        toast.show('The coach added a proposal', 'info')
      }
    } catch (e) {
      const kind = isAIError(e) ? e.kind : 'unknown'
      replyLocally(kind === 'offline' ? 'Offline. Answered from your data.' : 'AI did not answer. Answered from your data.')
    } finally {
      busyRef.current = false
      setThinking(false)
    }
  }, [online, toast])

  // ?q=... (from the Composer, the voice sheet or Today) is sent once per navigation: the location key guards against
  // effect re-runs, the param is cleared right away, and a question that arrives mid-reply waits in `queued`.
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const handledKey = useRef<string | null>(null)
  const [queued, setQueued] = useState<string | null>(null)
  useEffect(() => {
    const q = params.get('q')
    if (!q || handledKey.current === location.key) return
    handledKey.current = location.key
    setParams({}, { replace: true })
    setQueued(q)
  }, [params, setParams, location.key])
  useEffect(() => {
    if (!queued || thinking) return
    setQueued(null)
    void send(queued)
  }, [queued, thinking, send])

  const onClear = () => {
    clearMessages()
    setConfirmClear(false)
    setNotice(null)
    setShowEarlier(false)
    toast.show('Conversation cleared', 'info')
  }

  const proposals = proposalsLabel(pending)
  const visible = showEarlier ? messages : messages.slice(-RECENT_MESSAGES)
  const earlier = messages.length - visible.length

  return (
    <Screen pillar="coach" large title="Coach" right={<AIStatusChip onClick={() => navigate('/settings#ai')} />}>
      {/* Bottom padding keeps the last chat line clear of the fixed Composer. */}
      <div className="flex flex-col gap-3" style={{ paddingBottom: COMPOSER_CLEARANCE }}>
        {!facts || !priority ? (
          <Card className="anim-rise" {...rise(0)}>
            <p className="voice m-0 text-xl text-pretty">I need your profile and targets before I can coach from your data.</p>
            <Link to="/onboarding" className="mt-4 block"><Button variant="primary" full>Finish setup</Button></Link>
          </Card>
        ) : (
          <div className="anim-rise" {...rise(0)}>
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="eyebrow text-muted">Today</span>
                <ReadinessBadge state={facts.readiness.state} compact />
              </div>
              <CoachQuote
                actions={
                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    aria-haspopup="dialog"
                    className="press -my-2 -ml-2 inline-flex h-11 items-center gap-0.5 rounded-xl px-2 text-sm font-semibold text-app"
                  >
                    Details <ChevronRight size={16} aria-hidden />
                  </button>
                }
              >
                {firstSentence(priority.headline)}
              </CoachQuote>
            </Card>
          </div>
        )}

        {proposals && (
          <button
            type="button"
            onClick={() => setProposalsOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${proposals.count}: ${proposals.title}. Review`}
            {...rise(1)}
            className="anim-rise press flex min-h-[64px] w-full items-center gap-3 rounded-[1.25rem] border border-pillar-line bg-surface px-4 py-3 text-left active:bg-surface-2"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pillar-soft text-pillar" aria-hidden><Lightbulb size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block text-pillar">{proposals.count}</span>
              <span className="mt-0.5 block truncate text-base font-semibold leading-snug">{proposals.title}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
          </button>
        )}

        <section aria-label="Conversation" {...rise(2)} className="anim-rise mt-3">
          {messages.length > 0 && (
            <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
              {earlier > 0 ? (
                <button type="button" onClick={() => setShowEarlier(true)} className="press -ml-2 inline-flex h-11 items-center rounded-xl px-2 text-sm font-semibold text-muted">
                  Earlier messages · {earlier}
                </button>
              ) : <span className="eyebrow text-muted">Conversation</span>}
              {confirmClear ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" onClick={() => setConfirmClear(false)} className="text-app">Cancel</Button>
                  <Button variant="danger" onClick={onClear}>Clear all</Button>
                </span>
              ) : (
                <IconButton icon={<Eraser size={18} />} label="Clear conversation" onClick={() => setConfirmClear(true)} />
              )}
            </div>
          )}

          <div className="flex flex-col gap-5" aria-live="polite">
            {messages.length === 0 && !thinking && (
              <div className="flex flex-col items-center gap-2 py-3 text-center text-muted">
                <Illustration name="chat" size={96} />
                <p className="m-0 text-[15px]">Ask about training, food, sleep or symptoms.</p>
              </div>
            )}
            {visible.map((m) => (m.role === 'user' ? <UserBubble key={m.id} m={m} /> : <CoachReply key={m.id} m={m} onSupport={() => setSupportOpen(true)} />))}
            {thinking && <TypingSkeleton />}
            {notice && (
              <p className="m-0 flex items-center gap-2 text-sm text-muted" role="status">
                <TriangleAlert size={15} className="shrink-0" aria-hidden />
                {notice}
              </p>
            )}
            <div ref={endRef} className="scroll-mb-44" aria-hidden />
          </div>

          {facts && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Suggested questions">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} onClick={() => void send(s)} disabled={thinking} className="h-11 shrink-0">{s}</Chip>
              ))}
            </div>
          )}

          {!ai.connected && !ai.checking && (
            <p className="m-0 mt-3 text-sm text-muted">
              Answers come from your data.{' '}
              <Link to="/settings#ai" className="inline-flex min-h-11 items-center font-semibold text-app underline underline-offset-2">Connect AI</Link>
            </p>
          )}
        </section>
      </div>

      <Composer context="coach" placeholder="Ask the coach…" />

      {facts && priority && (
        <DetailsSheet
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          facts={facts}
          priority={priority}
          extras={extras}
          mindPct={mindPct}
          history={history}
          onRevert={onRevert}
        />
      )}

      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />

      <Sheet open={proposalsOpen} onClose={() => setProposalsOpen(false)} title={proposals ? proposals.count : 'Proposals'}>
        <div className="pb-2">
          {pending.map((d) => (
            <ProposalBlock key={d.id} d={d} busy={busyDecision === d.id} onAccept={() => onAccept(d)} onReject={() => onReject(d)} />
          ))}
          <p className="m-0 mt-1 text-center text-xs text-muted">Nothing changes until you accept.</p>
        </div>
      </Sheet>
    </Screen>
  )
}
