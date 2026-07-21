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

## Arcade concepts to explore

Fast, one-more-go arcade games (the kind that are satisfying to replay), sketched
from games David enjoyed:

- **Ninja wall-jump** — climb upward between two walls, kicking side to side;
  avoid spikes. A **long press jumps higher** than a tap. Endless vertical climb,
  score = height.
- **Ball bounce** — bounce a ball up a tower of ascending platforms; timing/aim
  based, don't fall.
- **Vertical tunnel flapper** — fly upward through a narrowing tunnel; tap the
  **left or right side** to flap in that direction, no tap = fall. Avoid the
  walls. (Flappy-Bird-like but vertical and two-sided.)
- **Mini golf** — aim-and-power putting across a series of holes with obstacles;
  par per hole, seedable courses.
- **Color-from-memory** — shown a target color briefly, then recreate it from
  memory with RGB/HSL sliders; scored by perceptual distance to the target.
- **Count-the-blocks memory** — Tetris-like shapes slide across the screen; after
  they pass, recall **how many** there were (or how many of a given type). Speed
  and count ramp up.

## Other candidates

- **Connections** — sort 16 words into 4 hidden groups, auto-generated from the
  existing word lists so it never runs out.
- **Spelling Bee** — make as many words as possible from 7 letters (one required),
  reusing the word lists.
- **Letter Boxed** — chain words around a square of 12 letters.

## Known follow-ups on shipped games

- **Nonogram** generation is random-fill (~55%), so puzzles can be ambiguous and
  aren't curated pictures. Improve with a real nonogram solver (for uniqueness)
  and/or a library of hand-designed picture bitmaps.
