import { describe, it, expect } from 'vitest'
import {
  COUNT_WOBBLE,
  PALETTE,
  correctAnswer,
  countForLevel,
  countForRound,
  exposureForLevel,
  gridSizeForCount,
  makeRound,
} from './countBlocks'
import { mulberry32 } from './seed'

describe('countForLevel', () => {
  it('grows with level and caps', () => {
    expect(countForLevel(1)).toBe(5)
    expect(countForLevel(2)).toBe(7)
    expect(countForLevel(100)).toBe(30)
  })
})

describe('countForRound (trend up, but not monotonic)', () => {
  it('stays exact for the first two levels and within the wobble after', () => {
    const rng = mulberry32(7)
    expect(countForRound(1, rng)).toBe(countForLevel(1))
    expect(countForRound(2, rng)).toBe(countForLevel(2))
    for (let level = 3; level <= 30; level += 1) {
      const c = countForRound(level, mulberry32(level * 31))
      expect(Math.abs(c - countForLevel(level))).toBeLessThanOrEqual(COUNT_WOBBLE)
      expect(c).toBeGreaterThanOrEqual(3)
    }
  })
  it('is not monotonically increasing across levels (you cannot just add one)', () => {
    // With the wobble, some level sequence must dip somewhere.
    let dips = 0
    for (let seed = 1; seed <= 5; seed += 1) {
      let prev = -1
      for (let level = 1; level <= 15; level += 1) {
        const c = makeRound(level, `s${seed}`).blockCount
        if (c < prev) dips += 1
        prev = c
      }
    }
    expect(dips).toBeGreaterThan(0)
  })
  it('still trends upward overall', () => {
    const late = makeRound(12, 'trend').blockCount
    const early = makeRound(1, 'trend').blockCount
    expect(late).toBeGreaterThan(early)
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

  it('gives hard (sliding) mode more time than normal at the same level', () => {
    for (let level = 1; level <= 15; level += 1) {
      expect(exposureForLevel(level, 'hard')).toBeGreaterThan(exposureForLevel(level, 'normal'))
    }
  })
})

describe('makeRound', () => {
  it('is deterministic for level + seed', () => {
    expect(makeRound(4, 'abc')).toEqual(makeRound(4, 'abc'))
  })

  it('produces a block count near the level trend, each block in-bounds', () => {
    const r = makeRound(5, 'seed')
    expect(Math.abs(r.cells.length - countForLevel(5))).toBeLessThanOrEqual(COUNT_WOBBLE)
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

  it('defaults to normal mode; hard mode keeps the same cluster but shows it longer', () => {
    const normal = makeRound(6, 'mode-seed')
    const hard = makeRound(6, 'mode-seed', 'hard')
    expect(normal.mode).toBe('normal')
    expect(hard.mode).toBe('hard')
    // Same seed/level → identical positions and count in both modes, so the
    // answer is never ambiguous — only the reveal duration differs.
    expect(hard.cells).toEqual(normal.cells)
    expect(hard.blockCount).toBe(normal.blockCount)
    expect(hard.exposureMs).toBeGreaterThan(normal.exposureMs)
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
  it('equals the number of blocks the player can see and count — in both modes', () => {
    for (const mode of ['normal', 'hard'] as const) {
      for (let level = 1; level <= 15; level += 1) {
        const r = makeRound(level, 'answer-key', mode)
        expect(correctAnswer(r)).toBe(r.cells.length)
        expect(correctAnswer(r)).toBe(r.blockCount)
      }
    }
  })
})
