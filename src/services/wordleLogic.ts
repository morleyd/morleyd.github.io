/**
 * Core Wordle game logic
 * Handles guess evaluation and status management
 */

/** Letter status types: empty (not guessed), correct (green), present (yellow), absent (gray) */
export type LetterStatus = 'empty' | 'correct' | 'present' | 'absent'

export const WORD_LENGTH = 5
export const MAX_ATTEMPTS = 6

/**
 * Priority order for letter statuses (used to determine keyboard key color)
 * Higher priority statuses override lower ones
 */
export const statusPriority: Record<LetterStatus, number> = {
  empty: 0,
  absent: 1,
  present: 2,
  correct: 3,
}

/**
 * Evaluates a guess against the answer word
 * Returns an array of LetterStatus for each position
 *
 * Algorithm:
 * 1. First pass: Mark exact matches (correct/green) and track remaining letter counts
 * 2. Second pass: Mark present letters (yellow) for remaining positions, then absent (gray)
 *
 * @param guess - The guessed word
 * @param answer - The target word
 * @returns Array of statuses for each letter position
 */
export const evaluateGuess = (guess: string, answer: string): LetterStatus[] => {
  const result: LetterStatus[] = Array.from({ length: WORD_LENGTH }, () => 'absent')
  const remaining: Record<string, number> = {}

  // Count occurrences of each letter in the answer
  answer.split('').forEach((letter) => {
    remaining[letter] = (remaining[letter] ?? 0) + 1
  })

  // First pass: Mark exact matches (correct/green)
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const guessLetter = guess.charAt(i)
    const answerLetter = answer.charAt(i)

    if (guessLetter === answerLetter) {
      result[i] = 'correct'
      remaining[guessLetter] = (remaining[guessLetter] ?? 0) - 1
    }
  }

  // Second pass: Mark present (yellow) or absent (gray) for non-correct positions
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] === 'correct') {
      continue
    }

    const letter = guess.charAt(i)
    const count = remaining[letter] ?? 0
    if (count > 0) {
      result[i] = 'present'
      remaining[letter] = count - 1
    } else {
      result[i] = 'absent'
    }
  }

  return result
}

/**
 * Converts letter statuses to a pattern string for analysis
 * correct = '2', present = '1', absent/empty = '0'
 *
 * @param statuses - Array of letter statuses
 * @returns Pattern string (e.g., "20100")
 */
export const statusesToPattern = (statuses: LetterStatus[]): string =>
  statuses
    .map((status) => {
      switch (status) {
        case 'correct':
          return '2'
        case 'present':
          return '1'
        case 'absent':
        default:
          return '0'
      }
    })
    .join('')
