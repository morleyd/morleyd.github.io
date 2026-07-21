# Minigames backlog

The games section is built on an **unlimited-play, no-lockout** model: every
game is seedable and/or endlessly replayable — no daily cap. This file tracks
ideas we've discussed but not yet built, so they aren't lost.

Each new game follows the same shape as the existing ones:

- Pure, unit-tested logic in `src/services/<game>.ts` (`<game>.spec.ts`).
- A `src/views/<Game>View.vue` using the shared `GameToolbar` and, for boards,
  `useSquareFit` + a URL seed via `src/services/seed.ts`.
- A route in `src/router/index.js` (`meta: { gamePage: true, lockScroll: true }`)
  and a card in `src/views/GamesView.vue`.

## Shortlisted (discussed, not yet built)

_None outstanding from the first round — 2048, Tetris, Sudoku, Nonogram, Tango,
Nerdle, Memory/Simon, and Connect 4 all shipped. New ideas below._

## Arcade concepts — all built ✅

These were David's own ideas from games he enjoyed. All six shipped:

- **Ninja wall-jump** → **Ninja Climb** (`/ninja-climb`) — hold to charge, longer =
  higher; spikes + rising lava.
- **Ball bounce** → **Ball Bounce** (`/ball-bounce`) — doodle-jump auto-bouncer,
  steer with screen wrap.
- **Vertical tunnel flapper** → **Vertical Tunnel** (`/tunnel`) — tap left/right to
  flap that way; narrowing course.
- **Mini golf** → **Mini Golf** (`/mini-golf`) — 9 seeded holes, pull-back-to-putt.
- **Color-from-memory** → **Color from Memory** (`/color-memory`) — recreate a
  flashed color; perceptual scoring.
- **Count-the-blocks memory** → **Count the Blocks** (`/count-blocks`) — tally the
  shapes that streamed past; levels up.

## Other candidates (not yet built)

- **Connections** — sort 16 words into 4 hidden groups, auto-generated from the
  existing word lists so it never runs out.
- **Spelling Bee** — make as many words as possible from 7 letters (one required),
  reusing the word lists.
- **Letter Boxed** — chain words around a square of 12 letters.

## Known follow-ups on shipped games

- **Nonogram** generation is random-fill (~55%), so puzzles can be ambiguous and
  aren't curated pictures. Improve with a real nonogram solver (for uniqueness)
  and/or a library of hand-designed picture bitmaps.
- **Mini Golf** hole layouts are random walls with no solvability check, so a rare
  combination could be very hard or effectively blocked (and there's no skip). Add
  a pathfinding/solvability check or curated layouts.
