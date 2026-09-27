import { test, expect } from '@playwright/test';
import { BASE_URL, CATEGORIES, PAGE_PROJECTS, PAGE_NUMBERS, FIRST_PAGE, LAST_PAGE } from '../helpers/page-constants';
import { exportData, exportDataCompact } from '../helpers/api';
import { toggleCategory, categoryButton } from '../helpers/categories';

import { resetAllData } from '../helpers/api';

test.describe('Boundary and Negative Testing', () => {

  test.beforeEach(async () => { await resetAllData(); });

  test('01 - Navigate to first page, click Prev repeatedly — page stays at 23', async ({ page }) => {
    await page.goto(BASE_URL);
    const prevBtn = page.locator('text=< Prev Page');
    const header = page.locator('header');

    await prevBtn.click();
    await page.waitForTimeout(300);
    await prevBtn.click();
    await page.waitForTimeout(300);
    await prevBtn.click();
    await page.waitForTimeout(300);

    await expect(header.locator(`text=Page ${FIRST_PAGE}`)).toBeVisible();
  });

  test('02 - Navigate to last page, click Next repeatedly — page stays at 289', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const header = page.locator('header');

    for (let i = 0; i < PAGE_NUMBERS.length - 1; i++) {
      await nextBtn.click();
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);
    await expect(header.locator(`text=Page ${LAST_PAGE}`)).toBeVisible();

    await nextBtn.click();
    await page.waitForTimeout(200);
    await nextBtn.click();
    await page.waitForTimeout(200);
    await nextBtn.click();
    await page.waitForTimeout(200);

    await expect(header.locator(`text=Page ${LAST_PAGE}`)).toBeVisible();
  });

  test('03 - Rapidly click Next 10 times — system stays stable', async ({ page }) => {
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const header = page.locator('header');

    for (let i = 0; i < 10; i++) {
      await nextBtn.click();
    }
    await page.waitForTimeout(1000);

    const expectedPage = PAGE_NUMBERS[Math.min(10, PAGE_NUMBERS.length - 1)];
    await expect(header.locator(`text=Page ${expectedPage}`)).toBeVisible();
  });

  test('04 - Toggle same category twice (on then off) — final state unchecked', async ({ page }) => {
    await page.goto(BASE_URL);

    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(300);
    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(300);

    const data = await exportDataCompact();
    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const savedCats = (data as Record<string, Record<string, string[]>>)?.[pageKey]?.[projectName] ?? [];
    expect(savedCats).not.toContain('Residential');
  });

  test('05 - Toggle all 66 categories on one project — all checked', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);

    for (const cat of CATEGORIES) {
      const responsePromise = page.waitForResponse((r) =>
        r.url().endsWith('/api/project-categories') && r.request().method() === 'PUT'
      );
      await toggleCategory(page, cat);
      await responsePromise;
      await page.waitForTimeout(10);
    }
    await page.waitForTimeout(1000);

    const data = await exportData();
    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const savedCats = (data as Record<string, Record<string, string[]>>)?.[pageKey]?.[projectName] ?? [];
    expect(savedCats.sort()).toEqual([...CATEGORIES].sort());
  });

  test('06 - Toggle all 66 on then all 66 off — final state all unchecked', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);

    for (const cat of CATEGORIES) {
      const responsePromise = page.waitForResponse((r) =>
        r.url().endsWith('/api/project-categories') && r.request().method() === 'PUT'
      );
      await toggleCategory(page, cat);
      await responsePromise;
    }

    for (const cat of CATEGORIES) {
      const responsePromise = page.waitForResponse((r) =>
        r.url().endsWith('/api/project-categories') && r.request().method() === 'PUT'
      );
      await toggleCategory(page, cat);
      await responsePromise;
    }
    await page.waitForTimeout(500);

    const data = await exportData();
    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const savedCats = (data as Record<string, Record<string, string[]>>)?.[pageKey]?.[projectName] ?? [];
    expect(savedCats.length).toBe(0);
  });

  test('07 - Rename to empty string — original name preserved', async ({ page }) => {
    await page.goto(BASE_URL);
    const originalName = PAGE_PROJECTS[FIRST_PAGE][0];

    const editBtn = page.locator('button[title="Edit project name"]');
    await editBtn.click();

    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill('');
    await input.press('Enter');
    await page.waitForTimeout(500);

    const header = page.locator('header');
    await expect(header.locator(`text=${originalName}`)).toBeVisible();
  });

  test('08 - Rename to long string — handled gracefully', async ({ page }) => {
    await page.goto(BASE_URL);
    const longName = 'A'.repeat(500);

    await page.locator('button[title="Edit project name"]').click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill(longName);
    await input.press('Enter');
    await page.waitForTimeout(500);

    const header = page.locator('header');
    const span = header.locator('span.truncate');
    const text = await span.textContent();
    expect(text).toBeDefined();
    expect(text!.trim().length).toBeGreaterThan(0);
  });

  test('09 - Rename with special characters — handled gracefully', async ({ page }) => {
    await page.goto(BASE_URL);
    const specialName = '!@#$%^&*()_+={}[]|;:\'",.<>?/~`';

    await page.locator('button[title="Edit project name"]').click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill(specialName);
    await input.press('Enter');
    await page.waitForTimeout(500);

    const header = page.locator('header');
    await expect(header.locator(`text=${specialName}`)).toBeVisible();
  });

  test('10 - Delete All Data when no data exists — no error', async ({ page }) => {
    await page.goto(BASE_URL);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button:has-text("Delete All Data")').click();
    await page.waitForTimeout(500);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });

  test('11 - Export when no data exists — all pages present with empty categories', async ({ page }) => {
    await page.goto(BASE_URL);

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('button:has-text("Export Data")').click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const bundle = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    const content = bundle.categories;

    // New export includes all pages with empty categories
    expect(Object.keys(content).length).toBe(PAGE_NUMBERS.length);
    for (const pageNum of PAGE_NUMBERS) {
      const pageStr = String(pageNum);
      expect(content[pageStr]).toBeDefined();
      for (const project of PAGE_PROJECTS[pageNum]) {
        expect(content[pageStr][project]).toEqual([]);
      }
    }
  });

  test('12 - Multi-project page with 6 projects — switch between all', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const targetPage = 235;
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(100);
    }

    const projects = PAGE_PROJECTS[targetPage];
    expect(projects.length).toBe(6);

    const sidebar = page.locator('aside');
    for (const project of projects) {
      await sidebar.locator('button', { hasText: project }).click();
      await page.waitForTimeout(200);
      const header = page.locator('header');
      await expect(header.locator(`text=${project}`)).toBeVisible();
    }
  });

  test('13 - Verify page counter accuracy across multiple navigations', async ({ page }) => {
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const header = page.locator('header');

    for (let i = 0; i < 5; i++) {
      await expect(header.locator(`text=Page ${PAGE_NUMBERS[i]}`)).toBeVisible();
      await nextBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('14 - Rename project then navigate away and back — name persists', async ({ page }) => {
    await page.goto(BASE_URL);
    const newName = 'Persist Test Name';

    await page.locator('button[title="Edit project name"]').click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill(newName);
    await input.press('Enter');
    await page.waitForTimeout(300);

    const nextBtn = page.locator('text=Next Page >');
    await nextBtn.click();
    await page.waitForTimeout(300);
    const prevBtn = page.locator('text=< Prev Page');
    await prevBtn.click();
    await page.waitForTimeout(300);

    const header = page.locator('header');
    await expect(header.locator(`text=${newName}`)).toBeVisible();
  });

  test('15 - Show Page overlay should cover the category grid [BUG: overlay only covers header]', async ({ page }) => {
    await page.goto(BASE_URL);

    const showPageBtn = page.locator('button:has-text("Show Page")');
    await showPageBtn.hover();
    await page.mouse.down();
    await page.waitForTimeout(500);

    const catBtn = categoryButton(page, 'Residential');
    await expect(catBtn).not.toBeVisible();
  });

  test('16 - Navigate to page with no image — Show Page handles gracefully', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < PAGE_NUMBERS.length - 1; i++) {
      await nextBtn.click();
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);

    const showPageBtn = page.locator('button:has-text("Show Page")');
    await showPageBtn.hover();
    await page.mouse.down();
    await page.waitForTimeout(500);

    const overlay = page.locator('.absolute.inset-0');
    await expect(overlay).toBeVisible();

    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(overlay).not.toBeVisible();
  });
});







