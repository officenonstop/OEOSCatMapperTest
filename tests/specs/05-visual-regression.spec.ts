import { test, expect } from '@playwright/test';
import { BASE_URL, CATEGORIES, PAGE_PROJECTS, PAGE_NUMBERS, FIRST_PAGE } from '../helpers/page-constants';
import { toggleCategory } from '../helpers/categories';

import { resetAllData } from '../helpers/api';

test.describe('Visual Regression Testing', () => {

  test.beforeEach(async () => { await resetAllData(); });

  test('01 - Initial page load (page 23)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('01-initial-page-load.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('02 - Categories selected on project', async ({ page }) => {
    await page.goto(BASE_URL);
    await toggleCategory(page, 'Residential');
    await toggleCategory(page, 'Sustainable');
    await toggleCategory(page, 'Waterfront');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('02-categories-selected.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('03 - Multi-project page (page 61)', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const targetPage = 61;
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('03-multi-project-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('04 - Show Page overlay open', async ({ page }) => {
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < 3; i++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
    await page.locator('button:has-text("Show Page")').hover(); await page.mouse.down();
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('04-show-page-overlay.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.05,
    });
    await page.mouse.up();
    await page.waitForTimeout(300);
  });

  test('05 - Project rename inline editing', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('button[title="Edit project name"]').click();
    await page.waitForTimeout(300);
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill('Editing Project Name');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('05-rename-inline-editing.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
    await input.press('Enter');
  });

  test('06 - After Delete All Data — clean state', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    await toggleCategory(page, 'Residential');
    await toggleCategory(page, 'Sustainable');
    await page.waitForTimeout(300);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button:has-text("Delete All Data")').click();
    await page.waitForTimeout(3000);

    await expect(page).toHaveScreenshot('06-after-delete-all.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
      timeout: 15000,
    });
  });

  test('07 - All 66 categories toggled on', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    for (const cat of CATEGORIES) {
      await toggleCategory(page, cat);
    }
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('07-all-categories-toggled.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('08 - Mobile viewport (375x812)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('08-mobile-viewport.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('09 - Tablet viewport (1024x768)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('09-tablet-viewport.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('10 - Sidebar with many projects (page 235 — 6 projects)', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const targetPage = 235;
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('10-sidebar-many-projects.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });

  test('11 - Renamed project with special characters', async ({ page }) => {
    await page.goto(BASE_URL);
    const specialName = '★ Project Alpha ★';
    await page.locator('button[title="Edit project name"]').click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill(specialName);
    await input.press('Enter');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('11-renamed-special-chars.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  });
});






