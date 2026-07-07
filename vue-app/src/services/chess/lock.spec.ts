import { describe, it, expect } from 'vitest'
import { WizardGame } from './game'
import { chooseMove } from './search'

/**
 * Reproduces the "can't move after a defection" lock: play whole games at max
 * chaos and assert that whenever it's White's turn with legal moves available,
 * the player can actually complete one. This mirrors the view's turn loop.
 */
function aiTurn(g: WizardGame) {
  const chaos = g.aiChaos()
  if (!chaos) {
    const m = chooseMove(g.chess.fen(), 1)
    if (m) g.aiApply(m)
  }
  g.suggest()
  g.spontaneousChaos()
}

function tryWhiteMove(g: WizardGame, legal: { from: string; to: string }[]): boolean {
  // Try legal moves until one actually commits (resistance needs a few taps;
  // a spooked piece may divert a tap to a coax, so fall through to another move).
  for (const mv of legal.slice(0, 6)) {
    g.playerTap(mv.from)
    for (let i = 0; i < 4; i += 1) {
      if (g.playerTap(mv.to).moved) return true
    }
  }
  return false
}

describe('turn lock', () => {
  it('White can always move on its turn, across many chaotic games', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const g = new WizardGame(`lock-${seed}`)
      g.settings.chaos = 1
      g.settings.agency = 1
      for (let ply = 0; ply < 250 && !g.gameOver; ply += 1) {
        if (g.turn === 'w') {
          const legal = g.chess.moves({ verbose: true }) as unknown as { from: string; to: string }[]
          if (!legal.length) break // no moves → should be game over
          const moved = tryWhiteMove(g, legal)
          expect(moved, `seed ${seed} ply ${ply}: White had a legal move but could not play it`).toBe(true)
        } else {
          aiTurn(g)
          // The AI turn must always hand control back to White (or end the game);
          // otherwise an illegal chaos move has hung the game on Black.
          if (!g.gameOver) {
            expect(g.turn, `seed ${seed} ply ${ply}: AI turn did not return to White`).toBe('w')
          }
        }
      }
    }
  }, 30000)
})
