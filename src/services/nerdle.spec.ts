import { describe, it, expect } from 'vitest'
import {
  MAX_GUESSES,
  WIDTH,
  generateEquation,
  isValidEquation,
  mergeKeyStatuses,
  scoreGuess,
  type TileStatus,
} from './nerdle'

describe('isValidEquation', () => {
  it('accepts a true, well-formed equation', () => {
    expect(isValidEquation('48-36=12')).toBe(true)
    expect(isValidEquation('12+13=25')).toBe(true)
    expect(isValidEquation('10-2=008')).toBe(false) // leading zero on rhs
  })
  it('respects operator precedence', () => {
    expect(isValidEquation('2+3*4=14')).toBe(true) // 2 + 12
    expect(isValidEquation('2+3*4=20')).toBe(false)
  })
  it('rejects false equations', () => {
    expect(isValidEquation('48-36=13')).toBe(false)
    expect(isValidEquation('12+13=99')).toBe(false)
  })
  it('rejects the wrong width', () => {
    expect(isValidEquation('1+1=2')).toBe(false) // too short
    expect('48-36=12').toHaveLength(WIDTH)
  })
  it('rejects malformed strings', () => {
    expect(isValidEquation('1++12=25')).toBe(false) // consecutive operators
    expect(isValidEquation('1+2=3=99')).toBe(false) // two equals
    expect(isValidEquation('*9+9=990')).toBe(false) // leading operator
  })
  it('rejects leading zeros in operands', () => {
    expect(isValidEquation('08+2=010')).toBe(false)
  })
})

describe('scoreGuess', () => {
  it('marks all correct for an exact match', () => {
    expect(scoreGuess('9*8=72', '9*8=72')).toEqual<TileStatus[]>([
      'correct', 'correct', 'correct', 'correct', 'correct', 'correct',
    ])
  })
  it('marks present for right symbol, wrong place', () => {
    // answer 12+34, guess 34+12 → the digits exist but shifted
    const res = scoreGuess('34+12', '12+34')
    expect(res[2]).toBe('correct') // '+' aligns
    expect(res[0]).toBe('present') // '3' present elsewhere
  })
  it('does not over-count duplicates beyond the answer', () => {
    // answer has one '1'; guess has two '1's — only one should be present/correct
    const res = scoreGuess('11+0=1', '1+9=10')
    const ones = res.filter((s, i) => '11+0=1'[i] === '1')
    const credited = ones.filter((s) => s !== 'absent').length
    const answerOnes = [...'1+9=10'].filter((c) => c === '1').length
    expect(credited).toBeLessThanOrEqual(answerOnes)
  })
})

describe('mergeKeyStatuses', () => {
  it('upgrades a key status but never downgrades', () => {
    let keys: Record<string, TileStatus> = {}
    keys = mergeKeyStatuses(keys, '1+2=3x', ['present', 'absent', 'absent', 'absent', 'absent', 'absent'])
    expect(keys['1']).toBe('present')
    keys = mergeKeyStatuses(keys, '1+2=3x', ['correct', 'absent', 'absent', 'absent', 'absent', 'absent'])
    expect(keys['1']).toBe('correct')
    keys = mergeKeyStatuses(keys, '1+2=3x', ['present', 'absent', 'absent', 'absent', 'absent', 'absent'])
    expect(keys['1']).toBe('correct') // not downgraded back to present
  })
})

describe('generateEquation', () => {
  it('is deterministic and valid for a seed', () => {
    for (const seed of ['a', 'b', 'c', 'seed-123', 'x']) {
      const eq = generateEquation(seed)
      expect(eq).toHaveLength(WIDTH)
      expect(isValidEquation(eq)).toBe(true)
      expect(generateEquation(seed)).toBe(eq) // deterministic
    }
  })
  it('exposes a sane guess limit', () => {
    expect(MAX_GUESSES).toBeGreaterThan(0)
  })
})
