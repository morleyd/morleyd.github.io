/**
 * Hard mode validation service
 * Enforces constraints that require using discovered information:
 * - Cannot use letters marked as absent (gray)
 * - Must use letters marked as present (yellow) in a different position
 * - Must use letters marked as correct (green) in the same position
 */

import type { LetterStatus } from './wordleLogic'
import { WORD_LENGTH } from './wordleLogic'

export interface HardModeConstraints {
  /** Letters that are confirmed not in the word */
  absentLetters: Set<string>
  /** Letters that are confirmed in the word (but position unknown) */
  presentLetters: Set<string>
  /** Required letters at specific positions (green tiles) */
  correctPositions: Map<number, string>
  /** Letters that cannot be at specific positions (yellow tiles) */
  presentPositions: Map<number, Set<string>>
}

export interface GuessResult {
  guess: string
  statuses: LetterStatus[]
}

/**
 * Computes hard mode constraints from previous guesses
 * Tracks which letters must be used, which are forbidden, and position requirements
 *
 * @param previousGuesses - Array of previous guesses and their statuses
 * @returns Constraints object for validating future guesses
 */
export const computeHardModeConstraints = (previousGuesses: GuessResult[]): HardModeConstraints => {
  const absentLetters = new Set<string>()
  const presentLetters = new Set<string>()
  const correctPositions = new Map<number, string>()
  const presentPositions = new Map<number, Set<string>>()

  for (const { guess, statuses } of previousGuesses) {
    for (let i = 0; i < WORD_LENGTH; i += 1) {
      const letter = guess.charAt(i)
      const status = statuses[i]

      if (status === 'correct') {
        // Green: Must use this letter at this exact position
        correctPositions.set(i, letter)
        presentLetters.add(letter)
        absentLetters.delete(letter) // Remove if previously marked absent
      } else if (status === 'present') {
        // Yellow: Must use this letter but NOT at this position
        presentLetters.add(letter)
        absentLetters.delete(letter) // Remove if previously marked absent
        if (!presentPositions.has(i)) {
          presentPositions.set(i, new Set())
        }
        presentPositions.get(i)!.add(letter)
      } else if (status === 'absent') {
        // Gray: Cannot use this letter (unless it's also marked present elsewhere)
        if (!presentLetters.has(letter)) {
          absentLetters.add(letter)
        }
      }
    }
  }

  return {
    absentLetters,
    presentLetters,
    correctPositions,
    presentPositions,
  }
}

/**
 * Validates a guess against hard mode constraints
 *
 * @param guess - The word to validate
 * @param constraints - Hard mode constraints from previous guesses
 * @returns Validation result with error message if invalid
 */
export const validateHardModeGuess = (
  guess: string,
  constraints: HardModeConstraints,
): { valid: boolean; error?: string } => {
  const { absentLetters, presentLetters, correctPositions, presentPositions } = constraints

  // Check each position
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const letter = guess.charAt(i)

    // Cannot use absent letters
    if (absentLetters.has(letter)) {
      return {
        valid: false,
        error: `Letter "${letter}" is not in the word.`,
      }
    }

    // Must use correct letters in their exact positions
    const requiredAtPosition = correctPositions.get(i)
    if (requiredAtPosition && letter !== requiredAtPosition) {
      return {
        valid: false,
        error: `Letter "${requiredAtPosition}" must be in position ${i + 1}.`,
      }
    }

    // Cannot use present letters in their forbidden positions
    const forbiddenAtPosition = presentPositions.get(i)
    if (forbiddenAtPosition && forbiddenAtPosition.has(letter)) {
      return {
        valid: false,
        error: `Letter "${letter}" cannot be in position ${i + 1} (it's present elsewhere).`,
      }
    }
  }

  // Must include all present letters somewhere in the guess
  for (const requiredLetter of presentLetters) {
    if (!guess.includes(requiredLetter)) {
      return {
        valid: false,
        error: `Letter "${requiredLetter}" must be used (it's in the word).`,
      }
    }
  }

  return { valid: true }
}
