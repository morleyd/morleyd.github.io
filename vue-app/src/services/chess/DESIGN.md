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

### A. Dial back the current heavy-handedness
- [ ] Remove ambient/persistent mood animations; nothing animates just because a
      mood scalar is nonzero.
- [ ] Global cap: at most ~2 pieces animating at once (rank by salience).
- [ ] Cut message volume hard: most moves stay silent; add a global rate limit so
      banter can't burst.
- [ ] Re-tune mood decay so moods return to calm quickly instead of accumulating.

### B. Mood animations — trait-gated + situational
- [ ] **Tremble (fear):** only when a piece is *actually under attack this turn*
      AND (it's **cowardly** — low bravery — OR it's **hanging** i.e. attacked and
      inadequately defended / would be lost for nothing). Reckless & brave pieces
      do **not** tremble under attack.
- [ ] **Bob (anticipation):** only **one or two** pieces at a time, and only the
      genuinely restless (high impatience trait + idled a while). Not a whole rank
      of bobbing pawns.
- [ ] **Anger:** fires only on a **legitimate proximal cause** — a bonded ally was
      just captured, or a direct grudge/threat this ply — and **fades after a ply
      or two**. No standing anger.
- [ ] **Joy/bounce:** reserve for real highs (just promoted, just won a big
      exchange) and only for a beat, then stop.

### C. Legibility
- [ ] Anger must **not recolor the glyph**. White pieces stay white, black stay
      black; express anger as a red aura/glow/outline around the piece so its base
      color is unmistakable through the pulse.
- [ ] Verify all effects keep type + color readable (light and dark squares).

### D. Message pacing & heckles
- [ ] Lines arrive on a **delay after the move** (not on the same frame), and
      stagger when more than one is due.
- [ ] Lower per-event probability so silence is normal and a line feels earned.
- [ ] **Idle heckle:** if the *player* takes too long on their turn, an impatient
      piece occasionally prods them ("We don't have all day…"). Rate-limited; only
      from a piece with the temperament for it.

### E. Piece agency / opinions
- [ ] **Cowardly refusal:** when the player targets a **dangerous** square for a
      **timid** piece (moving into attack / hanging), the piece refuses the first
      tap or two — snaps back with a complaint — and only goes on the ~3rd tap.
      Resets per move; never permanently blocks a legal move.
- [ ] **Reckless self-selection:** a reckless piece (e.g. a bold queen) will
      occasionally **select itself** for a flashy/dangerous move, offering it up.
- [ ] **Tactic suggestion:** when a genuinely strong move exists (fork, winning
      capture, sound gambit), the piece involved may **select itself / highlight**
      to suggest it. (Detect via engine eval or a light static check.)
- [ ] **Sacrifice complaint:** if the player sends a piece into a losing capture,
      it **complains and hops back once**, then obeys on the second confirm.
- [ ] All agency respects legality and never soft-locks: after the allowed
      resistance, the player's intent always wins.

### F. Movement animation
- [ ] On move commit, **translate the piece** from origin → destination (currently
      it teleports).
- [ ] **Speed by temperament × risk:** brave/reckless → quick confident dash;
      cowardly piece and/or risky move → slow, reluctant creep (maybe a small
      hesitation before it commits).
- [ ] Keep durations tasteful (~150–600ms); never so slow it feels laggy. Applies
      to captures too (attacker slides in).

### G. Supporting mechanics (enablers for the above)
- [ ] Lightweight **move-risk assessment** (is the destination attacked by a
      lesser/undefended piece? net material after the obvious recapture?) — reused
      by refusal, sacrifice recoil, and tactic suggestion. Prefer a fast static
      check via `chess.js` attackers; escalate to an engine eval only if needed.
- [ ] **Player-idle timer** to drive heckles (reset on interaction).
- [ ] Per-piece **interaction state** (e.g. refusal tap-count for the current
      target) that resets cleanly on move / deselect / new game.

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
