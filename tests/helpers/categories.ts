import { type Page } from '@playwright/test';

export function categoryButton(page: Page, name: string) {
  return page.locator('.grid.grid-cols-4').getByRole('button', {
    name: new RegExp(`^[✓ ]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  });
}

export async function toggleCategory(page: Page, name: string): Promise<void> {
  await categoryButton(page, name).click();
}
