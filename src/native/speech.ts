// Web Speech API wrapper. iOS Safari exposes `webkitSpeechRecognition`, which
// uses the OS speech engine (on-device when the device supports it, otherwise
// Apple's servers — never a third-party provider). Feature-detected: when the
// API is missing, `startListening` reports 'unavailable' synchronously and
// returns a no-op stop so callers can fall back to typing.
//
// Speech recognition needs a secure context. On an iPhone over plain http
// (http://<your-mac-ip>:5173) `isSpeechAvailable()` is false and callers focus a text
// field instead: the iOS keyboard's own dictation mic works everywhere.
//
// Capacitor swap: replace `getRecognitionCtor()` with a plugin such as
// @capacitor-community/speech-recognition; the public surface stays the same.

// --- minimal typings (TypeScript's DOM lib does not declare these) ----------

interface SpeechRecognitionAlternativeLike {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike {
  error: string
  message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export type SpeechErrorCode =
  | 'unavailable'
  | 'permission_denied'
  | 'no_speech'
  | 'no_microphone'
  | 'network'
  | 'aborted'
  | 'start_failed'
  | 'insecure_context'
  | (string & {})

/** Shown whenever Web Speech cannot be used; keyboard dictation needs no permission or https. */
export const KEYBOARD_DICTATION_HINT = 'Tap the mic on your keyboard to dictate.'

export interface ListenOptions {
  lang?: string
  /** Stop after this much silence once something has been heard (default 2200 ms). */
  silenceMs?: number
  onInterim?: (transcript: string) => void
  onResult: (transcript: string) => void
  onError: (e: SpeechErrorCode) => void
  onEnd?: () => void
}

export interface ListenHandle {
  stop(): void
}

/** Hard stop so a hung recogniser never keeps the mic indicator on. */
const MAX_LISTEN_MS = 20_000
/** Nothing heard at all for this long → stop (the engine's own no-speech timeout is unreliable on iOS). */
const NO_SPEECH_MS = 8_000
const SILENCE_MS = 2_200

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null
}

/** False when the API is missing OR the page is not a secure context (plain http on a phone). */
export function isSpeechAvailable(): boolean {
  if (typeof window === 'undefined' || window.isSecureContext !== true) return false
  return getRecognitionCtor() !== null
}

function mapError(code: string): SpeechErrorCode {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission_denied'
    case 'no-speech':
      return 'no_speech'
    case 'audio-capture':
      return 'no_microphone'
    case 'network':
      return 'network'
    case 'aborted':
      return 'aborted'
    default:
      return code || 'unknown'
  }
}

export function startListening(opts: ListenOptions): ListenHandle {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    opts.onError('unavailable')
    return { stop() {} }
  }
  if (typeof window !== 'undefined' && window.isSecureContext !== true) {
    opts.onError('insecure_context')
    return { stop() {} }
  }

  let rec: SpeechRecognitionLike
  try {
    rec = new Ctor()
  } catch {
    opts.onError('unavailable')
    return { stop() {} }
  }

  rec.lang = opts.lang ?? ((typeof navigator !== 'undefined' && navigator.language) || 'en-US')
  rec.continuous = false
  rec.interimResults = !!opts.onInterim
  rec.maxAlternatives = 1

  let finalText = ''
  let heard = ''
  let delivered = false
  let errored = false
  let finished = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let silenceTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
  }
  const stopSoon = (ms: number) => {
    if (silenceTimer) clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => {
      try { rec.stop() } catch { /* already stopped */ }
    }, ms)
  }

  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const t = r[0]?.transcript ?? ''
      if (r.isFinal) finalText += t
      else interim += t
    }
    heard = (finalText + interim).trim()
    if (heard) stopSoon(opts.silenceMs ?? SILENCE_MS) // auto-stop on silence
    if (interim && opts.onInterim) opts.onInterim(heard)
    if (finalText.trim() && !delivered) {
      delivered = true
      opts.onResult(finalText.trim())
    }
  }

  rec.onerror = (e) => {
    errored = true
    // 'aborted' after we already delivered a result is just cleanup noise.
    if (e.error === 'aborted' && delivered) return
    opts.onError(mapError(e.error))
  }

  rec.onend = () => {
    if (finished) return
    finished = true
    clearTimer()
    // iOS Safari sometimes ends without ever marking a result final: keep what was heard.
    if (!delivered && !errored && heard) {
      delivered = true
      opts.onResult(heard)
    }
    if (!delivered && !errored) opts.onError('no_speech')
    opts.onEnd?.()
  }

  try {
    rec.start()
  } catch {
    finished = true
    clearTimer()
    opts.onError('start_failed')
    return { stop() {} }
  }

  timer = setTimeout(() => {
    try { rec.stop() } catch { /* already stopped */ }
  }, MAX_LISTEN_MS)
  stopSoon(NO_SPEECH_MS)

  return {
    stop() {
      clearTimer()
      // stop() (not abort()) lets the engine flush a pending final result.
      try { rec.stop() } catch { /* already stopped */ }
    },
  }
}
