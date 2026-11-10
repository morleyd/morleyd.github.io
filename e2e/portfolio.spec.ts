import { test, expect, type Page } from '@playwright/test';

const HEADLINE = 'Applied Research Scientist — Speech, NLU & Clinical AI';
const RESUME = '/David-Morley-Resume.pdf';

async function expectInViewport(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test.describe('Portfolio home', () => {
  for (const size of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone', width: 390, height: 844 }
  ]) {
    test(`shows the headline, featured work and résumé on ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');

      await expect(page).toHaveTitle('David Morley — Applied Research Scientist');
      await expect(page.getByRole('heading', { level: 1, name: 'David Morley' })).toBeVisible();
      await expect(page.getByTestId('headline')).toHaveText(HEADLINE);

      // The 10-second test: headline and résumé button sit in the first screen.
      await expectInViewport(page, 'headline');
      await expectInViewport(page, 'resume-link');

      const cards = page.getByTestId('featured-card');
      await expect(cards).toHaveCount(4);
      await expect(cards.first()).toHaveAttribute('href', '/work#salt');

      await expect(page.getByTestId('resume-link')).toHaveAttribute('href', RESUME);
      await page.screenshot({ path: `e2e/screenshots/home-${size.name}.png` });
    });
  }

  test('the résumé PDF is served', async ({ request }) => {
    const response = await request.get(RESUME);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/pdf');
  });

  test('a featured card opens its case study', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('featured-card').nth(1).click();
    await expect(page).toHaveURL(/\/work#surgical-device$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Operating-room voice control' })).toBeInViewport();
  });

  test('a case study opened from Home links back to Home', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('featured-card').nth(1).click();
    await expect(page).toHaveURL(/\/work#surgical-device$/);
    const back = page.locator('#surgical-device').getByTestId('back-home');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('featured-card').nth(1)).toBeInViewport();
  });

  test('the back-to-home link goes away once Work is opened from the app bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByTestId('featured-card').nth(1).click();
    await expect(page.getByTestId('back-home').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Work' }).click();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByTestId('back-home')).toHaveCount(0);
  });

  test('a case study opened directly has no back-to-home link', async ({ page }) => {
    await page.goto('/work#salt');
    await expect(page.getByTestId('case-study').first()).toBeVisible();
    await expect(page.getByTestId('back-home')).toHaveCount(0);
  });

  test('the résumé button is reachable by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const resume = page.getByTestId('resume-link');
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      if (await resume.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error('Tab never reached the résumé button');
  });
});

test.describe('Work, About and old links', () => {
  test('work page has four case studies in the same five-part format', async ({ page }) => {
    await page.goto('/work');
    const studies = page.getByTestId('case-study');
    await expect(studies).toHaveCount(4);
    for (const heading of ['Problem', 'My role', 'Approach', 'Result', 'One thing I learned']) {
      await expect(studies.getByRole('heading', { level: 3, name: heading, exact: true })).toHaveCount(4);
    }
  });

  test('older project tiles open a dialog from the keyboard', async ({ page }) => {
    await page.goto('/work');
    const tile = page.getByRole('button', { name: /Minimum Edits/ });
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toContainText('the full edit list');
  });

  test('/contact redirects to /about, which shows email but no phone number', async ({ page }) => {
    await page.goto('/contact');
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('link', { name: 'morley.david.c@gmail.com' })).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('the games keep their URLs, seeds included', async ({ page }) => {
    await page.goto('/games');
    await expect(page.getByRole('heading', { level: 1, name: 'Playground' })).toBeVisible();
    // A seed is `size.code`; an invalid one is replaced with a fresh puzzle.
    await page.goto('/nonogram/10.12345');
    // Wait for the game to mount: it rewrites the URL on mount if the seed is bad.
    await expect(page.getByLabel('Elapsed time')).toBeVisible();
    await expect(page).toHaveURL(/\/nonogram\/10\.12345$/);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
  });

  test('a game rewriting its seed in the URL keeps the scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/wizard-chess');
    const newGame = page.getByRole('button', { name: 'New game' });
    await expect(newGame).toBeVisible();
    const seedUrl = page.url();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    // A DOM click: Playwright's click() would scroll the button into view first.
    await newGame.evaluate((el: HTMLElement) => el.click());
    await expect(page).not.toHaveURL(seedUrl);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
