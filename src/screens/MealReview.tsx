import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUp, Bookmark, Camera, Check, ChevronDown, CircleAlert, LoaderCircle, Mic, Plus, Search, Sparkles, Trash2, Undo2, Unplug,
  WifiOff,
} from 'lucide-react'
import type { Macros } from '../domain/types'
import { MOCK_UNCERTAINTY, aiConnected, isAIError, type AIErrorKind } from '../ai'
import {
  AIBadge, Button, Chip, ErrorState, Field, FoodGlyph, INPUT_BASE, Illustration, LoadingState, NumberInput, Screen, Sheet,
  Skeleton, TAB_BAR_HEIGHT, TextInput, fmtInt, useToast,
} from '../components'
import { addMeal, deleteMeal, getSetting, updateMeal } from '../db/repositories'
import { inferMealType, parseMealCorrection } from '../engine/voice'
import { isSpeechAvailable, startListening, type ListenHandle } from '../native/speech'
import { useAIStatus } from '../features/ai/config'
import { cx, dateOf, fmtDate, todayStr } from '../lib/util'
import {
  MEAL_TYPE_LABELS, applyCorrections, clearDraft, diffItems, draftTotals, fmtG, getDraftSnapshot, loadDraft, normalizeDraft,
  saveDraft, scaleItem, setItemMacros, subscribeDraft, suggestSavedName, timeValue, toNewItems, updateDraft, withTime,
  type DraftItem, type MealDraft, type MealType,
} from '../features/meal/draft'
import { cancelRecognition, isRecognitionInFlight, retryRecognition, startMealCapture } from '../features/meal/captureMeal'
import { refineItemsWithAI } from '../features/meal/refine'
import { ConfidencePill, MealTypeSelect, PortionChips } from '../features/meal/ui'

const rise = (i: number): { className: string; style: CSSProperties } => ({ className: 'anim-rise', style: { '--i': i } as CSSProperties })

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtInt(Math.abs(n))}`

/** Demo-provider rows are placeholders, not recognition — they are never shown as if the photo had been read. */
const isPlaceholder = (it: DraftItem) => it.uncertaintyReason === MOCK_UNCERTAINTY

// --- small pieces --------------------------------------------------------------

/** AI is off (or photo sharing is): say so plainly and offer the two ways forward. */
function NotConnected({ connected, canRetry, retrying, onRetry, onAdd }: {
  connected: boolean
  canRetry: boolean
  retrying: boolean
  onRetry: () => void
  onAdd: () => void
}) {
  const navigate = useNavigate()
  return (
    <div role="status" className="rounded-[1.25rem] border border-line-strong bg-surface p-4">
      <div className="flex items-start gap-3">
        <Unplug size={20} className="shrink-0 mt-0.5 text-muted" aria-hidden />
        <p className="text-[16px] font-medium leading-snug">
          {connected
            ? 'The photo was not sent to AI, so nothing was recognised. Add items yourself or read it now.'
            : 'AI is not connected, so nothing was recognised. Add items yourself or connect AI.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="secondary" icon={<Plus size={16} />} onClick={onAdd}>Add item</Button>
        {connected && canRetry
          ? <Button variant="ghost" icon={<Sparkles size={16} />} loading={retrying} onClick={onRetry}>Read photo</Button>
          : <Button variant="ghost" icon={<Sparkles size={16} />} onClick={() => navigate('/settings#ai')}>Connect AI</Button>}
      </div>
    </div>
  )
}

const ERROR_TITLE: Record<Exclude<AIErrorKind, 'not_configured'>, string> = {
  offline: 'Offline — the photo was not sent',
  auth: 'AI sign-in was rejected',
  rate_limit: 'AI is busy right now',
  refusal: 'AI declined this photo',
  network: 'AI did not answer',
  unknown: 'Recognition did not run',
}

function RecognitionError({ kind, message, onRetry, retrying }: { kind: Exclude<AIErrorKind, 'not_configured'>; message?: string; onRetry: () => void; retrying: boolean }) {
  const navigate = useNavigate()
  const retryable = kind !== 'refusal' && kind !== 'auth'
  const Icon = kind === 'offline' || kind === 'network' ? WifiOff : CircleAlert
  return (
    <div role="status" className="rounded-[1.25rem] border border-line-strong bg-surface p-4">
      <div className="flex items-start gap-3">
        <Icon size={20} className="shrink-0 mt-0.5 text-muted" aria-hidden />
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-tight">{ERROR_TITLE[kind]}</p>
          {message && <p className="text-[14px] text-muted leading-snug mt-1">{message}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {retryable && <Button variant="secondary" onClick={onRetry} loading={retrying}>Try again</Button>}
        {kind === 'auth' && <Button variant="ghost" onClick={() => navigate('/settings#ai')}>AI settings</Button>}
      </div>
    </div>
  )
}

/** The plate: ~40% of the first screen. `children` sit over the bottom of the photo. */
function PhotoHero({ src, children }: { src: string; children?: ReactNode }) {
  return (
    <figure className="relative overflow-hidden rounded-[1.5rem] border border-line">
      <img src={src} alt="Meal photo" className="block w-full object-cover" style={{ height: 'min(40dvh, 340px)' }} />
      {children}
    </figure>
  )
}

const HERO_CAPTION = 'absolute left-3 bottom-3 glass inline-flex items-center gap-2 h-8 px-3 rounded-full border border-line text-[13px] font-medium'

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3" aria-hidden>
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className={cx('h-4', i === 1 ? 'w-1/3' : 'w-1/2')} />
          <Skeleton className="h-4 w-12 ml-auto" />
        </div>
      ))}
    </>
  )
}

function ItemRow({ item, open, onToggle, onChange, onRemove }: {
  item: DraftItem
  open: boolean
  onToggle: () => void
  onChange: (next: DraftItem) => void
  onRemove: () => void
}) {
  const macroPatch = (patch: Partial<Macros>) => onChange(setItemMacros(item, patch))
  const label = item.foodName || 'Unnamed food'
  const approx = item.confidence != null ? '≈' : ''
  return (
    <article className="rounded-[1.25rem] border border-line bg-surface p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <FoodGlyph name={label} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium leading-snug line-clamp-2">{label}</p>
          {item.confidence != null
            ? <div className="mt-1"><ConfidencePill confidence={item.confidence} reason={item.uncertaintyReason} /></div>
            : <p className="tnum text-[13px] text-muted mt-0.5 truncate">{item.servingDescription || fmtG(item.quantityG)}</p>}
        </div>
        <div className="shrink-0 text-right leading-none" aria-live="polite">
          <span className="block whitespace-nowrap">
            <span className="num text-[24px]">{approx}{fmtInt(item.kcal)}</span>
            <span className="text-[12px] text-muted ml-1">kcal</span>
          </span>
          <span className="block whitespace-nowrap text-protein mt-1">
            <span className="num text-[24px]">{fmtInt(item.proteinG)}</span>
            <span className="text-[12px] font-semibold ml-1">g protein</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Edit'} details for ${label}`}
          className="press shrink-0 h-11 w-9 -mr-1.5 inline-flex items-center justify-center rounded-xl text-muted"
        >
          <ChevronDown size={18} className={cx('transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      <PortionChips name={label} baseG={item.baseQuantityG} grams={item.quantityG} onChange={(g) => onChange(scaleItem(item, g))} />

      {open && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <Field label="Name" htmlFor={`name-${item.key}`}>
            <TextInput id={`name-${item.key}`} value={item.foodName} onChange={(e) => onChange({ ...item, foodName: e.target.value })} placeholder="Food name" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><NumberInput value={item.quantityG} unit="g" min={0} step={10} onChange={(n) => onChange(scaleItem(item, n ?? 0))} /></Field>
            <Field label="Serving" htmlFor={`serv-${item.key}`}>
              <TextInput id={`serv-${item.key}`} value={item.servingDescription} onChange={(e) => onChange({ ...item, servingDescription: e.target.value })} placeholder="1 plate" />
            </Field>
            <Field label="Calories"><NumberInput value={item.kcal} unit="kcal" min={0} step={1} onChange={(n) => macroPatch({ kcal: n ?? 0 })} /></Field>
            <Field label="Protein"><NumberInput value={item.proteinG} unit="g" min={0} step={0.1} onChange={(n) => macroPatch({ proteinG: n ?? 0 })} /></Field>
            <Field label="Carbs"><NumberInput value={item.carbsG} unit="g" min={0} step={0.1} onChange={(n) => macroPatch({ carbsG: n ?? 0 })} /></Field>
            <Field label="Fat"><NumberInput value={item.fatG} unit="g" min={0} step={0.1} onChange={(n) => macroPatch({ fatG: n ?? 0 })} /></Field>
          </div>
          <Button variant="ghost" icon={<Trash2 size={16} />} onClick={onRemove} className="self-start -ml-2">Remove {label}</Button>
        </div>
      )}
    </article>
  )
}

interface ChangeSummary {
  transcript: string
  notes: string[]
  prev: DraftItem[] | null
  kcalDelta: number
  proteinDelta: number
  byAI: boolean
}

// --- screen --------------------------------------------------------------------

export default function MealReviewScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftSnapshot)
  useAIStatus() // re-render when the AI connection changes
  const connected = aiConnected()
  const stateDraft = (location.state as { draft?: unknown } | null)?.draft
  const [seeded, setSeeded] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [listening, setListening] = useState(false)
  const [describeText, setDescribeText] = useState('')
  const [refining, setRefining] = useState(false)
  const [lastChanges, setLastChanges] = useState<ChangeSummary | null>(null)
  const [saveAsFav, setSaveAsFav] = useState(false)
  const [typeTouched, setTypeTouched] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const handleRef = useRef<ListenHandle | null>(null)

  // A draft handed over via location.state (e.g. from the voice sheet) seeds the store once.
  useEffect(() => {
    if (!loadDraft() && stateDraft) {
      const d = normalizeDraft(stateDraft)
      if (d) saveDraft(d)
    }
    setSeeded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (draft?.savedName) setSaveAsFav(true)
  }, [draft?.mealId, draft?.savedName])

  useEffect(() => () => handleRef.current?.stop(), [])

  // A new plate that only holds demo placeholders is a "nothing recognised" plate: drop them from the draft too.
  const hasPlaceholders = !!draft && draft.status === 'ready' && draft.mealId == null && draft.items.some(isPlaceholder)
  useEffect(() => {
    if (!hasPlaceholders) return
    updateDraft((d) => ({
      ...d, items: d.items.filter((it) => !isPlaceholder(it)), confidence: null, recognitionNotes: null, errorKind: 'not_configured', errorMessage: '',
    }))
  }, [hasPlaceholders])

  const today = todayStr()

  if (!draft) {
    if (!seeded) return <LoadingState label="Loading…" />
    return (
      <Screen pillar="eat" title="The plate" back="/eat">
        <div className="flex flex-col items-center px-1 py-8 text-center text-muted">
          <Illustration name="plate" size={120} />
          <p className="voice text-[21px] text-app mt-3">No plate to review yet.</p>
          <div className="mt-5 flex flex-col gap-2 self-stretch">
            <Button icon={<Camera size={18} />} onClick={() => void startMealCapture(navigate, 'camera')}>Take a photo</Button>
            <Button variant="ghost" icon={<Search size={18} />} onClick={() => navigate('/eat/search')}>Search foods</Button>
          </div>
        </div>
      </Screen>
    )
  }

  if (draft.status === 'recognizing') {
    const stale = !isRecognitionInFlight()
    return (
      <Screen pillar="eat" title="The plate" back="/eat">
        <div className="flex flex-col gap-3">
          {stale ? (
            <>
              {draft.photoDataUrl && <PhotoHero src={draft.photoDataUrl} />}
              <ErrorState title="Recognition was interrupted" body="Try again, or add the foods yourself." onRetry={() => void retryRecognition()} />
            </>
          ) : draft.photoDataUrl ? (
            <PhotoHero src={draft.photoDataUrl}>
              <div role="status" aria-label="Reading your plate" className="absolute inset-x-3 bottom-3 glass rounded-2xl border border-line p-3 flex flex-col gap-2.5">
                <AIBadge label="Reading your plate" />
                <SkeletonRows />
              </div>
            </PhotoHero>
          ) : (
            <div role="status" aria-label="Reading your plate" className="rounded-[1.25rem] border border-line bg-surface p-4 flex flex-col gap-2.5">
              <AIBadge label="Reading your plate" />
              <SkeletonRows />
            </div>
          )}
          <Button variant="ghost" full onClick={cancelRecognition}>{stale ? 'Add foods yourself' : 'Skip and add yourself'}</Button>
        </div>
      </Screen>
    )
  }

  const patch = (fn: (d: MealDraft) => MealDraft) => updateDraft(fn)
  const editing = draft.mealId != null
  const items = hasPlaceholders ? draft.items.filter((it) => !isPlaceholder(it)) : draft.items
  const notConnected = hasPlaceholders || draft.errorKind === 'not_configured'
  const totals = draftTotals(items)
  const mealDate = dateOf(draft.ts)
  const estimated = items.some((i) => i.confidence != null)
  const canDescribe = items.length > 0 || connected

  const setItem = (next: DraftItem) => patch((d) => ({ ...d, items: d.items.map((it) => (it.key === next.key ? next : it)) }))
  const removeItem = (key: string) => {
    patch((d) => ({ ...d, items: d.items.filter((it) => it.key !== key) }))
    if (openKey === key) setOpenKey(null)
  }

  /** The meal type follows the time of day until the user picks one. */
  const setTime = (hhmm: string) => patch((d) => {
    const ts = withTime(d.ts, hhmm)
    return { ...d, ts, mealType: typeTouched || editing ? d.mealType : inferMealType(ts) }
  })
  const setMealType = (v: MealType) => {
    setTypeTouched(true)
    patch((d) => ({ ...d, mealType: v }))
  }

  const goSearch = () => navigate('/eat/search', { state: { returnTo: '/eat/review' } })

  const showChanges = (t: string, before: DraftItem[], after: DraftItem[], notes: string[], byAI: boolean) => {
    const a = draftTotals(before)
    const b = draftTotals(after)
    setLastChanges({ transcript: t, notes, prev: before, kcalDelta: Math.round(b.kcal - a.kcal), proteinDelta: Math.round(b.proteinG - a.proteinG), byAI })
    toast.show(`${notes.length} change${notes.length === 1 ? '' : 's'} applied`, 'success')
  }

  /** Deterministic fallback: the on-device correction parser. */
  const applyLocal = (t: string) => {
    const cur = loadDraft()
    if (!cur) return
    const corrections = parseMealCorrection(t, cur.items.map((i) => ({ foodName: i.foodName, quantityG: i.quantityG })))
    const { items: next, notes } = applyCorrections(cur.items, corrections)
    if (!notes.length) {
      setLastChanges({ transcript: t, notes: [], prev: null, kcalDelta: 0, proteinDelta: 0, byAI: false })
      return
    }
    saveDraft({ ...cur, items: next })
    showChanges(t, cur.items, next, notes, false)
  }

  /** "Describe it": AI refines the plate (text + photo) when connected, otherwise the local parser. */
  const describe = async (raw: string) => {
    const t = raw.trim()
    const cur = loadDraft()
    if (!t || !cur || refining) return
    setDescribeText('')
    if (!aiConnected()) { applyLocal(t); return }
    setRefining(true)
    try {
      const next = await refineItemsWithAI(cur.items, t, cur.photoDataUrl)
      const latest = loadDraft()
      if (!latest) return
      if (latest.items !== cur.items) { toast.show('The plate changed meanwhile — try again', 'info'); return }
      const notes = next.length ? diffItems(cur.items, next) : []
      if (!notes.length) {
        setLastChanges({ transcript: t, notes: [], prev: null, kcalDelta: 0, proteinDelta: 0, byAI: true })
        return
      }
      saveDraft({ ...latest, items: next })
      showChanges(t, cur.items, next, notes, true)
    } catch (e) {
      toast.show(isAIError(e) && e.message ? e.message : 'AI could not refine that — used the basic parser', 'info')
      applyLocal(t)
    } finally {
      setRefining(false)
    }
  }

  const stopVoice = () => {
    handleRef.current?.stop()
    handleRef.current = null
    setListening(false)
  }

  const toggleVoice = () => {
    if (listening) { stopVoice(); return }
    setListening(true)
    handleRef.current = startListening({
      onInterim: (t) => setDescribeText(t),
      onResult: (t) => void describe(t),
      onError: (code) => {
        setListening(false)
        if (code === 'no_speech') toast.show('Did not catch that — try again or type it', 'info')
        else if (code === 'permission_denied') toast.show('Microphone access denied — type it instead', 'error')
      },
      onEnd: () => setListening(false),
    })
  }

  const undoChanges = () => {
    if (!lastChanges?.prev) return
    const prev = lastChanges.prev
    patch((d) => ({ ...d, items: prev }))
    setLastChanges(null)
  }

  const onRetry = async () => {
    setRetrying(true)
    try {
      const ok = await retryRecognition()
      if (!ok) toast.show('No photo to retry with', 'info')
    } finally {
      setRetrying(false)
    }
  }

  const onConfirm = () => {
    if (!items.length) return
    const savedName = saveAsFav ? (draft.savedName?.trim() || suggestSavedName(items)) : null
    const keepPhotos = getSetting<boolean>('privacy.keepMealPhotos', false)
    const photoUri = editing ? draft.photoDataUrl : keepPhotos ? draft.photoDataUrl : null
    const newItems = toNewItems(items)
    try {
      if (editing && draft.mealId != null) {
        updateMeal(draft.mealId, { ts: draft.ts, mealType: draft.mealType, photoUri, notes: draft.notes, savedName, isSaved: !!savedName }, newItems)
      } else {
        addMeal({ ts: draft.ts, mealType: draft.mealType, photoUri, notes: draft.notes, source: draft.source, savedName, isSaved: !!savedName }, newItems)
      }
    } catch (e) {
      console.error(e)
      toast.show('Could not save the meal', 'error')
      return
    }
    clearDraft()
    toast.show(editing ? 'Meal updated' : `Logged ${fmtInt(totals.kcal)} kcal · P ${fmtG(totals.proteinG)}`, 'success')
    navigate(`/eat?date=${mealDate}`, { replace: true })
  }

  const onDiscard = () => {
    stopVoice()
    clearDraft()
    navigate('/eat', { replace: true })
  }

  const onDelete = () => {
    if (draft.mealId == null) return
    try {
      deleteMeal(draft.mealId)
    } catch (e) {
      console.error(e)
      toast.show('Could not delete the meal', 'error')
      return
    }
    clearDraft()
    toast.show('Meal deleted', 'info')
    navigate(`/eat?date=${mealDate}`, { replace: true })
  }

  const onDescribeSubmit = (e: FormEvent) => {
    e.preventDefault()
    void describe(describeText)
  }

  return (
    <Screen
      pillar="eat"
      eyebrow={mealDate === today ? 'Today' : fmtDate(mealDate)}
      title={editing ? 'Edit meal' : 'The plate'}
      back="/eat"
      right={<Button variant="ghost" onClick={onDiscard}>{editing ? 'Cancel' : 'Discard'}</Button>}
    >
      <div className="flex flex-col gap-3 pb-36">
        {draft.photoDataUrl && (
          <div {...rise(0)}>
            <PhotoHero src={draft.photoDataUrl}>
              <figcaption className={HERO_CAPTION}>
                {estimated ? <><AIBadge />Estimates — edit anything</> : notConnected ? 'Not read by AI' : 'Your photo'}
              </figcaption>
            </PhotoHero>
          </div>
        )}

        {notConnected ? (
          <NotConnected connected={connected} canRetry={!!draft.photoDataUrl} retrying={retrying} onRetry={() => void onRetry()} onAdd={goSearch} />
        ) : draft.errorKind && draft.errorKind !== 'not_configured' ? (
          <RecognitionError kind={draft.errorKind} message={draft.errorMessage} onRetry={() => void onRetry()} retrying={retrying} />
        ) : null}

        {!draft.photoDataUrl && estimated && (
          <div className="flex items-center gap-2 px-1 text-[13px] font-medium text-muted"><AIBadge />Estimates — edit anything</div>
        )}

        {items.map((item, i) => (
          <div key={item.key} {...rise(i + 1)}>
            <ItemRow
              item={item}
              open={openKey === item.key}
              onToggle={() => setOpenKey(openKey === item.key ? null : item.key)}
              onChange={setItem}
              onRemove={() => removeItem(item.key)}
            />
          </div>
        ))}

        {items.length === 0 && !notConnected && !draft.errorKind && (
          <p className="voice text-[20px] text-center px-4 py-4">Nothing on the plate yet.</p>
        )}

        {/* the not-connected banner already carries "Add item" while the plate is empty */}
        {!(notConnected && items.length === 0) && (
          <button
            type="button"
            onClick={goSearch}
            className="press inline-flex items-center justify-center gap-2 h-[52px] rounded-[1.25rem] border border-dashed border-line-strong text-[16px] font-medium"
          >
            <Plus size={18} aria-hidden />
            Add item
          </button>
        )}

        {canDescribe && (
          <div className="flex flex-col gap-2">
            <form onSubmit={onDescribeSubmit} className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Sparkles size={16} className={cx('absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none', connected ? 'text-pillar' : 'text-faint')} aria-hidden />
                <input
                  value={describeText}
                  onChange={(e) => setDescribeText(e.target.value)}
                  placeholder={listening ? 'Listening…' : 'Describe it — “extra rice, no skin”'}
                  aria-label="Describe it"
                  enterKeyHint="send"
                  disabled={refining}
                  className={cx(INPUT_BASE, 'h-12 pl-10', isSpeechAvailable() && 'pr-12')}
                />
                {isSpeechAvailable() && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-pressed={listening}
                    aria-label={listening ? 'Stop listening' : 'Describe it by voice'}
                    className="press absolute right-0.5 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center rounded-xl text-muted"
                  >
                    <Mic size={18} className={cx(listening && 'anim-pulse-soft text-pillar')} aria-hidden />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!describeText.trim() || refining}
                aria-label="Apply description"
                aria-busy={refining || undefined}
                className="press shrink-0 h-12 w-12 inline-flex items-center justify-center rounded-full bg-surface-3 border border-line text-app disabled:opacity-40"
              >
                {refining ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <ArrowUp size={18} aria-hidden />}
              </button>
            </form>
            {!connected && (
              <Link to="/settings#ai" className="self-start inline-flex items-center h-11 -my-1.5 px-1 text-[13px] text-muted underline underline-offset-4 decoration-line-strong">
                Basic edits only — connect AI for more
              </Link>
            )}

            {lastChanges && (
              <div className="rounded-[1.25rem] border border-line bg-surface-2 p-4" role="status">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {lastChanges.byAI ? <AIBadge label="AI edit" /> : <p className="eyebrow text-muted">You said</p>}
                    <p className="voice text-[17px] mt-1">“{lastChanges.transcript}”</p>
                  </div>
                  {lastChanges.prev && <Button variant="ghost" icon={<Undo2 size={16} />} onClick={undoChanges}>Undo</Button>}
                </div>
                {lastChanges.notes.length ? (
                  <>
                    <ul className="mt-2 flex flex-col gap-1">
                      {lastChanges.notes.map((n, i) => (
                        <li key={i} className="flex items-start gap-2 text-[15px] leading-snug">
                          <Check size={16} className="shrink-0 mt-0.5 text-muted" aria-hidden />
                          {n}
                        </li>
                      ))}
                    </ul>
                    <p className="tnum text-[14px] text-muted mt-2">
                      Total {signed(lastChanges.kcalDelta)} kcal · <span className="font-semibold text-protein">{signed(lastChanges.proteinDelta)} g protein</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[15px] text-muted">No change made. Name the food as it appears above.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-[1.25rem] border border-line bg-surface overflow-hidden mt-1">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="w-full h-[52px] flex items-center justify-between gap-3 px-4 text-left active:bg-surface-2"
          >
            <span className="eyebrow text-muted">Details</span>
            <span className="flex items-center gap-2 tnum text-[14px] text-muted">
              {timeValue(draft.ts)} · {MEAL_TYPE_LABELS[draft.mealType]}
              <ChevronDown size={16} className={cx('transition-transform', detailsOpen && 'rotate-180')} aria-hidden />
            </span>
          </button>
          {detailsOpen && (
            <div className="flex flex-col gap-3 border-t border-line p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Time" htmlFor="meal-time">
                  <TextInput id="meal-time" type="time" value={timeValue(draft.ts)} onChange={(e) => setTime(e.target.value)} />
                </Field>
                <Field label="Type" htmlFor="meal-type">
                  <MealTypeSelect id="meal-type" value={draft.mealType} onChange={setMealType} />
                </Field>
              </div>
              <Field label="Notes" htmlFor="meal-notes">
                <TextInput id="meal-notes" multiline rows={2} value={draft.notes} onChange={(e) => patch((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional" />
              </Field>
              <Chip selected={saveAsFav} check icon={<Bookmark size={14} />} onClick={() => setSaveAsFav((v) => !v)} className="self-start">
                Save as favourite
              </Chip>
              {saveAsFav && (
                <Field label="Favourite name" htmlFor="fav-name">
                  <TextInput
                    id="fav-name"
                    value={draft.savedName ?? ''}
                    onChange={(e) => patch((d) => ({ ...d, savedName: e.target.value }))}
                    placeholder={suggestSavedName(items) || 'Favourite name'}
                  />
                </Field>
              )}
              {editing && (
                <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)} className="self-start -ml-2">Delete meal</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky total + Log, floating just above the tab bar. */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 px-4 pointer-events-none"
        style={{ bottom: `calc(${TAB_BAR_HEIGHT + 4}px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="pointer-events-auto glass shadow-float border border-line rounded-[1.5rem] flex items-center gap-3 py-2.5 pr-2.5 pl-4">
          <div className="min-w-0 flex-1 flex items-baseline gap-x-3 flex-wrap leading-none" aria-live="polite" aria-label={`Meal total ${estimated ? 'about ' : ''}${fmtInt(totals.kcal)} kcal, ${fmtG(totals.proteinG)} protein`}>
            <span className="whitespace-nowrap">
              <span className="num text-[30px]">{estimated ? '≈' : ''}{fmtInt(totals.kcal)}</span>
              <span className="text-[12px] text-muted ml-1">kcal</span>
            </span>
            <span className="whitespace-nowrap text-protein">
              <span className="num text-[30px]">{fmtInt(totals.proteinG)}</span>
              <span className="text-[12px] font-semibold ml-1">g protein</span>
            </span>
          </div>
          <Button size="lg" onClick={onConfirm} disabled={items.length === 0}>
            {editing ? 'Save' : 'Log'}
          </Button>
        </div>
      </div>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this meal?"
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" size="lg" full onClick={onDelete}>Delete</Button>
            <Button variant="ghost" full onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        }
      >
        <p className="text-[15px] text-muted">This cannot be undone.</p>
      </Sheet>
    </Screen>
  )
}
