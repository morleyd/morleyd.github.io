import { describe, it, expect } from 'vitest'
import { WizardGame } from './game'

describe('WizardGame interaction', () => {
  it('selects a piece and then moves it to a legal square', () => {
    const g = new WizardGame('move-me')
    const sel = g.playerTap('g1') // white knight
    expect(sel.moved).toBe(false)
    expect(g.selected).toBe('g1')
    expect(g.legalTargets().has('f3')).toBe(true)

    const move = g.playerTap('f3')
    expect(move.moved).toBe(true)
    expect(g.chess.get('f3')?.type).toBe('n')
    expect(g.chess.get('g1')).toBeFalsy()
    expect(g.selected).toBeNull()
    expect(g.lastFrom).toBe('g1')
    expect(g.lastTo).toBe('f3')
  })

  it('introduces a piece the first time it is selected, then not again', () => {
    const g = new WizardGame('intro')
    expect(g.playerTap('e2').introSoul?.persona.name).toBeTruthy()
    g.playerTap('e2') // deselect
    expect(g.playerTap('e2').introSoul).toBeFalsy() // already met
  })

  it('cannot act while it is not the human turn (the stuck-knight bug)', () => {
    const g = new WizardGame('turns')
    g.playerTap('e2')
    g.playerTap('e4') // white moves; now it is black's turn
    expect(g.turn).toBe('b')
    expect(g.canPlay).toBe(false)

    const blocked = g.playerTap('g1') // trying to grab a white piece on black's turn
    expect(blocked.moved).toBe(false)
    expect(g.selected).toBeNull()
    expect(g.legalTargets().size).toBe(0)
  })

  it('cannot act while the engine is thinking', () => {
    const g = new WizardGame('thinking')
    g.aiThinking = true
    const r = g.playerTap('e2')
    expect(r.moved).toBe(false)
    expect(g.selected).toBeNull()
  })

  it('applies an AI move and keeps the turn flowing', () => {
    const g = new WizardGame('ai')
    g.playerTap('e2')
    g.playerTap('e4')
    g.aiApply({ from: 'e7', to: 'e5' })
    expect(g.chess.get('e5')?.color).toBe('b')
    expect(g.turn).toBe('w')
    expect(g.canPlay).toBe(true) // human can move again
  })
})
