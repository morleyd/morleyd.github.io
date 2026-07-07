# Wizard Chess — Character & Animation Design

> Working design doc for the "living pieces" layer. Source of truth for the
> personality/animation vision and the punch-list of changes. Lives on the
> `wizard-chess` branch.

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
