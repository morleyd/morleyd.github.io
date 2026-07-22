/**
 * Hand-authored pixel-art picture library for the Nonogram game.
 *
 * Each pattern is a square grid drawn as text rows so it stays readable and
 * editable here: `#` is a filled cell, any other character (`.`) is empty. The
 * game derives the row/column clues from the grid (see `nonogramFromPattern`),
 * so every pattern is trivially solvable — its own picture is a valid solution.
 *
 * Patterns are grouped by side length so the picker can offer only the ones
 * that fit the current board size. Fully self-contained — no network.
 */
import type { NonogramPattern } from './nonogram'
import { rngFromSeed } from './seed'

/** 5×5 pictures — bold, single-glance shapes. */
const P5: NonogramPattern[] = [
  {
    id: 'heart5',
    name: 'Heart',
    size: 5,
    rows: [
      '.#.#.',
      '#####',
      '#####',
      '.###.',
      '..#..',
    ],
  },
  {
    id: 'diamond5',
    name: 'Diamond',
    size: 5,
    rows: [
      '..#..',
      '.###.',
      '#####',
      '.###.',
      '..#..',
    ],
  },
  {
    id: 'plus5',
    name: 'Plus',
    size: 5,
    rows: [
      '..#..',
      '..#..',
      '#####',
      '..#..',
      '..#..',
    ],
  },
  {
    id: 'x5',
    name: 'Cross X',
    size: 5,
    rows: [
      '#...#',
      '.#.#.',
      '..#..',
      '.#.#.',
      '#...#',
    ],
  },
]

/** 10×10 pictures. */
const P10: NonogramPattern[] = [
  {
    id: 'heart10',
    name: 'Heart',
    size: 10,
    rows: [
      '..........',
      '.##....##.',
      '##########',
      '##########',
      '##########',
      '.########.',
      '..######..',
      '...####...',
      '....##....',
      '..........',
    ],
  },
  {
    id: 'invader10',
    name: 'Space Invader',
    size: 10,
    rows: [
      '..........',
      '..#....#..',
      '...#..#...',
      '..######..',
      '.##.##.##.',
      '##########',
      '#.######.#',
      '#.#....#.#',
      '...#..#...',
      '..#....#..',
    ],
  },
  {
    id: 'plus10',
    name: 'Plus',
    size: 10,
    rows: [
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '##########',
      '##########',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
    ],
  },
  {
    id: 'smiley10',
    name: 'Smiley',
    size: 10,
    rows: [
      '..######..',
      '.########.',
      '###.##.###',
      '###.##.###',
      '##########',
      '##########',
      '#.######.#',
      '##.####.##',
      '.########.',
      '..######..',
    ],
  },
  {
    id: 'note10',
    name: 'Music Note',
    size: 10,
    rows: [
      '...######.',
      '...#....#.',
      '...#....#.',
      '...#....#.',
      '...#....#.',
      '.###..###.',
      '####..####',
      '.##....##.',
      '..........',
      '..........',
    ],
  },
]

/** 15×15 pictures. */
const P15: NonogramPattern[] = [
  {
    id: 'heart15',
    name: 'Heart',
    size: 15,
    rows: [
      '...............',
      '..###.....###..',
      '.#####...#####.',
      '.#############.',
      '.#############.',
      '.#############.',
      '.#############.',
      '..###########..',
      '...#########...',
      '....#######....',
      '.....#####.....',
      '......###......',
      '.......#.......',
      '...............',
      '...............',
    ],
  },
  {
    id: 'diamond15',
    name: 'Diamond',
    size: 15,
    rows: [
      '.......#.......',
      '......###......',
      '.....#####.....',
      '....#######....',
      '...#########...',
      '..###########..',
      '.#############.',
      '###############',
      '.#############.',
      '..###########..',
      '...#########...',
      '....#######....',
      '.....#####.....',
      '......###......',
      '.......#.......',
    ],
  },
  {
    id: 'mushroom15',
    name: 'Mushroom',
    size: 15,
    rows: [
      '...............',
      '....#######....',
      '..###########..',
      '.#############.',
      '###############',
      '###############',
      '.#############.',
      '..###########..',
      '.....#####.....',
      '.....#####.....',
      '.....#####.....',
      '.....#####.....',
      '....#######....',
      '....#######....',
      '...............',
    ],
  },
  {
    id: 'invader15',
    name: 'Space Invader',
    size: 15,
    rows: [
      '...............',
      '...............',
      '...............',
      '....#.....#....',
      '.....#...#.....',
      '....#######....',
      '...##.###.##...',
      '..###########..',
      '..#.#######.#..',
      '..#.#.....#.#..',
      '.....##.##.....',
      '...............',
      '...............',
      '...............',
      '...............',
    ],
  },
]

/** All bundled pictures, across every supported board size. */
export const NONOGRAM_PATTERNS: NonogramPattern[] = [...P5, ...P10, ...P15]

/** Pictures that fit a given square board size. */
export const patternsForSize = (size: number): NonogramPattern[] =>
  NONOGRAM_PATTERNS.filter((p) => p.size === size)

/** Look up a picture by its id (optionally constrained to a board size). */
export const patternById = (id: string, size?: number): NonogramPattern | undefined =>
  NONOGRAM_PATTERNS.find((p) => p.id === id && (size === undefined || p.size === size))

/**
 * Deterministically pick one picture that fits `size`, chosen by `seed`. Used
 * for the default / "Random" puzzle so it is always a recognisable picture (not
 * random noise) while staying shareable — the same seed reproduces the same one.
 */
export const randomPatternForSize = (
  size: number,
  seed: string,
): NonogramPattern | undefined => {
  const options = patternsForSize(size)
  if (!options.length) return undefined
  const i = Math.floor(rngFromSeed(`nono-pick:${size}:${seed}`)() * options.length)
  return options[Math.min(i, options.length - 1)]
}
