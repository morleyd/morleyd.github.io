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
    // ...and the turn returns to the player.
    await expect(page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })

    // Restraint holds after a real exchange: still ≤2 pieces animating.
    expect(await page.locator(ANIMATING).count()).toBeLessThanOrEqual(2)

    await page.screenshot({ path: 'e2e/screenshots/desktop.png' })
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
