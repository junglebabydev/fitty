// Workout sound cues for blocks that run on their own (intervals, timed circuits): a short beep on each of the
// last three seconds, a long one at a change, and one spoken word ("Go", "Easy", "Last round"). Web Audio and
// speech must be started by a tap, so unlockCues() runs on the Start tap. There is no in-app setting. Everything is
// feature-detected and fails silently. Checked in a desktop browser only so far; an installed iPhone app may differ.

let ctx: AudioContext | null = null

/** Call from the tap that starts a block (iOS only allows audio that a gesture started). */
export function unlockCues(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

/** A sine tone: `long` marks a change (work ↔ rest), short ones count down. */
export function beep(long = false): void {
  try {
    if (!ctx) return
    // iOS can suspend the context between bouts (a call, the screen dimming): ask for it back before each beep.
    if (ctx.state !== 'running') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = long ? 660 : 880
    const t = ctx.currentTime
    const dur = long ? 0.45 : 0.12
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  } catch {
    // no audio
  }
}

/** One short phrase; a newer one replaces anything still queued. */
export function speak(text: string): void {
  try {
    const synth = window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    synth.speak(u)
  } catch {
    // no speech
  }
}
