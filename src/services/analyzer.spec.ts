import { describe, expect, it } from 'vitest'

import { analyzeGame, filterCandidates, remainingCandidatesFor } from './analyzer'
import { evaluateGuess } from './wordleLogic'
import { answerBank } from './wordLists'
import type { GuessHistoryEntry } from './analyzer'

/** Builds a history entry by evaluating a guess against a known target. */
const play = (guess: string, target: string): GuessHistoryEntry => ({
  guess,
  statuses: evaluateGuess(guess, target),
})

describe('filterCandidates', () => {
  it('keeps only words consistent with the observed colors', () => {
    const target = answerBank[0]
    const guess = answerBank[Math.floor(answerBank.length / 2)]
    const statuses = evaluateGuess(guess, target)
    const survivors = filterCandidates(answerBank, guess, statuses)
    expect(survivors).toContain(target)
    // Every survivor must reproduce the same pattern against the guess.
    for (const word of survivors) {
      expect(evaluateGuess(guess, word)).toEqual(statuses)
    }
  })
})

describe('remainingCandidatesFor', () => {
  it('narrows to the single answer once fully constrained', () => {
    const target = 'CRANE'
    const history = [play('SLATE', target), play('CRANE', target)]
    const remaining = remainingCandidatesFor(history)
    expect(remaining).toEqual(['CRANE'])
  })

  it('includes an off-bank target via extra candidates', () => {
    const target = 'ZZZZY' // not a real answer; guaranteed off-bank
    const remaining = remainingCandidatesFor([play('SLATE', target)], [target])
    expect(remaining).toContain(target)
  })
})

describe('analyzeGame', () => {
  const target = 'CRANE'
  const analysis = analyzeGame([play('SLATE', target), play('CRANE', target)], [target])

  it('produces bounded 1-100 skill and luck for every guess', () => {
    for (const row of analysis.rows) {
      expect(row.skill).toBeGreaterThanOrEqual(0)
      expect(row.skill).toBeLessThanOrEqual(100)
      expect(row.luck).toBeGreaterThanOrEqual(0)
      expect(row.luck).toBeLessThanOrEqual(100)
    }
  })

  it('reports actual and expected information in bits', () => {
    const first = analysis.rows[0]
    expect(first.actualInfo).toBeGreaterThan(0)
    expect(first.expectedInfo).toBeGreaterThan(0)
    // Narrowing from ~2314 words to a handful is several bits of information.
    expect(first.actualInfo).toBeLessThan(Math.log2(answerBank.length) + 0.001)
  })

  it('flags the final winning guess as a possible answer that ends the game', () => {
    const last = analysis.rows[analysis.rows.length - 1]
    expect(last.isPossibleAnswer).toBe(true)
    expect(last.remaining).toBe(1)
    expect(analysis.totalRemaining).toBe(1)
  })

  it('gives full skill and neutral luck when only one candidate remains', () => {
    // After SLATE + CRANE the answer is pinned; a redundant re-guess is forced.
    const forced = analyzeGame(
      [play('SLATE', target), play('CRANE', target), play('CRANE', target)],
      [target],
    )
    const lastRow = forced.rows[forced.rows.length - 1]
    expect(lastRow.skill).toBe(100)
    expect(lastRow.luck).toBe(50)
  })

  it('treats solving the word as the luckiest outcome, not a neutral roll', () => {
    // SLATE leaves a handful of words; guessing the answer out of several is a
    // lucky hit and must score well above 50 (the old bug scored it exactly 50).
    const rows = analyzeGame([play('SLATE', target), play('CRANE', target)], [target]).rows
    const winningRow = rows[rows.length - 1]
    expect(winningRow.remainingBefore).toBeGreaterThan(1) // genuinely had a choice
    expect(winningRow.luck).toBeGreaterThan(50)
  })

  it('marks a top expected-info opener as optimal', () => {
    // The best opener by expected info should rank as optimal with high skill.
    const opener = analyzeGame([play('SLATE', 'CRANE')]).rows[0]
    expect(opener.skill).toBeGreaterThan(70)
    expect(opener.bestGuess).toHaveLength(5)
  })

  it('credits a non-answer probe with the information it reveals', () => {
    // Pick a target and an allowed-but-not-answer-style guess: use any bank word
    // as target and a different bank word as probe; skill should still be scored.
    const probeAnalysis = analyzeGame([play('AUDIO', 'CRANE')])
    const row = probeAnalysis.rows[0]
    expect(row.actualInfo).toBeGreaterThan(0)
    expect(row.skill).toBeGreaterThanOrEqual(0)
  })

  it('averages skill and luck across guesses', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(analysis.averageSkill).toBeCloseTo(mean(analysis.rows.map((r) => r.skill)), 5)
    expect(analysis.averageLuck).toBeCloseTo(mean(analysis.rows.map((r) => r.luck)), 5)
  })
})
