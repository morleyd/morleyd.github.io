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
    expect(g.moveLog.some((m) => m.san === 'Nf3')).toBe(true) // move tracker records SAN
    expect(g.moveLog.every((m) => typeof m.ts === 'number')).toBe(true) // timestamped
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

  it('makes a piece resist a sacrifice, then obey on the second tap', () => {
    const g = new WizardGame('sac')
    // White queen d2, black pawn e5: Qd4 is a sacrifice.
    g.reset('sac', '4k3/8/8/4p3/8/8/3Q4/4K3 w - - 0 1')
    g.settings.agency = 1 // pieces always push back at this setting
    g.playerTap('d2')
    expect(g.selected).toBe('d2')

    const first = g.playerTap('d4')
    expect(first.moved).toBe(false)
    expect(first.cue?.type).toBe('hop') // it flinches
    expect(g.chess.get('d4')).toBeFalsy()
    expect(g.selected).toBe('d2') // still held

    const second = g.playerTap('d4')
    expect(second.moved).toBe(true)
    expect(g.chess.get('d4')?.type).toBe('q')
  })

  it('caps mood animations by the animation scaler', () => {
    const g = new WizardGame('anim')
    g.reset('anim')
    // Force everyone into an angry mood; the controller must still respect the cap.
    for (const s of Object.values(g.society.souls)) s.mood.anger = 1
    g.settings.animation = 0.5 // cap ~2
    expect(Object.keys(g.animations()).length).toBeLessThanOrEqual(2)
    g.settings.animation = 0 // still board
    expect(Object.keys(g.animations()).length).toBe(0)
  })

  it('keeps a constant cast across games but shuffles positions', () => {
    const names = (g: WizardGame): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const f of 'abcdefgh') out[f + '2'] = g.soulAt(f + '2')!.persona.name
      return out
    }
    const a = names(new WizardGame('game-a'))
    const b = names(new WizardGame('game-b'))
    // Same eight characters both games...
    expect(new Set(Object.values(a))).toEqual(new Set(Object.values(b)))
    // ...but not all on the same squares.
    expect(a).not.toEqual(b)
  })

  it('pregame chatter forms friendships (mutual bonds)', () => {
    const g = new WizardGame('chatter')
    const lines = g.pregameChatter()
    expect(lines.length).toBeGreaterThan(0)
    const anyMutual = Object.values(g.society.souls).some((s) =>
      Object.entries(s.bonds).some(([id, v]) => v >= 0.5 && (g.society.souls[id]?.bonds[s.id] ?? 0) >= 0.5),
    )
    expect(anyMutual).toBe(true)
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

  it('trust rises when the player wins material and falls when a piece is lost', () => {
    // Player captures a pawn: trust should climb.
    const win = new WizardGame('trust-win')
    win.reset('trust-win', '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1')
    win.settings.agency = 0 // no resistance to muddy the move
    const before = win.trust
    win.playerTap('e4')
    win.playerTap('d5') // exd5, wins a pawn
    expect(win.chess.get('d5')?.color).toBe('w')
    expect(win.trust).toBeGreaterThan(before)

    // Enemy takes one of ours: trust should drop, and harder than a win lifts it.
    const lose = new WizardGame('trust-lose')
    lose.reset('trust-lose', '4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1')
    const b2 = lose.trust
    lose.aiApply({ from: 'd5', to: 'e4' }) // dxe4, we lose the pawn
    expect(lose.chess.get('e4')?.color).toBe('b')
    expect(lose.trust).toBeLessThan(b2)
  })

  it('offers a stunt only at a dramatic moment (not on a calm opening)', () => {
    const calm = new WizardGame('calm')
    calm.settings.chaos = 1 // always offer when eligible
    calm.playerTap('g1') // a knight with only quiet extended leaps available
    expect(calm.chaosTargets().length).toBe(0)

    const drama = new WizardGame('drama')
    drama.reset('drama', '4k3/8/5p2/8/3N4/8/8/4K3 w - - 0 1') // Nd4, capture/check leaps exist
    drama.settings.chaos = 1
    drama.playerTap('d4')
    expect(drama.chaosTargets().length).toBeGreaterThan(0)
    expect(drama.chaosOfferType()).toBe('jetpack')
  })

  it('lets a vengeful piece rage-strike an adjacent enemy off the board', () => {
    const g = new WizardGame('rage')
    g.reset('rage', '4k3/8/8/3p4/3R4/8/8/4K3 w - - 0 1') // white rook d4, black pawn d5
    g.settings.chaos = 1
    const rook = g.soulAt('d4')!
    rook.vengefulUntil = 10 // still within its vengeful window (ply 0)

    g.playerTap('d4')
    expect(g.chaosOfferType()).toBe('rage')
    expect(g.chaosTargets()).toContain('d5')

    const strike = g.playerTap('d5')
    expect(strike.moved).toBe(true)
    expect(g.chess.get('d5')).toBeFalsy() // the pawn is gone
    expect(g.chess.get('d4')?.type).toBe('r') // the rook stayed put
    expect(g.turn).toBe('b') // the strike was the turn
    expect(rook.vengefulUntil).toBe(-1) // rage spent
    expect(g.fallen().some((f) => f.type === 'p')).toBe(true) // the victim is in the box
  })

  it('charges a long-idle piece up its file, shoving or trampling its pawn', () => {
    const g = new WizardGame('breakout')
    g.reset('breakout', '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1') // white rook a1 boxed by pawn a2
    g.settings.chaos = 1
    const rook = g.soulAt('a1')!
    rook.idleFor = 20 // stuck for ages...
    rook.mood.impatience = 1 // ...and the player has heard it ranting about it

    const line = g.spontaneousChaos()
    expect(line).toBeTruthy()
    expect(g.chess.get('a1')).toBeFalsy() // the rook charged out of the corner

    // The rook now sits somewhere up the a-file (a slide, not a jump).
    let rookRank = 0
    for (let r = 2; r <= 8; r += 1) if (g.chess.get(('a' + r) as `a${number}`)?.type === 'r') rookRank = r
    expect(rookRank).toBeGreaterThan(1)

    // Its pawn is either shoved one rank ahead (still on the file) or trampled.
    const pawnAhead = g.chess.get(('a' + (rookRank + 1)) as `a${number}`)?.type === 'p'
    const pawnTrampled = g.fallen().some((f) => f.type === 'p')
    expect(pawnAhead || pawnTrampled).toBe(true)
    expect(g.moveLog.some((m) => m.chaos && m.san.includes('breakout'))).toBe(true)
    // The trample is the only death that spirals; everything else is dragged off.
    if (pawnTrampled) expect(g.deathFx).toBe('spiral')
    expect(g.fx?.kind).toBe('breakout') // a lingering mark tells the player what happened
  })

  it('never tramples the PLAYER\'s own pawn, and never breaks a castling rook', () => {
    // Boxed in with zero runway (own knight right above the pawn): a player
    // piece will NOT smash its own pawn to get out.
    const boxed = new WizardGame('breakout-boxed')
    boxed.reset('breakout-boxed', '4k3/8/8/8/8/N7/P7/R3K3 w - - 0 1')
    boxed.settings.chaos = 1
    const r1 = boxed.soulAt('a1')!
    r1.idleFor = 20
    r1.mood.impatience = 1
    expect(boxed.spontaneousChaos()).toBeNull()
    expect(boxed.chess.get('a2')?.type).toBe('p') // pawn untouched

    // A rook the king could still castle with stays put, no matter how bored.
    const castle = new WizardGame('breakout-castle')
    castle.reset('breakout-castle', '4k3/8/8/8/8/8/P7/R3K3 w Q - 0 1') // Q right live
    castle.settings.chaos = 1
    const r2 = castle.soulAt('a1')!
    r2.idleFor = 20
    r2.mood.impatience = 1
    expect(castle.spontaneousChaos()).toBeNull()
    expect(castle.chess.get('a1')?.type).toBe('r')
  })

  it('a wayward breakout piece can be coaxed back to its post', () => {
    const g = new WizardGame('breakout-coax')
    g.reset('breakout-coax', '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1')
    g.settings.chaos = 1
    const rook = g.soulAt('a1')!
    rook.idleFor = 20
    rook.mood.impatience = 1
    expect(g.spontaneousChaos()).toBeTruthy()
    const dest = rook.square as string
    expect(dest).not.toBe('a1')
    expect(g.waywardSoul()?.id).toBe(rook.id) // the view can point at the runaway
    g.playerTap(dest as Parameters<typeof g.playerTap>[0]) // select the charger
    expect(g.coaxTarget()).toBe('a1')
    const res = g.playerTap('a1') // order it home
    expect(res.moved).toBe(false) // free — keeps your turn
    expect(g.chess.get('a1')?.type).toBe('r') // back at its post
  })

  it('keeps quiet pieces from breaking out — the rant must come first', () => {
    const g = new WizardGame('breakout-quiet')
    g.reset('breakout-quiet', '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1')
    g.settings.chaos = 1
    const rook = g.soulAt('a1')!
    rook.idleFor = 20
    rook.mood.impatience = 0.2 // long-idle but hasn't been complaining
    expect(g.spontaneousChaos()).toBeNull()
  })

  it('never lets the enemy stunt in the opening, and only for a capture', () => {
    // Opening position, max chaos: no plan, ever (ply < 8).
    const g = new WizardGame('ai-chaos-gate')
    g.settings.chaos = 1
    g.playerTap('e2')
    g.playerTap('e4')
    expect(g.society.ply).toBeLessThan(8)
    expect(g.aiChaosPlan()).toBeNull()

    // Past the opening with a black knight in jetpack range of a white pawn:
    // the plan exists, is a capture, and is staged (announce first, then commit).
    const h = new WizardGame('ai-chaos-hit')
    h.reset('ai-chaos-hit', '4k3/8/2n5/8/8/5P2/8/4K3 b - - 0 1') // Nc6 -> f3 is an extended leap
    h.settings.chaos = 1
    h.society.ply = 20 // mid-game
    let plan = null
    for (let i = 0; i < 40 && !plan; i += 1) plan = h.aiChaosPlan() // rng-gated; keep asking
    expect(plan).toBeTruthy()
    expect(h.chess.get(plan!.to)?.color).toBe('w') // it only stunts to CAPTURE
    expect(plan!.announce.text).not.toMatch(/enemy|yours|you've got/i) // no advertising the player's gear
    expect(h.chess.get(plan!.from)?.color).toBe('b') // nothing moved yet — announce is a telegraph

    const lines = h.aiChaosCommit(plan!)
    expect(lines.length).toBeGreaterThan(0)
    expect(h.chess.get(plan!.to)?.color).toBe('b') // now it landed
    expect(h.fx?.kind).toBe(plan!.type) // and left a lingering mark
  })

  it('rallies the pep-talk entourage: king + friends march one step as one turn', () => {
    const g = new WizardGame('entourage')
    // King e1 flanked by pawns d2/e2/f2 — room to march up the board.
    g.reset('entourage', '4k3/8/8/8/8/8/3PPP2/4K3 w - - 0 1')
    g.settings.chaos = 1
    let tapped = false
    for (let i = 0; i < 30 && !tapped; i += 1) {
      g.playerTap('e1') // select the king (offer is rng-gated; keep asking)
      if (g.chaosOfferType() === 'entourage' && g.chaosTargets().length) {
        tapped = true
        break
      }
      g.playerTap('e1') // deselect and retry
    }
    expect(tapped).toBe(true)
    const to = g.chaosTargets().find((t) => t === 'e2') ?? g.chaosTargets()[0]
    const res = g.playerTap(to)
    expect(res.moved).toBe(true)
    expect(g.chess.get(to)?.type).toBe('k') // the king led the march
    expect(g.turn).toBe('b') // one turn, all together
    // At least one companion moved with him.
    expect(g.moveLog.some((m) => m.chaos && m.san.includes('entourage'))).toBe(true)
    expect(g.fx?.kind).toBe('entourage')
    // Society mapping stayed consistent with the board.
    for (const [sq, id] of Object.entries(g.society.bySquare)) {
      expect(g.chess.get(sq as Parameters<typeof g.soulAt>[0])?.type).toBe(g.society.souls[id].type)
    }
  })

  it('body swap: two bonded friends trade squares as one turn', () => {
    const g = new WizardGame('bodyswap')
    g.reset('bodyswap', '4k3/8/8/8/8/8/8/2RQK3 w - - 0 1') // rook c1 beside queen d1
    g.settings.chaos = 1
    const rook = g.soulAt('c1')!
    const queen = g.soulAt('d1')!
    rook.bonds[queen.id] = 0.8 // fast friends

    let offered = false
    for (let i = 0; i < 30 && !offered; i += 1) {
      g.playerTap('c1')
      if (g.chaosOfferType() === 'swap' && g.chaosTargets().includes('d1')) {
        offered = true
        break
      }
      g.playerTap('c1')
    }
    expect(offered).toBe(true)
    const res = g.playerTap('d1')
    expect(res.moved).toBe(true)
    expect(g.chess.get('c1')?.type).toBe('q') // traded places
    expect(g.chess.get('d1')?.type).toBe('r')
    expect(g.soulAt('c1')?.id).toBe(queen.id) // identities followed the swap
    expect(g.soulAt('d1')?.id).toBe(rook.id)
    expect(g.turn).toBe('b')
    expect(g.fx?.kind).toBe('swap')
  })

  it('trust arc: a devoted army never talks back, a mutinous one digs in', () => {
    const fen = '4k3/8/8/4p3/8/8/3Q4/4K3 w - - 0 1' // Qd4 is a sacrifice (pawn e5 recaptures)
    // Devoted: trust >= 85 → resistance chance 0 → moves on the FIRST tap.
    const devoted = new WizardGame('trust-devoted')
    devoted.reset('trust-devoted', fen)
    devoted.settings.agency = 1
    devoted.trust = 95
    devoted.playerTap('d2')
    expect(devoted.playerTap('d4').moved).toBe(true)

    // Mutinous: trust ~0 → the piece always balks at a sacrifice first.
    const mutinous = new WizardGame('trust-mutinous')
    mutinous.reset('trust-mutinous', fen)
    mutinous.settings.agency = 1
    mutinous.trust = 0
    mutinous.playerTap('d2')
    expect(mutinous.playerTap('d4').moved).toBe(false) // refused at least once
  })

  it('gives each pregame pair a multi-turn conversation with no repeated lines', () => {
    const g = new WizardGame('pregame-convo')
    const lines = g.pregameChatter()
    expect(lines.length).toBeGreaterThanOrEqual(8) // a few real conversations
    // Alternating speakers within each 4-line conversation.
    for (let i = 0; i + 3 < lines.length; i += 4) {
      expect(lines[i].soulId).toBe(lines[i + 2].soulId)
      expect(lines[i + 1].soulId).toBe(lines[i + 3].soulId)
      expect(lines[i].soulId).not.toBe(lines[i + 1].soulId)
    }
    // No repeated dialogue across the whole pregame.
    const texts = lines.map((l) => l.text.replace(/\b[A-Z][a-z]+\b/g, '{name}'))
    expect(new Set(texts).size).toBe(texts.length)
  })
})
