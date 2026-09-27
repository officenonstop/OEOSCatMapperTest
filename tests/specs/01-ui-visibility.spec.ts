import { test, expect } from '@playwright/test';
import { BASE_URL, CATEGORIES, FIRST_PAGE, LAST_PAGE, TOTAL_PAGES, PAGE_PROJECTS, PAGE_NUMBERS } from '../helpers/page-constants';
import { categoryButton } from '../helpers/categories';

test.describe('UI Element Visibility Assertions', () => {

  test('01 - Page loads with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle('CatMapper');
  });

  test('02 - Sidebar is present with correct layout', async ({ page }) => {
    await page.goto(BASE_URL);
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('text=Export Data')).toBeVisible();
    await expect(sidebar.locator('text=Delete All Data')).toBeVisible();
  });

  test('03 - All 66 category buttons render in a 4-column grid', async ({ page }) => {
    await page.goto(BASE_URL);
    const grid = page.locator('.grid.grid-cols-4');
    await expect(grid).toBeVisible();
    const buttons = grid.locator('button');
    await expect(buttons).toHaveCount(66);
  });

  test('04 - Header contains all expected elements', async ({ page }) => {
    await page.goto(BASE_URL);
    const header = page.locator('header');
    await expect(header.locator('text=< Prev Page')).toBeVisible();
    await expect(header.locator('text=Next Page >')).toBeVisible();
    await expect(header.locator('text=Show Page')).toBeVisible();
    await expect(header.locator(`text=Page ${FIRST_PAGE}`)).toBeVisible();
    const editButton = header.locator('button[title="Edit project name"]');
    await expect(editButton).toBeVisible();
  });

  test('05 - Default page is 23 with first project selected', async ({ page }) => {
    await page.goto(BASE_URL);
    const sidebar = page.locator('aside');
    const firstProject = PAGE_PROJECTS[FIRST_PAGE][0];
    await expect(sidebar.locator(`text=${firstProject}`)).toBeVisible();
    const selectedProject = sidebar.locator('.space-y-1 button.bg-blue-600');
    await expect(selectedProject).toContainText(firstProject);
  });

  test('06 - Uncategorized asterisk visible for new projects', async ({ page }) => {
    await page.goto(BASE_URL);
    const header = page.locator('header');
    await expect(header.locator('text=*')).toBeVisible();
    const sidebar = page.locator('aside');
    await expect(sidebar.locator('text=*')).toBeVisible();
  });

  test('07 - Export Data button has green styling', async ({ page }) => {
    await page.goto(BASE_URL);
    const exportBtn = page.locator('button:has-text("Export Data")');
    await expect(exportBtn).toHaveClass(/bg-green-600/);
  });

  test('08 - Delete All Data button has red styling', async ({ page }) => {
    await page.goto(BASE_URL);
    const deleteBtn = page.locator('button:has-text("Delete All Data")');
    await expect(deleteBtn).toHaveClass(/bg-red-600/);
  });

  test('09 - All categories start unchecked', async ({ page }) => {
    await page.goto(BASE_URL);
    const buttons = page.locator('.grid.grid-cols-4 button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const checkbox = buttons.nth(i).locator('span.w-3.h-3.rounded.border');
      await expect(checkbox).toBeVisible();
      const text = await checkbox.textContent();
      expect(text?.trim()).toBe('');
    }
  });

  test('10 - Prev page does not go below first page', async ({ page }) => {
    await page.goto(BASE_URL);
    const prevBtn = page.locator('text=< Prev Page');
    await prevBtn.click();
    await page.waitForTimeout(500);
    const header = page.locator('header');
    await expect(header.locator(`text=Page ${FIRST_PAGE}`)).toBeVisible();
  });

  test('11 - Next page on last page does not go above last page', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    const nextBtn = page.locator('text=Next Page >');
    const header = page.locator('header');
    const lastPageNum = LAST_PAGE;

    const totalClicks = PAGE_NUMBERS.length - 1;
    for (let i = 0; i < totalClicks; i++) {
      await nextBtn.click();
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);
    await expect(header.locator(`text=Page ${lastPageNum}`)).toBeVisible();

    await nextBtn.click();
    await page.waitForTimeout(200);
    await nextBtn.click();
    await page.waitForTimeout(200);
    await nextBtn.click();
    await page.waitForTimeout(200);
    await expect(header.locator(`text=Page ${lastPageNum}`)).toBeVisible();
  });

  test('12 - Category buttons are clickable and have hover effect', async ({ page }) => {
    await page.goto(BASE_URL);
    const firstCategory = page.locator('.grid.grid-cols-4 button').first();
    await expect(firstCategory).toBeVisible();
    const initialClass = await firstCategory.getAttribute('class');
    expect(initialClass).toContain('hover:bg-gray-100');
  });

  test('13 - All 66 category labels are present in the grid', async ({ page }) => {
    await page.goto(BASE_URL);
    for (const category of CATEGORIES) {
      await expect(categoryButton(page, category)).toBeVisible();
    }
  });
});

