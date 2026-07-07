# Wizard Chess — Character & Animation Design

> Working design doc for the "living pieces" layer. Source of truth for the
> personality/animation vision and the punch-list of changes. Lives on the
> `wizard-chess` branch.

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
