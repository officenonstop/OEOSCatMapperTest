# Enhancement Plan v3: Add Project / Delete Project / Import Categories + Enhanced Export

---

## 1. Three New Buttons — Functionality

### "Add Project"
- Opens a `prompt()` dialog (consistent with existing `confirm()`/`alert()` pattern) for the new project name
- Validation: non-empty after trim; reject if name matches any existing project on that page (original `PAGE_PROJECTS` + already-added projects)
- Sends `POST /api/project-categories/add-project` with `{ page: number, project: string }`
- Server: adds to `project-additions` KV key (`{ [page]: string[] }`) AND initializes empty categories in main `project-categories` KV
- Context: `addProject(name)` updates local `addedProjects` state optimistically, then calls API
- New project appears in sidebar (`ProjectList`) immediately and is auto-selected
- Max length: 500 chars (consistent with rename)

### "Delete Project"
- Shows `confirm()` dialog: "Delete project '[name]' and all its categories?"
- Sends `DELETE /api/project-categories/delete-project` with `{ page: number, project: string }`
- Server: removes from `project-categories` KV; if project was in `project-additions`, removes from there too
- Context: `deleteProject(name)` updates local `addedProjects` state optimistically
- **Original project** (from `PAGE_PROJECTS`): categories cleared in KV; project remains visible in sidebar with `*` (zero categories)
- **Added project** (from `project-additions`): completely removed from sidebar and `project-additions`
- If deleted project was currently selected: switch to first remaining project on that page (originals first, then additions)

### "Import Categories"
- Button click triggers hidden `<input type="file" accept=".json">` via `ref.current.click()`
- User selects a previously exported JSON file
- Client parses JSON, validates it matches `CategoryData` shape (`Record<string, Record<string, string[]>>`)
- Sends `POST /api/project-categories/import` with parsed data
- Server: for each page/project in import data:
  - If project exists in `PAGE_PROJECTS[page]` → `setProjectCategories(page, project, categories)`
  - Else → `addProjectToKV(page, project, categories)` + add to `project-additions[page]`
- Server returns `{ success: true, stats: { pagesRestored, projectsRestored, additionsCreated } }`
- Client: calls `loadPageData(currentPage, currentProject)` to refresh (no full reload)

---

## 2. Enhanced "Export Categories"

**Current**: Exports only pages/projects that have saved categories. Fresh export returns `{}`.

**New**: Export ALL pages (from `PAGE_PROJECTS`) with ALL projects, using their **effective (renamed) names** as keys. Also includes user-added projects. This ensures export/import round-trip preserves user-facing names.

Example output:
```json
{
  "23": {
    "Promenade": ["Residential", "Sustainable"],
    "User Added Project": []
  },
  "24": {
    "Where Structure Meets Expression": []
  },
  ...
}
```

**Algorithm** (in `GET /api/project-categories/export/route.ts`):
```typescript
const savedData = await getAllData();        // { [page]: { [project]: string[] } }
const renames = await getAllRenames();       // { [page]: { [original]: renamed } }
const additions = await getAddedProjects();  // { [page]: string[] }

const result: CategoryData = {};

// 1. Canonical projects from PAGE_PROJECTS — use effective (renamed) name as key
for (const [pageStr, projects] of Object.entries(PAGE_PROJECTS)) {
  result[pageStr] = {};
  for (const originalProject of projects) {
    const effectiveName = renames[pageStr]?.[originalProject] ?? originalProject;
    const categories = savedData[pageStr]?.[effectiveName] ?? [];
    result[pageStr][effectiveName] = categories;
  }
}

// 2. User-added projects not in PAGE_PROJECTS
for (const [pageStr, addedProjects] of Object.entries(additions)) {
  if (!result[pageStr]) result[pageStr] = {};
  for (const addedProject of addedProjects) {
    if (!result[pageStr][addedProject]) {
      result[pageStr][addedProject] = savedData[pageStr]?.[addedProject] ?? [];
    }
  }
}

// 3. Any remaining projects in savedData not covered above (edge case)
for (const [pageStr, projects] of Object.entries(savedData)) {
  if (!result[pageStr]) result[pageStr] = {};
  for (const project of Object.keys(projects)) {
    if (!result[pageStr][project]) {
      result[pageStr][project] = projects[project];
    }
  }
}
```

**Why effective name as key?** Using `originalProject` (v2 approach) would mean a renamed project exports under its old canonical name. When re-imported, the rename would be lost. Using `effectiveName` preserves the user-facing name through export/import round-trip. Renamed projects will import as "added projects" (falling into the `else` branch), which is the correct behavior.

---

## 3. Files to Change

### Core Data Layer
| File | Change |
|------|--------|
| `src/lib/kv.ts` | Add: `ADDED_PROJECTS_KEY = "project-additions"`; functions `getAddedProjects()`, `addProjectToKV()`, `deleteProjectFromKV()`, `importData()`; update `deleteAllData()` to clear additions key |
| `src/lib/constants.ts` | No change (import `PAGE_PROJECTS` in export route) |

### API Routes (New)
| File | Method | Body | Response |
|------|--------|------|----------|
| `src/app/api/project-categories/add-project/route.ts` | POST | `{ page, project }` | `{ success: true, project }` |
| `src/app/api/project-categories/delete-project/route.ts` | DELETE | `{ page, project }` | `{ success: true }` |
| `src/app/api/project-categories/import/route.ts` | POST | `CategoryData` | `{ success: true, stats }` |

### API Routes (Modified)
| File | Change |
|------|--------|
| `src/app/api/project-categories/export/route.ts` | Enhanced algorithm above; imports `PAGE_PROJECTS` from constants; adds optional `?compact=true` query param (returns only non-empty entries for test performance) |

### React Components
| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | Add 3 buttons below existing Export/Delete All; Add=blue (`bg-blue-600`), Delete=orange (`bg-orange-600`), Import=purple (`bg-purple-600`); add hidden file input ref for import |
| `src/context/ProjectContext.tsx` | Add state `addedProjects: Record<string, string[]>`, `fetchAdditions()`, actions `addProject`, `deleteProject`, `importCategories`; expose all; add `useRef` for import file input |
| `src/components/ProjectList.tsx` | Merge `PAGE_PROJECTS[currentPage]` + `addedProjects[currentPage]`; render all with same UI (active highlight, `*` for no categories) |

---

## 4. Implementation Details

### `src/lib/kv.ts` Additions
```typescript
const ADDED_PROJECTS_KEY = "project-additions";

export async function getAddedProjects(): Promise<Record<string, string[]>> {
  // Same pattern as getAllData() — check hasConfig, try client.get, fallback to memory
  if (addedProjectsMemory) return addedProjectsMemory;
  if (!hasConfig()) { addedProjectsMemory = {}; return addedProjectsMemory; }
  try {
    const client = await getClient();
    if (!client) { addedProjectsMemory = {}; return addedProjectsMemory; }
    const data = await client.get<Record<string, string[]>>(ADDED_PROJECTS_KEY);
    addedProjectsMemory = data ?? {};
    return addedProjectsMemory;
  } catch {
    addedProjectsMemory = {};
    return addedProjectsMemory;
  }
}

export async function addProjectToKV(page: string, project: string): Promise<void> {
  // 1. Initialize empty categories in main store
  const all = await getAllData();
  if (!all[page]) all[page] = {};
  all[page][project] = [];
  memoryStore = all;
  // 2. Track in additions list
  const additions = await getAddedProjects();
  if (!additions[page]) additions[page] = [];
  if (!additions[page].includes(project)) additions[page].push(project);
  addedProjectsMemory = additions;
  // 3. Persist both
  const client = await getClient();
  if (client) {
    await client.set(KV_KEY, all);
    await client.set(ADDED_PROJECTS_KEY, additions);
  }
}

export async function deleteProjectFromKV(page: string, project: string): Promise<void> {
  // 1. Remove from main store
  const all = await getAllData();
  if (all[page]?.[project]) delete all[page][project];
  memoryStore = all;
  // 2. Remove from additions if present
  const additions = await getAddedProjects();
  if (additions[page]) {
    additions[page] = additions[page].filter(p => p !== project);
    if (additions[page].length === 0) delete additions[page];
  }
  addedProjectsMemory = additions;
  // 3. Persist both
  const client = await getClient();
  if (client) {
    await client.set(KV_KEY, all);
    await client.set(ADDED_PROJECTS_KEY, additions);
  }
}

export async function importData(data: CategoryData): Promise<{ pagesRestored: number; projectsRestored: number; additionsCreated: number }> {
  let pagesRestored = 0, projectsRestored = 0, additionsCreated = 0;
  for (const [page, projects] of Object.entries(data)) {
    let pageModified = false;
    for (const [project, categories] of Object.entries(projects)) {
      if (PAGE_PROJECTS[Number(page)]?.includes(project)) {
        await setProjectCategories(page, project, categories);
        projectsRestored++;
        pageModified = true;
      } else {
        await addProjectToKV(page, project);
        if (categories.length > 0) {
          await setProjectCategories(page, project, categories);
        }
        additionsCreated++;
        pageModified = true;
      }
    }
    if (pageModified) pagesRestored++;
  }
  return { pagesRestored, projectsRestored, additionsCreated };
}

// In deleteAllData():
await client.del(ADDED_PROJECTS_KEY);
addedProjectsMemory = null;  // reset memory cache
```

### `src/context/ProjectContext.tsx` Additions

```typescript
interface ProjectContextValue {
  // ... existing fields ...
  addedProjects: Record<string, string[]>;
  addProject: (name: string) => Promise<void>;
  deleteProject: (name: string) => Promise<void>;
  importCategories: (data: CategoryData) => Promise<void>;
}

const [addedProjects, setAddedProjects] = useState<Record<string, string[]>>({});

async function fetchAdditions() {
  try {
    const res = await fetch("/api/project-categories/additions");
    const data = await res.json();
    setAddedProjects(data.additions ?? {});
  } catch {
    // ignore
  }
}

// Call fetchAdditions() in the initial useEffect alongside fetchRenames()
useEffect(() => {
  fetchRenames();
  fetchAdditions();
}, []);

const addProject = async (name: string) => {
  const pageStr = String(currentPage);
  // Validate duplicate
  const originals = PAGE_PROJECTS[currentPage] ?? [];
  const extras = addedProjects[pageStr] ?? [];
  if ([...originals, ...extras].some(p => p.toLowerCase() === name.toLowerCase().trim())) {
    alert("A project with that name already exists on this page.");
    return;
  }
  // Optimistic update
  setAddedProjects(prev => ({
    ...prev,
    [pageStr]: [...(prev[pageStr] ?? []), name.trim()]
  }));
  try {
    await fetch("/api/project-categories/add-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: currentPage, project: name.trim() }),
    });
    setCurrentProjectState(name.trim());
  } catch {
    // Rollback optimistic update
    setAddedProjects(prev => ({
      ...prev,
      [pageStr]: (prev[pageStr] ?? []).filter(p => p !== name.trim())
    }));
    alert("Failed to add project");
  }
};

const deleteProject = async (name: string) => {
  const pageStr = String(currentPage);
  const isAdded = addedProjects[pageStr]?.includes(name) ?? false;

  if (!confirm(`Delete project '${name}' and all its categories?`)) return;

  // Optimistic update
  if (isAdded) {
    setAddedProjects(prev => ({
      ...prev,
      [pageStr]: (prev[pageStr] ?? []).filter(p => p !== name)
    }));
  }

  try {
    await fetch("/api/project-categories/delete-project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: currentPage, project: name }),
    });
    // Auto-switch selection if deleted project was selected
    if (name === currentProject) {
      const remaining = PAGE_PROJECTS[currentPage] ?? [];
      const effectiveRemaining = remaining.map(p => getEffectiveName(p));
      const addedRemaining = (isAdded ? [] : addedProjects[pageStr] ?? []);
      const allRemaining = [...effectiveRemaining, ...addedRemaining].filter(p => p !== name);
      if (allRemaining.length > 0) {
        setCurrentProjectState(allRemaining[0]);
        loadPageData(currentPage, allRemaining[0]);
      }
    }
  } catch {
    // Rollback
    if (isAdded) {
      setAddedProjects(prev => ({
        ...prev,
        [pageStr]: [...(prev[pageStr] ?? []), name]
      }));
    }
    alert("Failed to delete project");
  }
};

const importCategories = async (data: CategoryData) => {
  try {
    const res = await fetch("/api/project-categories/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      await fetchAdditions();
      await loadPageData(currentPage, currentProject);
      alert(`Import complete: ${result.stats.pagesRestored} pages, ${result.stats.projectsRestored} projects restored, ${result.stats.additionsCreated} new projects added.`);
    }
  } catch {
    alert("Failed to import categories");
  }
};
```

### `src/components/ProjectList.tsx` Merge Logic
```typescript
const originalProjects = PAGE_PROJECTS[currentPage] ?? [];
const extraProjects = addedProjects[String(currentPage)] ?? [];
const allProjects = [...originalProjects, ...extraProjects];

// ... render loop over allProjects ...
// original projects: use getEffectiveName() for display (handles renames)
// added projects: use the name directly
```

### `src/components/Sidebar.tsx` Button Layout
```
Bottom button group order:
[Export Categories]  (green, bg-green-600)
[Import Categories]  (purple, bg-purple-600)
[Add Project]        (blue, bg-blue-600)
[Delete Project]     (orange, bg-orange-600)
[Delete All Data]    (red, bg-red-600)
```

Rationale: Group by function — Export/Import are data transfer, Add/Delete are project mutations, Delete All is destructive. Separators between groups.

---

## 5. Key Notes on `fetchAdditions` and Page Navigation

- `addedProjects` is a flat `Record<string, string[]>` (page → project list) stored in context
- `fetchAdditions()` is called once on mount alongside `fetchRenames()` — it fetches ALL additions from the server, so no per-page re-fetch is needed on navigation
- When a project is added, the optimistic update immediately reflects it in sidebar regardless of current page
- The `ProjectList` merge logic uses the current page to select the right subset: `addedProjects[String(currentPage)]`

---

## 6. Testing Plan

### Existing Tests Needing Updates

| File | Test | Update Strategy |
|------|------|-----------------|
| `02-happy-path.spec.ts` T07 | Export JSON exact match | Check only tested pages/projects; assert `Object.keys(export).length === PAGE_NUMBERS.length` |
| `02-happy-path.spec.ts` T09 | Full e2e workflow export | Same — verify modified pages, skip full structure assertion |
| `02-happy-path.spec.ts` T10 | Multi-page export exact match | Same |
| `03-boundary-negative.spec.ts` T11 | Export with no data expects `{}` | Now asserts all `PAGE_NUMBERS` keys present with `[]` values |
| `04-destructive.spec.ts` T04 | Delete then Export expects `{}` | Same as above |

**Helper**: Add `exportDataCompact()` in `api.ts` that adds `?compact=true` to export URL — tests can use this for faster assertions (returns only non-empty entries).

### New Test File: `tests/specs/06-enhanced-features.spec.ts`

| # | Test | Steps |
|---|------|-------|
| 1 | Add Project button visible & styled | `bg-blue-600` class present |
| 2 | Add Project — happy path | Click → enter name → appears in sidebar, auto-selected, toggles work |
| 3 | Add Project — cancel dialog | Click → Escape/Cancel → no project added |
| 4 | Add Project — empty/whitespace name | Rejected with alert; no change |
| 5 | Add Project — duplicate of original project | Rejected with alert |
| 6 | Add Project — duplicate of added project | Rejected with alert |
| 7 | Delete Project button visible & styled | `bg-orange-600` class present |
| 8 | Delete Project — added project | Add → delete → removed from sidebar, `addedProjects` empty |
| 9 | Delete Project — original project | Delete → categories cleared, project stays in sidebar with `*` |
| 10 | Delete Project — cancel confirmation | Click → Cancel dialog → no change |
| 11 | Delete Project — auto-switch selection | Delete selected project → first remaining project selected |
| 12 | Import Categories button visible & styled | `bg-purple-600` class present |
| 13 | Import — happy path | Toggle categories → export → delete all → import file → categories restored |
| 14 | Import — restores added projects | Add project + categories → export → delete all → import → added project + cats restored |
| 15 | Import — invalid JSON file | Select `.txt` → alert error |
| 16 | Import — malformed JSON | Select invalid JSON → alert error |
| 17 | Enhanced Export — all pages present | `Object.keys(export).length === PAGE_NUMBERS.length` |
| 18 | Enhanced Export — empty categories | Untoggled projects show `[]` |
| 19 | Enhanced Export — mixed state | Some toggled, some not — all correctly exported |
| 20 | Enhanced Export — includes added projects | Add project without cats → export shows it with `[]` |
| 21 | Enhanced Export — respects renames | Rename project → export shows **renamed** name with categories |
| 22 | Full workflow: Add → Categorize → Export → Delete → Import | Complete E2E across all new features |
| 23 | Delete All Data clears additions | Add projects → Delete All → export empty, additions gone |

### New Test Helpers (`tests/helpers/api.ts`)
```typescript
export async function addProject(page: number, project: string): Promise<void>
export async function deleteProject(page: number, project: string): Promise<void>
export async function importCategories(data: CategoryData): Promise<void>
export async function exportDataCompact(): Promise<object>  // ?compact=true
```

Also add API route `GET /api/project-categories/additions` to fetch additions (used by `fetchAdditions()`).

---

## 7. Open Questions (User Decisions Needed)

1. **Import merge vs replace**: Plan = merge (overwrite matching, preserve non-overlapping). Confirm?
2. **Export `?compact=true` param**: Add for test performance? (Non-breaking, opt-in)
3. **Import restores renames?** Plan = no (export uses effective names, so renames are implicitly captured). Confirm this approach is acceptable?
4. **Add Project max length**: 500 chars (consistent with rename). OK?
5. **Button order in Sidebar**: Proposed: [Export] [Import] [Add Project] [Delete Project] [Delete All]. Confirm?
6. **Delete Project on last project of page**: Allow page to have zero projects in sidebar? (Yes — user can Add later)
7. **Export key naming**: Using effective (renamed) name instead of canonical name. This ensures round-trip preserves renames but means renamed projects import as "added projects". Recommended. Confirm?

---

## 8. Implementation Order

1. `kv.ts` — new functions + `deleteAllData` update + memory cache for additions
2. Export route — enhanced algorithm (effective names as keys, `?compact` param)
3. Add/Delete/Import API routes + GET additions route
4. `ProjectContext` — `addedProjects` state, `fetchAdditions()`, actions with optimistic updates and rollback
5. `ProjectList` — merge logic
6. `Sidebar` — 3 new buttons + handlers + file input ref
7. Tests: update existing + new spec file + API helpers
8. Verify: `npm run build`, `npm test`