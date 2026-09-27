import { CATEGORIES, PAGE_PROJECTS } from "./constants";
import type {
  CategoryData,
  CategoryExportV4,
  ProjectAdditions,
  ProjectRenames,
  ValidatedImport,
} from "./types";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECT_NAME_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePage(page: unknown): number {
  const pageNumber = typeof page === "number" ? page : Number(page);
  if (!Number.isInteger(pageNumber) || !(pageNumber in PAGE_PROJECTS)) {
    throw new Error("Unknown page");
  }
  return pageNumber;
}

export function validateProjectName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Project name must be a string");
  const name = value.trim();
  if (!name) throw new Error("Project name cannot be empty");
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    throw new Error(`Project name too long (max ${MAX_PROJECT_NAME_LENGTH} characters)`);
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("Project name cannot contain control characters");
  }
  if (["__proto__", "prototype", "constructor"].includes(name.toLocaleLowerCase())) {
    throw new Error("Project name is reserved");
  }
  return name;
}

function validateCategories(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((category) => typeof category !== "string")) {
    throw new Error(`${path} must be an array of strings`);
  }

  const knownCategories = new Set(CATEGORIES);
  for (const category of value) {
    if (!knownCategories.has(category)) {
      throw new Error(`${path} contains unknown category '${category}'`);
    }
  }
  return [...new Set(value)];
}

export function validateCategorySelection(value: unknown): string[] {
  return validateCategories(value, "Categories");
}

function validateCategoryData(value: unknown): CategoryData {
  if (!isRecord(value)) throw new Error("Categories must be an object");

  const categories: CategoryData = {};
  for (const [pageKey, projectsValue] of Object.entries(value)) {
    const page = validatePage(pageKey);
    if (String(page) !== pageKey) throw new Error(`Invalid page key '${pageKey}'`);
    if (!isRecord(projectsValue)) throw new Error(`Page ${pageKey} must be an object`);

    categories[pageKey] = {};
    const normalizedNames = new Set<string>();
    for (const [rawName, rawCategories] of Object.entries(projectsValue)) {
      const name = validateProjectName(rawName);
      const normalized = name.toLocaleLowerCase();
      if (normalizedNames.has(normalized)) {
        throw new Error(`Page ${pageKey} contains duplicate project '${name}'`);
      }
      normalizedNames.add(normalized);
      categories[pageKey][name] = validateCategories(
        rawCategories,
        `Categories for '${name}' on page ${pageKey}`
      );
    }
  }
  return categories;
}

function validateRenames(value: unknown): ProjectRenames {
  if (!isRecord(value)) throw new Error("Renames must be an object");

  const renames: ProjectRenames = {};
  for (const [pageKey, pageRenamesValue] of Object.entries(value)) {
    const page = validatePage(pageKey);
    if (String(page) !== pageKey) throw new Error(`Invalid rename page key '${pageKey}'`);
    if (!isRecord(pageRenamesValue)) throw new Error(`Renames for page ${pageKey} must be an object`);

    const pageRenames: Record<string, string> = {};
    for (const [original, renamedValue] of Object.entries(pageRenamesValue)) {
      if (!(PAGE_PROJECTS[page] ?? []).includes(original)) {
        throw new Error(`'${original}' is not a canonical project on page ${pageKey}`);
      }
      const renamed = validateProjectName(renamedValue);
      if (renamed !== original) pageRenames[original] = renamed;
    }
    if (Object.keys(pageRenames).length > 0) renames[pageKey] = pageRenames;
  }
  return renames;
}

function validateAdditions(value: unknown): ProjectAdditions {
  if (!isRecord(value)) throw new Error("Additions must be an object");

  const additions: ProjectAdditions = {};
  for (const [pageKey, pageAdditionsValue] of Object.entries(value)) {
    const page = validatePage(pageKey);
    if (String(page) !== pageKey) throw new Error(`Invalid additions page key '${pageKey}'`);
    if (!Array.isArray(pageAdditionsValue)) {
      throw new Error(`Additions for page ${pageKey} must be an array`);
    }
    const names = pageAdditionsValue.map(validateProjectName);
    const normalized = names.map((name) => name.toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      throw new Error(`Additions for page ${pageKey} contain duplicate names`);
    }
    if (names.length > 0) additions[pageKey] = names;
  }
  return additions;
}

export function resolveEffectiveName(
  pageRenames: Record<string, string> | undefined,
  original: string
): string {
  let name = original;
  const visited = new Set<string>();
  while (pageRenames?.[name] && !visited.has(name)) {
    visited.add(name);
    name = pageRenames[name];
  }
  return name;
}

export function normalizeRenames(renames: ProjectRenames): ProjectRenames {
  const normalized: ProjectRenames = {};
  for (const [pageKey, originals] of Object.entries(PAGE_PROJECTS)) {
    const pageRenames = renames[pageKey];
    if (!pageRenames) continue;
    for (const original of originals) {
      const effective = resolveEffectiveName(pageRenames, original);
      if (effective !== original) {
        if (!normalized[pageKey]) normalized[pageKey] = {};
        normalized[pageKey][original] = effective;
      }
    }
  }
  return normalized;
}

function validateV4Identity(payload: ValidatedImport): void {
  for (const [pageKey, originals] of Object.entries(PAGE_PROJECTS)) {
    const seen = new Set<string>();
    const pageRenames = payload.renames[pageKey];

    for (const original of originals) {
      const effective = resolveEffectiveName(pageRenames, original).toLocaleLowerCase();
      seen.add(effective);
    }
    for (const addition of payload.additions[pageKey] ?? []) {
      const normalized = addition.toLocaleLowerCase();
      if (seen.has(normalized)) {
        throw new Error(`Project '${addition}' conflicts with another project on page ${pageKey}`);
      }
      seen.add(normalized);
    }
  }
}

export function parseImportPayload(value: unknown): ValidatedImport {
  if (!isRecord(value)) throw new Error("Import data must be an object");

  if ("schemaVersion" in value) {
    if (value.schemaVersion !== 4) throw new Error("Unsupported export schema version");
    const payload: ValidatedImport = {
      format: "v4",
      categories: validateCategoryData(value.categories),
      renames: normalizeRenames(validateRenames(value.renames)),
      additions: validateAdditions(value.additions),
    };
    validateV4Identity(payload);
    return payload;
  }

  return {
    format: "legacy",
    categories: validateCategoryData(value),
    renames: {},
    additions: {},
  };
}

export function createExportBundle(
  categories: CategoryData,
  renames: ProjectRenames,
  additions: ProjectAdditions
): CategoryExportV4 {
  return {
    schemaVersion: 4,
    categories,
    renames: normalizeRenames(renames),
    additions,
  };
}
