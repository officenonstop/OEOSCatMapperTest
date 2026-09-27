import { test, expect } from '@playwright/test';
import { BASE_URL, PAGE_PROJECTS, PAGE_NUMBERS, FIRST_PAGE } from '../helpers/page-constants';
import { resetAllData, exportData, exportDataCompact, fetchCategories } from '../helpers/api';
import { toggleCategory, categoryButton } from '../helpers/categories';

test.describe('Happy Path — Complete User Flows', () => {

  test.beforeEach(async () => {
    await resetAllData();
  });

  test('01 - Select categories on single-project page and verify persistence', async ({ page }) => {
    await page.goto(BASE_URL);

    const categoriesToSelect = ['Residential', 'Sustainable', 'Waterfront'];
    for (const cat of categoriesToSelect) {
      await toggleCategory(page, cat);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1000);

    await page.reload();
    await page.waitForLoadState('load');

    const data = await exportData();
    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const savedCats = (data as Record<string, Record<string, string[]>>)?.[pageKey]?.[projectName] ?? [];
    expect(savedCats.sort()).toEqual(categoriesToSelect.sort());
  });

  test('02 - Navigate multi-project page, switch projects, verify isolated state', async ({ page }) => {
    await page.goto(BASE_URL);

    const targetPage = 61;
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }

    const sidebar = page.locator('aside');
    const project1 = PAGE_PROJECTS[targetPage][0];
    const project2 = PAGE_PROJECTS[targetPage][1];

    await sidebar.locator('button', { hasText: project1 }).click();
    await page.waitForTimeout(300);
    await toggleCategory(page, 'Residential');
    await toggleCategory(page, 'Sustainable');

    await sidebar.locator('button', { hasText: project2 }).click();
    await page.waitForTimeout(300);

    await toggleCategory(page, 'Hotel & Hospitality');

    await sidebar.locator('button', { hasText: project1 }).click();
    await page.waitForTimeout(300);

    const cats1 = await fetchCategories(targetPage, project1);
    expect(cats1).toContain('Residential');
    expect(cats1).toContain('Sustainable');
    expect(cats1).not.toContain('Hotel & Hospitality');
  });

  test('03 - Pagination forward and backward', async ({ page }) => {
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const prevBtn = page.locator('text=< Prev Page');
    const header = page.locator('header');

    await expect(header.locator(`text=Page ${PAGE_NUMBERS[0]}`)).toBeVisible();
    await nextBtn.click();
    await page.waitForTimeout(300);
    await expect(header.locator(`text=Page ${PAGE_NUMBERS[1]}`)).toBeVisible();
    await nextBtn.click();
    await page.waitForTimeout(300);
    await expect(header.locator(`text=Page ${PAGE_NUMBERS[2]}`)).toBeVisible();
    await prevBtn.click();
    await page.waitForTimeout(300);
    await expect(header.locator(`text=Page ${PAGE_NUMBERS[1]}`)).toBeVisible();
    await prevBtn.click();
    await page.waitForTimeout(300);
    await expect(header.locator(`text=Page ${PAGE_NUMBERS[0]}`)).toBeVisible();
  });

  test('04 - Pagination with project state preservation', async ({ page }) => {
    await page.goto(BASE_URL);

    const catsToSelect = ['Residential', 'Sustainable'];
    for (const cat of catsToSelect) {
      await toggleCategory(page, cat);
    }
    await page.waitForTimeout(500);

    const nextBtn = page.locator('text=Next Page >');
    await nextBtn.click();
    await page.waitForTimeout(300);
    const prevBtn = page.locator('text=< Prev Page');
    await prevBtn.click();
    await page.waitForTimeout(300);

    const saved = await fetchCategories(FIRST_PAGE, PAGE_PROJECTS[FIRST_PAGE][0]);
    expect(saved.sort()).toEqual(catsToSelect.sort());
  });

  test('05 - Rename project successfully', async ({ page }) => {
    await page.goto(BASE_URL);
    const newName = 'Renamed Project Test 42';

    const editBtn = page.locator('button[title="Edit project name"]');
    await editBtn.click();

    const input = page.locator('header input[aria-label="Project name"]');
    await expect(input).toBeVisible();
    await input.fill(newName);
    await input.press('Enter');
    await page.waitForTimeout(500);

    const header = page.locator('header');
    await expect(header.locator(`text=${newName}`)).toBeVisible();
    const sidebar = page.locator('aside');
    await expect(sidebar.locator(`text=${newName}`)).toBeVisible();

    await page.reload();
    await page.waitForLoadState('load');
    await expect(header.locator(`text=${newName}`)).toBeVisible();
  });

  test('06 - Show Page overlay opens and closes', async ({ page }) => {
    await page.goto(BASE_URL);
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

  test('07 - Export Data downloads JSON via UI — exact content match', async ({ page }) => {
    await page.goto(BASE_URL);

    const pageKey = String(FIRST_PAGE);
    const projectName = PAGE_PROJECTS[FIRST_PAGE][0];
    const toggledCats = ['Residential', 'Hotel & Hospitality'];

    for (const cat of toggledCats) {
      await toggleCategory(page, cat);
    }
    await page.waitForTimeout(2000);

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

    // New export includes all pages/projects - check only the modified ones
    expect(Object.keys(content).length).toBe(PAGE_NUMBERS.length);
    expect(content[pageKey]).toBeDefined();
    expect(content[pageKey][projectName]).toEqual(toggledCats);
    // Unmodified projects on same page should have empty arrays
    if (PAGE_PROJECTS[FIRST_PAGE].length > 1) {
      for (const p of PAGE_PROJECTS[FIRST_PAGE].slice(1)) {
        expect(content[pageKey][p]).toEqual([]);
      }
    }
    // Other pages should have empty categories for all projects
    for (const p of PAGE_NUMBERS.slice(1)) {
      const pageStr = String(p);
      expect(content[pageStr]).toBeDefined();
      for (const proj of PAGE_PROJECTS[p]) {
        expect(content[pageStr][proj]).toEqual([]);
      }
    }
  });

  test('08 - Delete All Data then verify clean state', async ({ page }) => {
    await page.goto(BASE_URL);

    await toggleCategory(page, 'Residential');
    await toggleCategory(page, 'Sustainable');
    await toggleCategory(page, 'Waterfront');
    await page.waitForTimeout(300);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button:has-text("Delete All Data")').click();
    await page.waitForTimeout(1000);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });

  test('09 - Full end-to-end workflow with export content validation', async ({ page }) => {
    await page.goto(BASE_URL);

    const pageKey = String(FIRST_PAGE);
    const newName = 'E2E Flow Project';
    const editBtn = page.locator('button[title="Edit project name"]');
    await editBtn.click();
    const input = page.locator('header input[aria-label="Project name"]');
    await input.fill(newName);
    await input.press('Enter');
    await page.waitForTimeout(300);

    const toggledCats = ['Residential', 'Sustainable', 'Mixed-Use'];
    for (const cat of toggledCats) {
      await toggleCategory(page, cat);
    }
    await page.waitForTimeout(2000);

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

    // New export includes all pages - check modified page/project
    expect(Object.keys(content).length).toBe(PAGE_NUMBERS.length);
    expect(content[pageKey]).toBeDefined();
    expect(content[pageKey][newName]).toEqual(toggledCats);
    // Unmodified projects on same page should be empty
    if (PAGE_PROJECTS[FIRST_PAGE].length > 1) {
      for (const p of PAGE_PROJECTS[FIRST_PAGE].slice(1)) {
        expect(content[pageKey][p]).toEqual([]);
      }
    }

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button:has-text("Delete All Data")').click();
    await page.waitForTimeout(1000);

    const data = await exportDataCompact();
    expect(Object.keys(data as object).length).toBe(0);
  });

  test('10 - Export with multi-page and multi-project categories — exact content match', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);

    const pageKey1 = String(FIRST_PAGE);
    const proj1 = PAGE_PROJECTS[FIRST_PAGE][0];

    await toggleCategory(page, 'Residential');
    await toggleCategory(page, 'Waterfront');
    await page.waitForTimeout(300);

    const targetPage = 102;
    const nextBtn = page.locator('text=Next Page >');
    for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
      await nextBtn.click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1000);

    const sidebar = page.locator('aside');
    const pageKey2 = String(targetPage);
    const [proj2a, proj2b] = PAGE_PROJECTS[targetPage];

    await sidebar.locator('button', { hasText: proj2a }).click();
    await page.waitForTimeout(1000);
    await toggleCategory(page, 'Sustainable');
    await page.waitForTimeout(500);

    await sidebar.locator('button', { hasText: proj2b }).click();
    await page.waitForTimeout(1000);
    await toggleCategory(page, 'Hotel & Hospitality');
    await toggleCategory(page, 'Mixed-Use');
    await page.waitForTimeout(2000);

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

    // New export includes all pages
    expect(Object.keys(content).length).toBe(PAGE_NUMBERS.length);

    // Check first page
    expect(content[pageKey1]).toBeDefined();
    expect(content[pageKey1][proj1]).toEqual(['Residential', 'Waterfront']);
    if (PAGE_PROJECTS[FIRST_PAGE].length > 1) {
      for (const p of PAGE_PROJECTS[FIRST_PAGE].slice(1)) {
        expect(content[pageKey1][p]).toEqual([]);
      }
    }

    // Check second page
    expect(content[pageKey2]).toBeDefined();
    expect(Object.keys(content[pageKey2]).sort()).toEqual([proj2a, proj2b].sort());
    expect(content[pageKey2][proj2a]).toEqual(['Sustainable']);
    expect(content[pageKey2][proj2b]).toEqual(['Hotel & Hospitality', 'Mixed-Use']);

    // Other pages should have empty categories
    for (const p of PAGE_NUMBERS) {
      if (p === FIRST_PAGE || p === targetPage) continue;
      const pageStr = String(p);
      expect(content[pageStr]).toBeDefined();
      for (const proj of PAGE_PROJECTS[p]) {
        expect(content[pageStr][proj]).toEqual([]);
      }
    }
  });
});





