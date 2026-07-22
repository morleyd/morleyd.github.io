import { describe, it, expect } from 'vitest'
import {
  PALETTE,
  correctAnswer,
  countForLevel,
  exposureForLevel,
  gridSizeForCount,
  makeRound,
} from './countBlocks'

describe('countForLevel', () => {
  it('grows with level and caps', () => {
    expect(countForLevel(1)).toBe(5)
    expect(countForLevel(2)).toBe(7)
    expect(countForLevel(100)).toBe(30)
  })
})

describe('gridSizeForCount', () => {
  it('is large enough to hold the blocks and stays within bounds', () => {
    expect(gridSizeForCount(5)).toBeGreaterThanOrEqual(4)
    expect(gridSizeForCount(4)).toBe(4)
    expect(gridSizeForCount(1000)).toBeLessThanOrEqual(12)
    // The grid must have room for every block.
    for (let level = 1; level <= 20; level += 1) {
      const count = countForLevel(level)
      const size = gridSizeForCount(count)
      expect(size * size).toBeGreaterThanOrEqual(count)
    }
  })
})

describe('exposureForLevel', () => {
  it('shortens as levels rise but never drops below the floor', () => {
    expect(exposureForLevel(6)).toBeLessThan(exposureForLevel(1))
    expect(exposureForLevel(100)).toBeGreaterThanOrEqual(900)
  })
})

describe('makeRound', () => {
  it('is deterministic for level + seed', () => {
    expect(makeRound(4, 'abc')).toEqual(makeRound(4, 'abc'))
  })

  it('produces exactly the level count of blocks, each in-bounds', () => {
    const r = makeRound(5, 'seed')
    expect(r.cells).toHaveLength(countForLevel(5))
    for (const c of r.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThan(r.cols)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeLessThan(r.rows)
      expect(PALETTE).toContain(c.color)
    }
  })

  it('places every block on a distinct grid cell (no overlap)', () => {
    const r = makeRound(9, 'unique')
    const keys = new Set(r.cells.map((c) => `${c.x},${c.y}`))
    expect(keys.size).toBe(r.cells.length)
  })

  it('forms one connected pattern (every block touches the cluster)', () => {
    const r = makeRound(8, 'connected')
    const present = new Set(r.cells.map((c) => `${c.x},${c.y}`))
    // Flood fill from the first block; all blocks must be reachable.
    const start = r.cells[0]
    const seen = new Set<string>([`${start.x},${start.y}`])
    const stack = [[start.x, start.y]]
    while (stack.length) {
      const [x, y] = stack.pop() as [number, number]
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const k = `${nx},${ny}`
        if (present.has(k) && !seen.has(k)) {
          seen.add(k)
          stack.push([nx, ny])
        }
      }
    }
    expect(seen.size).toBe(r.cells.length)
  })

  it('enlarges the grid and shortens the flash as levels rise', () => {
    const a = makeRound(1, 's')
    const b = makeRound(8, 's')
    expect(b.cols).toBeGreaterThanOrEqual(a.cols)
    expect(b.cells.length).toBeGreaterThan(a.cells.length)
    expect(b.exposureMs).toBeLessThan(a.exposureMs)
    expect(b.exposureMs).toBeGreaterThanOrEqual(900)
  })
})

describe('correctAnswer', () => {
  it('equals the number of blocks the player can see and count', () => {
    for (let level = 1; level <= 15; level += 1) {
      const r = makeRound(level, 'answer-key')
      expect(correctAnswer(r)).toBe(r.cells.length)
      expect(correctAnswer(r)).toBe(r.blockCount)
    }
  })
})
