# Enhancement Plan v2: Add Project / Delete Project / Import Categories + Enhanced Export

---

## 1. Three New Buttons — Functionality

### "Add Project"
- Opens a `prompt()` dialog (consistent with existing `confirm()`/`alert()` pattern) for the new project name
- Validation: non-empty, trimmed; reject if matches any existing project on that page (original + added)
- Sends `POST /api/project-categories/add-project` with `{ page: number, project: string }`
- Server: adds to `project-additions` KV key (`{ [page]: string[] }`) AND initializes empty categories in main `project-categories` KV
- Context: `addProject(page, name)` updates local `addedProjects` state optimistically, then calls API
- New project appears in sidebar (`ProjectList`) immediately and is auto-selected

### "Delete Project"
- Shows `confirm()` dialog: "Delete project '[name]' and all its categories?"
- Sends `DELETE /api/project-categories/delete-project` with `{ page: number, project: string }`
- Server: removes from `project-categories` KV; if project was in `project-additions`, removes from there too
- Context: `deleteProject(page, name)` updates local `addedProjects` state optimistically
- **Original project** (from `PAGE_PROJECTS`): categories cleared in KV; project remains visible in sidebar with `*` (zero categories)
- **Added project** (from `project-additions`): completely removed from sidebar and `project-additions`
- If deleted project was currently selected: switch to first remaining project on page (original or added)

### "Import Categories"
- Button click → triggers hidden `<input type="file" accept=".json" ref={importRef}>` via `ref.current.click()`
- User selects a previously exported JSON file
- Client parses JSON, validates it matches `CategoryData` shape (`Record<string, Record<string, string[]>>`)
- Sends `POST /api/project-categories/import` with parsed data
- Server: for each page/project in import data:
  - If project exists in `PAGE_PROJECTS[page]` → `setProjectCategories(page, project, categories)`
  - Else → `addProjectToKV(page, project, categories)` + add to `project-additions[page]`
- Server returns `{ success: true, stats: { pagesRestored, projectsRestored, additionsCreated } }`
- Client: calls `loadPageData(currentPage, currentProject)` to refresh, or `window.location.reload()` for full reset

---

## 2. Enhanced "Export Categories"

**Current**: Exports only pages/projects that have saved categories. Fresh export returns `{}`.

**New**: Export ALL pages (from `PAGE_PROJECTS`) with ALL projects. Projects without categories get an empty array. Also includes user-added projects.

Example output:
```json
{
  "23": {
    "The Promenade by the River": ["Residential", "Sustainable"],
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

// 1. Canonical projects from PAGE_PROJECTS (with rename resolution)
for (const [pageStr, projects] of Object.entries(PAGE_PROJECTS)) {
  result[pageStr] = {};
  for (const originalProject of projects) {
    const effectiveName = renames[pageStr]?.[originalProject] ?? originalProject;
    const categories = savedData[pageStr]?.[effectiveName] ?? [];
    result[pageStr][originalProject] = categories;
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

---

## 3. Files to Change

### Core Data Layer
| File | Change |
|------|--------|
| `src/lib/kv.ts` | Add: `ADDED_PROJECTS_KEY = "project-additions"`; functions `getAddedProjects()`, `addProjectToKV()`, `deleteProjectFromKV()`, `importData()`, update `deleteAllData()` to clear additions key |
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
| `src/app/api/project-categories/export/route.ts` | Enhanced algorithm above; imports `PAGE_PROJECTS` from constants |

### React Components
| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | Add 3 buttons below existing Export/Delete All; Add=blue (`bg-blue-600`), Delete=orange (`bg-orange-600`), Import=purple (`bg-purple-600`) |
| `src/context/ProjectContext.tsx` | Add state `addedProjects: Record<string, string[]>`, `fetchAdditions()`, actions `addProject`, `deleteProject`, `importCategories`; expose all |
| `src/components/ProjectList.tsx` | Merge `PAGE_PROJECTS[currentPage]` + `addedProjects[currentPage]`; render all with same UI (active highlight, `*` for no categories) |

---

## 4. Testing Plan

### Existing Tests Needing Updates

| File | Test | Update Strategy |
|------|------|-----------------|
| `02-happy-path.spec.ts` T07 | Export JSON exact match | Check only tested pages/projects; assert `Object.keys(export).length === PAGE_NUMBERS.length` |
| `02-happy-path.spec.ts` T09 | Full e2e workflow export | Same — verify modified pages, skip full structure assertion |
| `02-happy-path.spec.ts` T10 | Multi-page export exact match | Same |
| `03-boundary-negative.spec.ts` T11 | Export with no data expects `{}` | Now asserts all `PAGE_NUMBERS` keys present with `[]` values |
| `04-destructive.spec.ts` T04 | Delete then Export expects `{}` | Same as above |

**Helper**: Add `exportDataCompact()` in `api.ts` that adds `?compact=true` to export URL (new export API param returning only non-empty projects) — tests can use this for faster assertions.

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
| 21 | Enhanced Export — respects renames | Rename project → export shows original name with categories |
| 22 | Full workflow: Add → Categorize → Export → Delete → Import | Complete E2E across all new features |
| 23 | Delete All Data clears additions | Add projects → Delete All → export empty, additions gone |

### New Test Helpers (`tests/helpers/api.ts`)
```typescript
export async function addProject(page: number, project: string): Promise<void>
export async function deleteProject(page: number, project: string): Promise<void>
export async function importCategories(data: CategoryData): Promise<void>
export async function exportDataCompact(): Promise<object>  // ?compact=true
```

### New Test Constants (`tests/helpers/page-constants.ts`)
No changes needed — mirrors `src/lib/constants.ts`.

---

## 5. Key Implementation Details

### `src/lib/kv.ts` Additions
```typescript
const ADDED_PROJECTS_KEY = "project-additions";

export async function getAddedProjects(): Promise<Record<string, string[]>> { ... }
export async function addProjectToKV(page: string, project: string): Promise<void> { ... }
export async function deleteProjectFromKV(page: string, project: string): Promise<void> { ... }
export async function importData(data: CategoryData): Promise<void> { ... }

// In deleteAllData():
await client.del(ADDED_PROJECTS_KEY);
```

### `src/context/ProjectContext.tsx` Additions
```typescript
const [addedProjects, setAddedProjects] = useState<Record<string, string[]>>({});

async function fetchAdditions() { ... }  // call in initial useEffect

const addProject = async (name: string) => {
  // optimistic update
  setAddedProjects(prev => ({ ...prev, [String(currentPage)]: [...(prev[String(currentPage)] ?? []), name] }));
  await fetch("/api/.../add-project", { method: "POST", body: JSON.stringify({ page: currentPage, project: name }) });
  setCurrentProjectState(name);
};

const deleteProject = async (name: string) => {
  const isAdded = addedProjects[String(currentPage)]?.includes(name) ?? false;
  // optimistic
  if (isAdded) setAddedProjects(...);
  await fetch("/api/.../delete-project", { method: "DELETE", body: JSON.stringify({ page: currentPage, project: name }) });
  // switch selection if needed
};
```

### `src/components/ProjectList.tsx` Merge Logic
```typescript
const originalProjects = PAGE_PROJECTS[currentPage] ?? [];
const extraProjects = addedProjects[String(currentPage)] ?? [];
const allProjects = [...originalProjects, ...extraProjects];

{allProjects.map(project => {
  const isAdded = extraProjects.includes(project);
  const cats = projectCats[project] ?? [];
  // ... render
})}
```

---

## 6. Open Questions (User Decisions Needed)

1. **Import merge vs replace**: Current plan = merge (overwrite matching, preserve non-overlapping). Confirm?
2. **Export `?compact=true` param**: Add for test performance? (Non-breaking, opt-in)
3. **Import restores renames?** Plan = no (export doesn't capture rename history). Confirm?
4. **Add Project max length?** Rename allows 500 chars. Same limit?
5. **Button order in Sidebar**: [Export] [Import] [Add Project] [Delete Project] [Delete All]? Or group by function?
6. **Delete Project on last project of page**: Allow page to have zero projects in sidebar? (Yes — user can Add later)

---

## 7. Implementation Order

1. `kv.ts` — new functions + `deleteAllData` update
2. Export route — enhanced algorithm
3. Add/Delete/Import API routes
4. `ProjectContext` — addedProjects state + actions
5. `ProjectList` — merge logic
6. `Sidebar` — 3 new buttons + handlers
7. Tests: update existing + new spec file
8. Verify: `npm run build`, `npm test`