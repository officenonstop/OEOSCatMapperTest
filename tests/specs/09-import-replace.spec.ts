import { test, expect } from '@playwright/test';
import { BASE_URL, FIRST_PAGE, PAGE_PROJECTS, PAGE_NUMBERS } from '../helpers/page-constants';
import { resetAllData, exportBundle, exportDataCompact, fetchCategories, saveCategories, addProject } from '../helpers/api';
import { getImagePath } from '../../src/lib/constants';

const PAGE_A = FIRST_PAGE; // 23 — single canonical "The Promenade by the River"
const PAGE_B = PAGE_NUMBERS[1]; // 24 — single canonical "Where Structure Meets Expression"
const PAGE_MULTI = 61; // two canonicals: "Meets the City", "Refined."

async function apiImport(payload: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${BASE_URL}/api/project-categories/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function renameProject(page: number, oldName: string, newName: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/project-categories/rename`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, oldName, newName }),
  });
  if (!response.ok) {
    throw new Error(`Rename failed (${response.status}): ${await response.text()}`);
  }
}

test.describe('Import Data — replace instead of merge', () => {
  test.beforeEach(async () => {
    await resetAllData();
  });

  test('replace, not merge: existing selection overwritten and existing addition dropped', async () => {
    const canonical = PAGE_PROJECTS[PAGE_A][0];
    await saveCategories(PAGE_A, canonical, ['Resort']);
    await addProject(PAGE_A, 'X');

    const result = await apiImport({ [String(PAGE_A)]: { [canonical]: ['Villa'] } });
    expect(result.status).toBe(200);

    expect(await fetchCategories(PAGE_A, canonical)).toEqual(['Villa']);
    expect(await fetchCategories(PAGE_A, 'X')).toEqual([]);
    const bundle = await exportBundle();
    expect(bundle.additions[String(PAGE_A)]).toBeUndefined();
  });

  test('page not in JSON is cleared; page number and image path remain', async () => {
    const canonical = PAGE_PROJECTS[PAGE_B][0];
    await saveCategories(PAGE_B, canonical, ['Resort']);

    const importedCanonical = PAGE_PROJECTS[PAGE_A][0];
    const result = await apiImport({ [String(PAGE_A)]: { [importedCanonical]: ['Villa'] } });
    expect(result.status).toBe(200);

    expect(await fetchCategories(PAGE_B, canonical)).toEqual([]);
    expect(PAGE_NUMBERS).toContain(PAGE_B);
    expect(getImagePath(PAGE_B)).toBe(`/images/page_0${PAGE_B}.jpg`);
  });

  test('omitted canonical on an imported multi-project page keeps identity, loses selections', async () => {
    await saveCategories(PAGE_MULTI, 'Meets the City', ['Villa']);
    await saveCategories(PAGE_MULTI, 'Refined.', ['Resort']);

    const result = await apiImport({ [String(PAGE_MULTI)]: { 'Meets the City': ['Villa'] } });
    expect(result.status).toBe(200);

    expect(await fetchCategories(PAGE_MULTI, 'Meets the City')).toEqual(['Villa']);
    expect(await fetchCategories(PAGE_MULTI, 'Refined.')).toEqual([]);
  });

  test('v4 import replaces renames from JSON', async () => {
    const canonical = PAGE_PROJECTS[PAGE_A][0];
    await renameProject(PAGE_A, canonical, 'Alpha');

    const result = await apiImport({
      schemaVersion: 4,
      categories: { [String(PAGE_A)]: { Aurora: ['Villa'] } },
      renames: { [String(PAGE_A)]: { [canonical]: 'Aurora' } },
      additions: {},
    });
    expect(result.status).toBe(200);

    const bundle = await exportBundle();
    expect(bundle.renames[String(PAGE_A)]).toEqual({ [canonical]: 'Aurora' });
    expect(await fetchCategories(PAGE_A, 'Aurora')).toEqual(['Villa']);
  });

  test('legacy import (no schemaVersion) clears renames', async () => {
    const canonical = PAGE_PROJECTS[PAGE_A][0];
    await renameProject(PAGE_A, canonical, 'Alpha');

    const result = await apiImport({ [String(PAGE_A)]: { [canonical]: ['Villa'] } });
    expect(result.status).toBe(200);

    const bundle = await exportBundle();
    expect(bundle.renames).toEqual({});
  });

  test('v4 import rebuilds additions from JSON', async () => {
    await addProject(PAGE_A, 'Old');

    const result = await apiImport({
      schemaVersion: 4,
      categories: { [String(PAGE_A)]: { New: ['Villa'] } },
      renames: {},
      additions: { [String(PAGE_A)]: ['New'] },
    });
    expect(result.status).toBe(200);

    const bundle = await exportBundle();
    expect(bundle.additions[String(PAGE_A)]).toEqual(['New']);
    expect(await fetchCategories(PAGE_A, 'New')).toEqual(['Villa']);
    expect(await fetchCategories(PAGE_A, 'Old')).toEqual([]);
  });

  test('no conflict when a JSON rename collides with a pre-existing addition', async () => {
    await addProject(PAGE_A, 'Twin');
    const canonical = PAGE_PROJECTS[PAGE_A][0];

    const result = await apiImport({
      schemaVersion: 4,
      categories: { [String(PAGE_A)]: { Twin: ['Villa'] } },
      renames: { [String(PAGE_A)]: { [canonical]: 'Twin' } },
      additions: {},
    });
    expect(result.status).toBe(200);

    expect(await fetchCategories(PAGE_A, 'Twin')).toEqual(['Villa']);
    const bundle = await exportBundle();
    expect(bundle.renames[String(PAGE_A)]).toEqual({ [canonical]: 'Twin' });
    expect(bundle.additions[String(PAGE_A)]).toBeUndefined();
  });

  test('idempotent re-import', async () => {
    const payload = {
      schemaVersion: 4,
      categories: { [String(PAGE_A)]: { [PAGE_PROJECTS[PAGE_A][0]]: ['Villa'] } },
      renames: {},
      additions: {},
    };
    const first = await apiImport(payload);
    expect(first.status).toBe(200);
    const bundle1 = await exportBundle();

    const second = await apiImport(payload);
    expect(second.status).toBe(200);
    const bundle2 = await exportBundle();

    expect(bundle2).toEqual(bundle1);
  });

  test('empty JSON wipes all saved data (accepted behavior)', async () => {
    const canonicalA = PAGE_PROJECTS[PAGE_A][0];
    const canonicalB = PAGE_PROJECTS[PAGE_B][0];
    await saveCategories(PAGE_A, canonicalA, ['Resort']);
    await saveCategories(PAGE_B, canonicalB, ['Resort']);

    const result = await apiImport({});
    expect(result.status).toBe(200);

    // saved selections are gone (distinguishes wipe from a no-op merge)
    expect(await fetchCategories(PAGE_A, canonicalA)).toEqual([]);
    expect(await fetchCategories(PAGE_B, canonicalB)).toEqual([]);
    const bundle = await exportBundle();
    expect(bundle.renames).toEqual({});
    expect(bundle.additions).toEqual({});
    expect(await exportDataCompact()).toEqual({});
    expect(PAGE_NUMBERS.length).toBeGreaterThan(0);
    expect(PAGE_PROJECTS[PAGE_A]).toBeDefined();
  });

  test('validation still rejects unknown page / category / duplicate project', async () => {
    const unknownPage = await apiImport({ '3': { Foo: ['Resort'] } });
    expect(unknownPage.status).toBe(422);
    expect(unknownPage.body.error).toMatch(/Unknown page/);

    const unknownCategory = await apiImport({ [String(PAGE_A)]: { [PAGE_PROJECTS[PAGE_A][0]]: ['Nonsense'] } });
    expect(unknownCategory.status).toBe(422);
    expect(unknownCategory.body.error).toMatch(/unknown category/);

    const duplicate = await apiImport({ [String(PAGE_A)]: { Foo: ['Resort'], foo: ['Villa'] } });
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.error).toMatch(/duplicate project/);
  });

  test('malformed JSON rejected; oversize not accepted as 2MiB+ would be', async () => {
    const malformed = await fetch(`${BASE_URL}/api/project-categories/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json',
    });
    expect(malformed.status).toBe(400);
  });

  test('stats include pagesCleared for pages dropped by the import', async () => {
    await saveCategories(PAGE_A, PAGE_PROJECTS[PAGE_A][0], ['Resort']);
    await saveCategories(PAGE_B, PAGE_PROJECTS[PAGE_B][0], ['Resort']);

    const result = await apiImport({ [String(PAGE_A)]: { [PAGE_PROJECTS[PAGE_A][0]]: ['Villa'] } });
    expect(result.status).toBe(200);
    expect(result.body.stats.pagesCleared).toBe(1);
    expect(result.body.stats.projectsRestored).toBeGreaterThanOrEqual(1);
  });

  test('confirm dialog cancelled: file picker does not open and data is unchanged', async ({ page }) => {
    await page.goto(BASE_URL);
    await saveCategories(PAGE_A, PAGE_PROJECTS[PAGE_A][0], ['Resort']);
    const before = await exportBundle();

    let confirmCount = 0;
    page.on('dialog', async (d) => {
      if (d.type() === 'confirm') {
        confirmCount++;
        d.dismiss();
      } else {
        d.accept();
      }
    });

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null);
    await page.getByRole('button', { name: 'Import Data' }).click();
    const chooser = await chooserPromise;
    // confirm was dismissed, so importInputRef.click() never ran and the picker never opened
    expect(chooser).toBeNull();
    expect(confirmCount).toBe(1);

    expect(await exportBundle()).toEqual(before);
  });

  test('confirm dialog accepted: file picker opens and import runs', async ({ page }) => {
    await page.goto(BASE_URL);

    const alertMessage = new Promise<string>((resolve) => {
      page.on('dialog', async (d) => {
        if (d.type() === 'confirm') {
          d.accept();
        } else if (d.type() === 'alert') {
          resolve(d.message());
          d.accept();
        }
      });
    });

    const payload = JSON.stringify({
      schemaVersion: 4,
      categories: { [String(PAGE_A)]: { [PAGE_PROJECTS[PAGE_A][0]]: ['Residential'] } },
      renames: {},
      additions: {},
    });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import Data' }).click(),
    ]);
    await chooser.setFiles({
      name: 'imp.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });

    const msg = await alertMessage;
    expect(msg).toMatch(/Import complete/);
    expect(msg).toMatch(/previous pages cleared/);

    expect(await fetchCategories(PAGE_A, PAGE_PROJECTS[PAGE_A][0])).toEqual(['Residential']);
  });
});