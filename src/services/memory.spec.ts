import { describe, it, expect } from 'vitest'
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  MAX_SIMON_PADS,
  SIMON_PADS,
  buildDeck,
  checkSimon,
  extendSequence,
  isMatch,
  matchStars,
  padsFor,
  pairsFor,
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

describe('difficulty sizes', () => {
  it('each preset produces the right number of cards and pads', () => {
    for (const d of DIFFICULTY_ORDER) {
      const { pairs, pads } = DIFFICULTIES[d]
      expect(pairsFor(d)).toBe(pairs)
      expect(padsFor(d)).toBe(pads)
      // A chosen size yields a deck of exactly `pairs * 2` cards.
      expect(buildDeck(pairsFor(d), () => 0.5)).toHaveLength(pairs * 2)
    }
  })
  it('gets harder (more pairs/pads) across the ordered presets', () => {
    const pairsSeq = DIFFICULTY_ORDER.map(pairsFor)
    const padsSeq = DIFFICULTY_ORDER.map(padsFor)
    expect(pairsSeq).toEqual([...pairsSeq].sort((a, b) => a - b))
    expect(padsSeq).toEqual([...padsSeq].sort((a, b) => a - b))
    expect(pairsSeq[pairsSeq.length - 1]).toBeGreaterThan(pairsSeq[0])
  })
  it('MAX_SIMON_PADS covers the largest preset', () => {
    expect(MAX_SIMON_PADS).toBe(Math.max(...DIFFICULTY_ORDER.map(padsFor)))
  })
})

describe('extendSequence', () => {
  it('adds one pad in range', () => {
    const next = extendSequence([0, 1], () => 0.99)
    expect(next).toHaveLength(3)
    expect(next[2]).toBeGreaterThanOrEqual(0)
    expect(next[2]).toBeLessThan(SIMON_PADS)
  })
  it('defaults to the classic 4 pads', () => {
    expect(extendSequence([], () => 0.99)[0]).toBe(3)
  })
  it('honors a custom pad count so harder sizes use more pads', () => {
    // rng near 1 selects the top pad index (pads - 1).
    expect(extendSequence([], () => 0.99, 6)[0]).toBe(5)
    // Every draw stays within [0, pads).
    for (let r = 0; r < 1; r += 0.05) {
      const v = extendSequence([], () => r, 6)[0]
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
    }
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
