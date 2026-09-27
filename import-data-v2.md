# Import Data — Replace Instead of Merge (v2)

## Requirement

The "Import Data" button should delete all existing projects (and their
categories) before importing all projects and their categories from the new
JSON file. Page numbers and page images must NOT be deleted.

## Background

- KV stores ONLY three things: category selections (`project-categories`), renames
  (`project-renames`), and user-added projects (`project-additions`).
- Page numbers come from the `PAGE_NUMBERS` constant (`src/lib/constants.ts:219`),
  canonical project names from `PAGE_PROJECTS` (`src/lib/constants.ts:19`), and page
  images from static files resolved by `getImagePath` (`src/lib/constants.ts:221`).
  None of these live in KV, so clearing KV can never affect pages or images — the
  hard constraint is satisfied automatically.
- Today `importData` (`src/lib/kv.ts:305`) MERGES the imported JSON with the existing
  KV state: it clones the stored categories/renames/additions and layers the import
  on top. Existing projects and their category selections survive. That does not
  match the requirement.
- `persistAll` (`src/lib/kv.ts:90`) rewrites all three KV keys via `client.multi().set()`
  (Redis `SET` overwrites) and reassigns the in-memory globals — so any state not
  rewritten by the import is gone from both Redis and the process globals.

## Decisions (confirmed)

- Renames: REPLACE from the JSON. Existing renames are wiped, then whatever renames
  the JSON provides are applied. Legacy JSON (no `schemaVersion`) leaves renames empty.
- Confirmation: the "Import Data" button prompts the user BEFORE opening the file
  picker. Copy: *"Importing will replace all saved category selections, renames, and
  added projects. Page numbers and page images are not affected. Continue?"*
  (Chosen wording avoids overpromising "delete all projects" — canonical projects are
  constants and remain visible, only cleared.)
- Empty / zero-page JSON (`{}` or a v4 bundle with empty categories) is ACCEPTED and
  wipes all saved data. This is the logical extreme of replace semantics and matches
  "import what's in the JSON". The confirm dialog is the only guard; we do NOT reject
  zero-page payloads. Documented + tested as accepted behavior.
- Dead code: the `ProjectConflictError` throw inside `importData` (`src/lib/kv.ts:341`)
  and the import route's 409 branch become unreachable under replace semantics (no
  pre-existing additions to collide withduring the canonical loop). Left as harmless
  dead code — NOT commented (codebase convention: no comments) and NOT deleted (avoids
  touching the public API error surface; `ProjectConflictError` is still used by
  `addProjectToKV`/`renameProjectInKV` via `assertNameAvailable`).

## Plan

### 1. `src/lib/kv.ts` — `importData` (line 305)

Convert merge → replace. Keep a read of the OLD state purely to compute a
`pagesCleared` stat (addresses the "alert can hide a 196-page wipe" concern), then
start the three import buckets EMPTY so the rest of the loop applies the JSON into a
clean slate.

Current (lines 310–317):
```ts
const [storedCategories, storedRenames, storedAdditions] = await Promise.all([
  getAllData(),
  getAllRenames(),
  getAddedProjects(),
]);
const categories = cloneCategories(storedCategories);
const renames = normalizeRenames(cloneRenames(storedRenames));
const additions = cloneAdditions(storedAdditions);
```

Replace with:
```ts
const [oldCategories, oldRenames, oldAdditions] = await Promise.all([
  getAllData(),
  getAllRenames(),
  getAddedProjects(),
]);
const categories: CategoryData = {};
const renames: ProjectRenames = {};
const additions: ProjectAdditions = {};

const importPageKeys = new Set([
  ...Object.keys(data.categories),
  ...Object.keys(data.renames),
  ...Object.keys(data.additions),
]);
let pagesCleared = 0;
for (const pageKey of Object.keys(oldCategories)) {
  const hadSelections = oldCategories[pageKey] && Object.keys(oldCategories[pageKey]).length > 0;
  if (hadSelections && !importPageKeys.has(pageKey)) pagesCleared++;
}
```

Leave the entire loop body (current lines 318–402) untouched. It is already correct
when starting from empty buckets:

- v4 branch: assigns imported categories for canonical effective names, overwrites
  `renames[page]` from JSON, pushes imported additions into the empty `additions[page]`.
  The `conflictingAddition` check (kv.ts:341) is a harmless no-op (no pre-existing
  additions); the `delete` at kv.ts:351 is a no-op against an empty bucket.
- generic loop: the v4 canonical branch (kv.ts:376–383) only records `restoredPages`
  and continues (assignment gated by `if (data.format === "legacy")`) — no
  double-write/double-count; the legacy branch assigns imported categories and
  promotes non-canonical names to additions.

Update the return signature and the `return` at kv.ts:405 to include `pagesCleared`:
```ts
export async function importData(data: ValidatedImport): Promise<{
  pagesRestored: number;
  projectsRestored: number;
  additionsCreated: number;
  pagesCleared: number;
}> {
  ...
  return { pagesRestored: restoredPages.size, projectsRestored, additionsCreated, pagesCleared };
}
```

`persistAll` rewrites all three keys, so no stale data survives in KV; the in-memory
globals are reassigned. Pages not in the JSON → `categories[page]` unset →
`getProjectCategories` returns `[]` (kv.ts:121) → selections gone, canonical project
still listed (it's a constant).

### 2. `src/components/Sidebar.tsx` — `handleImportClick` (line 41)

Add a confirm BEFORE opening the file picker. (Placed here — not in
`handleImportChange` — so existing Playwright specs that `setInputFiles` directly on
the hidden input are unaffected; they exercise the import logic, not the confirm.)
```ts
const handleImportClick = () => {
  if (!confirm("Importing will replace all saved category selections, renames, and added projects. Page numbers and page images are not affected. Continue?")) return;
  importInputRef.current?.click();
};
```

### 3. `src/context/ProjectContext.tsx` — `importCategories` success alert (lines 497–501)

Reword the alert to surface the wipe honestly using the new `pagesCleared` stat. Keep
the `Import complete:` prefix so the existing `/Import complete/` test matchers still
pass:
```ts
alert(
  `Import complete: ${result.stats.pagesRestored} pages, `
  + `${result.stats.projectsRestored} projects imported, `
  + `${result.stats.additionsCreated} new projects added, `
  + `${result.stats.pagesCleared} previous pages cleared.`
);
```

### 4. No other source changes

- `parseImportPayload` / validation: unchanged. Legacy and v4 formats validate
  identically; empty JSON still validates as legacy (`isRecord` passes, no
  `schemaVersion` → empty categories, data-transfer.ts:191).
- API route `src/app/api/project-categories/import/route.ts`: unchanged; it passes
  `stats` through, so `pagesCleared` flows to the client.
- `ProjectContext.importCategories`: after import it refreshes renames/additions and
  refetches the CURRENT page's data via `loadPageData` (no full reload; the only
  `window.location.reload()` in the codebase is Delete All, `Sidebar.tsx:34`). If the
  previously selected project is gone it falls back to `available[0] ?? ""`
  (`ProjectContext.tsx:490–492`). Other pages' `pageProjects` cache self-heals via the
  `useEffect` on navigation (`ProjectContext.tsx:167–169`). No change needed.

## Files touched

Source:
- `src/lib/kv.ts` — `importData` initial buckets + `pagesCleared` stat + return type.
- `src/components/Sidebar.tsx` — `handleImportClick` confirm prompt.
- `src/context/ProjectContext.tsx` — `importCategories` success alert wording.

Tests:
- `tests/specs/09-import-replace.spec.ts` — NEW spec covering replace semantics,
  empty-JSON wipe, confirm flow, and the no-conflict-on-collision case at the
  API level (Playwright `page.request.post` to `/api/project-categories/import`,
  seeded/asserted via existing `resetAllData` / `exportBundle` / `saveCategories` /
  `addProject` helpers in `tests/helpers/api.ts`).

Existing specs need no edits: all import specs run from `resetAllData` (empty state,
where replace ≡ merge) and use `setInputFiles` on the hidden input, so the new
confirm and the `pagesCleared` alert prefix (`Import complete:`) keep them green.

## Test cases

Real page numbers from `PAGE_PROJECTS`: 23 ("The Promenade by the River"), 24
("Where Structure Meets Expression"), 61 ("Meets the City", "Refined."). All tests
in the new spec use `resetAllData()` in `beforeEach`.

### API-level (POST /api/project-categories/import)

1. **Replace, not merge:** `saveCategories(23, "The Promenade by the River", ["Resort"])`,
   `addProject(23, "X")`. Import legacy `{ "23": { "The Promenade by the River": ["Villa"] } }`.
   After: `fetchCategories(23,"The Promenade by the River")` == `["Villa"]`; "X" is gone
   from `exportBundle().additions["23"]`; `fetchCategories(23,"X")` == `[]`.
2. **Cleared pages not in JSON:** `saveCategories(24, "Where Structure Meets Expression", ["Hotel"])`.
   Import JSON omitting page 24. After: `fetchCategories(24,"Where Structure Meets Expression")`
   == `[]`; canonical project still listed in `PAGE_PROJECTS`; `getImagePath(24)` unchanged.
3. **Omitted canonical on an imported multi-project page (complement of test 2):**
   `saveCategories(61, "Meets the City", ["Villa"])` AND
   `saveCategories(61, "Refined.", ["Resort"])`. Import JSON for page 61 with ONLY
   `"Meets the City": ["Villa"]`. After: `fetchCategories(61,"Meets the City")` == `["Villa"]`;
   `fetchCategories(61,"Refined.")` == `[]` (the omitted canonical's selections cleared).
4. **Renames replaced from v4 JSON:** seed rename via UI/API onto page 23
   (`"The Promenade by the River"`→`"Alpha"`). Import v4 JSON with
   `renames: { "23": { "The Promenade by the River": "Aurora" } }`. After:
   `exportBundle().renames["23"]` == `{ "The Promenade by the River": "Aurora" }` only.
5. **Renames cleared by legacy JSON:** seed rename `…→"Alpha"` on page 23. Import
   legacy JSON (no `schemaVersion`). After: `exportBundle().renames` == `{}`.
6. **Additions rebuilt from v4 JSON:** `addProject(23, "Old")`. Import v4 JSON with
   `additions: { "23": ["New"] }` and `categories: { "23": { "New": ["Villa"] } }`. After:
   `exportBundle().additions["23"]` == `["New"]`; "Old" gone;
   `fetchCategories(23,"New")` == `["Villa"]`; `fetchCategories(23,"Old")` == `[]`.
7. **No conflict on what used to collide:** `addProject(23, "Twin")`. Import v4 JSON
   whose canonical rename for page 23 resolves the canonical to "Twin" (previously
   threw `ProjectConflictError`). Import succeeds (200); `fetchCategories(23,"Twin")`
   reflects the JSON; `additions["23"]` has no duplicate "Twin".
8. **Idempotent re-import:** import the same v4 JSON twice; second `exportBundle()`
   deep-equals the first.
9. **Empty JSON wipes all (accepted):** seed selections on pages 23 and 24. Import
   `{}`. After: all `exportBundle()` buckets empty (`categories`/`renames`/`additions`
   all `{}`); `PAGE_NUMBERS` and `PAGE_PROJECTS` unchanged; `getImagePath(23)` and
   `getImagePath(24)` unchanged.
10. **Validation unchanged:** unknown page key → 422 "Unknown page"; unknown category →
    422 "unknown category"; duplicate project name → 422 "duplicate project".
11. **Malformed / oversize unchanged:** non-JSON → 400; > 2 MiB → 413.
12. **Stats include pagesCleared:** seed selections on pages 23 and 24, then import JSON
    covering only page 23. Response `stats.pagesCleared` == 1; `stats.projectsRestored`
    counts projects assigned from the JSON.

### UI flow (click the Import Data button — uses `page.waitForEvent('filechooser')`)

13. **Confirm cancels:** click "Import Data", dismiss confirm → filechooser does NOT
    open; state unchanged.
14. **Confirm proceeds:** click "Import Data", accept confirm → filechooser opens;
    supply a valid JSON → import fires → success alert matches `/Import complete/`
    and includes `/previous pages cleared/`.

### Regression

15. **Existing round-trip & legacy specs stay green:** run the full `06-enhanced-features`
    suite unchanged — `setInputFiles` path bypasses the confirm; alert prefix
    `Import complete:` preserved.

### Manual end-to-end

16. Export → add a project + categories → import the earlier export → added project
    gone, state matches JSON, page nav + images intact.
17. Import a JSON covering only a couple of pages → navigate to an uncovered page →
    image loads, canonical projects display, selections empty.