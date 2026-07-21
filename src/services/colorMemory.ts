/**
 * Color-from-memory logic — generate a target color, then score how close the
 * player's recreated color is. Uses the "redmean" low-cost perceptual distance
 * so the score tracks how different two colors *look*, not just their raw RGB
 * gap. Pure and RNG-injectable so it's testable.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export const clampChannel = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

/** A random, reasonably saturated color (avoids near-black/near-white targets). */
export function randomColor(rng: () => number): RGB {
  // Build from HSL for pleasant, distinguishable targets, then convert to RGB.
  const h = rng() * 360
  const s = 0.45 + rng() * 0.5 // 45–95% saturation
  const l = 0.35 + rng() * 0.4 // 35–75% lightness
  return hslToRgb(h, s, l)
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
  }
}

/**
 * Redmean perceptual color distance. Weights the red/blue channels by the mean
 * red level, approximating how the eye perceives differences.
 */
export function redmeanDistance(a: RGB, b: RGB): number {
  const rbar = (a.r + b.r) / 2
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db)
}

/** The largest possible redmean distance (black↔white), for normalizing scores. */
export const MAX_DISTANCE = redmeanDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })

/**
 * Score a guess against the target as a 0–100 percentage of perceptual accuracy.
 * Squared so that only very close guesses earn top marks (a linear scale feels
 * too generous — halfway-off should not read as 50%).
 */
export function scorePercent(target: RGB, guess: RGB): number {
  const ratio = Math.min(1, redmeanDistance(target, guess) / MAX_DISTANCE)
  return Math.round(100 * (1 - ratio) ** 2)
}

export const toCss = (c: RGB): string => `rgb(${c.r}, ${c.g}, ${c.b})`

/** A qualitative label for a score, for post-round feedback. */
export function rating(score: number): string {
  if (score >= 98) return 'Perfect!'
  if (score >= 90) return 'Amazing'
  if (score >= 78) return 'Great'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Close-ish'
  return 'Way off'
}
