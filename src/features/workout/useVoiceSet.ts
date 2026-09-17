import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise } from '../../domain/types'
import { addVoiceCommand, getSavedMeals } from '../../db/repositories'
import { parseVoiceCommand, type ParsedCommand } from '../../engine'
import { isSpeechAvailable, startListening, type ListenHandle, type SpeechErrorCode } from '../../native'
import { nowIso } from '../../lib/util'

export interface VoiceSetResult {
  exerciseId: string | null
  exerciseName: string | null
  loadKg: number | null
  reps: number | null
  rir: number | null
  rpe: number | null
  durationSec: number | null
  painFlag: boolean
  preview: string
  transcript: string
  /** Row in voice_commands; the caller marks it 'applied' once the set is logged. */
  voiceCommandId: number
}

export interface UseVoiceSetOptions {
  exercises: Exercise[]
  onParsed(result: VoiceSetResult, cmd: ParsedCommand): void
  /** A transcript that is not a set (e.g. a symptom or a question). */
  onOther?(cmd: ParsedCommand, transcript: string): void
}

export interface VoiceSetApi {
  available: boolean
  listening: boolean
  interim: string
  error: string | null
  start(): void
  stop(): void
  /** Text fallback when the microphone is unavailable. */
  submitText(text: string): void
}

const ERROR_TEXT: Record<string, string> = {
  unavailable: 'Voice input is not available in this browser — type the set instead.',
  insecure_context: 'Voice input needs a secure (https) page — type the set instead.',
  permission_denied: 'Microphone access was denied. Allow it in browser settings or type the set.',
  no_speech: 'Did not hear anything — try again.',
  no_microphone: 'No microphone found.',
  network: 'Speech service unreachable — type the set instead.',
  aborted: 'Listening stopped.',
  start_failed: 'Could not start the microphone.',
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Per-exercise voice logging: "70 kilos for eight, RIR two" → prefilled set row. */
export function useVoiceSet(opts: UseVoiceSetOptions): VoiceSetApi {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const handle = useRef<ListenHandle | null>(null)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const available = isSpeechAvailable()

  const handleTranscript = useCallback((transcript: string) => {
    const t = transcript.trim()
    if (!t) return
    const { exercises, onParsed, onOther } = optsRef.current
    let saved: string[] = []
    try { saved = getSavedMeals().map((m) => m.savedName ?? '').filter(Boolean) } catch { saved = [] }
    const cmd = parseVoiceCommand(t, { exercises, savedMeals: saved, now: nowIso() })
    const status = cmd.intent === 'unknown' ? 'unrecognized' : 'previewed'
    let id = 0
    try {
      id = addVoiceCommand({ ts: nowIso(), transcript: t, intent: cmd.intent, payload: cmd.payload, status })
    } catch {
      id = 0
    }
    if (cmd.intent === 'log_set') {
      const p = cmd.payload
      onParsed({
        exerciseId: typeof p.exerciseId === 'string' ? p.exerciseId : null,
        exerciseName: typeof p.exerciseName === 'string' ? p.exerciseName : null,
        loadKg: num(p.loadKg),
        reps: num(p.reps),
        rir: num(p.rir),
        rpe: num(p.rpe),
        durationSec: num(p.durationSec),
        painFlag: p.painFlag === true,
        preview: cmd.preview,
        transcript: t,
        voiceCommandId: id,
      }, cmd)
    } else {
      onOther?.(cmd, t)
    }
  }, [])

  const stop = useCallback(() => {
    handle.current?.stop()
    handle.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    setError(null)
    setInterim('')
    if (!isSpeechAvailable()) {
      setError(ERROR_TEXT.unavailable)
      return
    }
    setListening(true)
    handle.current = startListening({
      onInterim: (t) => setInterim(t),
      onResult: (t) => {
        setInterim('')
        handleTranscript(t)
      },
      onError: (code: SpeechErrorCode) => {
        setError(ERROR_TEXT[code] ?? `Voice input failed (${code}).`)
        setListening(false)
      },
      onEnd: () => {
        setListening(false)
        handle.current = null
      },
    })
  }, [handleTranscript])

  const submitText = useCallback((text: string) => {
    setError(null)
    handleTranscript(text)
  }, [handleTranscript])

  useEffect(() => () => { handle.current?.stop() }, [])

  return { available, listening, interim, error, start, stop, submitText }
}
