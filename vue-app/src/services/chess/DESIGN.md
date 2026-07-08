# Wizard Chess — Character & Animation Design

> Working design doc for the "living pieces" layer. Source of truth for the
> personality/animation vision and the punch-list of changes. Lives on the
> `wizard-chess` branch.

## STATUS / RESUME HERE (as of last session)

**Shipped & deployed** to production (morleyd.github.io/wizard-chess): the game
itself (native Vue board, negamax engine in a worker, now deterministic per
position), the full social/personality layer (moods, bonds, dialogue with
pacing + per-piece cooldown + dedup), chaos stunts (disguise/jetpack/cold-feet/
tantrum/defector + enemy-initiated chaos), settings scalers (chatter/animation/
hints/chaos + reduced-motion), team **trust meter** (persists), **good/bad advice**,
the **box** (graveyard) under the board with a drag-off capture, **coax-back**,
**vengeance** (a bonded friend's death → lasting vengeful state), timestamped
chronological **move tracker**, **pregame conversations that form bonds**, a
**constant cast with shuffled positions**, and the iOS pawn-glyph fix. No emojis.
The five bounded playtest fixes below (trust swings, spaced pregame banter,
dramatic-only chaos offers, back-row breakout charge, rage-strike payoff) are all
in as of the latest session. **42 unit + 4 Playwright e2e tests pass.**

### NEXT STEPS (from the latest playtest feedback)

Bounded logic/UX fixes (no new art needed) — **all shipped this session:**
- [x] **Trust swings harder**: `trustFromMove()` runs on every move, either side.
      Player captures raise trust (`+2 + val·0.7`); losing a piece drops it hard
      (`−(3 + val·1.1 + grief·1.5)`, worse the more beloved the fallen); advancing
      up the board earns a little faith. A bonded survivor voices flagging faith
      via `loseFaithLine()`.
- [x] **Space out pregame banter**: `enqueue`/`pump` now take an `interval`; the
      pregame reveal runs at 2400ms (queue cap raised 8→12 so no pairs drop).
- [x] **Chaos offers only at dramatic moments**: `computeOffer` filters stunt
      targets to those that capture, give check, or escape an attack on the
      piece's own square — idle repositioning never triggers an offer.
- [x] **Trapped back-row breakout**: a piece idle ≥12 plies behind its own pawn
      charges up its file — a real multi-rank slide (distance depends on the room
      above), shoving its pawn one rank further ahead, or **trampling** it (the
      pawn dies) when there's no room. Spontaneous, 1×/game, chaos-gated. *(Not a
      jump/swap — it's a dense-castle charge, per David's steer.)*
- [x] **Rage payoff**: `offer.type: 'rage'` → `doRageStrike()`. A still-vengeful
      piece with an adjacent enemy can smash it clean off the board (`knockOff`
      with turn-flip — the strike IS the turn). Rage is then spent and the red
      clears. Red `.dot--rage` strike ring in the view.

Enabler added this session: an optional **`?fen=`** query param loads a specific
position (shareable puzzles / deterministic e2e setups); honoured only on the
initial mount, and `reset()` falls back to the opening on a malformed FEN.

### The pacing pass (second playtest, "everything lands at once") — shipped

The playtest log showed the drama *working* but compressed into single beats
(Gertrude took g7, Cuthbert died, Gerard swore vengeance AND tantrum-killed
Gertrude — all at 8:57). The fixes, all in:

- [x] **Pregame is a scene**: each adjacent pair now has a 4-line conversation
      (opener → reply → banter → closer, alternating speakers, 3 pairs), no line
      ever repeating, at a 2600ms reveal — ~30s of getting acquainted. Longer
      exchanges bond harder (+0.7). Idle heckle waits 50s so it can't step on it.
- [x] **Enemy chaos is earned and staged**: never before ply 8, only when the
      stunt *captures* (picks the biggest victim), and lands in two beats —
      `aiChaosPlan()` telegraphs (a line + "UP TO SOMETHING…" mark on the piece),
      then ~2.6s later `aiChaosCommit()` strikes. Announce lines never advertise
      the player's own gear (killed "The enemy's got jetpacks too!").
- [x] **One big thing at a time**: after the enemy's move, at most ONE follow-up
      beat (spontaneous stunt, else a suggestion — never both), arriving ~2.6s
      later as its own scene. Spontaneous chaos also never fires while the
      player is holding a piece.
- [x] **Tantrum needs visible buildup**: a max-rage piece must have been *seen*
      raging for a full round (red aura pulsing) before it can erupt
      (`enrageSeen`). No more same-beat kill-and-revenge.
- [x] **Breakout follows the rant**: only a piece whose impatience the player
      has heard (≥0.7, i.e. the escalating IMPATIENT lines fired) can charge —
      Dennis's "UNLEASHED WRATH" now actually pays off in the loudest ranter.
- [x] **Lingering stunt FX**: every rule-break leaves a mark for ~5.5s — origin
      ghost ring, destination ring, and a label naming it (JETPACK! / DISGUISE! /
      RAGE-STRIKE! / TANTRUM! / BREAKOUT! / COLD FEET / DEFECTED!). Honors
      reduced-motion.
- [x] **Slower, heavier animation**: travel ~320–720ms (risky ×1.8); captures
      are *hauled down to the box* over ~1.1s (canon drag-off); the ONE spiral-
      out death is the trampled pawn (`deathFx: 'drag' | 'spiral'`). Bubbles
      linger 5.6s.
- [x] **Vengeful legibility**: selecting a red-pulsing piece explains it in the
      status bar ("X burns with vengeance against Y — tap a red ring to strike").
- [x] **Template-level dialogue dedup**: "You KILLED {fallen}…" can't be used
      twice in a game even with different names (recent ring tracks templates
      too).

### The visual pass — shipped

- [x] **Real piece art**: the Wikipedia/Cburnett set (80×80 transparent PNGs,
      copied from `~/git/chess-ai/img/chesspieces/wikipedia/`, art by Colin M.L.
      Burnett, CC-BY-SA/GFDL) replaces the unicode glyphs everywhere — board,
      the box, table-talk badges, character sheet. Kills the iOS emoji hack;
      drop-shadow auras and transform animations apply cleanly; a defector
      literally changes colour.
- [x] **Capture "escort"**: after the captor's travel slide, it dives down its
      file past the board's bottom edge (to the box) alongside the victim's
      drag-off exit, then climbs back to its post (`--exit-y` per-square, 2.5s
      keyframes; suppressed for spiral deaths and cleared if the piece is moved
      again).
- [x] **Comic-book violence**: every capture bursts a starburst at the square —
      POW! / WHAM! / SMASH! / THWACK! / CRUNCH! / BAM! / CLANG! (rage-strike is
      always SMASH!, the trampled pawn gets SQUISH!). The panel conveys the
      smashing the pieces can't act out — no cannon-and-rubble art needed.
- [x] **Stunt accessories** (inline SVG, no sourcing needed): the jetpack knight
      wears a flickering thruster flame, the disguised rook wears glasses, the
      defector wears a black hat — for as long as the stunt FX lingers.

### Playtest round 3 (tantrum cut, endgame clarity, entourage/swap/trust) — shipped

- [x] **Tantrum CUT** (David: a random piece vanishing off-turn is alarming, not
      fun). Rage now pays off only through the player-controlled rage-strike.
- [x] **Endgame banner**: unmissable full-board overlay — CHECKMATE! green on a
      win, red on a loss, slate for stalemate/draw, with a subtitle.
- [x] **Rope drag-off**: victims get a lasso loop + taut rope, and the descent
      is *organic* — per-piece hashed sway (`--sway`), staggering curves, no two
      paths alike; the escort leans and drifts too. Spiral stays trample-only.
- [x] **Offers are visible**: the accessory goes on at OFFER time — glasses on
      the rook (disguise), flame on the knight (jetpack), banner on the king
      (entourage) — so you can see what you'd be opting into. Special rings now
      outrank the plain move dot on shared squares.
- [x] **Pep-talk entourage** (canon): king + ≥2 adjacent allies march one step
      together as a single turn (`entourageShift`, king must lead, ≥1 companion,
      commit-validated). "To me, friends — we move as ONE!"
- [x] **Body swap** (canon): two bonded friends (bond ≥ .45) beside each other
      trade squares as a turn — "Cover me — SWITCH!"
- [x] **Trust arc, visible**: refusal chance is now
      `agency × clamp((85 − trust)/55)` — a devoted army (85+) NEVER talks back,
      a mutinous one always digs in; a caption under the meter says what the
      current tier does. **No trust reset control (decided).**
- [x] **Breakout discipline** (playtest: a rook trampled its own pawn to move
      one square into a new trap, spoiling castling): player pieces never
      trample their own pawn; the landing square must genuinely free the piece
      (`freedomAt` ≥ before + 3); rooks with live castling rights never break
      out; a wayward charger is **coaxable back** like a fled piece.
- [x] **Coax discoverability**: the status bar teaches it ("X moved on its own —
      select it to order it back" → "tap the green ring to order it back to its
      post"). This is the standing recourse for misbehaving pieces.

### The 50-game soak (self-play QA) — findings + fixes shipped

`soak.spec.ts` plays full games through the view's exact code paths (taps,
offers, resists, coax, enemy chaos, spontaneous stunts) with per-ply invariant
checks. Run with `SOAK=1 npx vitest run src/services/chess/soak.spec.ts`
(~15 min; skipped in normal test passes). Findings from 2×50 games:

- **Zero invariant violations** across ~9,500 plies (board/society mapping,
  graveyard, turn flow, trust bounds) — the core is solid.
- **Trust death-spiraled** (avg end 10; 29/50 games flat 0): loss aversion made
  even trading rail the army into permanent mutiny. **Fixed**: capture reward up
  (`+2 + val·0.9`), loss sting down + grief capped (`−(2 + val·0.85 +
  min(grief,3)·1.2)`), and morale mean-reverts toward 50 by 1.2%/ply. After:
  avg end 31, only 9/50 at zero, full 0–100 spread — redemption arcs exist, and
  (emergent bonus) a trusted army resists less and shouts less bad advice, so
  it literally plays better.
- **Spontaneous chaos was a circus** (~2.7 uninvited board-changes/game).
  **Fixed**: breakout/cold-feet/defection share a hard budget of TWO per game.
- **Dialogue repeats ~26%** over ~108 lines/game — widened the dedup ring
  (40→90); residual repeats are pool-size-bound and masked by display dedup.
- **Rope physics** (from playtest): the captor now *leads* the dive (victim
  holds lassoed ~1s, then is yanked down trailing the rope) so the rope points
  at the dragger; and a captured mid-escort captor no longer dives-and-returns
  as a corpse.

### Playtest round 4 (edge graveyard, undo, pinned bubbles, trust that tracks) — shipped

David's notes, all addressed:

- [x] **"The box" is gone → edge graveyard.** No more length-of-the-board charge
      (which read as alarming). A casualty takes a short haul to the nearest free
      slot just OFF the board edge and rests there. The frame reserves an 8%
      gutter all round; 32 perimeter slots; nearest-free-to-death-square,
      re-derived each render so it's undo-stable. No name tags (the full edge is
      in use). Lasso loop on the hauled piece; no directional rope.
- [x] **A full second's beat**: the victim holds on its square (POW/CRUNCH) for
      1000ms after the capturer lands, THEN hauls out (650ms). The board copy
      just fades; a transit corpse in a top layer does the visible haul.
- [x] **Bubbles pinned to the piece** (rendered as a child of its box, like the
      jetpack flame) so they track it and never divorce from the square it left.
      Smaller, and **shrunk further on phones** (≤108px). **One bubble per side**
      at a time (one ally + one enemy max). Authored lines cut to a few words
      throughout. **Pregame smalltalk halts the instant you make your first move.**
- [x] **Capture ring**: a legal move onto an enemy shows a big hollow ring
      hugging the target, distinct from the small "move here" dot.
- [x] **Undo / redo** (buttons under the board): full-game JSON snapshots taken
      before every committed player action; undo peels back your move and the
      enemy's reply, redo re-applies. Restores captured pieces, trust, moods —
      everything. Disabled during the enemy's turn.
- [x] **Trust tracks the game harder + rises faster.** Each ply, morale drifts
      (5%/ply) toward a target set by the running material balance
      (`50 + balance·3.3`, clamped ~6–97) — so a clean winning game floats into
      the 80s on its own instead of inching up per-capture. Capture reward up
      (`+2.5 + val`). Tuned via the soak.

The **tantrum** removal and **no trust-reset** decisions from round 3 stand.

### Playtest round 5 (breakout discipline, undo scope, rope physics, purple/gold) — shipped

- [x] **Breakout only when earned.** No longer fires in the opening: requires
      `ply ≥ 16`, the piece's own side to be **deployed** (≥2 non-pawn pieces off
      the back rank), and — the key ask — that the piece has **complained out
      loud a few times** first. New per-soul `rants` counter bumps each ply it
      voices impatience (reset when it finally moves); breakout needs `rants ≥ 4`.
- [x] **Undo covers chaotic events.** Spontaneous stunts (breakout / cold-feet /
      defect) now snapshot before firing, so the player can take them back — right
      up until they make their own next move, after which reverting means undoing
      that move too (the normal stack behaviour). Enemy stunts revert with the
      move they answered.
- [x] **Rope + wobble physics restored** on the edge haul: the dragged piece
      **tumbles and lurches** (`haulWobble`) on a **taut rope** that points the way
      it's being yanked (`--rope-angle` toward its slot) — the "being pulled" feel
      David liked, now on the short edge drag.
- [x] **Board themed to the app palette.** Green → **muted purple** dark squares
      + **warm gold parchment** light squares; the frame is a deep-purple panel
      with a gold hairline so the gutter has colour; each resting casualty sits on
      a gold-ringed chip so **black pieces no longer vanish** into the dark edge.
- [x] **Tap a speech bubble to dismiss it** (bubbles are now interactive).

### Playtest round 6 (bubble contrast, capture marks, dragging piece, reprimand) — shipped

- [x] **Bubbles recoloured** — dark card + tone-coloured edge (gold/red/blue/…),
      so they pop over the purple/gold board instead of blending into the light
      squares.
- [x] **Capture indicator** is now four **corner triangles** closing on the
      target (the ring looked clunky); colour flips per square so it reads on
      both. **Grave chips** lightened to a soft halo (no hard gold ring) so black
      casualties stay readable at the edge.
- [x] **A dragging piece, not just a dragged one.** The captor stays on the
      square and **heaves** (`heave`) while the victim is hauled off on a **rope
      that points back to it** (`--rope-angle` toward the captor). Plus a real
      **settle beat**: after a capture the enemy waits ~2.6s (drag + ≥1s settle)
      before it can march in and drag the fresh victor off in turn.
- [x] **Reprimand the cheats.** When an enemy piece breaks the rules — a jetpack,
      a disguise slide, or a cold-feet retreat — it pulses gold and its legal
      home square glows; tap it to **march the offender back and resurrect any
      piece it grabbed**. Free (doesn't cost your move), available until you make
      your own next move. The engine can't do this to you — but it's the hook a
      future multiplayer mode would use to let an opponent enforce your pieces'
      rules. (`reprimandMove` in chaos.ts; `cheat` state in game.ts.)

### Playtest round 7 (a real drag, gold graves, jetpack reasons, mobile rings, desktop cog) — shipped

- [x] **The captor actually drags.** It now lunges ~60% of the way toward the
      victim's edge slot (dragging the roped body along), holds at the stretch,
      then hauls itself back to its post (`escortHaul`, offset computed per
      capture in `escortVars`). A visible dragging piece, not a heave in place.
      The post-capture settle also lengthened: the enemy waits ~3s (haul + a full
      second settled) before it can drag the fresh victor off.
- [x] **Grave halo is gold** — on-theme, and black casualties read clearly.
- [x] **Jetpack needs a REASON**, never "just because": the offer only appears if
      the knight is **rescuing the king** (player in check), the team **trusts you
      enough to have grown wings** (trust ≥ 82), or it has been **building up to
      it** (idle ≥ 6 and restless/ranting). Otherwise no jetpack.
- [x] **Target rings render above the pieces** (new `.marks` layer, z-index over
      the piece overlay) — a ring on an occupied square (capture / rage / jetpack
      target) is no longer hidden behind the piece on mobile.
- [x] **Desktop settings moved behind a cog** (a menu), like mobile, so the
      sliders no longer crowd the page. (GameToolbar — applies to every game.)

### Rule-break audit (every stunt must have a reason) + round 8 fixes — shipped

Audit of why each rule-break is allowed to happen:

| Stunt | Reason it's offered/fires |
|---|---|
| Jetpack (knight) | rescue the king (in check), "wings" (trust ≥ 82), or a real build-up (idle & ranting) — **and** a dramatic target (capture/check/escape) |
| Disguise (rook) | rook is **active** (≥ 6 legal moves — a confident flourish) **and** the diagonal target is dramatic |
| **Body swap** | **REWORKED**: never between same types; only when a clearly cheaper piece shields a clearly more valuable one that's hanging (and the cheap one was safe), or the swap gives check |
| Rage-strike | the piece is in its vengeful window with an enemy adjacent |
| Breakout | middlegame (ply ≥ 16), side deployed, and it has ranted ≥ 4× |
| Cold feet | genuinely terrified (fear ≥ 0.6) and under attack |
| Defector | **now** only when team trust has collapsed (< 33) |
| Enemy chaos | never in the opening; only to capture material |
| Pep-talk entourage | king + ≥2 adjacent allies **and** (endgame ≤ 12 pieces, or the king is exposed — in check / enemy on an adjacent square) |
| Timid balk | a cowardly ENEMY piece (bravery < 0.4) about to make a losing capture shrinks back to safety instead — costs its turn, with a line (fixes "captured a guarded piece then trembled") |

Round 8 changes:
- [x] **Body swap gated** to genuine gain (shield an endangered valuable piece, or
      give check) — no more turn-one pawn↔pawn swaps. (`beneficialSwap`.)
- [x] **Defector** only at trust < 33, and it **keeps its black hat for life** —
      identifiable as a turncoat even after it promotes (`defected` flag;
      `accessoryOf` shows the hat persistently).
- [x] **Drag-off reworked**: slower; the captor **walks the body all the way to
      the edge**, lurching with a random-walk wiggle as it pulls, then walks back
      (`escortHaul`, ~2.3s round trip; enemy waits ~4.2s to recapture).
- [x] **Glow dialed down** a touch (grave halo + vengeful/cheated pulses).

### Playtest round 9 (audit follow-ups) — shipped + decisions recorded

- [x] **Disguise** now requires an **active** rook (≥ 6 moves), not a boxed one
      (David's call — flipped the threshold).
- [x] **Rage-strike build-up**: a vengeful piece now **pines for its fallen
      friend** across the turns before it strikes (`pine()` + `mourning` name on
      the soul + PINING lines), so the strike is a story we've been hearing. It
      fires as the once-per-turn follow-up beat (after spontaneous chaos, before
      suggestions), rate-limited.
- [x] **Missed-window taunt**: tapping a cheated enemy after its reprimand window
      has closed now gets a gloat ("Too slow!") instead of nothing.
- [x] **"Captured a guarded piece then trembled" fixed** two ways: (1) a piece
      **never trembles on the ply it just moved/captured onto** (`s.square !==
      lastTo`); (2) a **timid enemy piece balks a losing capture** and retreats to
      safety instead, costing its turn, with a line (`timidBalk`, once/game).
- [x] **Pep-talk entourage** gated to David's ideas 1 & 2 (endgame **or** an
      exposed king).
- [x] **Defector** keeps its black hat for life (confirmed) — set via the
      `defected` flag, shown persistently by `accessoryOf`, survives promotion.

**DECISIONS on record**: swap = shield-a-valuable-piece **or** give-check only;
defector only at trust < 33; disguise needs an active rook; entourage needs
endgame-or-exposed-king; the player may reprimand enemy cheats until their next
move (multiplayer would let the opponent enforce yours). Open: swap "check in an
obvious turn or two" is currently immediate-check only; enemy-side entourage/swap
and defector coax-back still deferred; sound still deferred.

### Self-play soak (`soak.spec.ts`)

Opt-in QA harness — `SOAK=1 npx vitest run src/services/chess/soak.spec.ts`
(skipped in normal runs). Plays full games through the view's real code paths
with per-ply invariant checks (board/society mapping, graveyard, turn flow,
trust bounds) and prints result/plies/stunt/trust distributions. Re-run it after
any balance change.

## Canon survey — what Wizard's Chess actually is (HP books/films)

The magical variant from Harry Potter, for grounding our feature choices:

- **Living pieces, directed like troops.** The chessmen are alive and move on the
  player's spoken command ("Knight to E5") — "a lot like directing troops in
  battle." → we have this (you command; pieces move themselves).
- **Brutal captures.** A captured piece is *smashed / hacked / dragged* off the
  board by the attacker — violent, not a quiet removal. → **we don't do this yet**;
  our captures just fade. A canonical "smash" animation is the biggest missing beat.
- **Distinct personalities + loyalty/distrust.** Pieces have their own temperaments
  and are loyal or suspicious of their player. → core of our social sim.
- **They argue, refuse, and give (sometimes bad) advice.** Harry's new set was
  "very suspicious of his commands, often shouting contradictory advice"; pieces
  "could argue back if they disagreed with an unwise move," and refuse. Trust grows
  as the player proves themselves. → we have refusal + suggestions; **"trust that
  grows over the game," "shouted (sometimes bad) advice," and "coax a reluctant
  piece back" are canonical and worth leaning into.**
- **Old vs. new sets.** Ron's inherited set knew him and obeyed; a new set doesn't
  trust you yet. → a possible "relationship with the whole army" meta-arc.
- **Command notation.** Players use algebraic notation. → our move tracker mirrors this.

Design implications, now shipped: the **coax-a-fled-piece-back** window, the
**grief→rage** beat (vengeance), a persistent **team trust meter** that shifts with
your play and gates how much the pieces argue, **good and bad advice** (bad advice
grows as trust falls), and the **box** (graveyard of the fallen). The remaining big
canonical beat is a real **smash / drag-off capture animation** (right now captures
just fade).

Sources: [HP Wiki — Wizard's Chess](https://harrypotter.fandom.com/wiki/Wizard's_Chess),
[HP Lexicon](https://potterlex.com/wizard_s_chess),
[harrypotter.com fact file](https://www.harrypotter.com/fact-file/objects/wizard-chess-set).

## Vision

The pieces feel alive because they surprise you. **Novelty is the entire asset,
and it is spent every time an effect fires.** A board where everything shakes,
bounces and pulses after two moves has spent it all at once — the effects stop
reading as personality and become visual noise.

So the whole system is governed by one idea: **restraint makes it magic.** Most
pieces, most of the time, are still and quiet. An animation or a line is an
*event* — rare enough that when it happens you look, and specific enough that you
can immediately tell *why that piece* did that *right now*. Personality lives in
the exceptions, not the ambient state.

### Guiding principles

1. **Rare by default.** Stillness is the baseline. Every effect is an exception
   that must earn its moment. Hard caps on how much can happen at once.
2. **Legible proximal cause.** The player must be able to attribute every effect
   to something that just happened, to *that* piece. No ambient/global moods.
3. **Personality over piece-type.** Behavior comes from the individual's traits,
   not the class. Not all pawns are cowards; some are reckless. A timid rook and
   a bold rook behave differently in the same spot.
4. **Never obscure the game.** Piece color/type stays instantly readable through
   any effect. Effects never hide the board state or block input.
5. **Spread in time.** Reactions trail the action; they don't all land on the
   instant of a move, and they don't all land together.
6. **Agency, sparingly.** Pieces occasionally *act* (refuse, suggest, recoil) —
   but each such moment is a treat, never a tax on every move.

### Budgets (tune, but keep them tight)

- **≤ ~2 pieces** visibly animating (mood) at any one time; pick the most
  salient, silence the rest.
- **Most moves produce no message.** Target roughly **1 line every few plies**,
  never a burst; hard cap 1 visible bubble at a time (queue the rest, drop stale).
- **Agency moments** (refusal / self-select / sacrifice recoil): at most one in
  play at a time, and infrequent — a few times per game, not per move.
- Movement animation is the one effect that happens every move (it's functional),
  so it must stay quick and unobtrusive.

---

## Checklist

> Status (commit `a9ec421`): the restraint pass is in. Most items done; a few
> agency refinements deliberately deferred (see notes). Tuning is by-feel and
> ongoing.

### A. Dial back the current heavy-handedness
- [x] Remove ambient/persistent mood animations; nothing animates just because a
      mood scalar is nonzero. *(Animations chosen centrally in `game.animations()`.)*
- [x] Global cap: at most ~2 pieces animating at once (ranked by salience).
- [x] Cut message volume hard: most moves stay silent; ambient banter is spaced +
      probabilistic + one-per-turn.
- [x] Re-tune mood decay so moods return to calm quickly instead of accumulating.

### B. Mood animations — trait-gated + situational
- [x] **Tremble (fear):** under attack AND (cowardly OR hanging); reckless/bold
      pieces never tremble.
- [x] **Bob (anticipation):** only the genuinely restless, and (via the cap) only
      one or two at a time.
- [x] **Anger:** only on a fresh bonded-loss cause; decays within a ply or two.
- [x] **Joy/bounce:** only on a big scalp / promotion, for a beat.

### C. Legibility
- [x] Anger is a red **aura** (drop-shadow), not a glyph recolor — base color stays
      clear.
- [x] Effects keep type + color readable on light and dark squares.

### D. Message pacing & heckles
- [x] Lines arrive on a **delay after the move** and stream one at a time.
- [x] Lower per-event probability so silence is normal.
- [x] **Idle heckle:** a restless piece prods the player if they dawdle
      (rate-limited).

### E. Piece agency / opinions
- [x] **Cowardly refusal:** a timid piece balks (shake) at a dangerous square and
      only goes after ~3 taps; never soft-locks a legal move.
- [x] **Sacrifice complaint:** any piece flinches once (hop) at an outright
      sacrifice, then obeys on the second tap.
- [x] **Self-suggestion:** occasionally a piece pre-selects itself for a strong
      move (reckless pieces get a bolder line).
- [~] **Tactic suggestion:** approximated by "clearly-winning capture"
      (`bestOpportunity`). *Deferred: true fork/gambit detection.*
- [~] **Reckless self-selection of a *dangerous* (not just winning) move.**
      *Deferred: currently only winning captures are volunteered.*
- [x] All agency respects legality; the player's intent always wins in the end.

### F. Movement animation
- [x] Pieces **translate** origin → destination via TransitionGroup FLIP (dedicated
      animated overlay), no more teleporting; captures slide in.
- [x] **Speed by temperament × risk:** bold/reckless dash (~180ms), timid creep
      (~500ms), risky moves ×1.7.
- [~] Tasteful durations. *Deferred: an explicit hesitation pause before a timid
      piece commits (currently just a longer duration).*

### G. Supporting mechanics (enablers)
- [x] Lightweight **move-risk assessment** via `chess.js` attackers (`assess.ts`) —
      no engine round-trip; powers refusal, recoil, suggestion, travel speed.
- [x] **Player-idle timer** driving heckles (reset on interaction).
- [x] Per-piece **interaction state** (refusal tap-count) that resets on move /
      deselect / new game.

### Deferred (nice-to-have, not yet done)
- True fork/tactic detection (beyond winning captures) for smarter suggestions.
- Reckless pieces volunteering *risky* moves, not just winning ones.
- A hesitation beat before a timid piece commits to a scary move.
- **Move-tracker pairing**: spontaneous stunts (defect / cold feet / tantrum) add
  a move-log entry without consuming a turn, so the white/black column pairing
  shifts by one after one occurs. Game logic is unaffected — display only. Fix:
  render chaos/spontaneous plies as their own full-width row instead of pairing.
- Persist character-sheet trait edits across games (currently per-game only).

---

## Non-goals / anti-patterns
- Not a casino: no constant motion, no confetti, no everyone-talking-at-once.
- No effect the player can't explain ("why is that pawn angry?" should never come
  up — there's always a visible reason).
- No effect that hides the board or fights the player's input.

## Calibration knobs (expect to tune by feel)
- Fear/anger thresholds and decay rates; impatience accrual.
- Message probability + min gap between lines; idle-heckle delay.
- Refusal tap-count (2 vs 3); frequency of self-select & suggestion.
- Movement duration range and the temperament/risk → speed mapping.

## Verify
- Extend the Playwright e2e run: after several moves, assert only a bounded number
  of pieces carry an animating mood class, and that banter volume stays capped.
- Add controller unit tests for refusal (tap-count acquiescence), sacrifice
  recoil (one hop then obeys), and move-risk classification.

---

## Settings scalers

Player-facing sliders (persisted to localStorage), each a 0–1 scalar the
controller reads live. They scale the *same* knobs the restraint pass created —
so "off" is genuinely off and "high" is lively without being noise.

- [x] **Chattiness** — scales `speak()` ambient skip-probability and per-side
      gaps. 0 = pieces only speak on captures/mates; 1 = a lively peanut gallery.
- [x] **Animation frequency** — scales the `game.animations()` cap (0 pieces …
      up to ~4). 0 = still board; default surfaces ~2.
- [x] **Hints / piece agency** — scales how often pieces `suggest()` a move and
      how often they `resist()` (refuse / flinch). 0 = pieces never volunteer or
      push back; high = eager, opinionated helpers.
- [x] **Chaos** — scales how often rule-breaking stunts are offered/occur (see
      below). 0 = never; the probability a stunt is offered when eligible.

**Accessibility (pushback, decided):** a *movement-speed* slider isn't worth the
UI. But `prefers-reduced-motion` is a real signal (motion sensitivity), so we
honor it automatically — reduced motion shortens/disables the mood animations and
the travel transition, no user control needed. The Animation slider remains for
taste on top of that.

---

## Chaos (rule-breaking stunts)

Rare, delightful rule-bending. The governing rule: **the player keeps a semblance
of control ~90% of the time.** Most stunts are *offered*, not imposed — a piece
says "Want me to try something crazy?" and a second tap opts in, without spelling
out exactly what it'll do (often it just opens up more options; sometimes it
commits to something wild). A few things simply *happen*, rarely, as flavor. One
or two can happen *to* you.

Each stunt needs **trigger + telegraph + limit**: a reason (desperation or
personality), a clear visual tell so it reads as intentional mischief (hat,
glasses, jetpack flame), and tight rarity. All scaled by the **Chaos** slider
(0 = never).

### Activation types
- **Offered (opt-in):** piece highlights the stunt / extra options; a confirming
  tap commits. The player stays in control. *(disguise rook, jetpack knight,
  body swap, pep-talk entourage)*
- **Spontaneous (flavor):** just happens, ~once or twice a game, low stakes.
  *(cold feet: a scared piece flees an extra square; defector: a disgruntled pawn
  briefly switches sides when you're losing badly)*
- **Imposed (no choice):** rare, only at an extreme. *(tantrum: a max-rage piece
  knocks an adjacent enemy off the board, once per game)*

### Catalog (✅ = shipped)
| Stunt | Type | Trigger | Telegraph | Limit |
|---|---|---|---|---|
| ✅ Disguise rook | Offered | rook boxed in (≤4 legal moves) | dashed purple targets; "Bishop? Never heard of her." | 1×/game |
| ✅ Jetpack knight | Offered | extended leaps available | dashed purple targets; "JETPACK!" | 1×/game |
| ✅ Cold feet | Spontaneous | terrified piece (fear ≥ 0.7) under attack, empty square behind | flees 1 square back on its own | 1×/game |
| Pep-talk entourage | Offered | king has ≥2 adjacent allies | king raises banner; group slides together | rare; **whole entourage moves as one turn** |
| Body swap | Offered | two bonded friends adjacent-ish | "Cover me!" | rare |
| Defector pawn | Spontaneous | losing badly + low-obedience pawn | black hat; changes colour briefly | 1×/game |
| Tantrum | Imposed | a piece at max rage | shove animation | 1×/game |

**Implementation note:** off-book moves are applied in `chaos.ts` by editing the
board and reloading a freshly-built legal FEN (chess.js only knows legal chess),
then the game continues normally. Offers are decided once at selection (situational
gate + `rng() < chaos`), rendered as dashed purple target dots, and committed by
tapping one. Telegraphs for disguise/jetpack are currently the special dots + the
travel slide + a line; dedicated glasses/flame visuals are a later polish.

**Pep-talk detail (per feedback):** the king rallies its adjacent entourage to
**all move together as a single turn** — a small formation shuffle — rather than
just buffing morale. Needs a bespoke multi-piece move that still yields one reply
to the engine.

### Framing — DECIDED: blend (situational + slider)
Stunts only become available in a fitting situation (a boxed-in rook, a knight
with room to leap, a terrified piece), and the **Chaos** slider is the
probability they're offered/occur when eligible. Not ambient-random, not pure
easter eggs, not spent power-ups. This is the trigger model in `game.ts`.
