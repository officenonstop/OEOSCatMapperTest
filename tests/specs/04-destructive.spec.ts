import { test, expect } from '@playwright/test';
import { BASE_URL, PAGE_PROJECTS, PAGE_NUMBERS, FIRST_PAGE } from '../helpers/page-constants';
import { exportData, exportDataCompact } from '../helpers/api';
import { toggleCategory } from '../helpers/categories';

import { resetAllData } from '../helpers/api';

test.describe('Destructive Testing', () => {

  test.beforeEach(async () => { await resetAllData(); });

  async function deleteAllAndWait(page: import('@playwright/test').Page) {
    page.on('dialog', (dialog) => dialog.accept());
    const nav = page.waitForEvent('framenavigated');
    await page.locator('button:has-text("Delete All Data")').click();
    await nav;
    try {
      await page.waitForLoadState('load', { timeout: 15000 });
    } catch {
    }
  }

  test('01 - Delete All Data after toggling categories on 3 different pages', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);

    const targetPages = [FIRST_PAGE, 61, 102];
    const nextBtn = page.locator('text=Next Page >');

    for (let i = 0; i < targetPages.length; i++) {
      const prevPage = i === 0 ? FIRST_PAGE : targetPages[i - 1];
      const prevIdx = PAGE_NUMBERS.indexOf(prevPage);
      const targetIdx = PAGE_NUMBERS.indexOf(targetPages[i]);
      const clicks = targetIdx - prevIdx;
      for (let c = 0; c < Math.abs(clicks); c++) {
        await (clicks > 0 ? nextBtn : page.locator('text=< Prev Page')).click();
        await page.waitForTimeout(200);
      }

      const projects = PAGE_PROJECTS[targetPages[i]];
      const sidebar = page.locator('aside');
      await sidebar.locator('button', { hasText: projects[0] }).click();
      await page.waitForTimeout(200);

      await toggleCategory(page, 'Residential');
      await toggleCategory(page, 'Sustainable');
    }

    await deleteAllAndWait(page);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);

    const header = page.locator('header');
    await expect(header.locator('text=*')).toBeVisible();
  });

  test('02 - Delete All Data after renaming 2 projects — renames also cleared', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.locator('button[title="Edit project name"]').click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill('Rename Alpha');
    await input.press('Enter');
    await page.waitForTimeout(300);

    const nextBtn = page.locator('text=Next Page >');
    await nextBtn.click();
    await page.waitForTimeout(300);

    const sidebar = page.locator('aside');
    await sidebar.locator('button', { hasText: 'Where Structure Meets Expression' }).click();
    await page.waitForTimeout(200);

    await page.locator('button[title="Edit project name"]').click();
    const input2 = page.locator('header input[aria-label="Project name"]');
    await input2.fill('Rename Beta');
    await input2.press('Enter');
    await page.waitForTimeout(300);

    await deleteAllAndWait(page);

    const header = page.locator('header');
    const originalName = PAGE_PROJECTS[FIRST_PAGE][0];
    await expect(header.locator(`text=${originalName}`)).toBeVisible();
  });

  test('03 - Rapid double-click Delete All Data — no error', async ({ page }) => {
    await page.goto(BASE_URL);

    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(300);

    page.on('dialog', (dialog) => dialog.accept());
    const deleteBtn = page.locator('button:has-text("Delete All Data")');
    await deleteBtn.click();
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });

  test('04 - Delete All Data then Export — all pages present with empty categories via UI download', async ({ page }) => {
    await page.goto(BASE_URL);

    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(300);

    await deleteAllAndWait(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('button:has-text("Export Data")').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);

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

  test('05 - Toggle categories, refresh, verify auto-save persistence', async ({ page }) => {
    await page.goto(BASE_URL);

    const r1 = page.waitForResponse(r => r.url().endsWith('/api/project-categories') && r.request().method() === 'PUT');
    await toggleCategory(page, 'Residential');
    await r1;
    await page.waitForTimeout(50);
    const r2 = page.waitForResponse(r => r.url().endsWith('/api/project-categories') && r.request().method() === 'PUT');
    await toggleCategory(page, 'Waterfront');
    await r2;
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForLoadState('load');

    const data = await exportDataCompact();
    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const savedCats = (data as Record<string, Record<string, string[]>>)?.[pageKey]?.[projectName] ?? [];
    expect(savedCats).toContain('Residential');
    expect(savedCats).toContain('Waterfront');
  });

  test('06 - Delete All Data on multi-project page with mixed state — all reset', async ({ page }) => {
    await page.goto(BASE_URL);
    const targetPage = 61;
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(200);
    }

    const sidebar = page.locator('aside');
    const project1 = PAGE_PROJECTS[targetPage][0];
    const project2 = PAGE_PROJECTS[targetPage][1];

    await sidebar.locator('button', { hasText: project1 }).click();
    await page.waitForTimeout(200);
    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(200);

    await sidebar.locator('button', { hasText: project2 }).click();
    await page.waitForTimeout(200);
    await toggleCategory(page, 'Sustainable');
    await page.waitForTimeout(200);

    await deleteAllAndWait(page);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });

  test.skip('07 - Delete All clicked through overlay with force:true — overlay does not interfere', async ({ page }) => {
    await page.goto(BASE_URL);

    await toggleCategory(page, 'Residential');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("Show Page")').hover(); await page.mouse.down();
    await page.waitForTimeout(500);

    const overlay = page.locator('.absolute.inset-0');
    await expect(overlay).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    const nav = page.waitForEvent('framenavigated');
    await page.locator('button:has-text("Delete All Data")').click({ force: true });
    await nav;
    try {
      await page.waitForLoadState('load', { timeout: 15000 });
    } catch {
    }

    await page.mouse.up();

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });
});








