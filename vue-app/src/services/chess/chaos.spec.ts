import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { applyChaosMove, bishopTargets, jetpackTargets } from './chaos'
import { WizardGame } from './game'

describe('chaos moves', () => {
  it('lets a rook slide diagonally like a bishop', () => {
    const c = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1') // lone white rook a1
    expect(bishopTargets(c, 'a1')).toContain('c3')
    const res = applyChaosMove(c, 'a1', 'c3')
    expect(res).not.toBeNull()
    expect(c.get('c3')?.type).toBe('r')
    expect(c.get('a1')).toBeFalsy()
    expect(c.turn()).toBe('b') // turn flipped, game continues legally
  })

  it('gives a knight extended leaps and can capture with one', () => {
    const c = new Chess('4k3/8/8/8/3p4/8/8/N3K3 w - - 0 1') // knight a1, black pawn d4
    expect(jetpackTargets(c, 'a1')).toContain('d4')
    const res = applyChaosMove(c, 'a1', 'd4')
    expect(res?.captured).toBe('p')
    expect(c.get('d4')?.type).toBe('n')
  })

  it('never applies a move that would capture a king', () => {
    // Rook a1, black king on the a1-h8 diagonal at h8 — geometry allows it,
    // but capturing a king must be refused.
    const c = new Chess('7k/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(applyChaosMove(c, 'a1', 'h8')).toBeNull()
  })

  it('refuses a chaos move that leaves the mover in check', () => {
    // Black to move, king e8 in check from the rook on e1.
    const fen = '1n2k3/8/8/8/8/8/8/4RK2 b - - 0 1'
    // A jetpack that ignores the check is illegal...
    expect(applyChaosMove(new Chess(fen), 'b8', 'a6')).toBeNull()
    // ...but one that blocks the check (Ne7 interposes) is allowed.
    expect(applyChaosMove(new Chess(fen), 'b8', 'e7')).not.toBeNull()
  })
})

describe('chaos offers and limits (controller)', () => {
  it('offers a disguise to a boxed-in rook and executes it once', () => {
    const g = new WizardGame('chaos')
    // White rook a1 with open diagonal; black king far away. Rook has few moves.
    g.reset('chaos', '4k3/8/8/8/8/8/P7/RN2K3 w - - 0 1')
    g.settings.chaos = 1 // always offer when eligible
    const r = g.playerTap('a1')
    expect(r.introSoul).toBeTruthy()
    const targets = g.chaosTargets()
    expect(targets.length).toBeGreaterThan(0) // diagonal options offered

    const to = targets[0]
    const done = g.playerTap(to)
    expect(done.moved).toBe(true)
    expect(g.chess.get(to)?.type).toBe('r') // the rook teleported diagonally
    expect(g.turn).toBe('b')

    // Stunt is spent: selecting another rook-like piece won't re-offer disguise.
    expect(g.chaosTargets().length).toBe(0)
  })

  it('offers nothing when the Chaos scaler is 0', () => {
    const g = new WizardGame('nochaos')
    g.reset('nochaos', '4k3/8/8/8/8/8/P7/RN2K3 w - - 0 1')
    g.settings.chaos = 0
    g.playerTap('a1')
    expect(g.chaosTargets().length).toBe(0)
  })

  it('tantrum: a furious piece knocks an adjacent enemy off — after the rage has been seen', () => {
    const g = new WizardGame('rage')
    g.reset('rage', '4k3/8/8/3p4/3Q4/8/8/4K3 w - - 0 1') // white Q d4, black pawn d5
    g.settings.chaos = 1
    g.soulAt('d4')!.mood.anger = 1 // seething
    expect(g.spontaneousChaos()).toBeNull() // first sighting: the red must be read first
    g.society.ply += 2 // a round passes with the rage on display
    g.soulAt('d4')!.mood.anger = 1
    const u = g.spontaneousChaos()
    expect(u).not.toBeNull()
    expect(g.chess.get('d5')).toBeFalsy() // pawn was shoved off
  })

  it('defector: a disgruntled pawn switches sides when White is losing badly', () => {
    const g = new WizardGame('defect')
    g.reset('defect', '3qk3/8/8/8/8/8/4P3/4K3 w - - 0 1') // black up a queen
    g.settings.chaos = 1
    g.soulAt('e2')!.persona.obedience = 0.1 // ready to quit
    const u = g.spontaneousChaos()
    expect(u).not.toBeNull()
    expect(g.chess.get('e2')?.color).toBe('b') // now plays for the enemy
  })

  it('cold feet spooks a piece, then the player can coax it back to its post', () => {
    const g = new WizardGame('coax')
    // White knight e4 under attack from the e8 rook; e3 is empty behind it.
    g.reset('coax', '4r1k1/8/8/8/4N3/8/8/6K1 w - - 0 1')
    g.settings.chaos = 1
    g.soulAt('e4')!.mood.fear = 1
    const u = g.spontaneousChaos()
    expect(u).not.toBeNull()
    expect(g.chess.get('e3')?.type).toBe('n') // fled backward
    // Select the spooked knight → its old post is offered as a coax target.
    g.playerTap('e3')
    expect(g.coaxTarget()).toBe('e4')
    g.playerTap('e4')
    expect(g.chess.get('e4')?.type).toBe('n') // coaxed home
    expect(g.chess.get('e3')).toBeFalsy()
    expect(g.turn).toBe('w') // coaxing is free — still your move
  })

  it('killing a bonded friend makes a comrade vengeful and names the fallen', () => {
    const g = new WizardGame('rage')
    // Black knight b5 can capture the white pawn on d4; the c1 bishop adores it.
    g.reset('rage', '4k3/8/8/1n6/3P4/8/8/2B1K3 b - - 0 1')
    const victim = g.soulAt('d4')!
    g.soulAt('c1')!.bonds[victim.id] = 0.8
    const lines = g.aiApply({ from: 'b5', to: 'd4' })
    expect(Object.values(g.states())).toContain('vengeful')
    expect(lines.some((l) => l.text.includes(victim.persona.name))).toBe(true)
    // The fallen pawn is now in the box.
    expect(g.fallen().map((f) => f.id)).toContain(victim.id)
  })
})
