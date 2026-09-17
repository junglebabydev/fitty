import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSpeechAvailable, startListening } from '../speech'

type Handler = ((e: unknown) => void) | null

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: Handler = null
  onerror: Handler = null
  onend: Handler = null
  onstart: Handler = null
  stopped = 0
  constructor() { FakeRecognition.last = this }
  start() {}
  stop() { this.stopped += 1; this.onend?.({}) }
  abort() { this.onend?.({}) }
  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal, length: 1, 0: { transcript, confidence: 0.9 } } } })
  }
}

const stubWindow = (w: Record<string, unknown>) => vi.stubGlobal('window', w)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeRecognition.last = null
})

describe('isSpeechAvailable', () => {
  it('is false without a window, without the API, and on an insecure (plain http) page', () => {
    expect(isSpeechAvailable()).toBe(false)
    stubWindow({ isSecureContext: true })
    expect(isSpeechAvailable()).toBe(false)
    stubWindow({ isSecureContext: false, webkitSpeechRecognition: FakeRecognition })
    expect(isSpeechAvailable()).toBe(false)
  })
  it('is true on a secure page with the API', () => {
    stubWindow({ isSecureContext: true, webkitSpeechRecognition: FakeRecognition })
    expect(isSpeechAvailable()).toBe(true)
  })
})

describe('startListening', () => {
  it('reports insecure_context instead of starting the recogniser over plain http', () => {
    stubWindow({ isSecureContext: false, webkitSpeechRecognition: FakeRecognition })
    const onError = vi.fn()
    startListening({ onResult: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith('insecure_context')
    expect(FakeRecognition.last).toBeNull()
  })

  it('streams interim text, stops itself after silence and keeps what was heard', () => {
    vi.useFakeTimers()
    stubWindow({ isSecureContext: true, webkitSpeechRecognition: FakeRecognition })
    const onInterim = vi.fn()
    const onResult = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()
    startListening({ onInterim, onResult, onError, onEnd, silenceMs: 1000 })
    const rec = FakeRecognition.last!
    rec.emit('three eggs', false)
    expect(onInterim).toHaveBeenLastCalledWith('three eggs')
    vi.advanceTimersByTime(900)
    rec.emit('three eggs and toast', false) // still talking: the silence timer restarts
    vi.advanceTimersByTime(900)
    expect(rec.stopped).toBe(0)
    vi.advanceTimersByTime(200)
    expect(rec.stopped).toBe(1)
    // The engine never marked a result final (iOS Safari): the interim text is delivered on end.
    expect(onResult).toHaveBeenCalledWith('three eggs and toast')
    expect(onError).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('gives up with no_speech when nothing is heard', () => {
    vi.useFakeTimers()
    stubWindow({ isSecureContext: true, webkitSpeechRecognition: FakeRecognition })
    const onError = vi.fn()
    startListening({ onResult: vi.fn(), onError })
    vi.advanceTimersByTime(8000)
    expect(FakeRecognition.last!.stopped).toBe(1)
    expect(onError).toHaveBeenCalledWith('no_speech')
  })
})
