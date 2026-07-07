/**
 * Deterministic seeding so a game can be regenerated (and shared) from a short
 * code in the URL. Same seed → identical board.
 */

/** Small, fast PRNG. Returns a function producing floats in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash an arbitrary string to a 32-bit unsigned int (for seeding). */
export const strToSeed = (str: string): number => {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A short, URL-friendly random seed code. */
export const randomSeed = (): string => Math.floor(Math.random() * 0xffffffff).toString(36)

/** Build a seeded RNG from a seed code string. */
export const rngFromSeed = (code: string): (() => number) => mulberry32(strToSeed(code))
