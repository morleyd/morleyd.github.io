/**
 * Nerdle engine — a Wordle for arithmetic. The hidden answer is a valid
 * equation of fixed width (default 8) using digits 0-9 and + - * / =, e.g.
 * "9*8=72". Guesses are scored per tile as correct / present / absent, with the
 * same duplicate-aware counting Wordle uses.
 */

import { rngFromSeed } from './seed'

export const WIDTH = 8
export const MAX_GUESSES = 6

export type TileStatus = 'correct' | 'present' | 'absent'
export const OPERATORS = ['+', '-', '*', '/'] as const
export const KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '*', '/', '='] as const

/**
 * Evaluate the left side of an equation string with correct operator
 * precedence (× and ÷ before + and −); null if malformed. Hand-rolled rather
 * than eval'd, so there's no code execution on user input.
 */
function evalExpr(expr: string): number | null {
  if (!/^[0-9+\-*/]+$/.test(expr)) return null
  if (/[+\-*/]{2,}/.test(expr)) return null // no consecutive operators
  if (/^[+\-*/]/.test(expr) || /[+\-*/]$/.test(expr)) return null // no leading/trailing op
  // Disallow multi-digit numbers with a leading zero (e.g. "08"), matching Nerdle.
  if (/(^|[+\-*/])0\d/.test(expr)) return null

  const tokens = expr.match(/\d+|[+\-*/]/g)
  if (!tokens || tokens.length % 2 === 0) return null

  // First pass: fold * and / into a list of terms joined by + / -.
  const terms: number[] = [Number(tokens[0])]
  const addOps: string[] = []
  for (let k = 1; k < tokens.length; k += 2) {
    const op = tokens[k]
    const num = Number(tokens[k + 1])
    if (op === '*') {
      terms[terms.length - 1] *= num
    } else if (op === '/') {
      if (num === 0) return null
      terms[terms.length - 1] /= num
    } else {
      addOps.push(op)
      terms.push(num)
    }
  }

  let result = terms[0]
  for (let k = 0; k < addOps.length; k += 1) {
    result += addOps[k] === '+' ? terms[k + 1] : -terms[k + 1]
  }
  return Number.isFinite(result) ? result : null
}

/** Whether a full "a=b" string is a syntactically valid, true equation. */
export function isValidEquation(guess: string): boolean {
  if (guess.length !== WIDTH) return false
  const parts = guess.split('=')
  if (parts.length !== 2) return false
  const [lhs, rhs] = parts
  if (lhs.length === 0 || rhs.length === 0) return false
  // The right side must be a plain non-negative integer (standard Nerdle).
  if (!/^\d+$/.test(rhs)) return false
  if (/^0\d/.test(rhs)) return false
  const left = evalExpr(lhs)
  if (left === null) return false
  return left === Number(rhs)
}

/**
 * Score a guess against the answer, Wordle-style: greens first, then greens are
 * removed from the pool before assigning yellows so duplicate symbols don't
 * over-count.
 */
export function scoreGuess(guess: string, answer: string): TileStatus[] {
  const result: TileStatus[] = new Array(guess.length).fill('absent')
  const counts: Record<string, number> = {}
  for (const ch of answer) counts[ch] = (counts[ch] ?? 0) + 1

  for (let i = 0; i < guess.length; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct'
      counts[guess[i]] -= 1
    }
  }
  for (let i = 0; i < guess.length; i += 1) {
    if (result[i] === 'correct') continue
    const ch = guess[i]
    if (counts[ch] > 0) {
      result[i] = 'present'
      counts[ch] -= 1
    }
  }
  return result
}

/** Merge per-guess tile statuses into the best-known status for each key. */
export function mergeKeyStatuses(
  current: Record<string, TileStatus>,
  guess: string,
  statuses: TileStatus[],
): Record<string, TileStatus> {
  const rank: Record<TileStatus, number> = { absent: 0, present: 1, correct: 2 }
  const next = { ...current }
  guess.split('').forEach((ch, i) => {
    const s = statuses[i]
    if (next[ch] === undefined || rank[s] > rank[next[ch]]) next[ch] = s
  })
  return next
}

const randInt = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1))

/**
 * Generate a valid equation of exactly WIDTH characters from a seed. Tries
 * random operand/operator combinations until one fits the width and all Nerdle
 * validity rules (integer result, no leading zeros, etc.).
 */
export function generateEquation(seed: string): string {
  const rng = rngFromSeed(`nerdle:${seed}`)

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const op = OPERATORS[randInt(rng, 0, OPERATORS.length - 1)]
    let a: number
    let b: number
    if (op === '/') {
      // Build a clean division: b * quotient = a.
      b = randInt(rng, 1, 9)
      const q = randInt(rng, 1, 9)
      a = b * q
    } else {
      a = randInt(rng, 1, 99)
      b = randInt(rng, 1, 99)
      if (op === '-' && b > a) [a, b] = [b, a] // keep the result non-negative
    }

    let value: number
    switch (op) {
      case '+':
        value = a + b
        break
      case '-':
        value = a - b
        break
      case '*':
        value = a * b
        break
      default:
        value = a / b
    }
    if (!Number.isInteger(value) || value < 0) continue

    const candidate = `${a}${op}${b}=${value}`
    if (candidate.length === WIDTH && isValidEquation(candidate)) return candidate
  }

  // Deterministic fallback that always fits WIDTH=8 (extremely unlikely to hit).
  return '12+13=25'
}
