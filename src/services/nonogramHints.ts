/**
 * Nonogram hint engine — pure, deterministic, and built to TEACH, not just to
 * point. Given the player's marks and the puzzle it finds the single most
 * instructive next step, names the technique behind it, and explains the
 * reasoning with the line's real clue numbers (and, where it helps, a little
 * far-ends packing diagram, oriented to the row or column) so the player can spot it
 * themselves. The view reveals it in three steps:
 *
 *   L1 `nudge`  — which line to look at and which idea applies (no square).
 *   L2 `lesson` — the worked reasoning + `packing` diagram, enough to find the
 *                 square yourself.
 *   L3 `reveal` — the exact square and what to do; the view applies it.
 *
 * Techniques, surfaced by how satisfying/teachable they are (fills first):
 *   complete — the clue exactly fills the line; there's only one arrangement.
 *   overlap  — a run long enough that it covers some squares no matter how it
 *              slides (the far-left ∩ far-right trick).
 *   cap      — a completed run must have a blank on each side.
 *   reach    — a square no run can cover in any arrangement, so it's blank.
 *   mistake  — a filled/emptied square that can't match the picture (shown first).
 *   crossref — no single line moves, but a "what-if" probe on one square dead-ends,
 *              so its value is forced by the row and column together (teaches the
 *              probing technique and points at the most unblocking square).
 *   reveal   — last resort: even a probe can't settle a square, so reveal one true
 *              square (the most unblocking one) to restart progress.
 */

import { forcedCells, type Cell, type Nonogram } from './nonogram'

export type HintKind = 'mistake' | 'complete' | 'overlap' | 'cap' | 'reach' | 'crossref' | 'reveal'

export interface Hint {
  /** Row-major index of the square the hint is about. */
  cell: number
  /** The row or column to spotlight (from L1), as cell indices. */
  region: number[]
  /** Which technique this is. */
  kind: HintKind
  /** Mark to set at `cell` on the final reveal: 0 clear · 1 fill · 2 X. */
  apply: Cell
  /** L1 — where to look and which idea, no square or value given away. */
  nudge: string
  /** L2 — the reasoning that lets the player find the square themselves. */
  lesson: string
  /** L2 — optional monospace diagram (far-ends packings; horizontal for a row,
   *  a vertical transpose for a column so it matches the board). */
  packing: string[]
  /** L3 — the exact square and what to do with it. */
  reveal: string
}

type State = -1 | 0 | 1 // solver view: unknown · known-empty · known-filled

/** A row or column: its cell indices, clue, and display label (`row 3`). */
interface LineRef {
  idxs: number[]
  clue: number[]
  label: string
}

const toRuns = (clue: number[]): number[] => (clue.length === 1 && clue[0] === 0 ? [] : clue)
const minSpan = (runs: number[]): number =>
  runs.reduce((a, b) => a + b, 0) + Math.max(0, runs.length - 1)

/**
 * The left-most valid arrangement of `runs` given the line's known cells, as the
 * start index of each run — or null if none fits. DFS placing each run at the
 * earliest feasible spot: run cells can't sit on a known-empty, the square after
 * a run must be a gap, and no known-filled square may be left uncovered.
 */
function leftmostStarts(state: State[], runs: number[]): number[] | null {
  const n = state.length
  const starts: number[] = []
  const dfs = (pos: number, ci: number): boolean => {
    if (ci === runs.length) {
      for (let k = pos; k < n; k += 1) if (state[k] === 1) return false // uncovered fill
      return true
    }
    const len = runs[ci]
    for (let start = pos; start + len <= n; start += 1) {
      let fits = true
      for (let k = start; k < start + len; k += 1) if (state[k] === 0) fits = false
      if (fits && start + len < n && state[start + len] === 1) fits = false // no gap after run
      let skippedFill = false
      for (let k = pos; k < start; k += 1) if (state[k] === 1) skippedFill = true
      if (fits && !skippedFill) {
        starts[ci] = start
        if (dfs(start + len + 1, ci + 1)) return true
      }
      if (state[start] === 1) break // can't slide past a known fill
    }
    return false
  }
  return dfs(0, 0) ? starts.slice() : null
}

const fillFromStarts = (starts: number[], runs: number[], n: number): boolean[] => {
  const fill = new Array(n).fill(false)
  starts.forEach((s, i) => {
    for (let k = s; k < s + runs[i]; k += 1) fill[k] = true
  })
  return fill
}

const leftmostFill = (state: State[], runs: number[]): boolean[] | null => {
  const s = leftmostStarts(state, runs)
  return s && fillFromStarts(s, runs, state.length)
}

const rightmostFill = (state: State[], runs: number[]): boolean[] | null => {
  const s = leftmostStarts([...state].reverse(), [...runs].reverse())
  return s && fillFromStarts(s, [...runs].reverse(), state.length).reverse()
}

const glyph = (f: boolean): string => (f ? '█' : '·')

/**
 * Render the far-ends packing arrangements as a monospace diagram oriented like
 * the board: horizontal strips for a row, and a vertical transpose for a column
 * so its runs read top→bottom — matching the highlighted column — instead of
 * being rotated onto a misleading left→right strip. Each column arrangement gets
 * a centred header and one glyph per cell down the line.
 */
function packingDiagram(
  vertical: boolean,
  arrangements: { label: string; fill: boolean[] }[],
): string[] {
  if (!arrangements.length) return []
  if (!vertical) return arrangements.map((a) => `${a.label.padEnd(12)}${a.fill.map(glyph).join('')}`)
  const n = arrangements[0].fill.length
  const w = Math.max(...arrangements.map((a) => a.label.length))
  const center = (s: string): string => {
    const gap = w - s.length
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + s + ' '.repeat(gap - left)
  }
  const lines = [arrangements.map((a) => center(a.label)).join('  ')]
  for (let k = 0; k < n; k += 1) lines.push(arrangements.map((a) => center(glyph(a.fill[k]))).join('  '))
  return lines
}

/** Priority of each technique — higher is surfaced first (fills before X's). */
const SCORE: Record<Exclude<HintKind, 'mistake' | 'crossref' | 'reveal'>, number> = {
  complete: 6,
  overlap: 5,
  cap: 3,
  reach: 2,
}

export function findHint(marks: readonly number[], puzzle: Nonogram): Hint | null {
  const { rows, cols, solution, rowClues, colClues } = puzzle
  const rowIdx = (r: number): number[] => Array.from({ length: cols }, (_, c) => r * cols + c)
  const colIdx = (c: number): number[] => Array.from({ length: rows }, (_, r) => r * cols + c)
  const cellsOf = (idxs: number[]): Cell[] => idxs.map((i) => (marks[i] ?? 0) as Cell)

  // 1) Mistakes first — an error blocks all correct progress. Prefer to spotlight
  // a line the mark makes provably impossible (a real lesson); fall back to the
  // picture when the slip is only wrong globally.
  for (let i = 0; i < marks.length; i += 1) {
    const wrongFill = marks[i] === 1 && !solution[i]
    const wrongCross = marks[i] === 2 && solution[i]
    if (!wrongFill && !wrongCross) continue
    const r = Math.floor(i / cols)
    const c = i % cols
    const rowBroken = !forcedCells(cellsOf(rowIdx(r)), rowClues[r])
    const colBroken = !forcedCells(cellsOf(colIdx(c)), colClues[c])
    const spot = rowBroken ? rowIdx(r) : colBroken ? colIdx(c) : rowIdx(r)
    const label = rowBroken ? `row ${r + 1}` : colBroken ? `column ${c + 1}` : `row ${r + 1}`
    const provable = rowBroken || colBroken
    return {
      cell: i,
      region: spot,
      kind: 'mistake',
      apply: 0,
      nudge: provable
        ? `${cap(label)} can't be completed as it stands — there's a slip on it.`
        : `A square in row ${r + 1} doesn't match the finished picture.`,
      lesson: provable
        ? `Line up ${label}'s filled squares and X-marks against its clue (${clueText(rowBroken ? rowClues[r] : colClues[c])}). There's no way to arrange the runs that fits what's marked, so one mark is wrong.`
        : `Every square is forced by the clues, and this one is set the opposite way to the solved picture. Clearing it and re-deducing is the way back.`,
      packing: [],
      reveal: wrongFill
        ? 'This square is empty in the solution — clear it.'
        : 'This square is filled in the solution — clear the X.',
    }
  }

  // 2) The most teachable forced square anywhere on the board.
  const lines = [
    ...rowClues.map((clue, r) => ({ idxs: rowIdx(r), clue, label: `row ${r + 1}` })),
    ...colClues.map((clue, c) => ({ idxs: colIdx(c), clue, label: `column ${c + 1}` })),
  ]
  let best: Hint | null = null
  let bestScore = 0
  for (const { idxs, clue, label } of lines) {
    const cells = cellsOf(idxs)
    const forced = forcedCells(cells, clue)
    if (!forced) continue // inconsistent — but any real slip was handled above
    const runs = toRuns(clue)
    const state = cells.map((c) => (c === 1 ? 1 : c === 2 ? 0 : -1)) as State[]
    const lf = leftmostFill(state, runs)
    const rf = rightmostFill(state, runs)
    const whole = runs.length > 0 && minSpan(runs) === idxs.length

    for (let k = 0; k < idxs.length; k += 1) {
      if (cells[k] !== 0) continue
      const doFill = forced.fill[k]
      if (!doFill && !forced.empty[k]) continue

      let kind: Exclude<HintKind, 'mistake' | 'crossref' | 'reveal'>
      if (doFill) kind = whole ? 'complete' : 'overlap'
      else if ((k > 0 && cells[k - 1] === 1) || (k < idxs.length - 1 && cells[k + 1] === 1)) kind = 'cap'
      else kind = 'reach'
      if (SCORE[kind] <= bestScore) continue

      best = buildForcedHint(kind, idxs, k, clue, runs, forced.fill, lf, rf, label)
      bestScore = SCORE[kind]
    }
  }
  if (best) return best

  // 3) Single-line solving has stalled — no unpainted square is forced by any one
  // line on its own. Teach the cross-referencing (probe) step: try each square
  // both ways and propagate along the lines it touches; the value that dead-ends
  // some line is impossible, so the other is forced. Among all squares a probe
  // settles, surface the one whose correct value then unblocks the MOST further
  // line-solving — the keystone — so the hint points at a square that matters, not
  // whichever comes first top-left.
  const base: State[] = marks.map((m) => (m === 1 ? 1 : m === 2 ? 0 : -1)) as State[]
  const withCell = (i: number, v: State): State[] => {
    const b = base.slice()
    b[i] = v
    return b
  }
  let probe: { i: number; apply: Cell; unlock: number; dead: LineRef } | null = null
  let reveal: { i: number; apply: Cell; unlock: number } | null = null
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] !== -1) continue
    const fillRes = propagateBoard(withCell(i, 1), lines)
    const emptyRes = propagateBoard(withCell(i, 0), lines)
    // Any real slip was caught in step 1, so `base` agrees with the solution and
    // the true value never dead-ends — track the most unblocking true square as a
    // last resort for genuinely deep puzzles no single probe can crack.
    const correct = solution[i] ? fillRes : emptyRes
    if (!reveal || correct.decided > reveal.unlock) {
      reveal = { i, apply: solution[i] ? 1 : 2, unlock: correct.decided }
    }
    // Provably settled by the probe when exactly one assignment dead-ends. Keep
    // the survivor with the largest downstream unlock.
    if (fillRes.dead && !emptyRes.dead) {
      if (!probe || emptyRes.decided > probe.unlock)
        probe = { i, apply: 2, unlock: emptyRes.decided, dead: fillRes.dead }
    } else if (emptyRes.dead && !fillRes.dead) {
      if (!probe || fillRes.decided > probe.unlock)
        probe = { i, apply: 1, unlock: fillRes.decided, dead: emptyRes.dead }
    }
  }
  if (probe) return buildProbeHint(probe, base, lines, cols)
  if (reveal) return buildRevealHint(reveal, base, lines, cols)
  return null
}

/** Whole-board single-line propagation to a fixpoint from a seeded state grid,
 * used by the cross-referencing probe. Applies each line's forced fills/empties
 * (via `forcedCells`) round-robin until nothing new is decided. Returns how many
 * unknown cells it settled and, if a line ran out of room, that dead line. */
function propagateBoard(board: State[], lines: LineRef[]): { decided: number; dead: LineRef | null } {
  let decided = 0
  for (;;) {
    let changed = false
    for (const line of lines) {
      const forced = forcedCells(cellsFromState(board, line.idxs), line.clue)
      if (!forced) return { decided, dead: line }
      for (let k = 0; k < line.idxs.length; k += 1) {
        const gi = line.idxs[k]
        if (board[gi] !== -1) continue
        if (forced.fill[k]) {
          board[gi] = 1
          decided += 1
          changed = true
        } else if (forced.empty[k]) {
          board[gi] = 0
          decided += 1
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return { decided, dead: null }
}

/** Read a line out of the solver's state grid as painted cells for `forcedCells`
 * (known-filled → filled, known-empty → X, unknown → blank). */
const cellsFromState = (board: State[], idxs: number[]): Cell[] =>
  idxs.map((i) => (board[i] === 1 ? 1 : board[i] === 0 ? 2 : 0)) as Cell[]

/** Which crossing line (the square's own row or column) a placement immediately
 * opens up, and by how much — the line the player should watch "unlock". */
function beneficiary(base: State[], i: number, v: State, lines: LineRef[], cols: number): LineRef {
  const placed = base.slice()
  placed[i] = v
  const rows = base.length / cols
  const rowLine = lines[Math.floor(i / cols)] // `lines` is rows first, then columns
  const colLine = lines[rows + (i % cols)]
  const gained = (line: LineRef): number => {
    const forced = forcedCells(cellsFromState(placed, line.idxs), line.clue)
    if (!forced) return 0
    let n = 0
    for (let k = 0; k < line.idxs.length; k += 1) {
      if (placed[line.idxs[k]] === -1 && (forced.fill[k] || forced.empty[k])) n += 1
    }
    return n
  }
  return gained(colLine) > gained(rowLine) ? colLine : rowLine
}

function buildProbeHint(
  p: { i: number; apply: Cell; unlock: number; dead: LineRef },
  base: State[],
  lines: LineRef[],
  cols: number,
): Hint {
  const r = Math.floor(p.i / cols)
  const c = (p.i % cols) + 1
  const forcedEmpty = p.apply === 2
  const wrong = forcedEmpty ? 'filled' : 'empty'
  const right = forcedEmpty ? 'empty' : 'filled'
  const ben = beneficiary(base, p.i, forcedEmpty ? 0 : 1, lines, cols)
  const plural = p.unlock === 1 ? '' : 's'
  const unlocks =
    p.unlock > 0
      ? ` And it pays off: placing it lets single-line solving settle ${p.unlock} more square${plural}.`
      : ''
  return {
    cell: p.i,
    region: ben.idxs,
    kind: 'crossref',
    apply: p.apply,
    nudge: `No row or column can move on its own now — this is a cross-referencing step. Watch ${ben.label}: one of its squares can be pinned down by testing a "what-if" against the lines that cross it.`,
    lesson: `The probing trick, for when every line stalls: take the square at row ${r + 1}, column ${c}, pencil it in as ${wrong}, and follow the knock-on fills and X's along the lines it touches. It snowballs into a contradiction — ${cap(p.dead.label)} is left with no room for its clue (${clueText(p.dead.clue)}). Since ${wrong} is impossible, the square must be ${right}.${unlocks}`,
    packing: [],
    reveal: forcedEmpty
      ? `So this square is empty — mark it with an X, then re-scan ${ben.label}.`
      : `So this square is filled — fill it in, then re-scan ${ben.label}.`,
  }
}

function buildRevealHint(
  reveal: { i: number; apply: Cell; unlock: number },
  base: State[],
  lines: LineRef[],
  cols: number,
): Hint {
  const r = Math.floor(reveal.i / cols)
  const c = (reveal.i % cols) + 1
  const filled = reveal.apply === 1
  const ben = beneficiary(base, reveal.i, filled ? 1 : 0, lines, cols)
  const plural = reveal.unlock === 1 ? '' : 's'
  const opens =
    reveal.unlock > 0
      ? ` Placing it reopens ${reveal.unlock} square${plural} of ordinary line-solving, so try to spot how it lets ${ben.label} and its crossing lines advance again.`
      : ` Place it, then look for how it lets ${ben.label} and its crossing lines start moving again.`
  return {
    cell: reveal.i,
    region: ben.idxs,
    kind: 'reveal',
    apply: reveal.apply,
    nudge: `This is a genuinely hard spot — no single line moves, and no one "what-if" settles a square outright either. Deep puzzles like this need weighing two or three lines at once. Watch ${ben.label} for the way forward.`,
    lesson: `To keep you moving, here's one square that's true in the finished picture — at row ${r + 1}, column ${c}.${opens}`,
    packing: [],
    reveal: filled
      ? `In the solution this square is filled — fill it in.`
      : `In the solution this square is empty — mark it with an X.`,
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const clueText = (clue: number[]): string => (clue.length === 1 && clue[0] === 0 ? '0' : clue.join(' '))

function buildForcedHint(
  kind: Exclude<HintKind, 'mistake' | 'crossref' | 'reveal'>,
  idxs: number[],
  k: number,
  clue: number[],
  runs: number[],
  forcedFill: boolean[],
  lf: boolean[] | null,
  rf: boolean[] | null,
  label: string,
): Hint {
  const cell = idxs[k]
  const region = idxs
  const clueStr = clueText(clue)
  // Orient the wording and the diagram to the line: a run in a row slides
  // left↔right, a run in a column slides top↔bottom.
  const col = label.startsWith('column')
  const nearLabel = col ? 'top' : 'far-left'
  const farLabel = col ? 'bottom' : 'far-right'
  const both =
    lf && rf
      ? packingDiagram(col, [
          { label: nearLabel, fill: lf },
          { label: farLabel, fill: rf },
          { label: 'overlap', fill: forcedFill },
        ])
      : []

  if (kind === 'complete') {
    return {
      cell,
      region,
      kind,
      apply: 1,
      nudge: `${cap(label)} is fully pinned down — its clue (${clueStr}) only fits one way in ${idxs.length} squares.`,
      lesson: `Add the runs plus the single gaps they need between them: ${runs.join(' + ')}${runs.length > 1 ? ` + ${runs.length - 1} gap${runs.length > 2 ? 's' : ''}` : ''} = ${idxs.length}, exactly the length. With no slack there's only one arrangement, so every square in the line is decided.`,
      packing: lf ? packingDiagram(col, [{ label: 'the one fit', fill: lf }]) : [],
      reveal: 'This square is filled in that one arrangement — fill it in.',
    }
  }
  if (kind === 'overlap') {
    return {
      cell,
      region,
      kind,
      apply: 1,
      nudge: `Look at ${label}. A run in its clue (${clueStr}) is long enough to overlap itself — some squares stay filled however it slides.`,
      lesson: `Push the runs as ${col ? 'high up the column as they go, then as low' : "far left as they'll go, then as far right"}. Any square filled in BOTH extremes is locked in no matter what happens between. Compare the two, and take the overlap:`,
      packing: both,
      reveal: `This square is filled in both the ${nearLabel} and ${farLabel} fit — fill it in.`,
    }
  }
  if (kind === 'cap') {
    return {
      cell,
      region,
      kind,
      apply: 2,
      nudge: `${cap(label)} has a filled run ending right beside this square.`,
      lesson: `A run is exactly as long as its clue says — no longer. The filled run next to this square is already the length it needs, so it can't reach in here; a completed run always has a blank capping each end.`,
      packing: [],
      reveal: 'This square must be empty — mark it with an X.',
    }
  }
  // reach
  return {
    cell,
    region,
    kind,
    apply: 2,
    nudge: `In ${label}, no run can reach this square.`,
    lesson: `Try fitting the clue (${clueStr}) every which way — ${col ? 'hard to the top, hard to the bottom' : 'hard left, hard right'}, everywhere between. This square comes up blank in all of them, so nothing can ever fill it:`,
    packing:
      lf && rf
        ? packingDiagram(col, [
            { label: nearLabel, fill: lf },
            { label: farLabel, fill: rf },
          ])
        : [],
    reveal: 'This square must be empty — mark it with an X.',
  }
}
