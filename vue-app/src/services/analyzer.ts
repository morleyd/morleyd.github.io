import { answerBank } from './wordLists'
import { evaluateGuess, statusesToPattern } from './wordleLogic'
import type { LetterStatus } from './wordleLogic'

export interface GuessHistoryEntry {
  guess: string
  statuses: LetterStatus[]
}

export interface GuessAnalysisRow {
  guess: string
  remaining: number
  luck: number              // Percentage relative to total entropy
  infoGainedPercent: number // Percentage of uncertainty removed
}

export interface GameAnalysis {
  rows: GuessAnalysisRow[]
  filteredCandidates: string[]
  remainingCandidates: string[]
  totalRemaining: number
}

const MAX_PREVIEW = 12

// -----------------------------------------------------
// Utilities
// -----------------------------------------------------

/**
 * Calculates bits of uncertainty based on the number of candidates.
 * H = log2(N).
 */
const calculateStateEntropy = (candidateCount: number) => {
  if (candidateCount <= 1) return 0
  return Math.log2(candidateCount)
}

/**
 * Compute the Expected Information (Entropy of the distribution) 
 * for a specific guess against a list of candidates.
 * H = - Σ p(x) log2 p(x)
 */
const computeExpectedInfo = (candidates: string[], guess: string): number => {
  const total = candidates.length
  if (total === 0) return 0

  // Group by pattern to find probability distributions
  const patternCounts = new Map<string, number>()
  for (const answer of candidates) {
    const pattern = statusesToPattern(evaluateGuess(guess, answer))
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1)
  }

  let expectedInfo = 0
  for (const count of patternCounts.values()) {
    const p = count / total
    expectedInfo += p * Math.log2(1 / p)
  }

  return expectedInfo
}

// -----------------------------------------------------
// Filtering 
// -----------------------------------------------------

export const filterCandidates = (
  candidates: string[],
  guess: string,
  statuses: LetterStatus[],
): string[] => {
  const targetPattern = statusesToPattern(statuses)
  return candidates.filter(
    (answer) => statusesToPattern(evaluateGuess(guess, answer)) === targetPattern,
  )
}

// -----------------------------------------------------
// Main Analyzer
// -----------------------------------------------------

export const analyzeGame = (
  history: GuessHistoryEntry[],
  extraCandidates: string[] = [],
): GameAnalysis => {
  // Seed with the official answer bank, plus any extra candidates (e.g. a custom
  // or random target word that isn't in the bank) so filtering never eliminates
  // the true answer and leaves an empty/incorrect remaining list.
  const candidateSet = new Set<string>(answerBank)
  for (const word of extraCandidates) {
    candidateSet.add(word)
  }
  let candidates = [...candidateSet]

  const rows: GuessAnalysisRow[] = history.map((entry) => {
    const countBefore = candidates.length
    
    // 1. State Entropy Before: Total uncertainty available to resolve
    const entropyBefore = calculateStateEntropy(countBefore)

    // 2. Expected Info: Average bits we expected to gain
    const expectedInfo = computeExpectedInfo(candidates, entry.guess)

    // -- APPLY FILTER --
    candidates = filterCandidates(candidates, entry.guess, entry.statuses)
    
    const countAfter = candidates.length

    // 3. State Entropy After
    const entropyAfter = calculateStateEntropy(countAfter)

    // 4. Actual Info Gained
    const infoGained = entropyBefore - entropyAfter

    // 5. Calculate Percentages
    let infoGainedPercent = 0
    let luck = 0

    if (entropyBefore > 0) {
      // What % of the uncertainty did we eliminate?
      infoGainedPercent = (infoGained / entropyBefore) * 100
      
      // Luck: The surplus info gained as a % of total uncertainty.
      // e.g. if we gained 1 bit more than expected in a 10-bit pool, luck is +10%
      const luckBits = infoGained - expectedInfo
      luck = (luckBits / entropyBefore) * 100
    }

    return {
      guess: entry.guess,
      remaining: countAfter,
      luck,
      infoGainedPercent,
    }
  })

  return {
    rows,
    filteredCandidates: candidates.slice(0, MAX_PREVIEW),
    remainingCandidates: candidates.sort(),
    totalRemaining: candidates.length,
  }
}
