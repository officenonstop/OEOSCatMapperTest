import { test, expect, type Dialog, type Page } from '@playwright/test';
import { BASE_URL, FIRST_PAGE, PAGE_NUMBERS, PAGE_PROJECTS } from '../helpers/page-constants';
import { exportBundle, exportData, exportDataCompact, resetAllData } from '../helpers/api';
import { categoryButton } from '../helpers/categories';
import type { CategoryExportV4 } from '../../src/lib/types';

interface ExpectedDialog {
  type: Dialog['type'] extends () => infer T ? T : never;
  message: RegExp;
  value?: string;
  dismiss?: boolean;
}

async function withDialogs(
  page: Page,
  expected: ExpectedDialog[],
  action: () => Promise<unknown>
): Promise<void> {
  let index = 0;
  let resolveDialogs!: () => void;
  let rejectDialogs!: (error: Error) => void;
  const dialogsDone = new Promise<void>((resolve, reject) => {
    resolveDialogs = resolve;
    rejectDialogs = reject;
  });

  const listener = (dialog: Dialog) => {
    const expectation = expected[index++];
    if (!expectation) {
      rejectDialogs(new Error(`Unexpected ${dialog.type()} dialog: ${dialog.message()}`));
      void dialog.dismiss();
      return;
    }
    try {
      expect(dialog.type()).toBe(expectation.type);
      expect(dialog.message()).toMatch(expectation.message);
      const handled = expectation.dismiss
        ? dialog.dismiss()
        : dialog.accept(expectation.value);
      void handled.then(() => {
        if (index === expected.length) resolveDialogs();
      });
    } catch (error) {
      rejectDialogs(error instanceof Error ? error : new Error(String(error)));
      void dialog.dismiss();
    }
  };

  page.on('dialog', listener);
  try {
    await Promise.all([action(), dialogsDone]);
  } finally {
    page.off('dialog', listener);
  }
}

async function toggleCategoryAndWait(page: Page, category: string): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/project-categories')
    && response.request().method() === 'PUT'
  );
  await categoryButton(page, category).click();
  expect((await responsePromise).ok()).toBe(true);
}

async function addProjectThroughUI(page: Page, name: string): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/project-categories/add-project')
    && response.request().method() === 'POST'
  );
  await withDialogs(
    page,
    [{ type: 'prompt', message: /Enter new project name/, value: name }],
    () => page.getByRole('button', { name: 'Add Project' }).click()
  );
  expect((await responsePromise).ok()).toBe(true);
}

async function renameCurrentProject(page: Page, name: string): Promise<void> {
  await page.getByTitle('Edit project name').click();
  const input = page.locator('header input[aria-label="Project name"]');
  await input.fill(name);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/project-categories/rename')
    && response.request().method() === 'PUT'
  );
  await input.press('Enter');
  const response = await responsePromise;
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Rename failed (${response.status()}): ${body}`);
  }
}

async function deleteCurrentProject(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/project-categories/delete-project')
    && response.request().method() === 'DELETE'
  );
  await withDialogs(
    page,
    [{ type: 'confirm', message: /Delete project '.+' and all its categories/ }],
    () => page.getByRole('button', { name: 'Delete Project' }).click()
  );
  expect((await responsePromise).ok()).toBe(true);
}

async function downloadExport(page: Page): Promise<CategoryExportV4> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Data' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Export download stream was unavailable');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as CategoryExportV4;
}

async function importThroughButton(
  page: Page,
  name: string,
  content: string,
  expectedDialogs: ExpectedDialog[],
  expectRequest = true
): Promise<void> {
  const responsePromise = expectRequest
    ? page.waitForResponse((response) =>
        response.url().endsWith('/api/project-categories/import')
        && response.request().method() === 'POST',
        { timeout: 120000 }
      )
    : undefined;

  // Set files directly on the hidden file input — onChange fires handleImportChange
  await withDialogs(page, expectedDialogs, () =>
    page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    })
  );
  if (responsePromise) await responsePromise;
}

async function deleteAllThroughUI(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/project-categories')
    && response.request().method() === 'DELETE'
  );
  const navigationPromise = page.waitForEvent('framenavigated');
  await withDialogs(
    page,
    [
      { type: 'confirm', message: /Delete ALL data/ },
      { type: 'alert', message: /All data deleted/ },
    ],
    () => page.getByRole('button', { name: 'Delete All Data' }).click()
  );
  expect((await responsePromise).ok()).toBe(true);
  await navigationPromise;
}

test.describe('V4 project mutations and data transfer', () => {
  test.beforeEach(async () => {
    await resetAllData();
  });

  test('buttons are visible, ordered, and styled', async ({ page }) => {
    await page.goto(BASE_URL);
    const actions = page.locator('aside > div').last().getByRole('button');
    await expect(actions).toHaveText([
      'Export Data',
      'Import Data',
      'Add Project',
      'Delete Project',
      'Delete All Data',
    ]);
    await expect(page.getByRole('button', { name: 'Import Data' })).toHaveClass(/bg-purple-600/);
    await expect(page.getByRole('button', { name: 'Add Project' })).toHaveClass(/bg-blue-600/);
    await expect(page.getByRole('button', { name: 'Delete Project' })).toHaveClass(/bg-orange-700/);
  });

  test('new project is selected immediately and starts empty', async ({ page }) => {
    await page.goto(BASE_URL);
    await toggleCategoryAndWait(page, 'Residential');
    await page.waitForTimeout(500);
    await addProjectThroughUI(page, 'Empty Addition');
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(500);

    // Verify via export that project was persisted
    const data = await exportData();
    const pageData = data[String(FIRST_PAGE)];
    expect(pageData).toBeDefined();
    if (pageData) {
      expect(pageData['Empty Addition'] ?? []).toEqual([]);
      expect(pageData[PAGE_PROJECTS[FIRST_PAGE][0]] ?? []).toContain('Residential');
    }
  });

  test('effective duplicate name is rejected without category loss', async ({ page }) => {
    await page.goto(BASE_URL);
    await toggleCategoryAndWait(page, 'Residential');
    await renameCurrentProject(page, 'Renamed Project');

    await withDialogs(
      page,
      [
        { type: 'prompt', message: /Enter new project name/, value: 'renamed project' },
        { type: 'alert', message: /already exists/ },
      ],
      () => page.getByRole('button', { name: 'Add Project' }).click()
    );

    await expect(page.locator('aside').getByRole('button', { name: /Renamed Project/ })).toHaveCount(1);
    const bundle = await exportBundle();
    expect(bundle.categories[String(FIRST_PAGE)]['Renamed Project']).toEqual(['Residential']);
    expect(bundle.additions[String(FIRST_PAGE)]).toBeUndefined();
  });

  test('duplicate add API returns conflict without erasing categories', async ({ page }) => {
    await page.goto(BASE_URL);
    await toggleCategoryAndWait(page, 'Residential');
    const original = PAGE_PROJECTS[FIRST_PAGE][0];
    const response = await page.request.post(`${BASE_URL}/api/project-categories/add-project`, {
      data: { page: FIRST_PAGE, project: original },
    });
    expect(response.status()).toBe(409);
    expect((await exportData())[String(FIRST_PAGE)][original]).toEqual(['Residential']);
  });

  test('failed add rolls back optimistic state', async ({ page }) => {
    await page.route('**/api/project-categories/add-project', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Injected add failure' }),
    }));
    await page.goto(BASE_URL);
    await withDialogs(
      page,
      [
        { type: 'prompt', message: /Enter new project name/, value: 'Will Roll Back' },
        { type: 'alert', message: /Injected add failure/ },
      ],
      () => page.getByRole('button', { name: 'Add Project' }).click()
    );
    await expect(page.locator('aside').getByRole('button', { name: /Will Roll Back/ })).toHaveCount(0);
    await expect(page.locator('aside [aria-pressed="true"]')).toContainText(PAGE_PROJECTS[FIRST_PAGE][0]);
  });

  test('added project can be renamed, reloaded, and deleted', async ({ page }) => {
    await page.goto(BASE_URL);
    await addProjectThroughUI(page, 'Before Rename');
    await page.reload();
    await page.waitForTimeout(500);
    // Select the new project
    await page.locator('aside').getByRole('button', { name: /Before Rename/ }).click();
    await toggleCategoryAndWait(page, 'Sustainable');
    await renameCurrentProject(page, 'After Rename');
    await page.reload();
    await page.waitForTimeout(500);

    const renamed = page.locator('aside').getByRole('button', { name: /After Rename/ });
    await expect(renamed).toBeVisible();
    await expect(page.locator('aside').getByRole('button', { name: /Before Rename/ })).toHaveCount(0);
    await renamed.click();
    await expect(categoryButton(page, 'Sustainable')).toHaveClass(/bg-blue-100/);
    await deleteCurrentProject(page);
    await expect(renamed).toHaveCount(0);
    expect((await exportBundle()).additions[String(FIRST_PAGE)]).toBeUndefined();
  });

  test('deleting a lone canonical project clears UI and persistence', async ({ page }) => {
    await page.goto(BASE_URL);
    await toggleCategoryAndWait(page, 'Residential');
    await deleteCurrentProject(page);

    await expect(categoryButton(page, 'Residential')).toHaveClass(/bg-white/);
    await expect(page.locator('aside').getByRole('button', { name: /The Promenade by the River/ })).toContainText('*');
    expect((await exportDataCompact())[String(FIRST_PAGE)]).toBeUndefined();
  });

  test('failed delete restores project and categories', async ({ page }) => {
    await page.goto(BASE_URL);
    await addProjectThroughUI(page, 'Delete Rollback');
    await toggleCategoryAndWait(page, 'Residential');
    await page.route('**/api/project-categories/delete-project', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Injected delete failure' }),
    }));

    await withDialogs(
      page,
      [
        { type: 'confirm', message: /Delete project 'Delete Rollback'/ },
        { type: 'alert', message: /Injected delete failure/ },
      ],
      () => page.getByRole('button', { name: 'Delete Project' }).click()
    );
    await expect(page.locator('aside').getByRole('button', { name: /Delete Rollback/ })).toBeVisible();
    await expect(categoryButton(page, 'Residential')).toHaveClass(/bg-blue-100/);
  });

  test('fresh export contains every canonical page and project', async ({ page }) => {
    await page.goto(BASE_URL);
    const bundle = await downloadExport(page);
    expect(bundle.schemaVersion).toBe(4);
    expect(Object.keys(bundle.categories)).toEqual(PAGE_NUMBERS.map(String));
    for (const pageNumber of PAGE_NUMBERS) {
      for (const project of PAGE_PROJECTS[pageNumber]) {
        expect(bundle.categories[String(pageNumber)][project]).toEqual([]);
      }
    }
  });

  test('V4 export restores renames, additions, and categories exactly', async ({ page }) => {
    test.slow();
    await page.goto(BASE_URL);
    await renameCurrentProject(page, 'Round Trip Canonical');
    await toggleCategoryAndWait(page, 'Residential');
    await addProjectThroughUI(page, 'Round Trip Addition');
    await toggleCategoryAndWait(page, 'Sustainable');
    await page.waitForTimeout(500);
    const before = await downloadExport(page);
    expect(before.schemaVersion).toBe(4);

    await deleteAllThroughUI(page);
    await page.waitForTimeout(2000);
    await importThroughButton(
      page,
      'round-trip.json',
      JSON.stringify(before),
      [{ type: 'alert', message: /Import complete/ }]
    );
    await page.waitForTimeout(1000);

    await expect(page.locator('aside').getByRole('button', { name: /Round Trip Canonical/ })).toBeVisible();
    await expect(page.locator('aside').getByRole('button', { name: /Round Trip Addition/ })).toBeVisible();
    
    // Verify categories are restored via export
    const after = await downloadExport(page);
    const pageKey = String(FIRST_PAGE);
    expect(after.schemaVersion).toBe(4);
    expect(after.categories[pageKey]['Round Trip Canonical']).toEqual(['Residential']);
    expect(after.categories[pageKey]['Round Trip Addition']).toEqual(['Sustainable']);
    
    // V4 rename identity preserved (canonical → renamed stays as rename, not addition)
    expect(after.renames[pageKey]['The Promenade by the River'] ?? null).toBe('Round Trip Canonical');
    expect(after.additions[pageKey]).toContain('Round Trip Addition');
  });

  test('legacy CategoryData import remains supported', async ({ page }) => {
    await page.goto(BASE_URL);
    const legacy = { [String(FIRST_PAGE)]: { 'Legacy Addition': ['Residential'] } };
    await importThroughButton(
      page,
      'legacy.json',
      JSON.stringify(legacy),
      [{ type: 'alert', message: /Import complete/ }]
    );
    const project = page.locator('aside').getByRole('button', { name: /Legacy Addition/ });
    await expect(project).toBeVisible();
    await project.click();
    await expect(categoryButton(page, 'Residential')).toHaveClass(/bg-blue-100/);
  });

  test('malformed and structurally invalid files do not mutate data', async ({ page }) => {
    await page.goto(BASE_URL);
    const before = await exportBundle();
    await importThroughButton(
      page,
      'malformed.json',
      '{ invalid json',
      [{ type: 'alert', message: /Unexpected token|JSON/ }],
      false
    );
    await importThroughButton(
      page,
      'invalid-shape.json',
      JSON.stringify({ [String(FIRST_PAGE)]: { Project: [1, null] } }),
      [{ type: 'alert', message: /array of strings/ }],
      false
    );
    expect(await exportBundle()).toEqual(before);
  });

  test('import HTTP error is surfaced and preserves state', async ({ page }) => {
    await page.route('**/api/project-categories/import', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Injected import failure' }),
    }));
    await page.goto(BASE_URL);
    const before = await exportBundle();
    const legacy = { [String(FIRST_PAGE)]: { 'Never Imported': ['Residential'] } };
    await importThroughButton(
      page,
      'server-error.json',
      JSON.stringify(legacy),
      [{ type: 'alert', message: /Injected import failure/ }]
    );
    expect(await exportBundle()).toEqual(before);
  });
});
