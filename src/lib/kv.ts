import fs from "node:fs/promises";
import path from "node:path";
import { PAGE_PROJECTS } from "./constants";
import { normalizeRenames, resolveEffectiveName } from "./data-transfer";
import type {
  CategoryData,
  ProjectAdditions,
  ProjectRenames,
  ValidatedImport,
} from "./types";

const KV_KEY = "project-categories";
const RENAMES_KEY = "project-renames";
const ADDED_PROJECTS_KEY = "project-additions";

const GLOBAL_CATEGORIES = Symbol.for("catmapper.categories");
const GLOBAL_RENAMES = Symbol.for("catmapper.renames");
const GLOBAL_ADDITIONS = Symbol.for("catmapper.additions");

function getCategories(): CategoryData {
  if (!(GLOBAL_CATEGORIES in (globalThis as any))) {
    (globalThis as any)[GLOBAL_CATEGORIES] = {};
  }
  return (globalThis as any)[GLOBAL_CATEGORIES];
}
function setCategories(data: CategoryData): void {
  (globalThis as any)[GLOBAL_CATEGORIES] = data;
}
function getRenames(): ProjectRenames {
  if (!(GLOBAL_RENAMES in (globalThis as any))) {
    (globalThis as any)[GLOBAL_RENAMES] = {};
  }
  return (globalThis as any)[GLOBAL_RENAMES];
}
function setRenames(data: ProjectRenames): void {
  (globalThis as any)[GLOBAL_RENAMES] = data;
}
function getAdditions(): ProjectAdditions {
  if (!(GLOBAL_ADDITIONS in (globalThis as any))) {
    (globalThis as any)[GLOBAL_ADDITIONS] = {};
  }
  return (globalThis as any)[GLOBAL_ADDITIONS];
}
function setAdditions(data: ProjectAdditions): void {
  (globalThis as any)[GLOBAL_ADDITIONS] = data;
}

export class ProjectConflictError extends Error {}
export class ProjectNotFoundError extends Error {}

// Durable fallback when no Redis/KV is configured (local dev without env vars).
// Previously this module kept everything in globalThis memory only, so a server
// restart wiped adds, category toggles, and renames. We now mirror the three
// stores to a JSON file so process restarts preserve data. Writes are
// best-effort (e.g. read-only filesystems keep memory-only behavior).
function getLocalDataFile(): string {
  return (
    process.env.CATMAPPER_DATA_FILE ??
    path.join(process.cwd(), ".data", "catmapper-data.json")
  );
}

let localLoaded = false;
let localSaveChain: Promise<void> = Promise.resolve();

async function ensureLocalLoaded(): Promise<void> {
  if (localLoaded) return;
  localLoaded = true;
  let raw: string;
  try {
    raw = await fs.readFile(getLocalDataFile(), "utf8");
  } catch {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as {
      categories?: CategoryData;
      renames?: ProjectRenames;
      additions?: ProjectAdditions;
    };
    if (parsed && typeof parsed === "object") {
      if (parsed.categories && typeof parsed.categories === "object") {
        setCategories(cloneCategories(parsed.categories));
      }
      if (parsed.renames && typeof parsed.renames === "object") {
        setRenames(cloneRenames(parsed.renames));
      }
      if (parsed.additions && typeof parsed.additions === "object") {
        setAdditions(cloneAdditions(parsed.additions));
      }
    }
  } catch {
    // Corrupt file -> start empty rather than crashing.
  }
}

async function writeLocalFile(
  categories: CategoryData,
  renames: ProjectRenames,
  additions: ProjectAdditions
): Promise<void> {
  const file = getLocalDataFile();
  const payload = JSON.stringify({ categories, renames, additions }, null, 2);
  const run = async (): Promise<void> => {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await fs.writeFile(tmp, payload, "utf8");
      await fs.rename(tmp, file);
    } catch {
      // Best-effort only.
    }
  };
  localSaveChain = localSaveChain.then(run, run);
  await localSaveChain;
}

async function clearLocalFile(): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      await fs.rm(getLocalDataFile(), { force: true });
    } catch {
      // Best-effort only.
    }
  };
  localSaveChain = localSaveChain.then(run, run);
  await localSaveChain;
}

function getRedisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
}

function getRedisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

function hasConfig() {
  return Boolean(getRedisUrl() && getRedisToken());
}

async function getClient() {
  if (!hasConfig()) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url: getRedisUrl(), token: getRedisToken() });
}

function cloneCategories(data: CategoryData): CategoryData {
  return Object.fromEntries(
    Object.entries(data).map(([page, projects]) => [
      page,
      Object.fromEntries(
        Object.entries(projects).map(([project, categories]) => [project, [...categories]])
      ),
    ])
  );
}

function cloneRenames(data: ProjectRenames): ProjectRenames {
  return Object.fromEntries(
    Object.entries(data).map(([page, renames]) => [page, { ...renames }])
  );
}

function cloneAdditions(data: ProjectAdditions): ProjectAdditions {
  return Object.fromEntries(
    Object.entries(data).map(([page, projects]) => [page, [...projects]])
  );
}

async function persistAll(
  categories: CategoryData,
  renames: ProjectRenames,
  additions: ProjectAdditions
): Promise<void> {
  const client = await getClient();
  if (client) {
    await client
      .multi()
      .set(KV_KEY, categories)
      .set(RENAMES_KEY, renames)
      .set(ADDED_PROJECTS_KEY, additions)
      .exec();
  }

  setCategories(categories);
  setRenames(renames);
  setAdditions(additions);
  if (!client) {
    await writeLocalFile(categories, renames, additions);
  }
}

export async function getAllData(): Promise<CategoryData> {
  const client = await getClient();
  if (!client) {
    await ensureLocalLoaded();
    return getCategories();
  }
  return (await client.get<CategoryData>(KV_KEY)) ?? {};
}

export async function getPageData(page: number): Promise<Record<string, string[]>> {
  const all = await getAllData();
  return all[String(page)] ?? {};
}

export async function getProjectCategories(page: string, project: string): Promise<string[]> {
  const all = await getAllData();
  return all[page]?.[project] ?? [];
}

export async function setProjectCategories(
  page: string,
  project: string,
  categories: string[]
): Promise<void> {
  const pageNumber = Number(page);
  const [storedCategories, renames, additions] = await Promise.all([
    getAllData(),
    getAllRenames(),
    getAddedProjects(),
  ]);
  const knownProjects = [
    ...effectiveCanonicalProjects(pageNumber, normalizeRenames(renames)),
    ...(additions[page] ?? []),
  ];
  const storedName = findName(knownProjects, project);
  if (!storedName) throw new ProjectNotFoundError("Project not found");

  const all = cloneCategories(storedCategories);
  if (!all[page]) all[page] = {};
  all[page][storedName] = [...categories];

  const client = await getClient();
  if (client) await client.set(KV_KEY, all);
  setCategories(all);
  if (!client) {
    await writeLocalFile(getCategories(), getRenames(), getAdditions());
  }
}

export async function getAllRenames(): Promise<ProjectRenames> {
  const client = await getClient();
  if (!client) {
    await ensureLocalLoaded();
    return getRenames();
  }
  return (await client.get<ProjectRenames>(RENAMES_KEY)) ?? {};
}

export async function getAddedProjects(): Promise<ProjectAdditions> {
  const client = await getClient();
  if (!client) {
    await ensureLocalLoaded();
    return getAdditions();
  }
  return (await client.get<ProjectAdditions>(ADDED_PROJECTS_KEY)) ?? {};
}

export async function deleteAllData(): Promise<void> {
  const client = await getClient();
  if (client) {
    await client.multi().del(KV_KEY).del(RENAMES_KEY).del(ADDED_PROJECTS_KEY).exec();
  }
  setCategories({});
  setRenames({});
  setAdditions({});
  await clearLocalFile();
}

function effectiveCanonicalProjects(page: number, renames: ProjectRenames): string[] {
  const pageKey = String(page);
  return (PAGE_PROJECTS[page] ?? []).map((original) =>
    resolveEffectiveName(renames[pageKey], original)
  );
}

function findName(names: string[], requested: string): string | undefined {
  const normalized = requested.toLocaleLowerCase();
  return names.find((name) => name.toLocaleLowerCase() === normalized);
}

function assertNameAvailable(
  page: number,
  requested: string,
  renames: ProjectRenames,
  additions: ProjectAdditions,
  ignoredName?: string
): void {
  const ignored = ignoredName?.toLocaleLowerCase();
  const names = [
    ...effectiveCanonicalProjects(page, renames),
    ...(additions[String(page)] ?? []),
  ];
  const duplicate = names.some((name) => {
    const normalized = name.toLocaleLowerCase();
    return normalized === requested.toLocaleLowerCase() && normalized !== ignored;
  });
  if (duplicate) throw new ProjectConflictError("A project with that name already exists on this page");
}

export async function addProjectToKV(page: string, project: string): Promise<void> {
  const pageNumber = Number(page);
  const [storedCategories, storedRenames, storedAdditions] = await Promise.all([
    getAllData(),
    getAllRenames(),
    getAddedProjects(),
  ]);
  assertNameAvailable(pageNumber, project, storedRenames, storedAdditions);

  const categories = cloneCategories(storedCategories);
  const renames = normalizeRenames(cloneRenames(storedRenames));
  const additions = cloneAdditions(storedAdditions);
  if (!categories[page]) categories[page] = {};
  categories[page][project] = [];
  additions[page] = [...(additions[page] ?? []), project];
  await persistAll(categories, renames, additions);
}

export async function deleteProjectFromKV(
  page: string,
  requestedProject: string
): Promise<"cleared" | "deleted"> {
  const pageNumber = Number(page);
  const [storedCategories, storedRenames, storedAdditions] = await Promise.all([
    getAllData(),
    getAllRenames(),
    getAddedProjects(),
  ]);
  const categories = cloneCategories(storedCategories);
  const renames = normalizeRenames(cloneRenames(storedRenames));
  const additions = cloneAdditions(storedAdditions);
  const pageAdditions = additions[page] ?? [];
  const addedProject = findName(pageAdditions, requestedProject);

  if (addedProject) {
    if (categories[page]) delete categories[page][addedProject];
    additions[page] = pageAdditions.filter((name) => name !== addedProject);
    if (additions[page].length === 0) delete additions[page];
    await persistAll(categories, renames, additions);
    return "deleted";
  }

  const canonicalProject = findName(effectiveCanonicalProjects(pageNumber, renames), requestedProject);
  if (!canonicalProject) throw new ProjectNotFoundError("Project not found");
  if (categories[page]) delete categories[page][canonicalProject];
  await persistAll(categories, renames, additions);
  return "cleared";
}

export async function renameProjectInKV(
  page: string,
  requestedOldName: string,
  newName: string
): Promise<"canonical" | "added"> {
  const pageNumber = Number(page);
  const [storedCategories, storedRenames, storedAdditions] = await Promise.all([
    getAllData(),
    getAllRenames(),
    getAddedProjects(),
  ]);
  const categories = cloneCategories(storedCategories);
  const renames = normalizeRenames(cloneRenames(storedRenames));
  const additions = cloneAdditions(storedAdditions);
  const pageAdditions = additions[page] ?? [];
  const addedProject = findName(pageAdditions, requestedOldName);

  if (addedProject) {
    assertNameAvailable(pageNumber, newName, renames, additions, addedProject);
    additions[page] = pageAdditions.map((name) => (name === addedProject ? newName : name));
    if (!categories[page]) categories[page] = {};
    categories[page][newName] = categories[page][addedProject] ?? [];
    if (newName !== addedProject) delete categories[page][addedProject];
    await persistAll(categories, renames, additions);
    return "added";
  }

  const originals = PAGE_PROJECTS[pageNumber] ?? [];
  const original = originals.find(
    (name) => resolveEffectiveName(renames[page], name).toLocaleLowerCase()
      === requestedOldName.toLocaleLowerCase()
  );
  if (!original) throw new ProjectNotFoundError("Project not found");

  const oldName = resolveEffectiveName(renames[page], original);
  assertNameAvailable(pageNumber, newName, renames, additions, oldName);
  if (!renames[page]) renames[page] = {};
  if (newName === original) delete renames[page][original];
  else renames[page][original] = newName;
  if (Object.keys(renames[page]).length === 0) delete renames[page];

  if (!categories[page]) categories[page] = {};
  if (oldName in categories[page]) {
    categories[page][newName] = categories[page][oldName];
    if (newName !== oldName) delete categories[page][oldName];
  }
  await persistAll(categories, renames, additions);
  return "canonical";
}

export async function importData(data: ValidatedImport): Promise<{
  pagesRestored: number;
  projectsRestored: number;
  additionsCreated: number;
  pagesCleared: number;
}> {
  const [oldCategories, oldRenames, oldAdditions] = await Promise.all([
    getAllData(),
    getAllRenames(),
    getAddedProjects(),
  ]);
  const categories: CategoryData = {};
  const renames: ProjectRenames = {};
  const additions: ProjectAdditions = {};
  let projectsRestored = 0;
  let additionsCreated = 0;
  const restoredPages = new Set<string>();

  const pageKeys = new Set([
    ...Object.keys(data.categories),
    ...Object.keys(data.renames),
    ...Object.keys(data.additions),
  ]);

  let pagesCleared = 0;
  for (const pageKey of Object.keys(oldCategories)) {
    const hadSelections = oldCategories[pageKey] && Object.keys(oldCategories[pageKey]).length > 0;
    const hadRenames = Boolean(oldRenames[pageKey]);
    const hadAdditions = Boolean(oldAdditions[pageKey]);
    if ((hadSelections || hadRenames || hadAdditions) && !pageKeys.has(pageKey)) pagesCleared++;
  }

  for (const page of pageKeys) {
    const pageNumber = Number(page);
    const importedProjects = data.categories[page] ?? {};
    if (!categories[page]) categories[page] = {};

    if (data.format === "v4") {
      const oldPageRenames = renames[page];
      const nextPageRenames = data.renames[page] ?? {};
      const importedAdditions = data.additions[page] ?? [];

      for (const original of PAGE_PROJECTS[pageNumber] ?? []) {
        const oldEffective = resolveEffectiveName(oldPageRenames, original);
        const nextEffective = resolveEffectiveName(nextPageRenames, original);
        const conflictingAddition = findName(additions[page] ?? [], nextEffective);
        if (conflictingAddition && !findName(importedAdditions, conflictingAddition)) {
          throw new ProjectConflictError(
            `Project '${nextEffective}' conflicts with an existing addition on page ${page}`
          );
        }
        if (Object.prototype.hasOwnProperty.call(importedProjects, nextEffective)) {
          categories[page][nextEffective] = [...importedProjects[nextEffective]];
          projectsRestored++;
        }
        if (oldEffective !== nextEffective) delete categories[page][oldEffective];
      }

      if (Object.keys(nextPageRenames).length > 0) renames[page] = { ...nextPageRenames };
      else delete renames[page];

      for (const project of importedAdditions) {
        const existing = findName(additions[page] ?? [], project);
        if (!existing) {
          additions[page] = [...(additions[page] ?? []), project];
          additionsCreated++;
        }
        if (Object.prototype.hasOwnProperty.call(importedProjects, project)) {
          categories[page][existing ?? project] = [...importedProjects[project]];
          projectsRestored++;
        }
      }
    }

    for (const [requestedProject, importedCategories] of Object.entries(importedProjects)) {
      const canonical = (PAGE_PROJECTS[pageNumber] ?? []).find((original) => {
        const effective = resolveEffectiveName(renames[page], original);
        return effective.toLocaleLowerCase() === requestedProject.toLocaleLowerCase()
          || original.toLocaleLowerCase() === requestedProject.toLocaleLowerCase();
      });
      if (canonical) {
        const effective = resolveEffectiveName(renames[page], canonical);
        if (data.format === "legacy") {
          categories[page][effective] = [...importedCategories];
          projectsRestored++;
        }
        restoredPages.add(page);
        continue;
      }

      const existingAddition = findName(additions[page] ?? [], requestedProject);
      if (!existingAddition) {
        additions[page] = [...(additions[page] ?? []), requestedProject];
        additionsCreated++;
      }
      if (data.format === "legacy" || !findName(data.additions[page] ?? [], requestedProject)) {
        categories[page][existingAddition ?? requestedProject] = [...importedCategories];
        projectsRestored++;
      }
      restoredPages.add(page);
    }

    if ((data.additions[page]?.length ?? 0) > 0 || Object.keys(data.renames[page] ?? {}).length > 0) {
      restoredPages.add(page);
    }
    if ((additions[page]?.length ?? 0) === 0) delete additions[page];
  }

  await persistAll(categories, normalizeRenames(renames), additions);
  return {
    pagesRestored: restoredPages.size,
    projectsRestored,
    additionsCreated,
    pagesCleared,
  };
}
