import { test, expect } from '@playwright/test';
import { BASE_URL, PAGE_NUMBERS } from '../helpers/page-constants';
import { resetAllData } from '../helpers/api';

test.describe('Jump to page', () => {
  test.beforeEach(async () => { await resetAllData(); });

  test('01 - Jump to a valid page navigates on Enter', async ({ page }) => {
    await page.goto(BASE_URL);
    const target = PAGE_NUMBERS[1];
    const jumpInput = page.locator('header input[aria-label="Jump to page"]');
    await expect(jumpInput).toBeVisible();
    await jumpInput.fill(String(target));
    await jumpInput.press('Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('header')).toContainText(`Page ${target}`);
    await expect(jumpInput).toHaveValue('');
  });

  test('02 - Jump to a non-existent page shows an error and keeps the page', async ({ page }) => {
    await page.goto(BASE_URL);
    const invalid = 25; // gap in the sparse PAGE_NUMBERS list (between 24 and 29)
    const jumpInput = page.locator('header input[aria-label="Jump to page"]');
    await jumpInput.fill(String(invalid));
    await jumpInput.press('Enter');
    await page.waitForTimeout(300);
    await expect(page.locator('header')).toContainText(`Page ${invalid} not found`);
    await expect(page.locator('header')).toContainText(`Page ${PAGE_NUMBERS[0]}`);
  });

  test('03 - Error clears when the user edits the input again', async ({ page }) => {
    await page.goto(BASE_URL);
    const jumpInput = page.locator('header input[aria-label="Jump to page"]');
    await jumpInput.fill('25');
    await jumpInput.press('Enter');
    await page.waitForTimeout(200);
    await expect(page.locator('header')).toContainText('Page 25 not found');
    await jumpInput.fill('24');
    await page.waitForTimeout(200);
    await expect(page.locator('header')).not.toContainText('Page 25 not found');
  });

  test('04 - Single Enter after character-by-character typing navigates (no double-Enter)', async ({ page }) => {
    await page.goto(BASE_URL);
    const target = PAGE_NUMBERS[1];
    const jumpInput = page.locator('header input[aria-label="Jump to page"]');
    await jumpInput.click();
    await jumpInput.pressSequentially(String(target), { delay: 50 });
    await jumpInput.press('Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('header')).toContainText(`Page ${target}`);
    await expect(jumpInput).toHaveValue('');
  });
});