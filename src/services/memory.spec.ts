import { describe, it, expect } from 'vitest'
import {
  SIMON_PADS,
  buildDeck,
  checkSimon,
  extendSequence,
  isMatch,
  matchStars,
} from './memory'

describe('buildDeck', () => {
  it('contains exactly two of each value', () => {
    const deck = buildDeck(6, () => 0.5)
    expect(deck).toHaveLength(12)
    for (let v = 0; v < 6; v += 1) {
      expect(deck.filter((x) => x === v)).toHaveLength(2)
    }
  })
  it('is deterministic for a given RNG', () => {
    let s = 1
    const rng = () => {
      s = (s * 1103515245 + 12345) % 2147483648
      return s / 2147483648
    }
    const a = buildDeck(8, rng)
    s = 1
    const b = buildDeck(8, rng)
    expect(a).toEqual(b)
  })
})

describe('isMatch', () => {
  it('matches equal values at different indices', () => {
    const deck = [3, 1, 3, 2]
    expect(isMatch(deck, 0, 2)).toBe(true)
    expect(isMatch(deck, 0, 1)).toBe(false)
  })
  it('rejects the same index (double tap)', () => {
    expect(isMatch([5, 5], 0, 0)).toBe(false)
  })
})

describe('matchStars', () => {
  it('awards 3 stars for a near-perfect game', () => {
    expect(matchStars(8, 8)).toBe(3)
    expect(matchStars(8, 10)).toBe(3)
  })
  it('drops to 2 then 1 star as moves grow', () => {
    expect(matchStars(8, 15)).toBe(2)
    expect(matchStars(8, 30)).toBe(1)
  })
})

describe('extendSequence', () => {
  it('adds one pad in range', () => {
    const next = extendSequence([0, 1], () => 0.99)
    expect(next).toHaveLength(3)
    expect(next[2]).toBeGreaterThanOrEqual(0)
    expect(next[2]).toBeLessThan(SIMON_PADS)
  })
  it('does not mutate the input', () => {
    const seq = [2, 3]
    extendSequence(seq, () => 0)
    expect(seq).toEqual([2, 3])
  })
})

describe('checkSimon', () => {
  const seq = [0, 2, 3, 1]
  it('reports ok for a correct prefix', () => {
    expect(checkSimon(seq, [0, 2])).toBe('ok')
  })
  it('reports complete when the full sequence is matched', () => {
    expect(checkSimon(seq, [0, 2, 3, 1])).toBe('complete')
  })
  it('reports wrong on a mismatch', () => {
    expect(checkSimon(seq, [0, 1])).toBe('wrong')
    expect(checkSimon(seq, [3])).toBe('wrong')
  })
})
