import { describe, it, expect, beforeEach } from 'vitest'
import { recordSolvedPattern, solvedPatternIds } from './nonogramProgress'

describe('nonogram progress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty', () => {
    expect(solvedPatternIds().size).toBe(0)
  })

  it('records solved pictures and reads them back', () => {
    recordSolvedPattern('duck10')
    recordSolvedPattern('heart5')
    expect(solvedPatternIds()).toEqual(new Set(['duck10', 'heart5']))
  })

  it('is idempotent per picture', () => {
    recordSolvedPattern('duck10')
    recordSolvedPattern('duck10')
    expect([...solvedPatternIds()]).toEqual(['duck10'])
  })

  it('survives corrupt storage by starting over', () => {
    localStorage.setItem('nonogram-solved', 'not json {')
    expect(solvedPatternIds().size).toBe(0)
    localStorage.setItem('nonogram-solved', JSON.stringify({ nope: true }))
    expect(solvedPatternIds().size).toBe(0)
    localStorage.setItem('nonogram-solved', JSON.stringify(['ok', 7, null]))
    expect(solvedPatternIds()).toEqual(new Set(['ok']))
  })
})
