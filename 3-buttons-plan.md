# Enhancement Plan: Add Project / Delete Project / Import Categories + Enhanced Export

---

## 1. Three New Buttons — Functionality

### "Add Project"
- Opens a `prompt()` dialog (consistent with existing `confirm()`/`alert()` pattern) for the new project name
- Sends `POST /api/project-categories/add-project` with `{ page, project }`
- Server stores the addition in a new Redis key `project-additions` and initializes empty categories in the main store
- New project appears in the sidebar (`ProjectList`) and is auto-selected
- `ProjectList` merges `PAGE_PROJECTS[currentPage]` with any added projects

### "Delete Project"
- Shows `confirm()` dialog: "Delete project '[name]' and all its categories?"
- Sends `DELETE /api/project-categories/delete-project` with `{ page, project }`
- Removes the project's category data and any addition record
- For original projects: only categories are cleared; the project name still shows (with `*`)
- For user-added projects: the project is completely removed from the sidebar
- If the deleted project was selected, switch to the first remaining project

### "Import Categories"
- Opens a hidden `<input type="file" accept=".json">`
- User selects a previously exported JSON file
- Parses and validates the JSON against `CategoryData` shape
- Sends `POST /api/project-categories/import` with parsed data
- Server merges imported data into the existing store (overwriting matching keys, preserving non-overlapping data)
- UI refreshes to reflect imported state

---

## 2. Enhanced "Export Categories"

**Current**: Exports only pages/projects that have saved categories. Fresh export returns `{}`.

**New**: Export ALL pages (from `PAGE_PROJECTS`) with ALL projects. Projects without categories get an empty array.

Example output:
```json
{
  "23": {
    "The Promenade by the River": ["Residential", "Sustainable"]
  },
  "24": {
    "Where Structure Meets Expression": []
  },
  ...
}
```

Implementation: Modify `GET /api/project-categories/export/route.ts`:
1. Fetch `getAllData()` (saved categories)
2. Fetch `getAllRenames()` (for renamed project name lookup)
3. Iterate over `PAGE_PROJECTS` and build complete result
4. Also include user-added projects not in `PAGE_PROJECTS`

---

## 3. Files to Change

| File | Change |
|------|--------|
| `src/lib/kv.ts` | Add `addProject()`, `deleteProject()`, `getAddedProjects()`, `importData()` |
| `src/app/api/project-categories/export/route.ts` | Enhanced to include all pages/projects with `[]` fallback |
| `src/app/api/project-categories/add-project/route.ts` | New: `POST` — add a project to a page |
| `src/app/api/project-categories/delete-project/route.ts` | New: `DELETE` — remove a project from a page |
| `src/app/api/project-categories/import/route.ts` | New: `POST` — import category data from JSON |
| `src/components/Sidebar.tsx` | Add 3 new buttons in the bottom button group |
| `src/context/ProjectContext.tsx` | Add actions `addProject`, `deleteProject`, `importCategories`; expose `addedProjects` |
| `src/components/ProjectList.tsx` | Merge original projects + added projects |

---

## 4. Testing Plan

### Existing tests needing updates

| File | Test | Reason |
|------|------|--------|
| `02-happy-path.spec.ts` T07 | Export JSON exact match | Export shape changes (all projects included) |
| `02-happy-path.spec.ts` T09 | Full e2e workflow export validation | Same |
| `02-happy-path.spec.ts` T10 | Multi-page export exact match | Same |
| `03-boundary-negative.spec.ts` T11 | Export with no data expects `{}` | Now expects all pages/projects with `[]` |
| `04-destructive.spec.ts` T04 | Delete then Export expects `{}` | Same |

Update strategy: Assert export contains expected keys (pages we modified), modified projects match, unmodified projects have `[]`, total page count matches `PAGE_NUMBERS.length`.

### New test file: `tests/specs/06-enhanced-features.spec.ts`

| # | Test | Steps |
|---|------|-------|
| 1 | Add Project button visible & styled | Button present in sidebar with distinct styling |
| 2 | Add Project — happy path | Enter name → appears in sidebar, auto-selected, toggleable |
| 3 | Add Project — cancel dialog | Cancel prompt → no project added |
| 4 | Add Project — empty name | Rejected (no change) |
| 5 | Add Project — duplicate name | Rejected or handled gracefully |
| 6 | Delete Project button visible & styled | Button present |
| 7 | Delete Project — added project | Add → delete → removed from sidebar |
| 8 | Delete Project — original project | Delete → categories cleared, project still shown with `*` |
| 9 | Delete Project — cancel | Cancel confirmation → no change |
| 10 | Import Categories button visible & styled | Button present |
| 11 | Import — happy path | Export → delete all → import → all restored |
| 12 | Import — invalid file | Select non-JSON → error handled |
| 13 | Enhanced Export — all pages present | All `PAGE_NUMBERS` keys in export |
| 14 | Enhanced Export — empty categories | Untoggled projects show `[]` |
| 15 | Enhanced Export — mixed state | Toggled + untoggled projects correctly exported |
| 16 | Enhanced Export — includes added projects | Added project without cats shows `[]` |
| 17 | Full workflow: Add → Categorize → Export → Delete → Import | Complete E2E |

### New test helpers (`tests/helpers/api.ts`)
- `addProject(page, project)` — calls POST add-project API
- `deleteProject(page, project)` — calls DELETE delete-project API
- `importCategories(data)` — calls POST import API
