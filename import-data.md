# Import Data — Replace Instead of Merge

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
- "Delete All Data" already does a full clear via `deleteAllData`
  (`src/lib/kv.ts:165`), which deletes all three KV keys. `importData` will instead
  reset the in-memory buckets locally before applying the import and then call
  `persistAll`, which rewrites all three keys via Redis `SET` (overwrites) and
  reassigns the in-memory globals.

## Decisions (confirmed)

- Renames: REPLACE from the JSON. Existing renames are wiped, then whatever renames
  the JSON provides are applied. Legacy JSON (no `schemaVersion`) leaves renames
  empty.
- Confirmation: the "Import Data" button now prompts the user before opening the
  file picker, mirroring the existing "Delete All Data" confirm dialog.

## Plan

### 1. `src/lib/kv.ts` — `importData` (lines 305–410)

Convert merge → replace by changing the three initial buckets from "clone of
stored state" to empty, so the rest of the loop applies the JSON into a clean
slate:

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
const categories: CategoryData = {};
const renames: ProjectRenames = {};
const additions: ProjectAdditions = {};
```

Leave the entire loop body (lines 318–402) and `persistAll` (line 404) untouched.
The loop is already correct when starting from empty buckets:

- The v4 branch (lines 333–367) assigns categories from JSON for canonical
  effective names, overwrites `renames[page]` from JSON regardless of init value,
  and pushes imported additions into the now-empty `additions[page]`. The
  `conflictingAddition` check (line 341) becomes a harmless no-op because there
  can be no pre-existing additions to collide with. The `if (oldEffective !==
  nextEffective) delete ...` (line 351) is a no-op against an empty bucket.
- The generic loop (lines 370–396) handles both formats: the v4 canonical branch
  (376–383) only records `restoredPages` and continues (the assignment is gated by
  `if (data.format === "legacy")`), so there is no double-write or double-count;
  the legacy branch assigns imported categories and promotes non-canonical names
  to additions.
- `persistAll` (kv.ts:90–108) rewrites all three KV keys via
  `client.multi().set(...)`; Redis `SET` overwrites, so no stale data survives in
  KV. The in-memory globals (`setCategories`/`setRenames`/`setAdditions`) are
  likewise reassigned.

Net effect of the loop starting from empty buckets:
- Pages not present in the JSON → `categories[page]` stays `{}`/unset →
  `getProjectCategories` returns `[]` (kv.ts:121) → existing category selections
  are gone. The canonical project still appears (it's a `PAGE_PROJECTS`
  constant); only its selections are cleared.
- Canonical projects (not deletable — they are constants) keep their identity but
  lose their previous category selections.
- Legacy JSON (no `schemaVersion`) → `data.renames`/`data.additions` are `{}`
  (data-transfer.ts:191–196) → loop leaves renames/additions empty, imports
  categories, promotes unknown names to additions.
- v4 JSON → renames and additions are fully rebuilt from the JSON.

No changes to `parseImportPayload` / validation: legacy and v4 formats still
validate identically. `validateV4Identity` (data-transfer.ts:157) already
prevents intra-JSON conflicts, so the `ProjectConflictError` path inside
`importData` is now unreachable but harmless dead code.

No changes to the API route (`src/app/api/project-categories/import/route.ts`)
or to `ProjectContext.importCategories` (`src/context/ProjectContext.tsx:462`):
it calls `importData`, then refreshes renames/additions and reloads the page. If
the previously selected project is gone it falls back to `available[0] ?? ""`
(kv.ts:483–492).

The return stats (`pagesRestored`, `projectsRestored`, `additionsCreated`) stay
meaningful under replace semantics, so the client success alert
(`ProjectContext.tsx:497–501`) continues to read sensibly.

### 2. `src/components/Sidebar.tsx` — `handleImportClick` (line 41)

Add a confirmation dialog before opening the file picker, mirroring
`handleDeleteAll` (lines 28–39). State that pages and images are unaffected to
reassure the user about the destructive scope:

Current:
```ts
const handleImportClick = () => {
  importInputRef.current?.click();
};
```

Replace with:
```ts
const handleImportClick = () => {
  if (!confirm("Importing will replace all existing projects and categories. Page numbers and page images are not affected. Continue?")) return;
  importInputRef.current?.click();
};
```

## Files touched

- `src/lib/kv.ts` — `importData` initial buckets (3 lines).
- `src/components/Sidebar.tsx` — `handleImportClick` confirm prompt (1 line).

No other files need changes. KV persistence is fully handled by the unchanged
`persistAll` call.

## Test cases

### Unit: `importData` replace semantics (kv.ts)

1. **Replace, not merge:** Seed KV with `categories[3]["A"] = ["Resort"]` and an
   added project "X" on page 3. Import JSON `{ categories: { "3": { "A": ["Villa"] } } }`
   (legacy). After import: `categories[3]` equals `{ "A": ["Villa"] }`; the
   addition "X" is gone; `getProjectCategories(3,"X")` returns `[]`; the canonical
   project "A" is present with `["Villa"]`.
2. **Cleared pages not in JSON:** Seed `categories[5]["B"] = ["Hotel"]`. Import JSON
   that omits page 5 entirely. After import: `getProjectCategories(5,"B")` returns
   `[]`; canonical project "B" still lists via `PAGE_PROJECTS`; page 5 still in
   `PAGE_NUMBERS`; `/images/page_005.jpg` path unchanged.
3. **Renames replaced from v4 JSON:** Seed renames `{"3":{"A":"Alpha"}}`. Import v4
   JSON with `renames: {"3":{"A":"Aurora"}}`. After import: `renames[3]` is
   `{"A":"Aurora"}` only — the old "Alpha" rename is gone.
4. **Renames cleared by legacy JSON:** Seed renames `{"3":{"A":"Alpha"}}`. Import
   legacy JSON (no `schemaVersion`). After import: `renames` is `{}`.
5. **Additions rebuilt from v4 JSON:** Seed additions `{"3":["Old"]}`. Import v4 JSON
   with `additions: {"3":["New"]}` and matching categories entry. After import:
   `additions[3]` equals `["New"]`; "Old" is gone; `categories[3]["New"]` equals the
   JSON value; `categories[3]["Old"]` absent.
6. **No conflict error on what used to collide:** Seed additions `{"3":["Twin"]}`.
   Import v4 JSON whose canonical rename for page 3 resolves to "Twin" (which would
   previously have thrown `ProjectConflictError` at kv.ts:341). After import: no
   error; canonical "Twin" carries the imported categories; `additions[3]` no
   longer contains a duplicate "Twin".
7. **Idempotent re-import:** Import the same v4 JSON twice. State after the second
   import equals state after the first (replace semantics, no accumulation).
8. **Pages and images invariant:** Before and after any import, `PAGE_NUMBERS`
   length and `PAGE_PROJECTS` contents are unchanged; `getImagePath(n)` returns the
   identical path for all `n`.

### API route: `POST /api/project-categories/import`

9. **Validation still enforced:** Import invalid JSON (unknown page key, unknown
   category, duplicate project) → 422 with the same messages as before. Replace
   semantics does not relax validation (validation happens in `parseImportPayload`,
   unchanged).
10. **Oversize payload:** > 2 MiB body → 413, unchanged.
11. **Malformed JSON:** non-JSON body → 400, unchanged.
12. **Stats in response:** Successful import returns `{ success: true, format, stats }`
    where `stats.projectsRestored` counts projects assigned from the JSON (not
    existing-store-merged), and `stats.additionsCreated` counts additions created
    from the JSON.

### Client flow: `Sidebar.handleImportClick`

13. **Confirm cancels:** Click "Import Data", dismiss confirm with Cancel → file
    picker does NOT open; KV state unchanged.
14. **Confirm proceeds:** Click "Import Data", accept confirm → file picker opens;
    selecting a valid JSON file triggers import.
15. **Post-import refresh:** After a successful import, the sidebar project list
    reflects the imported projects (old added projects gone), the selected project
    updates to a still-valid name (falling back to the first available if the old
    selection no longer exists), and category selections render from the JSON.

### Manual end-to-end

16. **Round-trip:** Export current data to JSON → Add a new project and assign some
    categories → Import the earlier export → the new project and added selections
    are gone; the state matches the exported JSON exactly; page navigation still
    works; page images still render.
17. **Pages and images survive aggressive import:** On a fresh state, import a JSON
    that only covers a couple of pages. Navigate to a page NOT in the JSON — the page
    image loads, the canonical projects still display, and category selections are
    empty (not the previous selections).

## Kimi k3 review comments

Adversarial review of this plan, with every claim re-verified against the source.

### Verdict

The core engineering analysis is **correct and verified**: the 3-line bucket change +
untouched loop + unchanged `persistAll` produces exact replace semantics, and the
doc's claims about why the loop body survives are accurate. But the doc has **three
factual errors**, a **non-executable test plan**, and it **downplays two behavioral
consequences** beyond what "replace instead of merge" obviously implies.

### What holds up (verified against code)

- Merge-today claim: `importData` clones stored state at kv.ts:310–317 exactly as quoted.
- The loop is genuinely correct from empty buckets: `conflictingAddition` (kv.ts:341)
  is unreachable because the canonical loop (338–352) runs *before* the additions loop
  (357–367) within each page iteration, so `additions[page]` is always empty at check
  time; the v4-canonical branch in the generic loop is gated by
  `if (data.format === "legacy")` (kv.ts:378), so no double-write/double-count;
  `persistAll` rewrites all three keys via `multi().set()` (kv.ts:97–102) and
  reassigns globals (105–107).
- Line references kv.ts:305, 310–317, 333–367, 341, 351, 370–396, 404, 90–108, 121,
  165; constants.ts:19, 219, 221; data-transfer.ts:157, 191–196;
  ProjectContext.tsx:462, 497–501; Sidebar.tsx:28–39, 41 — all exact.
- The 3-line diff compiles as written: `CategoryData`/`ProjectRenames`/`ProjectAdditions`
  are already imported (kv.ts:3–8); the clone helpers remain used by four other functions.
- Failure-atomicity quietly improves vs. a literal "delete then import": validation
  precedes any write and `persistAll` is the only write, so a bad file leaves old
  state intact.

### Factual errors in this doc

1. **`kv.ts:483–492` does not exist.** kv.ts is 410 lines. The fallback
   `available[0] ?? ""` is at **ProjectContext.tsx:490–492**. The cited range fits
   ProjectContext.tsx almost exactly — a wrong-filename typo, but it should be fixed
   in a doc whose authority rests on precise citations.
2. **"then refreshes renames/additions and reloads the page" is false.**
   `importCategories` (ProjectContext.tsx:462–505) never reloads; the only
   `window.location.reload()` in the codebase is Delete All (Sidebar.tsx:34). Import
   does a *targeted* refresh: renames, additions, and `loadPageData` for the **current
   page only**. The `pageProjects` cache for other pages stays stale post-import (it
   self-heals via the `useEffect` at ProjectContext.tsx:167–169 on navigation — no
   bug, but the doc's mental model is wrong).
3. **The test cases use pages that don't exist.** Tests 1–6 seed/import pages **3 and
   5**, but `PAGE_PROJECTS` has 197 pages starting at **23** (verified: no 3, no 5).
   `validatePage` (data-transfer.ts:17–23) rejects every one of these imports with
   "Unknown page" → 422 before `importData` is ever reached. As written, tests 1–6
   test nothing. Use real pages (e.g., 23, 24, 61).

### Gaps and risks, by severity

**High — the test plan is not executable as specified.** There is no unit-test
runner: `package.json` has only `"test": "playwright test"`; no jest/vitest. Tests
1–8 ("Unit: kv.ts") and 9–12 ("API route") have no home. The natural fit is
Playwright API-level tests via `page.request.post` (pattern already used at
06-enhanced-features.spec.ts:226), with state seeded/asserted through the existing
`exportBundle`/`resetAllData` helpers — but the plan must say that, and "Files
touched: 2" is inconsistent with a 17-case test plan.

**High — degenerate valid input becomes a total wipe.** `{}` parses as valid *legacy*
(`isRecord` passes, no `schemaVersion` → empty categories, data-transfer.ts:191–196).
Under merge, importing `{}` was a **no-op**; under replace it **deletes everything** —
the loop never runs and `persistAll({},{},{})` overwrites all three keys. Same for
`{"schemaVersion":4,"categories":{},"renames":{},"additions":{}}`. This is the logical
extreme of replace semantics and may be intended — but the doc never discusses the
blast-radius change, and the single generic `confirm()` is the only guard against
picking the wrong file. At minimum add an explicit "empty JSON wipes all"
accepted-behavior test; better, reject zero-page payloads or show counts in the confirm.

**Medium — the success alert becomes misleading.** `restoredPages`/`projectsRestored`
only count what's *in* the JSON (pageKeys from `data.*`, kv.ts:322–326). Under merge,
unlisted pages were untouched, so the alert told the whole story. Under replace, the
alert can say **"1 page, 3 projects restored" while silently wiping 196 pages of
selections**. "Stats stay meaningful" is the weakest sentence in the doc. Add
`pagesCleared`/`selectionsCleared` to stats, or reword the alert.

**Medium — requirement vs. reality on "delete all existing projects."** Canonical
projects are constants and survive every import (cleared, but visible). The doc is
honest about this in Background, but (a) "Decisions (confirmed)" never records
stakeholder sign-off on it, and (b) the proposed confirm copy — "replace all existing
projects and categories" — overpromises. Suggested copy: *"replaces all saved category
selections, renames, and added projects."*

**Low — "harmless dead code" is fragile, not harmless.** The `ProjectConflictError`
path (kv.ts:341–346) and the route's 409 branch (route.ts:32–34) become unreachable
through an *ordering invariant* (empty additions during the canonical loop), not
through types. A future refactor that processes additions first silently re-arms it.
Either delete the path or comment the invariant.

**Low — the new confirm gets zero automated coverage.** `importThroughButton`
(06-enhanced-features.spec.ts:136) bypasses the button via `setInputFiles` on the
hidden input, so no existing test breaks (verified: all import specs run from
reset/empty state, where replace ≡ merge — "No other files need changes" is accurate
for source and existing tests). But planned tests 13–14 need a
`page.waitForEvent('filechooser')` pattern that doesn't exist in the helpers yet.

### Nuance checked and cleared

The line-351 `delete` *could* theoretically erase a slot written earlier in the same
loop (a rename onto a sibling canonical's original). Traced: rename swaps collapse to
identity via chain-following in `resolveEffectiveName` + `normalizeRenames`, and
single-direction collisions delete only empty slots. The doc's "no-op" claim survives —
it is only non-vacuous for hand-crafted JSON exploiting a pre-existing validation gap.

### Pre-existing issues (not caused by this plan — don't fix here)

- `validateV4Identity` (data-transfer.ts:162–165) never checks canonical-vs-canonical
  effective-name collisions (`seen.add` without `seen.has`), so hand-crafted renames
  like `B→"A"` on a two-project page (e.g., 61, 81, 289) validate, then silently
  overwrite each other in the import loop. The UI can't produce this
  (`assertNameAvailable`, kv.ts:290).
- V4 `categories` keys that are neither canonical nor declared additions silently
  *create* additions via the generic loop (kv.ts:386–390).
- The concurrent-toggle lost-update race (`setProjectCategories` reads then SETs one
  key, kv.ts:126–151) exists identically under merge today; replace neither worsens
  nor fixes it.
- Cosmetic: `categories[page] = {}` (kv.ts:331) persists empty page objects for
  rename/addition-only pages — same as merge.

### Suggested amendments to this doc

1. Fix `kv.ts:483–492` → `ProjectContext.tsx:490–492`; replace "reloads the page"
   with "refreshes renames/additions and refetches the current page's data (no reload)".
2. Use real page numbers (23, 24, 61) in test cases 1–6.
3. State where tests 1–12 live (Playwright API-level) and add test files to
   "Files touched".
4. Add an explicit decision + test for empty/zero-page JSON (wipe-all or reject).
5. Add cleared-counts to stats or reword the success alert and the confirm copy.
6. Add a test: page covered by JSON but a canonical project omitted → that project's
   selections cleared (complement of test 2).
7. Comment the ordering invariant at kv.ts:341, or delete the dead conflict path.

**Bottom line:** implement the 3-line kv.ts change and the confirm exactly as planned —
the design is sound and minimal. But don't trust the doc's test section or its two
stray citations, and have an explicit conversation about empty-file wipe and alert
wording before shipping.