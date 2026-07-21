import { describe, it, expect } from 'vitest'
import {
  SHAPES,
  SHAPE_CELLS,
  asksTarget,
  colorOf,
  correctAnswer,
  countForLevel,
  countOf,
  makeRound,
} from './countBlocks'

describe('countForLevel', () => {
  it('grows with level and caps', () => {
    expect(countForLevel(1)).toBe(5)
    expect(countForLevel(2)).toBe(7)
    expect(countForLevel(100)).toBe(24)
  })
})

describe('asksTarget', () => {
  it('switches to the targeted question at level 3', () => {
    expect(asksTarget(1)).toBe(false)
    expect(asksTarget(2)).toBe(false)
    expect(asksTarget(3)).toBe(true)
  })
})

describe('makeRound', () => {
  it('is deterministic for level + seed', () => {
    expect(makeRound(4, 'abc')).toEqual(makeRound(4, 'abc'))
  })
  it('produces the level count of pieces, each in-bounds', () => {
    const r = makeRound(5, 'seed')
    expect(r.pieces).toHaveLength(countForLevel(5))
    for (const p of r.pieces) {
      expect(SHAPES).toContain(p.shape)
      expect(p.lane).toBeGreaterThanOrEqual(0)
      expect(p.lane).toBeLessThan(r.lanes)
      expect(p.startOffset).toBeGreaterThanOrEqual(0)
      expect(p.startOffset).toBeLessThan(1)
    }
  })
  it('separates pieces sharing a lane so they cannot visually merge', () => {
    const r = makeRound(8, 'lanes') // high level → many pieces, more lane sharing
    for (let lane = 0; lane < r.lanes; lane += 1) {
      const offsets = r.pieces
        .filter((p) => p.lane === lane)
        .map((p) => p.startOffset)
        .sort((a, b) => a - b)
      const m = offsets.length
      for (let i = 1; i < m; i += 1) {
        // Slots are 1/m apart with <=0.2/m jitter each side → gap >= 0.6/m.
        expect(offsets[i] - offsets[i - 1]).toBeGreaterThan(0.5 / m)
      }
    }
  })
  it('speeds up and shortens exposure as levels rise', () => {
    const a = makeRound(1, 's')
    const b = makeRound(6, 's')
    expect(b.speed).toBeGreaterThan(a.speed)
    expect(b.exposureMs).toBeLessThan(a.exposureMs)
    expect(b.exposureMs).toBeGreaterThanOrEqual(2200)
  })
})

describe('countOf / correctAnswer', () => {
  it('countOf tallies pieces of a shape', () => {
    const r = makeRound(4, 'seed')
    const total = SHAPES.reduce((sum, s) => sum + countOf(r, s), 0)
    expect(total).toBe(r.pieces.length)
  })
  it('correctAnswer is total below level 3', () => {
    const r = makeRound(2, 'seed')
    expect(correctAnswer(r)).toBe(r.pieces.length)
  })
  it('correctAnswer is the target count at level 3+', () => {
    const r = makeRound(4, 'seed')
    expect(correctAnswer(r)).toBe(countOf(r, r.target))
  })
})

describe('shape data', () => {
  it('every shape has four cells and a color', () => {
    for (const s of SHAPES) {
      expect(SHAPE_CELLS[s]).toHaveLength(4)
      expect(colorOf(s)).toMatch(/^#/)
    }
  })
})
