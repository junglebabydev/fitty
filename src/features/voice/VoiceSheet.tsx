// Universal microphone sheet (PRD §7.4): listen (or type), parse into a strict command,
// show a structured, editable preview, then apply through the repositories.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, Keyboard, Mic, RotateCcw, TriangleAlert, Undo2, X } from 'lucide-react'
import type { Region } from '../../domain/types'
import { cx, dateOf, fmtDate } from '../../lib/util'
import { Button, Chip, IconButton, NumberInput, ReadinessBadge, Segmented, Sheet, Slider, StatusPill, TextInput } from '../../components'
import { useQuery, useToast } from '../../hooks'
import { getMeals, getSavedMeals, getSetting, pruneVoiceCommands } from '../../db/repositories'
import { EXERCISE_BY_ID } from '../../data'
import { RED_FLAG_LABELS, parseVoiceCommand, regionLabel, type ParsedCommand, type ParsedMealItem, type VoiceIntent } from '../../engine'
import { isSpeechAvailable, startListening, type ListenHandle, type SpeechErrorCode } from '../../native'
import { KEYBOARD_DICTATION_HINT } from '../../native/speech'
import {
  DEFAULT_PAIN_SCORE, applyCommand, buildVoiceContext, findCloneSource, numOrNull, planMealItems, recordVoiceCommand, sumMacros,
  type ApplyResult, type Payload,
} from './applyCommand'

export interface VoiceSheetProps {
  open: boolean
  onClose: () => void
  /** Skip listening and parse this text straight away (e.g. a typed command from another screen). */
  initialTranscript?: string
  /** Skip parsing too: preview this command (the Composer's AI router maps its result onto a ParsedCommand). */
  initialCommand?: { transcript: string; cmd: ParsedCommand }
  /** Never apply without a tap: commands that write data always stop at the preview. */
  alwaysPreview?: boolean
  /** Adds "Edit" to the preview: closes the sheet and hands the text back to the caller's field. */
  onEdit?: (transcript: string) => void
  onApplied?: (result: ApplyResult) => void
}

type Phase =
  | { kind: 'listening'; interim: string }
  | { kind: 'typing' }
  | { kind: 'preview'; transcript: string; cmd: ParsedCommand }
  | { kind: 'done'; transcript: string; cmd: ParsedCommand; result: ApplyResult }
  | { kind: 'error'; code: SpeechErrorCode }

const INTENT_LABEL: Record<VoiceIntent, string> = {
  log_body_metric: 'Body metric',
  log_meal: 'Meal',
  log_set: 'Set',
  start_workout: 'Workout',
  log_symptom: 'Symptom',
  request_substitution: 'Substitution',
  clone_meal: 'Repeat meal',
  coach_query: 'Coach',
  unknown: 'Not recognised',
}

const SPEECH_ERROR_TEXT: Record<string, string> = {
  unavailable: `Voice input is not available in this browser. ${KEYBOARD_DICTATION_HINT}`,
  permission_denied: `Microphone access is off for this site. ${KEYBOARD_DICTATION_HINT}`,
  no_speech: 'Did not hear anything.',
  no_microphone: 'No microphone found. Type the command instead.',
  network: 'The speech service needs a connection. Type the command instead.',
  aborted: 'Listening stopped.',
  start_failed: 'Could not start listening.',
  insecure_context: `Voice input needs a secure (https) page. ${KEYBOARD_DICTATION_HINT}`,
}

const EXAMPLES = [
  'Weight today 83.4 kilos',
  'Three eggs, two toast and a latte',
  'Bench 26 kilos for ten, RIR 2',
  'My left knee hurts, 3 out of 10',
  "Start today's workout",
  'Same lunch as yesterday',
  'How am I doing this week?',
]

const KNEE_FLAGS: (keyof typeof RED_FLAG_LABELS)[] = ['locking', 'givingWay', 'swelling', 'numbness', 'weakness']
const SPINE_FLAGS: (keyof typeof RED_FLAG_LABELS)[] = ['numbness', 'weakness', 'radiating', 'swelling']

function initialDraft(cmd: ParsedCommand): Payload {
  const p: Payload = { ...cmd.payload }
  if (cmd.intent === 'log_symptom') {
    if (numOrNull(p.painScore) == null) p.painScore = DEFAULT_PAIN_SCORE
    if (!Array.isArray(p.regions) || !(p.regions as unknown[]).length) p.regions = p.region ? [p.region] : []
    if (!p.redFlags || typeof p.redFlags !== 'object') p.redFlags = {}
  }
  return p
}

function canApply(cmd: ParsedCommand, d: Payload, cloneFound: boolean): boolean {
  switch (cmd.intent) {
    case 'log_symptom': return Array.isArray(d.regions) && (d.regions as unknown[]).length > 0
    case 'log_set': return !!d.exerciseId && (numOrNull(d.reps) != null || numOrNull(d.durationSec) != null)
    case 'log_body_metric': return (numOrNull(d.value) ?? 0) > 0
    case 'log_meal': return Array.isArray(d.items) && (d.items as unknown[]).length > 0
    case 'clone_meal': return cloneFound
    case 'request_substitution': return typeof d.exerciseId === 'string' && d.exerciseId.length > 0
    case 'coach_query': return typeof d.question === 'string' && d.question.trim().length > 0
    case 'start_workout': return true
    default: return false
  }
}

// --- editors ------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 text-[15px]">
      <span className="eyebrow text-muted shrink-0">{label}</span>
      <span className="text-right font-medium min-w-0">{children}</span>
    </div>
  )
}

/** Caution line: icon + words, so the status colour is never the only signal. */
function Caution({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-sm leading-snug">
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

const FIELD_LABEL = 'flex flex-col gap-1.5'
const FIELD_TEXT = 'eyebrow text-muted'

function SymptomEditor({ draft, onChange }: { draft: Payload; onChange: (p: Payload) => void }) {
  const regions = (draft.regions as Region[]) ?? []
  const pain = numOrNull(draft.painScore) ?? DEFAULT_PAIN_SCORE
  const flags = (draft.redFlags ?? {}) as Record<string, boolean>
  const knee = regions.some((r) => r.startsWith('knee'))
  const flagKeys = knee ? KNEE_FLAGS : SPINE_FLAGS
  const side = regions.includes('knee_left') && regions.includes('knee_right') ? 'both' : regions.includes('knee_right') ? 'knee_right' : 'knee_left'
  return (
    <div className="flex flex-col gap-4 mt-3">
      {draft.sideUnspecified === true && (
        <Segmented
          label="Which knee"
          options={[{ value: 'knee_left', label: 'Left knee' }, { value: 'knee_right', label: 'Right knee' }, { value: 'both', label: 'Both' }]}
          value={side}
          onChange={(v) => onChange({ ...draft, regions: v === 'both' ? ['knee_left', 'knee_right'] : [v], region: v === 'both' ? 'knee_left' : v })}
        />
      )}
      {draft.sideUnspecified !== true && (
        <Row label="Area">{regions.map((r) => regionLabel(r)).join(', ') || '—'}</Row>
      )}
      <Slider label="Pain" value={pain} onChange={(n) => onChange({ ...draft, painScore: n })} tone="auto" suffix="/10" labels={['No pain', 'Worst']} />
      <div>
        <div className="eyebrow text-muted mb-2.5">Red flags · tap any that apply</div>
        <div className="flex flex-wrap gap-2">
          {flagKeys.map((k) => (
            <Chip key={k} className="min-h-11" selected={!!flags[k]} tone="red" check onClick={() => onChange({ ...draft, redFlags: { ...flags, [k]: !flags[k] } })}>
              {RED_FLAG_LABELS[k].replace(/^\w/, (c) => c.toUpperCase())}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}

function SetEditor({ draft, onChange }: { draft: Payload; onChange: (p: Payload) => void }) {
  const id = String(draft.exerciseId ?? '')
  const timed = numOrNull(draft.durationSec) != null || (numOrNull(draft.reps) == null && !!EXERCISE_BY_ID[id]?.timed)
  return (
    <div className="mt-3">
      <Row label="Exercise">{String(draft.exerciseName ?? id)}</Row>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <label className={FIELD_LABEL}>
          <span className={FIELD_TEXT}>Load</span>
          <NumberInput value={numOrNull(draft.loadKg)} onChange={(n) => onChange({ ...draft, loadKg: n })} unit="kg" step={0.5} min={0} />
        </label>
        {timed ? (
          <label className={FIELD_LABEL}>
            <span className={FIELD_TEXT}>Time</span>
            <NumberInput value={numOrNull(draft.durationSec)} onChange={(n) => onChange({ ...draft, durationSec: n })} unit="s" min={0} />
          </label>
        ) : (
          <label className={FIELD_LABEL}>
            <span className={FIELD_TEXT}>Reps</span>
            <NumberInput value={numOrNull(draft.reps)} onChange={(n) => onChange({ ...draft, reps: n })} min={0} max={100} />
          </label>
        )}
        <label className={FIELD_LABEL}>
          <span className={FIELD_TEXT}>RIR</span>
          <NumberInput value={numOrNull(draft.rir)} onChange={(n) => onChange({ ...draft, rir: n })} min={0} max={10} />
        </label>
      </div>
      {draft.painFlag === true && <Caution>Flagged as painful. Progression on this exercise will hold.</Caution>}
    </div>
  )
}

function BodyMetricEditor({ draft, onChange }: { draft: Payload; onChange: (p: Payload) => void }) {
  const type = String(draft.type)
  const unit = type === 'weight' ? 'kg' : type === 'waist' ? 'cm' : '%'
  const label = type === 'weight' ? 'Weight' : type === 'waist' ? 'Waist' : 'Body fat'
  return (
    <div className="mt-3">
      <Row label="Date">{typeof draft.date === 'string' ? fmtDate(draft.date) : 'Today'}</Row>
      <label className={cx(FIELD_LABEL, 'mt-3')}>
        <span className={FIELD_TEXT}>{label}</span>
        <NumberInput value={numOrNull(draft.value)} onChange={(n) => onChange({ ...draft, value: n })} unit={unit} step={0.1} min={0} size="lg" />
      </label>
      {typeof draft.originalValue === 'number' && (
        <p className="text-sm text-muted mt-2">Converted from {draft.originalValue} {String(draft.originalUnit)}.</p>
      )}
      {draft.unitAssumed === true && <p className="text-sm text-muted mt-2">No unit heard, so {unit} was assumed.</p>}
    </div>
  )
}

function MealEditor({ draft, onChange }: { draft: Payload; onChange: (p: Payload) => void }) {
  const items = (Array.isArray(draft.items) ? draft.items : []) as ParsedMealItem[]
  const planned = useMemo(() => planMealItems(items), [items])
  const totals = sumMacros(planned.map((p) => p.item))
  const remove = (i: number) => onChange({ ...draft, items: items.filter((_, k) => k !== i) })
  return (
    <div className="mt-3">
      <Row label="Meal">{String(draft.mealType ?? 'meal')}</Row>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-2 mt-1">
        {planned.map((p, i) => (
          <li key={i} className="flex items-center gap-2 pl-3 pr-1 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium truncate">{p.item.foodName}</div>
              <div className="text-xs text-muted truncate">
                {p.food ? `${p.grams} g · ${p.item.servingDescription}` : `${p.grams} g · not in food list`}
              </div>
            </div>
            <div className="text-right shrink-0 tnum">
              <div className="num text-lg">≈{Math.round(p.item.kcal)} <span className="font-sans text-xs font-medium text-muted">kcal</span></div>
              <div className="text-xs font-medium text-protein">{Math.round(p.item.proteinG)} g protein</div>
            </div>
            {!p.food && <StatusPill tone="amber" size="sm">Estimate</StatusPill>}
            <IconButton icon={<X size={17} />} label={`Remove ${p.item.foodName}`} onClick={() => remove(i)} />
          </li>
        ))}
        {!planned.length && <li className="px-3 py-3 text-[14px] text-muted">No items left.</li>}
      </ul>
      <div className="flex items-end justify-between mt-3">
        <span className="eyebrow text-muted">Total · estimate</span>
        <span className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1"><span className="num text-3xl">≈{Math.round(totals.kcal)}</span><span className="text-xs font-medium text-muted">kcal</span></span>
          <span className="flex items-baseline gap-1 text-protein"><span className="num text-3xl">{Math.round(totals.proteinG)}</span><span className="text-xs font-medium">g protein</span></span>
        </span>
      </div>
      <p className="text-xs text-muted mt-2 leading-snug">Portions are typical servings. Edit any item in Eat after saving.</p>
    </div>
  )
}

function ClonePreview({ draft }: { draft: Payload }) {
  const source = useQuery(() => findCloneSource(draft, getSavedMeals(), getMeals(14)), [draft.savedMealName, draft.date, draft.mealType])
  if (!source) {
    return (
      <Caution>
        No matching meal found{typeof draft.date === 'string' ? ` on ${fmtDate(draft.date)}` : ''}. Try a saved meal name, or log it fresh.
      </Caution>
    )
  }
  const totals = sumMacros(source.items)
  return (
    <div className="mt-3">
      <Row label="Copy of">{source.savedName ?? `${source.mealType} · ${fmtDate(dateOf(source.ts))}`}</Row>
      <Row label="Log as">{String(draft.mealType ?? source.mealType)} · now</Row>
      <ul className="border-t border-line pt-2 text-sm text-muted">
        {source.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2 py-0.5">
            <span className="truncate">{it.foodName}</span>
            <span className="tnum shrink-0">{Math.round(it.kcal)} kcal · {Math.round(it.proteinG)} g P</span>
          </li>
        ))}
      </ul>
      <div className="flex items-end justify-between mt-3">
        <span className="eyebrow text-muted">Total</span>
        <span className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1"><span className="num text-3xl">{Math.round(totals.kcal)}</span><span className="text-xs font-medium text-muted">kcal</span></span>
          <span className="flex items-baseline gap-1 text-protein"><span className="num text-3xl">{Math.round(totals.proteinG)}</span><span className="text-xs font-medium">g protein</span></span>
        </span>
      </div>
    </div>
  )
}

function SubstitutionPreview({ draft }: { draft: Payload }) {
  return (
    <div className="mt-3">
      <Row label="Exercise">{typeof draft.exerciseName === 'string' ? draft.exerciseName : '—'}</Row>
      {typeof draft.region === 'string' && <Row label="Easier on">{regionLabel(draft.region as Region)}</Row>}
      {!draft.exerciseId && <Caution>Name the exercise, e.g. “swap squats for something easier on my knee”.</Caution>}
      {!!draft.exerciseId && <p className="text-sm text-muted mt-3 leading-snug">Opens today’s session with the gate-safe substitute picked for you.</p>}
    </div>
  )
}

// --- the sheet ------------------------------------------------------------------------

export function VoiceSheet({ open, onClose, initialTranscript, initialCommand, alwaysPreview = false, onEdit, onApplied }: VoiceSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>({ kind: 'typing' })
  const [draft, setDraft] = useState<Payload>({})
  const [typed, setTyped] = useState('')
  const handleRef = useRef<ListenHandle | null>(null)
  const pendingRef = useRef<{ transcript: string; cmd: ParsedCommand } | null>(null)
  const speech = isSpeechAvailable()

  const stopListening = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
  }, [])

  const apply = useCallback(
    (transcript: string, cmd: ParsedCommand, payload: Payload) => {
      const full: ParsedCommand = { ...cmd, payload }
      let result: ApplyResult
      try {
        result = applyCommand(full)
      } catch (e) {
        result = { ok: false, message: e instanceof Error ? e.message : 'Could not apply that command.' }
      }
      try {
        recordVoiceCommand(transcript, full, result.ok ? 'applied' : 'previewed')
      } catch (e) {
        console.warn('voice command not recorded', e)
      }
      pendingRef.current = null
      onApplied?.(result)
      if (result.ok && result.navigateTo) {
        onClose()
        navigate(result.navigateTo)
        return
      }
      setPhase({ kind: 'done', transcript, cmd: full, result })
    },
    [navigate, onApplied, onClose],
  )

  const showPreview = useCallback((transcript: string, cmd: ParsedCommand) => {
    setDraft(initialDraft(cmd))
    setPhase({ kind: 'preview', transcript, cmd })
    if (cmd.intent === 'unknown') {
      pendingRef.current = null
      try { recordVoiceCommand(transcript, cmd, 'unrecognized') } catch { /* ignore */ }
    } else {
      pendingRef.current = { transcript, cmd }
    }
  }, [])

  const handleTranscript = useCallback(
    (raw: string) => {
      stopListening()
      const transcript = raw.trim()
      if (!transcript) { setPhase({ kind: 'typing' }); return }
      const cmd = parseVoiceCommand(transcript, buildVoiceContext())
      // Navigation-only intents change nothing, so they never need a confirmation tap.
      const writes = cmd.intent !== 'coach_query' && !(cmd.intent === 'start_workout' && cmd.payload.action !== 'finish')
      if (cmd.intent !== 'unknown' && !cmd.needsConfirmation && !(alwaysPreview && writes)) {
        apply(transcript, cmd, initialDraft(cmd))
        return
      }
      showPreview(transcript, cmd)
    },
    [alwaysPreview, apply, showPreview, stopListening],
  )

  const listen = useCallback(() => {
    stopListening()
    setPhase({ kind: 'listening', interim: '' })
    handleRef.current = startListening({
      onInterim: (t) => setPhase((p) => (p.kind === 'listening' ? { kind: 'listening', interim: t } : p)),
      onResult: (t) => handleTranscript(t),
      onError: (code) => {
        handleRef.current = null
        setPhase((p) => (p.kind === 'listening' ? { kind: 'error', code } : p))
      },
      onEnd: () => { handleRef.current = null },
    })
  }, [handleTranscript, stopListening])

  const close = useCallback(() => {
    stopListening()
    if (pendingRef.current) {
      try { recordVoiceCommand(pendingRef.current.transcript, pendingRef.current.cmd, 'discarded') } catch { /* ignore */ }
      pendingRef.current = null
    }
    onClose()
  }, [onClose, stopListening])

  // Open: prune old transcripts, then parse the given text or start listening.
  useEffect(() => {
    if (!open) { stopListening(); return }
    setTyped('')
    pendingRef.current = null
    try { pruneVoiceCommands(getSetting<number>('privacy.voiceRetentionDays', 30)) } catch { /* ignore */ }
    if (initialCommand) { showPreview(initialCommand.transcript, initialCommand.cmd); return }
    if (initialTranscript && initialTranscript.trim()) { handleTranscript(initialTranscript); return }
    if (isSpeechAvailable()) listen()
    else setPhase({ kind: 'typing' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => () => stopListening(), [stopListening])

  const cloneFound = useQuery(
    () => (phase.kind === 'preview' && phase.cmd.intent === 'clone_meal' ? !!findCloneSource(draft, getSavedMeals(), getMeals(14)) : true),
    [phase.kind, draft.savedMealName, draft.date, draft.mealType],
  )

  const typeInstead = () => { setPhase({ kind: 'typing' }); stopListening() }
  const submitTyped = () => { if (typed.trim()) handleTranscript(typed) }

  // --- footer ---------------------------------------------------------------------
  let footer: ReactNode = null
  if (phase.kind === 'preview' && phase.cmd.intent !== 'unknown') {
    const ok = canApply(phase.cmd, draft, cloneFound)
    footer = (
      <div className="flex gap-2">
        <Button variant="outline" full onClick={close}>{onEdit ? 'Cancel' : 'Discard'}</Button>
        {onEdit && <Button variant="secondary" full onClick={() => { const t = phase.transcript; close(); onEdit(t) }}>Edit</Button>}
        <Button full disabled={!ok} onClick={() => apply(phase.transcript, phase.cmd, draft)}>Apply</Button>
      </div>
    )
  } else if (phase.kind === 'preview') {
    footer = (
      <div className="flex gap-2">
        <Button variant="outline" full icon={<Keyboard size={16} />} onClick={typeInstead}>Type it</Button>
        {speech && <Button full icon={<Mic size={16} />} onClick={listen}>Try again</Button>}
      </div>
    )
  } else if (phase.kind === 'done') {
    const r = phase.result
    footer = (
      <div className="flex gap-2">
        {r.undo && r.ok && (
          <Button variant="outline" icon={<Undo2 size={16} />} onClick={() => { r.undo?.(); toast.show('Undone', 'info'); close() }}>Undo</Button>
        )}
        {!r.ok && r.navigateTo && <Button variant="secondary" full onClick={() => { close(); navigate(r.navigateTo!) }}>Go there</Button>}
        {!r.ok && !r.navigateTo && (speech ? <Button variant="secondary" full icon={<Mic size={16} />} onClick={listen}>Try again</Button> : <Button variant="secondary" full icon={<Keyboard size={16} />} onClick={typeInstead}>Try again</Button>)}
        {r.ok && r.reviewTo && <Button variant="secondary" full onClick={() => { close(); navigate(r.reviewTo!) }}>Review</Button>}
        <Button full onClick={close}>Done</Button>
      </div>
    )
  } else if (phase.kind === 'listening') {
    footer = (
      <div className="flex gap-2">
        <Button variant="outline" full icon={<Keyboard size={16} />} onClick={typeInstead}>Type instead</Button>
        <Button variant="secondary" full onClick={() => { const t = phase.interim.trim(); if (t) handleTranscript(t); else typeInstead() }}>Stop</Button>
      </div>
    )
  } else if (phase.kind === 'error') {
    footer = (
      <div className="flex gap-2">
        <Button variant="outline" full icon={<Keyboard size={16} />} onClick={typeInstead}>Type instead</Button>
        {speech && phase.code !== 'unavailable' && phase.code !== 'insecure_context' && (
          <Button full icon={<RotateCcw size={16} />} onClick={listen}>Try again</Button>
        )}
      </div>
    )
  } else {
    footer = (
      <div className="flex gap-2">
        {speech && <Button variant="outline" full icon={<Mic size={16} />} onClick={listen}>Use the mic</Button>}
        <Button full disabled={!typed.trim()} onClick={submitTyped}>Parse</Button>
      </div>
    )
  }

  // --- body -------------------------------------------------------------------------
  let body: ReactNode
  if (phase.kind === 'listening') {
    body = (
      <div className="flex flex-col items-center text-center pt-6 pb-2">
        <div className="relative flex h-40 w-40 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 rounded-full border border-line-strong anim-pulse-soft" />
          <span className="absolute inset-4 rounded-full border border-line-strong bg-accent-soft anim-pulse-soft" style={{ animationDelay: '400ms' }} />
          <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-full bg-accent text-accent-fg">
            <Mic size={40} />
          </span>
        </div>
        <div className="display mt-5 text-3xl" role="status">Listening</div>
        <p className={cx('voice mt-2 min-h-[3lh] max-w-[28ch] text-xl', phase.interim ? 'text-app' : 'text-muted')} aria-live="polite">
          {phase.interim ? `“${phase.interim}”` : 'Say a weight, a meal, a set, a symptom or a question.'}
        </p>
        <div className="mt-3 w-full">
          <div className="eyebrow text-muted mb-2.5">Try saying</div>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLES.slice(0, 4).map((ex) => (
              <Chip key={ex} className="min-h-11" onClick={() => handleTranscript(ex)}>{ex}</Chip>
            ))}
          </div>
        </div>
      </div>
    )
  } else if (phase.kind === 'typing') {
    body = (
      <div className="flex flex-col gap-4 pt-1">
        {!speech && <p className="text-sm text-muted leading-snug">{KEYBOARD_DICTATION_HINT}</p>}
        <TextInput
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitTyped() }}
          placeholder='e.g. "Weight today 83.4 kilos"'
          enterKeyHint="go"
          aria-label="Command"
        />
        <div>
          <div className="eyebrow text-muted mb-2.5">Examples · tap to fill</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Chip key={ex} className="min-h-11" onClick={() => setTyped(ex)}>{ex}</Chip>
            ))}
          </div>
        </div>
      </div>
    )
  } else if (phase.kind === 'error') {
    body = (
      <div className="flex flex-col items-center text-center py-8">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-warn/30 bg-warn/10 text-warn" aria-hidden>
          <TriangleAlert size={28} />
        </span>
        <div className="voice mt-5 max-w-[28ch] text-xl" role="alert">{SPEECH_ERROR_TEXT[phase.code] ?? 'Listening failed.'}</div>
        <p className="text-sm text-muted mt-2">Nothing was saved.</p>
      </div>
    )
  } else if (phase.kind === 'preview') {
    const { cmd, transcript } = phase
    const unknown = cmd.intent === 'unknown'
    body = (
      <div className="pt-1">
        <p className="voice text-lg text-muted">“{transcript}”</p>
        <div className="mt-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={cx('inline-flex items-center gap-1.5 eyebrow', unknown ? 'text-warn' : 'text-muted')}>
              {unknown && <TriangleAlert size={13} aria-hidden />}
              {INTENT_LABEL[cmd.intent]}
            </span>
            {!unknown && <span className="eyebrow text-faint">{Math.round(cmd.confidence * 100)}% sure</span>}
          </div>
          <div className={cx('mt-2 leading-snug', unknown ? 'text-[15px] text-muted' : 'text-xl font-semibold')}>{cmd.preview}</div>
          {cmd.intent === 'log_symptom' && <SymptomEditor draft={draft} onChange={setDraft} />}
          {cmd.intent === 'log_set' && <SetEditor draft={draft} onChange={setDraft} />}
          {cmd.intent === 'log_body_metric' && <BodyMetricEditor draft={draft} onChange={setDraft} />}
          {cmd.intent === 'log_meal' && <MealEditor draft={draft} onChange={setDraft} />}
          {cmd.intent === 'clone_meal' && <ClonePreview draft={draft} />}
          {cmd.intent === 'request_substitution' && <SubstitutionPreview draft={draft} />}
          {cmd.intent === 'coach_query' && <p className="text-sm text-muted mt-3 leading-snug">Opens Coach with this question.</p>}
          {cmd.intent === 'start_workout' && <p className="text-sm text-muted mt-3 leading-snug">{draft.action === 'finish' ? 'Marks the session in progress as completed.' : 'Opens today’s session; the symptom gate runs before the first set.'}</p>}
        </div>
        {unknown && (
          <div className="mt-4">
            <div className="eyebrow text-muted mb-2.5">Try one of these</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.slice(0, 4).map((ex) => (
                <Chip key={ex} className="min-h-11" onClick={() => handleTranscript(ex)}>{ex}</Chip>
              ))}
            </div>
          </div>
        )}
        {!unknown && <p className="mt-3 text-xs text-muted leading-snug">Nothing is saved until you apply.</p>}
      </div>
    )
  } else {
    const r = phase.result
    body = (
      <div className="pt-1">
        <div className="flex items-start gap-3.5 rounded-[1.25rem] border border-line bg-surface p-4">
          <span
            className={cx(
              'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border anim-pop',
              r.ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-warn/30 bg-warn/10 text-warn',
            )}
            aria-hidden
          >
            {r.ok ? <CircleCheck size={24} /> : <CircleAlert size={24} />}
          </span>
          <div className="min-w-0">
            <div className="eyebrow text-muted">{r.ok ? 'Applied' : 'Not applied'}</div>
            <div className="mt-1 text-[17px] font-semibold leading-snug" role="status">{r.message}</div>
            <p className="voice mt-1.5 text-[15px] text-muted">“{phase.transcript}”</p>
          </div>
        </div>
        {r.readiness && (
          <div className="mt-4 flex items-center justify-between gap-2 px-1">
            <span className="eyebrow text-muted">Readiness now</span>
            <ReadinessBadge state={r.readiness} compact />
          </div>
        )}
        {r.gateAdvice && r.gateAdvice.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 px-1">
            {r.gateAdvice.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] leading-snug">
                <span className="mt-[9px] h-1 w-1 rounded-full bg-muted shrink-0" aria-hidden />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const title = phase.kind === 'preview' ? 'Confirm' : phase.kind === 'done' ? (phase.result.ok ? 'Done' : 'Not applied') : 'Voice command'

  return (
    <Sheet open={open} onClose={close} title={title} footer={footer} className="glass!">
      {body}
    </Sheet>
  )
}

export default VoiceSheet

/** Owns the open state for a VoiceSheet; spread `props` onto the sheet. */
export function useVoiceSheet() {
  const [open, setOpen] = useState(false)
  const [initialTranscript, setInitialTranscript] = useState<string | undefined>(undefined)
  const openSheet = useCallback((transcript?: string) => {
    setInitialTranscript(transcript)
    setOpen(true)
  }, [])
  const closeSheet = useCallback(() => setOpen(false), [])
  return { open, openSheet, closeSheet, props: { open, onClose: closeSheet, initialTranscript } }
}
