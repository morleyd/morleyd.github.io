/**
 * Word list management and daily puzzle selection
 * Loads word lists from external files and provides daily word rotation
 */

import answersRaw from '@/assets/answers.txt?raw'
import wordsRaw from '@/assets/accepted_words.txt?raw'

/** Start date for daily puzzle rotation (17 Nov 2025 UTC) */
const START_DATE = Date.UTC(2025, 10, 17)
const MS_PER_DAY = 86_400_000
const FALLBACK_WORD = 'DAVID'

/**
 * Parses a raw word list file into an array of uppercase 5-letter words
 *
 * @param raw - Raw file content with one word per line
 * @returns Array of normalized 5-letter words
 */
const parseWordList = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length === 5)

/** Official answer bank (words that can be the daily puzzle) */
export const answerBank = parseWordList(answersRaw)

/** Additional allowed words (can be guessed but aren't in answer bank) */
const extraAllowed = parseWordList(wordsRaw)

/** Combined set of all allowed guess words */
export const allowedWordSet = new Set<string>([...answerBank, ...extraAllowed])

export interface DailyAnswer {
  word: string
  index: number
  dayOffset: number
  date: Date
}

/**
 * Gets the daily puzzle word for a given date
 * Rotates through the answer bank based on days since START_DATE
 *
 * @param date - Date to get puzzle for (defaults to today)
 * @returns Daily answer information
 */
export const getDailyAnswer = (date = new Date()): DailyAnswer => {
  const dayStartUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const dayOffset = Math.floor((dayStartUTC - START_DATE) / MS_PER_DAY)
  // Use modulo to cycle through answer bank, handling negative offsets
  const normalizedIndex = ((dayOffset % answerBank.length) + answerBank.length) % answerBank.length
  const word = answerBank[normalizedIndex] ?? FALLBACK_WORD

  return {
    word,
    index: normalizedIndex,
    dayOffset,
    date: new Date(dayStartUTC),
  }
}

/**
 * Formats a date for display in the puzzle header
 *
 * @param date - Date to format
 * @returns Formatted date string (e.g., "Nov 17, 2025")
 */
export const getFormattedPuzzleDate = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })

/**
 * Gets a random word from the answer bank
 *
 * @returns A random 5-letter word
 */
export const getRandomWord = (): string => {
  const randomIndex = Math.floor(Math.random() * answerBank.length)
  return answerBank[randomIndex] ?? FALLBACK_WORD
}
