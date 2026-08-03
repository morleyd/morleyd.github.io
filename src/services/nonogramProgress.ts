/**
 * Solved-picture tracking for the Nonogram game, persisted to localStorage so
 * "New puzzle" can steer toward pictures the player hasn't completed yet (and
 * warn when only repeats are left). Best-effort: storage being unavailable or
 * corrupt just means nothing is remembered.
 */

const KEY = 'nonogram-solved'

/** Ids of every picture the player has ever solved (any size). */
export function solvedPatternIds(): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [],
    )
  } catch {
    return new Set()
  }
}

/** Remember that a picture was solved. Idempotent. */
export function recordSolvedPattern(id: string): void {
  const ids = solvedPatternIds()
  if (ids.has(id)) return
  ids.add(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // Storage full or blocked — tracking is a nicety, not a requirement.
  }
}
