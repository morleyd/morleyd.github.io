import { test, expect } from '@playwright/test'

const ANIMATING = '.glyph.anim-tremble, .glyph.anim-bob, .glyph.anim-angry, .glyph.anim-joy'

test.describe('Wizard Chess', () => {
  test('renders a full board and lets you move a piece', async ({ page }) => {
    await page.goto('/wizard-chess')

    // Full 8x8 board with all 32 pieces on the animated overlay.
    await expect(page.locator('.board .sq')).toHaveCount(64)
    await expect(page.locator('.piece-box')).toHaveCount(32)

    // Board is a reasonable, square size (regression: it collapsed / went tiny).
    const box = await page.locator('.board').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(320)
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(4)

    // Restraint: nothing should be animating on a calm opening board.
    expect(await page.locator(ANIMATING).count()).toBeLessThanOrEqual(2)

    // Selecting a piece highlights it, shows a move dot, and introduces it.
    await page.locator('[data-square="e2"]').click()
    await expect(page.locator('.sq.sel')).toHaveCount(1)
    await expect(page.locator('.dot').first()).toBeVisible()
    expect(await page.locator('.talk-line').count()).toBeGreaterThan(0)

    // The core mechanic: the piece actually moves e2 -> e4.
    await page.locator('[data-square="e4"]').click()
    await expect(page.locator('[data-piece="e4"]')).toBeVisible()
    await expect(page.locator('[data-piece="e2"]')).toHaveCount(0)

    // The engine must actually reply: a black piece leaves its home ranks...
    const blackAtHome = page.locator('[data-piece$="7"] .glyph.black, [data-piece$="8"] .glyph.black')
    await expect.poll(async () => blackAtHome.count(), { timeout: 15_000 }).toBeLessThan(16)
    // ...and the turn returns to the player (either "Your move." or "in check!").
    await expect(page.getByTestId('status')).not.toHaveText('The enemy is plotting…', { timeout: 15_000 })

    // Restraint holds after a real exchange: still ≤2 pieces animating.
    expect(await page.locator(ANIMATING).count()).toBeLessThanOrEqual(2)

    await page.screenshot({ path: 'e2e/screenshots/desktop.png' })
  })

  test('chaos: a knight takes an off-book leap when Chaos is maxed', async ({ page }) => {
    // Force Chaos on, and max Team Trust so the knight has "wings" — a jetpack
    // now needs a reason (rescue / wings / build-up), never "just because".
    await page.addInitScript(() => {
      localStorage.setItem(
        'wizard-chess-settings',
        JSON.stringify({ chatter: 0.6, animation: 0.6, agency: 0.6, chaos: 1 }),
      )
      localStorage.setItem('wizard-chess-trust', '95')
    })
    // Chaos is only offered at a *dramatic* moment (a stunt that captures, checks,
    // or escapes an attack). Set up a position where a jetpack leap is a genuine
    // capture: a white knight on d4 with a black pawn on f6, one extended leap away.
    await page.goto('/wizard-chess?fen=' + encodeURIComponent('4k3/8/5p2/8/3N4/8/8/4K3 w - - 0 1'))

    // Wait for the hand-set position to settle (four pieces, knight on d4).
    await expect(page.locator('.piece-box')).toHaveCount(4)
    await expect(page.locator('[data-piece="d4"]')).toBeVisible()

    await page.locator('[data-square="d4"]').click() // the white knight
    // A chaos option is offered (dashed purple target).
    await expect(page.locator('.dot--chaos').first()).toBeVisible()
    const chaosSq = await page.locator('.mark:has(.dot--chaos)').first().getAttribute('data-mark')
    expect(chaosSq).toBeTruthy()

    // Take the off-book leap; the knight lands where no normal knight could.
    await page.locator(`[data-square="${chaosSq}"]`).click()
    await expect(page.locator(`[data-piece="${chaosSq}"] .glyph.white`)).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/chaos.png' })
  })

  test('long-press opens a character sheet with trait sliders and moods', async ({ page }) => {
    await page.goto('/wizard-chess')
    await page.locator('[data-square="e1"]').click({ delay: 600 }) // hold = long-press the king
    await expect(page.getByText('Personality (drag to reshape)')).toBeVisible()
    await expect(page.getByText('Mood right now')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/sheet.png' })
  })

  test('is playable at a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/wizard-chess')

    await expect(page.locator('.piece-box')).toHaveCount(32)
    const box = await page.locator('.board').boundingBox()
    expect(box!.width).toBeGreaterThan(300)
    expect(box!.width).toBeLessThanOrEqual(390)

    await page.locator('[data-square="e2"]').click()
    await page.locator('[data-square="e4"]').click()
    await expect(page.locator('[data-piece="e4"]')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/mobile.png' })
  })
})
