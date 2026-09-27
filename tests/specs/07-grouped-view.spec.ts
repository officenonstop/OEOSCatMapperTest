import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/page-constants';
import { resetAllData } from '../helpers/api';

// Expected group sizes in group-file order (14+11+10+9+10+3+5+4 = 66).
const GROUP_SIZES = [14, 11, 10, 9, 10, 3, 5, 4];

test.describe('Grouped Categories View', () => {

  test.beforeEach(async () => { await resetAllData(); });

  test('01 - Sorted/Grouped toggle renders between Next Page and Show Page and switches without reload', async ({ page }) => {
    await page.goto(BASE_URL);

    const header = page.locator('header');
    const sortedBtn = header.getByRole('button', { name: 'Sorted', exact: true });
    const groupedBtn = header.getByRole('button', { name: 'Grouped', exact: true });
    await expect(sortedBtn).toBeVisible();
    await expect(groupedBtn).toBeVisible();
    // Placement: toggle sits immediately after the Next Page button.
    await expect(header.locator('button:has-text("Next Page >") + div[role="group"]')).toBeVisible();

    // Default view is sorted: single 4-column grid, no group sections.
    await expect(sortedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.grid.grid-cols-4')).toHaveCount(1);
    await expect(page.getByTestId('group-section')).toHaveCount(0);

    // Switching views must not reload the page (marker survives only if no reload).
    await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1; });
    await groupedBtn.click();
    await expect(page.getByTestId('group-section')).toHaveCount(8);
    await expect(groupedBtn).toHaveAttribute('aria-pressed', 'true');

    await sortedBtn.click();
    await expect(page.locator('.grid.grid-cols-4')).toHaveCount(1);
    await expect(page.getByTestId('group-section')).toHaveCount(0);

    const marker = await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload);
    expect(marker).toBe(1);
  });

  test('02 - Grouped view shows 8 colored sections, all 66 cards, black text', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('header').getByRole('button', { name: 'Grouped', exact: true }).click();

    const sections = page.getByTestId('group-section');
    await expect(sections).toHaveCount(8);

    // Membership invariant (review B4): every category rendered exactly once,
    // with per-group sizes matching Grouped-Categories.txt.
    await expect(sections.getByRole('button')).toHaveCount(66);
    for (let i = 0; i < GROUP_SIZES.length; i++) {
      await expect(sections.nth(i).getByRole('button')).toHaveCount(GROUP_SIZES[i]);
      await expect(sections.nth(i).locator('div').first()).toContainText(`Group ${i + 1} (${GROUP_SIZES[i]})`);
    }

    // Each section carries its own group background color (8 distinct values).
    const backgrounds = await sections.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundColor)
    );
    expect(new Set(backgrounds).size).toBe(8);

    // Foreground stays black on cards (spot-check first card of each section).
    for (let i = 0; i < GROUP_SIZES.length; i++) {
      await expect(sections.nth(i).getByRole('button').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
    }
  });

  test('03 - Selection in grouped mode keeps group color and shows dark border', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('header').getByRole('button', { name: 'Grouped', exact: true }).click();

    const firstSection = page.getByTestId('group-section').first();
    const card = firstSection.getByRole('button', { name: /^[✓ ]*Residential$/ });
    const groupBg = await firstSection.evaluate((el) => getComputedStyle(el).backgroundColor);

    await card.click();
    await expect(card.locator('span').first()).toHaveText('✓');

    // Card background still equals the group color (selection must not mask it),
    // and the selected state uses a dark border instead of a tint.
    // (toHaveCSS auto-retries, waiting out the 150ms border-color transition.)
    const cardBg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(cardBg).toBe(groupBg);
    await expect(card).toHaveCSS('border-color', 'rgb(17, 24, 39)'); // gray-900
  });
});
