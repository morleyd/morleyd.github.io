import { describe, it, expect, afterEach } from 'vitest'
import { PAD_FREQUENCIES, SimonAudio } from './memoryAudio'

// jsdom provides no AudioContext, so this exercises the guarded no-op path
// (the same path SSR would hit) and confirms nothing throws.

describe('PAD_FREQUENCIES', () => {
  it('provides a distinct tone for every possible pad', () => {
    expect(PAD_FREQUENCIES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(PAD_FREQUENCIES).size).toBe(PAD_FREQUENCIES.length)
  })
})

describe('SimonAudio without AudioContext', () => {
  afterEach(() => {
    // ensure the global is clean between tests
    delete (globalThis as { AudioContext?: unknown }).AudioContext
  })

  it('reports unavailable and never throws', () => {
    const audio = new SimonAudio()
    expect(audio.available).toBe(false)
    expect(() => {
      audio.resume()
      audio.play(0)
      audio.play(5, 100)
      audio.dispose()
    }).not.toThrow()
  })

  it('respects the muted flag as a plain toggle', () => {
    const audio = new SimonAudio()
    expect(audio.muted).toBe(false)
    audio.muted = true
    expect(() => audio.play(1)).not.toThrow()
  })
})
