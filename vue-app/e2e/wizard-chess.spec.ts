import { test, expect } from '@playwright/test'

test.describe('Wizard Chess', () => {
  test('renders a full board and lets you move a piece', async ({ page }) => {
    await page.goto('/wizard-chess')

    // Full 8x8 board (regression: it used to "lose rows").
    await expect(page.locator('.board .sq')).toHaveCount(64)

    // Board is a reasonable, square size (regression: it collapsed / went tiny).
    const box = await page.locator('.board').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(320)
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(4)

    // Selecting a piece highlights it, shows move dots, and introduces it.
    await page.locator('[data-square="e2"]').click()
    await expect(page.locator('.sq.sel')).toHaveCount(1)
    await expect(page.locator('.dot').first()).toBeVisible()
    expect(await page.locator('.talk-line').count()).toBeGreaterThan(0)

    // The core bug: the piece must actually move e2 -> e4.
    await page.locator('[data-square="e4"]').click()
    await expect(page.locator('[data-square="e4"] .piece')).toBeVisible()
    await expect(page.locator('[data-square="e2"] .piece')).toHaveCount(0)

    // The engine must actually reply: one black piece leaves its home ranks...
    const blackAtHome = page.locator('[data-square$="7"] .piece.black, [data-square$="8"] .piece.black')
    await expect.poll(async () => blackAtHome.count(), { timeout: 15_000 }).toBeLessThan(16)
    // ...and then the turn comes back to the player.
    await expect(page.getByTestId('status')).toHaveText('Your move.', { timeout: 15_000 })

    await page.screenshot({ path: 'e2e/screenshots/desktop.png' })
  })

  test('is playable at a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/wizard-chess')

    await expect(page.locator('.board .sq')).toHaveCount(64)
    const box = await page.locator('.board').boundingBox()
    expect(box!.width).toBeGreaterThan(300)
    expect(box!.width).toBeLessThanOrEqual(390)

    await page.locator('[data-square="e2"]').click()
    await page.locator('[data-square="e4"]').click()
    await expect(page.locator('[data-square="e4"] .piece')).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/mobile.png' })
  })
})
