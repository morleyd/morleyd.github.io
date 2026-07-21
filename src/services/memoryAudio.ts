/**
 * Simon pad tones for the Memory game's Simon mode.
 *
 * One frequency per pad; a short oscillator blip plays both when the computer
 * shows the sequence and when the player taps a pad. Browsers block audio until
 * a user gesture, so `resume()` (called from a click/tap) lazily creates and
 * resumes the AudioContext. Everything degrades to a no-op where there is no
 * AudioContext (unit tests / SSR), so callers never need to guard.
 */

/** Pentatonic-ish tones, one per pad index. Index 0..MAX_SIMON_PADS-1. */
export const PAD_FREQUENCIES = [329.63, 261.63, 220.0, 164.81, 415.3, 493.88]

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
}

/**
 * Thin wrapper over a single AudioContext. Construct once per view; call
 * `resume()` from the first user gesture and `dispose()` on unmount.
 */
export class SimonAudio {
  private ctx: AudioContext | null = null
  muted = false

  /** Whether real audio is available in this environment. */
  get available(): boolean {
    return audioContextCtor() !== undefined
  }

  /** Create the AudioContext (if needed) and resume it. Call from a gesture. */
  resume(): void {
    const Ctor = audioContextCtor()
    if (!Ctor) return
    if (!this.ctx) {
      try {
        this.ctx = new Ctor()
      } catch {
        this.ctx = null
        return
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Play the tone for `pad` for `durationMs`. No-op when muted or unavailable. */
  play(pad: number, durationMs = 300): void {
    if (this.muted || !this.ctx) return
    const freq = PAD_FREQUENCIES[pad % PAD_FREQUENCIES.length]
    const now = this.ctx.currentTime
    const end = now + durationMs / 1000

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)

    // Quick attack, gentle release so overlapping blips don't click.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.connect(gain).connect(this.ctx.destination)
    osc.start(now)
    osc.stop(end + 0.02)
  }

  /** Release the AudioContext. */
  dispose(): void {
    if (this.ctx) {
      try {
        void this.ctx.close()
      } catch {
        // ignore
      }
      this.ctx = null
    }
  }
}
