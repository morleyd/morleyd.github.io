import { describe, it, expect } from 'vitest'
import { WizardGame } from './game'
import type { Square } from './types'

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

  it('undoes and redoes a move, restoring the whole position and turn', () => {
    const g = new WizardGame('undo')
    g.playerTap('e2')
    g.playerTap('e4')
    expect(g.chess.get('e4')?.type).toBe('p')
    expect(g.turn).toBe('b')
    expect(g.canUndo).toBe(true)

    g.undo()
    expect(g.chess.get('e4')).toBeFalsy()
    expect(g.chess.get('e2')?.type).toBe('p')
    expect(g.turn).toBe('w')
    expect(g.canRedo).toBe(true)

    g.redo()
    expect(g.chess.get('e4')?.type).toBe('p')
    expect(g.turn).toBe('b')
  })

  it('undo brings a captured piece back out of the graveyard', () => {
    const g = new WizardGame('undo-cap')
    g.reset('undo-cap', '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1')
    g.settings.agency = 0
    g.playerTap('e4')
    g.playerTap('d5') // exd5
    expect(g.chess.get('d5')?.color).toBe('w')
    expect(g.fallen().length).toBe(1)

    g.undo()
    expect(g.fallen().length).toBe(0) // the pawn is un-killed
    expect(g.chess.get('d5')?.color).toBe('b') // back on the board
    expect(g.chess.get('e4')?.color).toBe('w')
    expect(Object.values(g.society.souls).filter((s) => s.captured).length).toBe(0)
  })

  it('trust tracks the running material balance (ahead climbs, behind sinks)', () => {
    const ahead = new WizardGame('t-ahead')
    ahead.reset('t-ahead', '4k3/8/8/8/8/8/8/Q3K3 w - - 0 1') // White up a whole queen
    ahead.trust = 40
    const shuffleW = ['a1', 'a3', 'a5', 'a3']
    const shuffleB = ['e8', 'd8', 'e8', 'd8']
    for (let i = 0; i < 3; i += 1) {
      ahead.aiApply({ from: shuffleW[i], to: shuffleW[i + 1] })
      ahead.aiApply({ from: shuffleB[i], to: shuffleB[i + 1] })
    }
    expect(ahead.trust).toBeGreaterThan(46) // drifting up toward the ~80 material target

    const behind = new WizardGame('t-behind')
    behind.reset('t-behind', 'q3k3/8/8/8/8/8/8/4K3 b - - 0 1') // Black up a queen
    behind.trust = 60
    const bShuffle = ['a8', 'a6', 'a4', 'a6']
    const wShuffle = ['e1', 'd1', 'e1', 'd1']
    for (let i = 0; i < 3; i += 1) {
      behind.aiApply({ from: bShuffle[i], to: bShuffle[i + 1] })
      behind.aiApply({ from: wShuffle[i], to: wShuffle[i + 1] })
    }
    expect(behind.trust).toBeLessThan(56) // sagging toward the low material target
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
    drama.trust = 90 // "wings": a jetpack needs a reason, and deep trust is one
    drama.playerTap('d4')
    expect(drama.chaosTargets().length).toBeGreaterThan(0)
    expect(drama.chaosOfferType()).toBe('jetpack')
  })

  it('withholds the jetpack when the knight has no reason (not just because)', () => {
    const g = new WizardGame('no-jetpack')
    g.reset('no-jetpack', '4k3/8/5p2/8/3N4/8/8/4K3 w - - 0 1') // dramatic leap available…
    g.settings.chaos = 1
    g.trust = 50 // …but ordinary trust, fresh knight, king safe → no reason to fly
    g.playerTap('d4')
    expect(g.chaosOfferType()).not.toBe('jetpack')
  })

  it('lets a vengeful piece rage-strike an adjacent enemy off the board', () => {
    // Diagonal-adjacent enemy the rook CANNOT legally capture — rage-strike is
    // reserved for exactly this (a neighbour you can't just take normally), so it
    // never hijacks an ordinary capture.
    const g = new WizardGame('rage')
    g.reset('rage', '4k3/8/8/4p3/3R4/8/8/4K3 w - - 0 1') // white rook d4, black pawn e5 (diagonal)
    g.settings.chaos = 1
    const rook = g.soulAt('d4')!
    rook.vengefulUntil = 10 // still within its vengeful window (ply 0)

    g.playerTap('d4')
    expect(g.chaosOfferType()).toBe('rage')
    expect(g.chaosTargets()).toContain('e5')

    const strike = g.playerTap('e5')
    expect(strike.moved).toBe(true)
    expect(g.chess.get('e5')).toBeFalsy() // the pawn is gone
    expect(g.chess.get('d4')?.type).toBe('r') // the rook stayed put
    expect(g.turn).toBe('b') // the strike was the turn
    expect(rook.vengefulUntil).toBe(-1) // rage spent
    expect(g.fallen().some((f) => f.type === 'p')).toBe(true) // the victim is in the box
  })

  it('never hijacks a normal capture with a rage-strike', () => {
    // Rook d4, black pawn d5 — a legal capture. A vengeful rook must NOT be
    // offered rage there; tapping d5 should take the pawn the ordinary way (rook
    // ends on d5), not strike it off while staying put in the wrong square.
    const g = new WizardGame('rage-capture')
    g.reset('rage-capture', '4k3/8/8/3p4/3R4/8/8/4K3 w - - 0 1')
    g.settings.chaos = 1
    g.soulAt('d4')!.vengefulUntil = 10

    g.playerTap('d4')
    expect(g.chaosTargets()).not.toContain('d5') // rage not offered on a capturable foe

    const res = g.playerTap('d5')
    expect(res.moved).toBe(true)
    expect(g.chess.get('d5')?.type).toBe('r') // the rook actually moved onto d5
    expect(g.chess.get('d4')).toBeFalsy()
  })

  // A middlegame board: rook boxed at a1, but the side is deployed (Bc4, Nf4).
  const BREAKOUT_FEN = '4k3/8/8/8/2B2N2/8/P7/R3K3 w - - 0 1'
  // Nudge a soul into the "earned a breakout" state: long-idle, loudly ranting,
  // and the game is past the opening.
  const primeBreakout = (g: WizardGame, sq: Square) => {
    g.settings.chaos = 1
    g.society.ply = 20 // middlegame
    const s = g.soulAt(sq)!
    s.idleFor = 20
    s.mood.impatience = 1
    s.rants = 6 // it has complained a good few times
    return s
  }

  it('charges a long-idle piece up its file, shoving or trampling its pawn', () => {
    const g = new WizardGame('breakout')
    g.reset('breakout', BREAKOUT_FEN)
    primeBreakout(g, 'a1')

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
    // Boxed in with zero runway (own knight right above the pawn) — but deployed
    // elsewhere (Bc4): a player piece will NOT smash its own pawn to get out.
    const boxed = new WizardGame('breakout-boxed')
    boxed.reset('breakout-boxed', '4k3/8/8/8/2B5/N7/P7/R3K3 w - - 0 1')
    primeBreakout(boxed, 'a1')
    expect(boxed.spontaneousChaos()).toBeNull()
    expect(boxed.chess.get('a2')?.type).toBe('p') // pawn untouched

    // A rook the king could still castle with stays put, no matter how bored.
    const castle = new WizardGame('breakout-castle')
    castle.reset('breakout-castle', '4k3/8/8/8/2B2N2/8/P7/R3K3 w Q - 0 1') // Q right live
    primeBreakout(castle, 'a1')
    expect(castle.spontaneousChaos()).toBeNull()
    expect(castle.chess.get('a1')?.type).toBe('r')
  })

  it('a wayward breakout piece can be coaxed back to its post', () => {
    const g = new WizardGame('breakout-coax')
    g.reset('breakout-coax', BREAKOUT_FEN)
    const rook = primeBreakout(g, 'a1')
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

  it('lets the player undo a spontaneous breakout', () => {
    const g = new WizardGame('breakout-undo')
    g.reset('breakout-undo', BREAKOUT_FEN)
    primeBreakout(g, 'a1')
    expect(g.spontaneousChaos()).toBeTruthy()
    expect(g.chess.get('a1')).toBeFalsy()
    expect(g.canUndo).toBe(true)
    g.undo()
    expect(g.chess.get('a1')?.type).toBe('r') // charger back in its corner
    expect(g.chess.get('a2')?.type).toBe('p') // pawn back where it was
  })

  it('holds a breakout until the piece has ranted, deployed, and left the opening', () => {
    // Everything primed EXCEPT the rant count → no eruption (must complain first).
    const quiet = new WizardGame('breakout-quiet')
    quiet.reset('breakout-quiet', BREAKOUT_FEN)
    const r = primeBreakout(quiet, 'a1')
    r.rants = 1 // barely grumbled
    expect(quiet.spontaneousChaos()).toBeNull()

    // Fully ranted but still the opening (ply < 16) → still no eruption.
    const early = new WizardGame('breakout-early')
    early.reset('breakout-early', BREAKOUT_FEN)
    primeBreakout(early, 'a1')
    early.society.ply = 6
    expect(early.spontaneousChaos()).toBeNull()
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

  it('lets the player reprimand a cheating enemy piece back to its legal home', () => {
    const g = new WizardGame('reprimand')
    g.reset('reprimand', '4k3/8/2n5/8/8/5P2/PP6/4K3 b - - 0 1') // Nc6, white pawns (live game)
    g.settings.chaos = 1
    g.society.ply = 20
    let plan = null
    for (let i = 0; i < 60 && !plan; i += 1) plan = g.aiChaosPlan()
    expect(plan).toBeTruthy()
    g.aiChaosCommit(plan!) // the knight jetpacks c6 -> f3, snatching the pawn
    expect(g.turn).toBe('w') // the player's move now
    expect(g.chess.get('f3')?.color).toBe('b') // enemy knight cheated onto f3
    expect(g.fallen().some((f) => f.color === 'w')).toBe(true) // it grabbed our pawn
    expect(g.reprimandSquare()).toBe('f3') // the cheat is badged
    expect(g.reprimandTarget()).toBe('c6') // ...and its home glows

    const res = g.playerTap('c6') // enforce the rule
    expect(res.moved).toBe(false) // free — the player keeps their move
    expect(g.turn).toBe('w')
    expect(g.chess.get('c6')?.color).toBe('b') // knight marched home
    expect(g.chess.get('f3')?.color).toBe('w') // and our pawn is back!
    expect(g.fallen().length).toBe(0)
    expect(g.reprimandTarget()).toBeNull() // cheat resolved

    // Once the player makes a real move, the reprimand window is gone.
    const g2 = new WizardGame('reprimand2')
    g2.reset('reprimand2', '4k3/8/2n5/8/8/5P2/PP6/4K3 b - - 0 1')
    g2.settings.chaos = 1
    g2.society.ply = 20
    let plan2 = null
    for (let i = 0; i < 60 && !plan2; i += 1) plan2 = g2.aiChaosPlan()
    g2.aiChaosCommit(plan2!)
    const cheatSq = g2.reprimandSquare() as Square
    g2.playerTap('e1')
    g2.playerTap('e2') // the player moves instead of reprimanding
    expect(g2.reprimandTarget()).toBeNull() // too late now
    g2.aiApply({ from: 'e8', to: 'd8' }) // black replies; control returns to White
    // …tapping the cheat now just gets a gloat about the missed chance.
    const missed = g2.playerTap(cheatSq)
    expect(missed.moved).toBe(false)
    expect(missed.utterances[0]?.text).toBeTruthy()
  })

  it('a vengeful piece pines for its fallen friend (building up to the strike)', () => {
    const g = new WizardGame('pine')
    g.reset('pine', '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1')
    g.society.ply = 4
    const q = g.soulAt('e2')!
    q.vengefulUntil = 12
    q.mourning = 'Dennis'
    const u = g.pine()
    expect(u).toBeTruthy()
    expect(u!.text).toContain('Dennis')
  })

  it('a timid enemy piece balks a losing capture and retreats instead', () => {
    const g = new WizardGame('balk')
    // Black bishop f4 can take the e3 pawn, but it's defended by d2 → a bad trade.
    g.reset('balk', '4k3/8/8/8/5b2/4P3/3P4/4K3 b - - 0 1')
    g.settings.chaos = 1
    g.soulAt('f4')!.persona.bravery = 0.2 // a coward
    let balk = null
    for (let i = 0; i < 50 && !balk; i += 1) balk = g.timidBalk({ from: 'f4', to: 'e3' })
    expect(balk).toBeTruthy()
    expect(balk!.move.from).toBe('f4')
    expect(balk!.move.to).not.toBe('e3') // it shrinks back somewhere safe instead
    expect(balk!.utterance.tone).toBe('afraid')

    // A brave piece takes the trade without flinching.
    const brave = new WizardGame('brave')
    brave.reset('brave', '4k3/8/8/8/5b2/4P3/3P4/4K3 b - - 0 1')
    brave.settings.chaos = 1
    brave.soulAt('f4')!.persona.bravery = 0.9
    let braveBalk = null
    for (let i = 0; i < 20 && !braveBalk; i += 1) braveBalk = brave.timidBalk({ from: 'f4', to: 'e3' })
    expect(braveBalk).toBeNull()
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

  it('body swap: a cheap piece shields an endangered valuable one', () => {
    const g = new WizardGame('bodyswap')
    // Black rook on d8 skewers the white queen on d4; a safe knight sits on c4.
    g.reset('bodyswap', '3rk3/8/8/8/2NQ4/8/8/4K3 w - - 0 1')
    g.settings.chaos = 1
    const knight = g.soulAt('c4')!
    const queen = g.soulAt('d4')!

    let offered = false
    for (let i = 0; i < 30 && !offered; i += 1) {
      g.playerTap('d4') // hold the endangered queen
      if (g.chaosOfferType() === 'swap' && g.chaosTargets().includes('c4')) {
        offered = true
        break
      }
      g.playerTap('d4')
    }
    expect(offered).toBe(true)
    const res = g.playerTap('c4') // the knight throws itself into the queen's place
    expect(res.moved).toBe(true)
    expect(g.chess.get('c4')?.type).toBe('q') // queen swung to safety
    expect(g.chess.get('d4')?.type).toBe('n') // knight took the hot square
    expect(g.soulAt('c4')?.id).toBe(queen.id) // identities followed the swap
    expect(g.soulAt('d4')?.id).toBe(knight.id)
    expect(g.turn).toBe('b')
    expect(g.fx?.kind).toBe('swap')
  })

  it('never offers a pointless body swap (same type, or no gain)', () => {
    // Two rooks side by side, nobody in danger, no check to be had → no swap.
    const g = new WizardGame('bodyswap-none')
    g.reset('bodyswap-none', '4k3/8/8/8/8/8/8/2RRK3 w - - 0 1') // rooks c1 & d1
    g.settings.chaos = 1
    for (let i = 0; i < 20; i += 1) {
      g.playerTap('c1')
      if (g.chaosOfferType() === 'swap') throw new Error('should not offer a same-type swap')
      g.playerTap('c1')
    }
    // A rook + queen with neither in danger and no check is also pointless.
    const g2 = new WizardGame('bodyswap-safe')
    g2.reset('bodyswap-safe', '4k3/8/8/8/8/8/8/2RQK3 w - - 0 1')
    g2.settings.chaos = 1
    for (let i = 0; i < 20; i += 1) {
      g2.playerTap('c1')
      expect(g2.chaosOfferType()).not.toBe('swap')
      g2.playerTap('c1')
    }
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
