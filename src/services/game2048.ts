/**
 * 2048 core logic — pure, deterministic, and framework-free so it can be unit
 * tested and driven by a seeded RNG. The view owns tile identity/animation; this
 * module only moves values around a grid.
 */

export const SIZE = 4
export const WIN_VALUE = 2048

export type Direction = 'left' | 'right' | 'up' | 'down'

export interface Tile {
  id: number
  value: number
  row: number
  col: number
  /** Freshly spawned this turn (drives the pop-in animation). */
  isNew?: boolean
  /** Result of a merge this turn (drives the merge pop animation). */
  merged?: boolean
}

export interface MoveResult {
  /** The board after the move: survivors, with merged tiles carrying the new value. */
  tiles: Tile[]
  /** Tiles that merged away, positioned at their merge target so they can slide in. */
  consumed: Tile[]
  /** Points scored this move (sum of every merged tile's new value). */
  gained: number
  /** Whether anything actually moved or merged (an unchanged board is a no-op). */
  moved: boolean
}

const VECTORS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
}

const inBounds = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE

const buildGrid = (tiles: Tile[]): (Tile | null)[][] => {
  const grid: (Tile | null)[][] = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null))
  for (const t of tiles) grid[t.row][t.col] = t
  return grid
}

/**
 * Slide/merge all tiles one step in `dir`. Pure: input tiles are never mutated —
 * the result carries fresh tile objects (same `id`s) so the view can keep DOM
 * nodes stable and let CSS transitions animate the movement.
 */
export function move(tiles: Tile[], dir: Direction): MoveResult {
  const grid = buildGrid(tiles.map((t) => ({ ...t, isNew: false, merged: false })))
  const { dr, dc } = VECTORS[dir]
  // Process tiles nearest the target wall first so they settle before the rest.
  const rowOrder = dr > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]
  const colOrder = dc > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]

  let moved = false
  let gained = 0
  const consumed: Tile[] = []

  for (const r of rowOrder) {
    for (const c of colOrder) {
      const tile = grid[r][c]
      if (!tile) continue

      // Slide to the farthest empty cell in this direction.
      let nr = r
      let nc = c
      while (inBounds(nr + dr, nc + dc) && !grid[nr + dr][nc + dc]) {
        nr += dr
        nc += dc
      }

      // A same-valued tile just beyond that (not already merged this turn) merges.
      const tr = nr + dr
      const tc = nc + dc
      const target = inBounds(tr, tc) ? grid[tr][tc] : null
      if (target && target.value === tile.value && !target.merged) {
        grid[r][c] = null
        target.value *= 2
        target.merged = true
        gained += target.value
        consumed.push({ ...tile, row: target.row, col: target.col })
        moved = true
      } else if (nr !== r || nc !== c) {
        grid[r][c] = null
        grid[nr][nc] = tile
        tile.row = nr
        tile.col = nc
        moved = true
      }
    }
  }

  const survivors: Tile[] = []
  for (const rowCells of grid) for (const t of rowCells) if (t) survivors.push(t)
  return { tiles: survivors, consumed, gained, moved }
}

/** Cells with no tile, in row-major order. */
export function emptyCells(tiles: Tile[]): Array<{ row: number; col: number }> {
  const occupied = new Set(tiles.map((t) => t.row * SIZE + t.col))
  const cells: Array<{ row: number; col: number }> = []
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    if (!occupied.has(i)) cells.push({ row: Math.floor(i / SIZE), col: i % SIZE })
  }
  return cells
}

/**
 * Spawn one tile in a random empty cell — a 2 (90%) or a 4 (10%), classic odds.
 * Returns null when the board is full. `rng` is consumed twice (cell, value).
 */
export function spawn(tiles: Tile[], rng: () => number, id: number): Tile | null {
  const cells = emptyCells(tiles)
  if (cells.length === 0) return null
  const cell = cells[Math.floor(rng() * cells.length)]
  const value = rng() < 0.9 ? 2 : 4
  return { id, value, row: cell.row, col: cell.col, isNew: true }
}

/** True while any legal move (a slide or a merge) remains. */
export function canMove(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return true
  const grid = buildGrid(tiles)
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const v = grid[r][c]!.value
      if (c + 1 < SIZE && grid[r][c + 1]!.value === v) return true
      if (r + 1 < SIZE && grid[r + 1][c]!.value === v) return true
    }
  }
  return false
}

/** True once any tile reaches the win value (the player may keep going after). */
export function hasWon(tiles: Tile[]): boolean {
  return tiles.some((t) => t.value >= WIN_VALUE)
}
