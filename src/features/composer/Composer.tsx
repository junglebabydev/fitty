// The Composer (DESIGN §10.3): one glass bar above the tab bar — + · "Ask or log anything…" · mic · send.
// Text goes to the deterministic parser, then (when connected) the AI router; the result is always a
// preview the user applies, an editable meal draft, or a coach answer. Nothing is saved without a tap.
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, Camera, ChevronRight, FileUp, Image, LoaderCircle, Mic, Plus, Sparkles, Square } from 'lucide-react'
import { aiConnected, isAIError } from '../../ai'
import { Button, Sheet, TAB_BAR_HEIGHT, useToast } from '../../components'
import { FEATURES } from '../../config/features'
import { addMoodLog } from '../../db/repositories'
import { VALENCE_WORDS, parseVoiceCommand, type ParsedCommand } from '../../engine'
import { cx, nowIso } from '../../lib/util'
import { usePhotoPicker } from '../../native/PhotoInput'
import { KEYBOARD_DICTATION_HINT, isSpeechAvailable, startListening, type ListenHandle, type SpeechErrorCode } from '../../native/speech'
import { useAIStatus } from '../ai/config'
import { captureMealFromFile, REVIEW_PATH } from '../meal/captureMeal'
import { itemFromFoodItem, newDraft, saveDraft } from '../meal/draft'
import { VoiceSheet } from '../voice/VoiceSheet'
import { buildVoiceContext } from '../voice/applyCommand'
import { actionFromRouter, decideRoute, routeWithAI, type ComposerAction } from './router'

export type ComposerContext = 'today' | 'eat' | 'coach' | 'train' | 'mind'

export interface ComposerProps {
  context: ComposerContext
  placeholder?: string
}

/** Bottom padding a screen needs so its last block clears the Composer (the tab bar inset is AppShell's). */
export const COMPOSER_CLEARANCE = 84

const LISTENING_HINT = 'Listening… tap the square to stop.'
const MAX_FIELD_PX = 120

function speechErrorSentence(code: SpeechErrorCode): string {
  if (code === 'permission_denied') return `Microphone access is off for this site. ${KEYBOARD_DICTATION_HINT}`
  if (code === 'no_speech') return 'Did not hear anything — try again, or tap the mic on your keyboard to dictate.'
  return `Voice input is not working here. ${KEYBOARD_DICTATION_HINT}`
}

/** Height of the on-screen keyboard (0 when closed), so the bar can sit on top of it on iOS. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

function PlusRow({ icon, label, sub, onClick }: { icon: ReactNode; label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex min-h-16 w-full items-center gap-3.5 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-left active:bg-surface-3">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-app" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
    </button>
  )
}

export function Composer({ context, placeholder = 'Ask or log anything…' }: ComposerProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const ai = useAIStatus()
  const keyboard = useKeyboardInset()

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'hint' | 'error' } | null>(null)
  const [listening, setListening] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [preview, setPreview] = useState<{ transcript: string; cmd: ParsedCommand } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mood, setMood] = useState<{ valence: number; note: string } | null>(null)

  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const handleRef = useRef<ListenHandle | null>(null)

  // Persistent camera + library inputs. They live here (not inside the + sheet) so they are
  // still mounted when the sheet closes and iOS hands the photo back.
  const photos = usePhotoPicker((file) => { void captureMealFromFile(navigate, file) })

  const stopListening = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    setListening(false)
  }, [])
  useEffect(() => () => handleRef.current?.stop(), [])

  // Auto-grow.
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(MAX_FIELD_PX, el.scrollHeight)}px`
  }, [text])

  // Hints fade on their own; errors stay until the text changes.
  useEffect(() => {
    if (!note || note.tone !== 'hint' || listening) return
    const t = window.setTimeout(() => setNote(null), 6000)
    return () => window.clearTimeout(t)
  }, [note, listening])

  const focusField = () => fieldRef.current?.focus()

  // --- + sheet: the picker opens FIRST, synchronously, inside the tap --------------------
  const snapMeal = () => { photos.openCamera(); setPlusOpen(false) }
  const choosePhoto = () => { photos.openLibrary(); setPlusOpen(false) }
  const uploadReport = () => { setPlusOpen(false); navigate('/reports?upload=1') }

  // --- mic -----------------------------------------------------------------------------------
  const onMic = () => {
    if (listening) { stopListening(); setNote(null); focusField(); return }
    if (!isSpeechAvailable()) {
      focusField() // synchronous, inside the tap, so iOS raises the keyboard
      setNote({ text: KEYBOARD_DICTATION_HINT, tone: 'hint' })
      return
    }
    const base = text.trim() ? `${text.trim()} ` : ''
    setListening(true)
    setNote({ text: LISTENING_HINT, tone: 'hint' })
    handleRef.current = startListening({
      onInterim: (t) => setText(base + t),
      onResult: (t) => setText(base + t),
      onError: (code) => {
        if (code === 'aborted') return
        // These fail before the recogniser starts, so no onEnd follows.
        if (code === 'start_failed' || code === 'unavailable' || code === 'insecure_context') { handleRef.current = null; setListening(false) }
        setNote({ text: speechErrorSentence(code), tone: code === 'no_speech' ? 'hint' : 'error' })
      },
      onEnd: () => {
        handleRef.current = null
        setListening(false)
        setNote((n) => (n?.text === LISTENING_HINT ? { text: 'Check the text, then send.', tone: 'hint' } : n))
        focusField()
      },
    })
  }

  // --- submit ----------------------------------------------------------------------------------
  const openPreview = (transcript: string, cmd: ParsedCommand) => {
    setPreview({ transcript, cmd })
    setPreviewOpen(true)
  }

  const run = (action: ComposerAction, transcript: string) => {
    if (action.kind === 'command') { openPreview(transcript, action.cmd); return }
    if (action.kind === 'mood') { setMood({ valence: action.valence, note: action.note }); return }
    if (action.kind === 'meal_draft') {
      saveDraft(newDraft({
        items: action.items.map(itemFromFoodItem),
        source: 'voice',
        confidence: 0.5,
        notes: transcript,
        recognitionNotes: 'Estimated by AI from your description. Edit anything before logging.',
      }))
      setText('')
      navigate(REVIEW_PATH)
      return
    }
    setText('')
    navigate(action.to)
  }

  const submit = async () => {
    const t = text.trim()
    if (!t || busy) return
    stopListening()
    setNote(null)
    fieldRef.current?.blur()

    let cmd: ParsedCommand
    try {
      cmd = parseVoiceCommand(t, buildVoiceContext())
    } catch (e) {
      console.warn('composer parse failed', e)
      cmd = { intent: 'unknown', payload: { transcript: t }, confidence: 0, preview: '', needsConfirmation: true }
    }
    const route = decideRoute(t, cmd, aiConnected())
    if (route.via === 'plan' || route.via === 'coach') { setText(''); navigate(route.to); return }
    if (route.via === 'preview') { openPreview(t, route.cmd); return }

    setBusy(true)
    try {
      run(actionFromRouter(await routeWithAI(t), t, nowIso()), t)
    } catch (e) {
      // No dead end: fall back to what the local parser made of it, else keep the text and say why.
      if (cmd.intent !== 'unknown') openPreview(t, cmd)
      else setNote({ text: isAIError(e) && e.message ? e.message : 'AI could not read that. Try again, or rephrase it.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit() }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() }
  }

  const applyMood = () => {
    if (!mood) return
    try {
      addMoodLog({ ts: nowIso(), kind: 'momentary', valence: mood.valence, labels: [], contexts: [], note: mood.note })
      toast.show('Mood logged', 'success')
      setText('')
    } catch (e) {
      console.error(e)
      toast.show('Could not save that', 'error')
    }
    setMood(null)
  }

  const bottom = keyboard > 80 ? `${keyboard + 8}px` : `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`
  const status = busy ? 'Working out what you mean…' : note?.text ?? null
  const canSend = text.trim().length > 0 && !busy
  const round = 'press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full'

  return (
    <>
      {photos.inputs}

      <div className="pointer-events-none fixed left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-3" style={{ bottom }} data-composer={context}>
        {status && (
          <p
            role={note?.tone === 'error' && !busy ? 'alert' : 'status'}
            className="glass pointer-events-auto mx-auto mb-2 flex w-fit max-w-full items-center gap-2 rounded-2xl border border-line-strong px-3.5 py-2 text-[13px] leading-snug text-app shadow-float"
          >
            {busy && <LoaderCircle size={14} className="shrink-0 animate-spin" aria-hidden />}
            <span>{status}</span>
          </p>
        )}
        <form
          onSubmit={onSubmit}
          aria-label="Ask or log"
          className="glass shadow-float pointer-events-auto flex items-end gap-1 rounded-[1.75rem] border border-line-strong p-1.5"
        >
          <button type="button" onClick={() => setPlusOpen(true)} aria-label="Add a photo or a report" aria-haspopup="dialog" className={cx(round, 'text-app active:bg-surface-3')}>
            <Plus size={22} aria-hidden />
          </button>
          <textarea
            ref={fieldRef}
            rows={1}
            value={text}
            onChange={(e) => { setText(e.target.value); if (note?.tone === 'error') setNote(null) }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            enterKeyHint="send"
            autoCapitalize="sentences"
            readOnly={busy}
            className="min-h-11 min-w-0 flex-1 resize-none self-center bg-transparent px-1 py-2.5 text-[16px] leading-snug text-app outline-none placeholder:text-muted"
            style={{ maxHeight: MAX_FIELD_PX }}
          />
          <button
            type="button"
            onClick={onMic}
            disabled={busy}
            aria-label={listening ? 'Stop listening' : 'Dictate'}
            aria-pressed={listening}
            className={cx(round, 'disabled:opacity-40', listening ? 'bg-stop text-accent-fg' : 'text-app active:bg-surface-3')}
          >
            {listening ? <Square size={16} fill="currentColor" aria-hidden /> : <Mic size={21} aria-hidden />}
          </button>
          <button type="submit" disabled={!canSend} aria-label="Send" aria-busy={busy || undefined} className={cx(round, 'bg-accent text-accent-fg disabled:opacity-35')}>
            {busy ? <LoaderCircle size={20} className="animate-spin" aria-hidden /> : <ArrowUp size={21} strokeWidth={2.5} aria-hidden />}
          </button>
        </form>
      </div>

      <Sheet open={plusOpen} onClose={() => setPlusOpen(false)} title="Add" className="glass!">
        <div className="flex flex-col gap-2 pt-1">
          <PlusRow icon={<Camera size={21} />} label="Snap a meal" sub="Opens the camera" onClick={snapMeal} />
          <PlusRow icon={<Image size={21} />} label="Choose a photo" sub="From your library" onClick={choosePhoto} />
          {FEATURES.reports && <PlusRow icon={<FileUp size={21} />} label="Upload a report" sub="Blood test, scan or clinic letter" onClick={uploadReport} />}
          {!ai.connected && (
            <button type="button" onClick={() => { setPlusOpen(false); navigate('/settings#ai') }} className="press mt-1 flex min-h-11 items-center gap-2 px-1 text-left text-[13px] leading-snug text-muted">
              <Sparkles size={15} className="shrink-0" aria-hidden />
              <span>AI is not connected, so photos are not read for you. <span className="font-semibold text-app underline underline-offset-2">Connect AI</span></span>
            </button>
          )}
        </div>
      </Sheet>

      <VoiceSheet
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        initialCommand={preview ?? undefined}
        alwaysPreview
        onEdit={() => { window.setTimeout(focusField, 250) }}
        onApplied={(r) => { if (r.ok) setText('') }}
      />

      <Sheet
        open={mood !== null}
        onClose={() => setMood(null)}
        title="Confirm"
        className="glass!"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" full onClick={() => setMood(null)}>Cancel</Button>
            <Button variant="secondary" full onClick={() => { setMood(null); window.setTimeout(focusField, 250) }}>Edit</Button>
            <Button full onClick={applyMood}>Apply</Button>
          </div>
        }
      >
        {mood && (
          <div className="rounded-[1.25rem] border border-line bg-surface p-4" data-pillar="mind">
            <div className="eyebrow text-pillar">Mood</div>
            <div className="mt-1.5 text-xl font-semibold leading-snug">{VALENCE_WORDS[mood.valence] ?? 'Logged'}</div>
            {mood.note && <p className="voice mt-2 text-[17px] text-muted">“{mood.note}”</p>}
            <p className="mt-3 text-xs text-muted leading-snug">Nothing is saved until you apply.</p>
          </div>
        )}
      </Sheet>
    </>
  )
}

export default Composer
