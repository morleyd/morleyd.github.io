import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { mulberry32 } from '../seed'
import { applyMove, createSociety, scanBoard } from './social'
import { createDialogueState, speak } from './dialogue'
import { chooseMove } from './search'
import type { Color, PieceType } from './types'

const info = (m: ReturnType<Chess['move']>) => ({
  from: m.from,
  to: m.to,
  color: m.color as Color,
  piece: m.piece as PieceType,
  flags: m.flags,
  captured: m.captured as PieceType | undefined,
  promotion: m.promotion as PieceType | undefined,
})

describe('society identity tracking', () => {
  it('assigns a named soul to every one of the 32 pieces', () => {
    const chess = new Chess()
    const soc = createSociety(chess, mulberry32(42))
    expect(Object.keys(soc.souls)).toHaveLength(32)
    expect(Object.values(soc.souls).every((s) => s.persona.name.length > 0)).toBe(true)
  })

  it('keeps a piece identity as it moves', () => {
    const chess = new Chess()
    const soc = createSociety(chess, mulberry32(1))
    const id = soc.bySquare['e2']
    applyMove(soc, info(chess.move('e4')))
    expect(soc.bySquare['e2']).toBeUndefined()
    expect(soc.bySquare['e4']).toBe(id)
    expect(soc.souls[id].square).toBe('e4')
    expect(soc.souls[id].idleFor).toBe(0)
  })

  it('resolves a capture: victim dies, killer gains a kill, comrades hold a grudge', () => {
    const chess = new Chess()
    const soc = createSociety(chess, mulberry32(7))
    applyMove(soc, info(chess.move('e4')))
    applyMove(soc, info(chess.move('d5')))
    const killerId = soc.bySquare['e4']
    const victimId = soc.bySquare['d5']
    // How each surviving black piece felt about the killer *before* the capture.
    const before = Object.values(soc.souls)
      .filter((s) => s.color === 'b' && s.id !== victimId)
      .map((s) => ({ id: s.id, bond: s.bonds[killerId] ?? 0 }))
    const events = applyMove(soc, info(chess.move('exd5')))

    expect(soc.souls[victimId].captured).toBe(true)
    expect(soc.souls[victimId].square).toBeNull()
    expect(soc.bySquare['d5']).toBe(killerId)
    expect(soc.souls[killerId].kills).toBe(1)
    expect(events.some((e) => e.kind === 'capture')).toBe(true)
    expect(events.some((e) => e.kind === 'captured')).toBe(true)

    // Every survivor now thinks worse of the killer than they did before.
    for (const b of before) {
      expect(soc.souls[b.id].bonds[killerId]).toBeLessThan(b.bond)
    }
    expect(before.length).toBeGreaterThan(0)
  })

  it('drags the rook along when castling', () => {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    const soc = createSociety(chess, mulberry32(3))
    const rookId = soc.bySquare['h1']
    const kingId = soc.bySquare['e1']
    applyMove(soc, info(chess.move('O-O')))
    expect(soc.bySquare['h1']).toBeUndefined()
    expect(soc.bySquare['f1']).toBe(rookId)
    expect(soc.bySquare['g1']).toBe(kingId)
  })

  it('carries identity through pawn promotion, changing type', () => {
    const chess = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1')
    const soc = createSociety(chess, mulberry32(9))
    const id = soc.bySquare['a7']
    applyMove(soc, info(chess.move('a8=Q')))
    expect(soc.bySquare['a8']).toBe(id)
    expect(soc.souls[id].type).toBe('q')
  })
})

describe('dialogue', () => {
  it('is deterministic for a given seed', () => {
    const run = () => {
      const chess = new Chess()
      const rng = mulberry32(2024)
      const soc = createSociety(chess, rng)
      const state = createDialogueState()
      applyMove(soc, info(chess.move('e4')))
      applyMove(soc, info(chess.move('d5')))
      const events = applyMove(soc, info(chess.move('exd5')))
      return speak(soc, [...events, ...scanBoard(soc, chess)], state, rng)
    }
    expect(run()).toEqual(run())
  })

  it('voices a capture with a filled-in name', () => {
    const chess = new Chess()
    const rng = mulberry32(11)
    const soc = createSociety(chess, rng)
    const state = createDialogueState()
    applyMove(soc, info(chess.move('e4')))
    applyMove(soc, info(chess.move('d5')))
    const events = applyMove(soc, info(chess.move('exd5')))
    const lines = speak(soc, events, state, rng)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => !l.text.includes('{'))).toBe(true)
  })
})

describe('engine', () => {
  it('returns a legal move from the opening position', () => {
    const chess = new Chess()
    const move = chooseMove(chess.fen(), 3)
    expect(move).not.toBeNull()
    // Legal if chess.js accepts it without throwing.
    expect(() => chess.move({ from: move!.from, to: move!.to, promotion: move!.promotion ?? 'q' })).not.toThrow()
  })

  it('grabs a free queen (finds the obvious capture)', () => {
    // White to move; the black queen on d5 is hanging to the pawn on e4.
    const chess = new Chess('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1')
    const move = chooseMove(chess.fen(), 4)
    expect(move).toMatchObject({ from: 'e4', to: 'd5' })
  })
})

describe('full-game integration', () => {
  it('keeps identities consistent with the board across a whole self-played game', () => {
    const chess = new Chess()
    const rng = mulberry32(2718)
    const soc = createSociety(chess, rng)
    const state = createDialogueState()

    for (let ply = 0; ply < 100 && !chess.isGameOver(); ply += 1) {
      const move = chooseMove(chess.fen(), 1) // fast level keeps the test snappy
      if (!move) break
      const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
      applyMove(soc, info(played))
      const lines = speak(soc, scanBoard(soc, chess), state, rng)
      for (const l of lines) expect(l.text).not.toContain('{') // every template filled

      // The identity map must exactly mirror the real board.
      const occupied = chess.board().flat().filter(Boolean) as { square: string; type: string; color: string }[]
      const living = Object.values(soc.souls).filter((s) => !s.captured)
      expect(living).toHaveLength(occupied.length)
      for (const cell of occupied) {
        const id = soc.bySquare[cell.square]
        expect(id).toBeDefined()
        expect(soc.souls[id].color).toBe(cell.color)
        expect(soc.souls[id].type).toBe(cell.type) // stays true through promotions
      }
    }
  }, 20000)
})
