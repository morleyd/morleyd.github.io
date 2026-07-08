import { describe, it, expect } from 'vitest'
import { assessMove, bestOpportunity } from './assess'
import { requiredTaps } from './game'
import type { PieceSoul } from './types'

describe('assessMove', () => {
  it('rates a free capture as pure gain', () => {
    // White pawn e4 can take the undefended black queen on d5.
    const r = assessMove('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'e4', 'd5')
    expect(r.gain).toBe(9)
    expect(r.risk).toBe(0)
    expect(r.sacrifice).toBe(false)
  })

  it('flags moving into a pawn attack as a hanging sacrifice', () => {
    // Qd2-d4 walks onto a square the e5 pawn covers, undefended.
    const r = assessMove('4k3/8/8/4p3/8/8/3Q4/4K3 w - - 0 1', 'd2', 'd4')
    expect(r.hanging).toBe(true)
    expect(r.sacrifice).toBe(true)
    expect(r.risk).toBeGreaterThanOrEqual(2)
  })

  it('treats a normal developing move as safe', () => {
    const r = assessMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2', 'e4')
    expect(r.sacrifice).toBe(false)
    expect(r.risk).toBe(0)
  })

  it('bestOpportunity finds the free queen', () => {
    const opp = bestOpportunity('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'w')
    expect(opp).toMatchObject({ from: 'e4', to: 'd5' })
    expect(opp!.value).toBeGreaterThanOrEqual(8)
  })
})

describe('requiredTaps', () => {
  const soul = (bravery: number): PieceSoul =>
    ({ persona: { name: 'x', intro: '', bravery } }) as unknown as PieceSoul

  it('lets a safe move go on the first tap', () => {
    expect(requiredTaps(soul(0.2), { gain: 0, risk: 0, hanging: false, sacrifice: false })).toBe(1)
  })
  it('makes anyone balk once at a sacrifice', () => {
    expect(requiredTaps(soul(0.9), { gain: 0, risk: 9, hanging: true, sacrifice: true })).toBe(2)
  })
  it('makes a coward dig in for three taps on a dangerous move', () => {
    expect(requiredTaps(soul(0.2), { gain: 0, risk: 9, hanging: true, sacrifice: true })).toBe(3)
    expect(requiredTaps(soul(0.2), { gain: 0, risk: 0, hanging: true, sacrifice: false })).toBe(3)
  })
})
