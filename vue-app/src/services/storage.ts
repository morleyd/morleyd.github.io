/**
 * LocalStorage management for game state persistence
 * Caches game progress and automatically cleans up expired entries
 */

import type { LetterStatus } from './wordleLogic'
import { getDailyAnswer } from './wordLists'

export interface CachedGameState {
  targetWord: string
  guesses: Array<{ guess: string; statuses: LetterStatus[] }>
  currentGuess: string
  gameState: 'playing' | 'won' | 'lost'
  letterStatuses: Record<string, LetterStatus>
  hardMode: boolean
  puzzleId: string
  puzzleType: 'daily' | 'custom' | 'random'
  timestamp: number
}

const STORAGE_PREFIX = 'wordle-game-'
const STORAGE_KEYS_KEY = 'wordle-game-keys'
const ONE_DAY_MS = 86_400_000

/**
 * Gets all stored game keys from localStorage
 */
function getStoredKeys(): string[] {
  try {
    const keysJson = localStorage.getItem(STORAGE_KEYS_KEY)
    return keysJson ? JSON.parse(keysJson) : []
  } catch {
    return []
  }
}

/**
 * Saves game keys list to localStorage
 */
function saveStoredKeys(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS_KEY, JSON.stringify(keys))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Cleans up expired game states (older than 1 day)
 */
function cleanupExpiredGames(): void {
  const keys = getStoredKeys()
  const now = Date.now()
  const validKeys: string[] = []

  for (const key of keys) {
    try {
      const data = localStorage.getItem(key)
      if (!data) {
        continue
      }

      const state: CachedGameState = JSON.parse(data)
      const age = now - state.timestamp

      if (age < ONE_DAY_MS) {
        validKeys.push(key)
      } else {
        localStorage.removeItem(key)
      }
    } catch {
      // Remove invalid entries
      localStorage.removeItem(key)
    }
  }

  saveStoredKeys(validKeys)
}

/**
 * Generates a storage key for a puzzle
 */
function getStorageKey(puzzleId: string): string {
  return `${STORAGE_PREFIX}${puzzleId}`
}

/**
 * Saves game state to localStorage
 */
export function saveGameState(state: CachedGameState): void {
  try {
    cleanupExpiredGames()

    const key = getStorageKey(state.puzzleId)
    const keys = getStoredKeys()

    if (!keys.includes(key)) {
      keys.push(key)
      saveStoredKeys(keys)
    }

    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Loads game state from localStorage
 */
export function loadGameState(puzzleId: string): CachedGameState | null {
  try {
    cleanupExpiredGames()

    const key = getStorageKey(puzzleId)
    const data = localStorage.getItem(key)

    if (!data) {
      return null
    }

    const state: CachedGameState = JSON.parse(data)
    const age = Date.now() - state.timestamp

    // Return null if expired
    if (age >= ONE_DAY_MS) {
      localStorage.removeItem(key)
      const keys = getStoredKeys().filter((k) => k !== key)
      saveStoredKeys(keys)
      return null
    }

    return state
  } catch {
    return null
  }
}

/**
 * Gets puzzle ID for daily puzzle
 */
export function getDailyPuzzleId(): string {
  const daily = getDailyAnswer()
  return `daily-${daily.dayOffset}`
}

/**
 * Gets puzzle ID for custom word
 */
export function getCustomPuzzleId(hash: string): string {
  return `custom-${hash}`
}

/**
 * Gets puzzle ID for random word
 */
export function getRandomPuzzleId(word: string): string {
  return `random-${word}`
}
