/**
 * Share score functionality
 * Generates Wordle-style share text with emoji blocks
 */

import type { LetterStatus } from './wordleLogic'
import { MAX_ATTEMPTS } from './wordleLogic'

/**
 * Converts letter status to emoji block
 */
const statusToEmoji = (status: LetterStatus): string => {
  switch (status) {
    case 'correct':
      return '🟩'
    case 'present':
      return '🟨'
    case 'absent':
    default:
      return '⬜'
  }
}

/**
 * Generates share text in Wordle format
 * Format: "Wordle X/6\n\n🟩🟨⬜⬜🟩\n🟨🟨⬜🟩🟨\n..."
 *
 * @param guesses - Array of guesses with their statuses
 * @param puzzleType - Type of puzzle (daily, custom, random)
 * @param puzzleNumber - Puzzle number for daily, undefined for others
 * @param shareLink - Optional link to share
 * @param won - Whether the puzzle was solved (false renders "X/6" for a loss)
 * @returns Formatted share text
 */
export function generateShareText(
  guesses: Array<{ guess: string; statuses: LetterStatus[] }>,
  puzzleType: 'daily' | 'custom' | 'random',
  puzzleNumber?: number,
  shareLink?: string,
  won = true,
): string {
  const attempts = guesses.length
  const maxAttempts = MAX_ATTEMPTS

  // Build emoji grid
  const emojiGrid = guesses.map(({ statuses }) => statuses.map(statusToEmoji).join('')).join('\n')

  // Build header
  let header = 'Wordle'
  if (puzzleType === 'daily' && puzzleNumber) {
    header = `Wordle ${puzzleNumber}`
  } else if (puzzleType === 'custom') {
    header = 'Wordle (Custom)'
  } else if (puzzleType === 'random') {
    header = 'Wordle (Random)'
  }

  const score = won ? `${attempts}/${maxAttempts}` : `X/${maxAttempts}`

  // Build share text
  let shareText = `${header} ${score}\n\n${emojiGrid}`

  if (shareLink) {
    shareText += `\n\n${shareLink}`
  }

  return shareText
}

/**
 * Copies text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
