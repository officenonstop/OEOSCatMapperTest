import { BASE_URL } from './page-constants';
import type { CategoryData, CategoryExportV4 } from '../../src/lib/types';

function assertSafeTestTarget(): void {
  const hostname = new URL(BASE_URL).hostname;
  const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  if (!isLoopback && process.env.ALLOW_DESTRUCTIVE_TESTS !== 'true') {
    throw new Error(`Refusing to mutate non-loopback test target '${BASE_URL}'`);
  }
}

export async function resetAllData(): Promise<void> {
  assertSafeTestTarget();
  const response = await fetch(`${BASE_URL}/api/project-categories`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to reset data: ${response.status} ${response.statusText}`);
  }
}

export async function exportBundle(): Promise<CategoryExportV4> {
  const response = await fetch(`${BASE_URL}/api/project-categories/export`);
  if (!response.ok) {
    throw new Error(`Failed to export data: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<CategoryExportV4>;
}

export async function exportData(): Promise<CategoryData> {
  const bundle = await exportBundle();
  return bundle.categories;
}

export async function exportDataCompact(): Promise<CategoryData> {
  const response = await fetch(`${BASE_URL}/api/project-categories/export?compact=true`);
  if (!response.ok) {
    throw new Error(`Failed to export data: ${response.status} ${response.statusText}`);
  }
  const bundle = await response.json() as CategoryExportV4;
  return bundle.categories;
}

export async function fetchCategories(page: number, project: string): Promise<string[]> {
  const response = await fetch(
    `${BASE_URL}/api/project-categories?page=${page}&project=${encodeURIComponent(project)}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.categories ?? [];
}

export async function saveCategories(page: number, project: string, categories: string[]): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/project-categories`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, project, categories }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save categories: ${response.status} ${response.statusText}`);
  }
}

export async function addProject(page: number, project: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/project-categories/add-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, project }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add project: ${response.status} ${response.statusText}`);
  }
}

export async function deleteProject(page: number, project: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/project-categories/delete-project`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, project }),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.status} ${response.statusText}`);
  }
}

export async function importCategories(data: Record<string, Record<string, string[]>>): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/project-categories/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to import data: ${response.status} ${response.statusText}`);
  }
}
