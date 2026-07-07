import { answerBank } from './wordLists'
import { WORD_LENGTH } from './wordleLogic'
import type { LetterStatus } from './wordleLogic'

export interface GuessHistoryEntry {
  guess: string
  statuses: LetterStatus[]
}

export interface GuessAnalysisRow {
  guess: string
  /** Was the guessed word itself still a possible answer before this guess? */
  isPossibleAnswer: boolean
  /** Candidates remaining before this guess was played. */
  remainingBefore: number
  /** Candidates remaining after applying this guess's colors. */
  remaining: number
  /** Average bits a typical outcome of this guess would have revealed. */
  expectedInfo: number
  /** Bits the outcome you actually got revealed (can exceed or trail expected). */
  actualInfo: number
  /**
   * How good the guess *choice* was, 1-100. It's the percentile of this guess's
   * expected information among the whole answer bank, so 100 ≈ the theoretically
   * best splitter and 50 ≈ a middling guess.
   */
  skill: number
  /**
   * How the dice fell, 1-100. It's the percentile of the outcome you received
   * among all outcomes this guess could have produced: 50 is an average roll,
   * 100 means you got about the luckiest split possible, 1 the unluckiest.
   * Solving the word outright counts as the luckiest possible outcome.
   */
  luck: number
  /** True when your guess was (one of) the highest expected-info play available. */
  isOptimal: boolean
  /** The answer-bank word with the highest expected info at this point. */
  bestGuess: string
  bestGuessInfo: number
  /** Whether the suggested best guess is itself a still-possible answer. */
  bestGuessIsAnswer: boolean
}

export interface GameAnalysis {
  rows: GuessAnalysisRow[]
  /** Mean skill across all guesses (1-100). */
  averageSkill: number
  /** Mean luck across all guesses (1-100). */
  averageLuck: number
  filteredCandidates: string[]
  remainingCandidates: string[]
  totalRemaining: number
}

const MAX_PREVIEW = 12
const PATTERN_COUNT = 3 ** WORD_LENGTH // 243 distinct color patterns
const ALL_GREEN = PATTERN_COUNT - 1 // the winning pattern (every tile correct)
const OPTIMAL_EPSILON = 1e-9
// A guess within this many bits of the best splitter is treated as "optimal" —
// a sub-tenth-of-a-bit gap is a rounding difference, not a real mistake.
const OPTIMAL_TOLERANCE = 0.1

// -----------------------------------------------------
// Fast pattern coding
// -----------------------------------------------------
// A guess/answer pair maps to one of 243 color patterns. We encode it as a
// base-3 integer (green=2, yellow=1, gray=0, most-significant digit first) so
// the hot loops can bucket by array index instead of building/hashing strings.

// Reused across calls — the analyzer runs synchronously and patternCode never
// re-enters, so sharing these buffers avoids millions of tiny allocations.
const letterCounts = new Int8Array(26)
const digits = new Int8Array(WORD_LENGTH)

const patternCode = (guess: string, answer: string): number => {
  letterCounts.fill(0)
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    letterCounts[answer.charCodeAt(i) - 65] += 1
    digits[i] = 0
  }
  // Greens first so they claim their letter before yellows are considered.
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const letter = guess.charCodeAt(i) - 65
    if (letter === answer.charCodeAt(i) - 65) {
      digits[i] = 2
      letterCounts[letter] -= 1
    }
  }
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (digits[i] === 2) continue
    const letter = guess.charCodeAt(i) - 65
    if (letterCounts[letter] > 0) {
      digits[i] = 1
      letterCounts[letter] -= 1
    }
  }
  let code = 0
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    code = code * 3 + digits[i]
  }
  return code
}

/** Encodes the colors a player actually saw into the same base-3 pattern code. */
const codeFromStatuses = (statuses: LetterStatus[]): number => {
  let code = 0
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const status = statuses[i]
    const digit = status === 'correct' ? 2 : status === 'present' ? 1 : 0
    code = code * 3 + digit
  }
  return code
}

// -----------------------------------------------------
// Information theory helpers
// -----------------------------------------------------

// Reused bucket buffer for expected-info scans over the guess pool.
const buckets = new Int32Array(PATTERN_COUNT)

/**
 * Expected information (entropy of the outcome distribution) for a guess against
 * a candidate list: H = Σ p(pattern) · log2(1 / p(pattern)).
 */
const expectedInfoOf = (candidates: string[], guess: string): number => {
  const total = candidates.length
  if (total <= 1) return 0

  buckets.fill(0)
  for (let i = 0; i < total; i += 1) {
    buckets[patternCode(guess, candidates[i])] += 1
  }

  let info = 0
  for (let code = 0; code < PATTERN_COUNT; code += 1) {
    const count = buckets[code]
    if (count > 0) {
      const p = count / total
      info += p * Math.log2(1 / p)
    }
  }
  return info
}

// -----------------------------------------------------
// Filtering
// -----------------------------------------------------

export const filterCandidates = (
  candidates: string[],
  guess: string,
  statuses: LetterStatus[],
): string[] => {
  const targetCode = codeFromStatuses(statuses)
  return candidates.filter((answer) => patternCode(guess, answer) === targetCode)
}

/**
 * Filters the answer bank (plus any extra candidates) down to the words still
 * consistent with a guess history. Cheap enough to run live while playing.
 */
export const remainingCandidatesFor = (
  history: GuessHistoryEntry[],
  extraCandidates: string[] = [],
): string[] => {
  const candidateSet = new Set<string>(answerBank)
  for (const word of extraCandidates) {
    candidateSet.add(word)
  }
  let candidates = [...candidateSet]
  for (const entry of history) {
    candidates = filterCandidates(candidates, entry.guess, entry.statuses)
  }
  return candidates.sort()
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

  // The pool of plausible guesses we rank skill against. Using the answer bank
  // keeps "best guess" a real, guessable word and bounds the cost regardless of
  // how large the full accepted-word list is.
  const guessPool = answerBank

  const rows: GuessAnalysisRow[] = history.map((entry) => {
    const guess = entry.guess
    const total = candidates.length
    const liveSet = new Set(candidates)
    const isPossibleAnswer = liveSet.has(guess)

    // --- Distribution of the actual guess over the current candidates ---
    // One pass gives us the guess's expected info, the size of the bucket the
    // player landed in (remaining after), and the luck percentile.
    buckets.fill(0)
    for (let i = 0; i < total; i += 1) {
      buckets[patternCode(guess, candidates[i])] += 1
    }

    const actualCode = codeFromStatuses(entry.statuses)
    const remainingAfter = total > 0 ? buckets[actualCode] : 0
    const wonThisGuess = actualCode === ALL_GREEN

    // Luck ranks how favorable your outcome was among everything this guess could
    // have produced. We score each outcome by "badness" = how many candidates it
    // leaves (fewer is luckier), with one special case: solving the word outright
    // is the single best thing that can happen, so the all-green outcome always
    // gets badness 0 — beating even a non-winning narrow-to-one result.
    const yourBadness = wonThisGuess ? 0 : remainingAfter

    let expectedInfo = 0
    // Outcomes worse than yours (higher badness) count fully in your favor;
    // equally-good ties count half.
    let worseMass = 0
    let tieMass = 0
    for (let code = 0; code < PATTERN_COUNT; code += 1) {
      const count = buckets[code]
      if (count === 0) continue
      const p = count / total
      expectedInfo += p * Math.log2(1 / p)
      const badness = code === ALL_GREEN ? 0 : count
      if (badness > yourBadness) worseMass += count
      else if (badness === yourBadness) tieMass += count
    }

    const actualInfo = remainingAfter > 0 ? Math.log2(total / remainingAfter) : 0

    // With 0 or 1 candidate there's nothing to distinguish: the play was forced
    // and perfect, and no luck was involved.
    let luck = 50
    let skill = 100
    let bestGuess = guess
    let bestGuessInfo = expectedInfo
    let bestGuessIsAnswer = isPossibleAnswer
    let isOptimal = true

    if (total > 1) {
      luck = (worseMass + 0.5 * tieMass) / total * 100

      // --- Skill: rank this guess's expected info across the whole pool ---
      let better = 0
      let equal = 0
      let bestInfo = -1
      for (let i = 0; i < guessPool.length; i += 1) {
        const candidateGuess = guessPool[i]
        const info = expectedInfoOf(candidates, candidateGuess)
        if (info < expectedInfo - OPTIMAL_EPSILON) better += 1
        else if (info <= expectedInfo + OPTIMAL_EPSILON) equal += 1

        // Track the best splitter, preferring a still-possible answer on ties so
        // the suggestion is a word that could actually win the game outright.
        const isAnswer = liveSet.has(candidateGuess)
        if (
          info > bestInfo + OPTIMAL_EPSILON ||
          (info > bestInfo - OPTIMAL_EPSILON && isAnswer && !bestGuessIsAnswer)
        ) {
          bestInfo = info
          bestGuess = candidateGuess
          bestGuessInfo = info
          bestGuessIsAnswer = isAnswer
        }
      }

      skill = (better + 0.5 * equal) / guessPool.length * 100
      isOptimal = expectedInfo >= bestInfo - OPTIMAL_TOLERANCE
    }

    // --- Apply the filter for the next round ---
    candidates = candidates.filter((answer) => patternCode(guess, answer) === actualCode)

    return {
      guess,
      isPossibleAnswer,
      remainingBefore: total,
      remaining: candidates.length,
      expectedInfo,
      actualInfo,
      skill,
      luck,
      isOptimal,
      bestGuess,
      bestGuessInfo,
      bestGuessIsAnswer,
    }
  })

  const averageSkill = rows.length
    ? rows.reduce((sum, row) => sum + row.skill, 0) / rows.length
    : 0
  const averageLuck = rows.length
    ? rows.reduce((sum, row) => sum + row.luck, 0) / rows.length
    : 0

  return {
    rows,
    averageSkill,
    averageLuck,
    filteredCandidates: candidates.slice(0, MAX_PREVIEW),
    remainingCandidates: candidates.sort(),
    totalRemaining: candidates.length,
  }
}
