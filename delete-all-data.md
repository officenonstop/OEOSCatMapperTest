# Plan: Rename "Import/Export Categories" -> "Import/Export Data" and Confirm Delete All Data Scope

## 0. Original Requirement

1. Rename the sidebar buttons "Import Categories" to "Import Data" and
   "Export Categories" to "Export Data".
2. "Delete All Data" should delete only app projects and their categories, not
   page numbers or page images.

The second part of the requirement is already satisfied by the current
`deleteAllData()` implementation: it clears only categories, renames, and
additions. Page numbers (static `PAGE_PROJECTS`) and page images (static files
under `public/images/`) are never stored in KV and so cannot be deleted. This
plan therefore makes no logic change for Delete All Data; it only aligns the
button's dialog text with the new "data" terminology.

## 1. Goals

Rename the two sidebar data-transfer buttons so they read "Import Data" and
"Export Data" instead of "Import Categories" and "Export Categories", align the
user-facing dialog, alert, and route-error strings with the new terminology,
and rename the export download filename from `project-categories.json` to
`catmapper-data.json`.

Confirm and document that "Delete All Data" already deletes only app projects
and their categories (canonical renames and user additions) and intentionally
does **not** delete page numbers or page images. No logic change is needed for
this behavior; only the button's dialog text is being aligned.

This plan is the result of an adversarial self-review of an earlier draft. The
critical miss identified during review (visual regression snapshot regeneration)
is captured in section 6.

## 2. Resolved Product Decisions

- Button labels become `Export Data` and `Import Data`. The order, styling,
  and behavior of the buttons are unchanged.
- "Delete All Data" keeps its label. Its confirm/alert text is updated from
  "category data" to "data" for terminology consistency.
- The export download filename becomes `catmapper-data.json` on both the
  client (`a.download`) and the server (`Content-Disposition` header). The
  exported JSON envelope and `schemaVersion` are unchanged; only the suggested
  filename changes. Import remains backward compatible with both V4 bundles
  and legacy `CategoryData` objects regardless of the file's name.
- Internal API surface is intentionally preserved: KV key names, route paths
  under `/api/project-categories/*`, function names (`deleteAllData`,
  `importData`, `importCategories`), and the `CategoryData` type are all
  unchanged.
- "Delete All Data" behavior is already correct and is not modified. It clears
  only the three KV keys `project-categories`, `project-renames`, and
  `project-additions`. Page numbers come from the static `PAGE_PROJECTS` map
  in `src/lib/constants.ts`; page images are static files in
  `public/images/page_*.jpg`. Neither is stored in KV, so neither is deleted.

### Deliberately kept as "categories" (do NOT align)

The following user-facing strings intentionally keep the word "categories"
and are out of scope for the "data" terminology rename. A future reader
should not "helpfully" align them and break the regex coupling noted below:

- `src/lib/data-transfer.ts` validation messages, e.g. `"Categories must be an
  object"` (line 60), `"... must be an array of strings"` (line 43), and
  `"... contains unknown category 'X'"` (line 49). These surface via
  `alert(error.message)` in `Sidebar.tsx:54-55` on import failure. They
  reference the `categories` field of the (unchanged) JSON envelope, so the
  wording is accurate.
- `src/context/ProjectContext.tsx:394` Delete Project confirm:
  `Delete project 'X' and all its categories?`. A project delete is
  category-scoped, so keeping "categories" here is correct.
  `tests/specs/06-enhanced-features.spec.ts:102` pin this exact wording via
  the regex `/Delete project '.+' and all its categories/`; changing the
  prompt without updating that regex would break the test.
- `tests/helpers/api.ts` load/save/fetch/export/reset error messages
  (lines 25, 38, 49, 62, 73, 84) already use neutral "data"/"project"
  wording; only line 95 historically said "import categories" and is
  corrected by this plan.

## 3. Backend and Frontend Changes

### A. App source - buttons, dialogs, filename, route errors

`src/components/Sidebar.tsx`:

- Line 15 throw message and line 24 alert: `Failed to export categories` ->
  `Failed to export data`.
- Line 20 `a.download`: `project-categories.json` -> `catmapper-data.json`.
- Line 29 confirm: `Delete ALL category data? This cannot be undone.` ->
  `Delete ALL data? This cannot be undone.`.
- Line 33 alert: `All category data deleted.` -> `All data deleted.`.
- Line 55 alert fallback: `Failed to import categories: invalid file` ->
  `Failed to import data: invalid file`.
- Line 81 button text: `Export Categories` -> `Export Data`.
- Line 87 button text: `Import Categories` -> `Import Data`.

`src/app/api/project-categories/export/route.ts`:

- Line 76 `Content-Disposition` filename: `project-categories.json` ->
  `catmapper-data.json` (mirror the client).
- Line 80 error: `Failed to export categories` -> `Failed to export data`.

`src/app/api/project-categories/import/route.ts`:

- Line 35 error: `Failed to import categories` -> `Failed to import data`.

`src/context/ProjectContext.tsx`:

- Line 473 throw message and line 503 alert fallback:
  `Failed to import categories` -> `Failed to import data`.

`ui-playwright-testing-process.md` (living process guide, 2 example lines):

- Line 103 example log string `Resetting all category data...` ->
  `Resetting all data...` (mirror `tests/global-setup.ts:4`).
- Line 210 example locator `button:has-text("Export Categories")` ->
  `button:has-text("Export Data")`.

### B. Playwright specs (button text and dialog regex)

`tests/specs/01-ui-visibility.spec.ts`:

- Line 16 visible assertion `text=Export Categories` -> `text=Export Data`.
- Line 56 test name: `Export Categories button has green styling` ->
  `Export Data button has green styling`.
- Line 58 locator `button:has-text("Export Categories")` ->
  `button:has-text("Export Data")`.

`tests/specs/02-happy-path.spec.ts`:

- Line 144 test title `07 - Export Categories downloads JSON via UI ...` ->
  `07 - Export Data downloads JSON via UI ...`.
- Lines 157, 224, 290 locator `button:has-text("Export Categories")` ->
  `button:has-text("Export Data")`.

`tests/specs/03-boundary-negative.spec.ts`:

- Line 192 locator `button:has-text("Export Categories")` ->
  `button:has-text("Export Data")`.

`tests/specs/04-destructive.spec.ts`:

- Line 113 locator `button:has-text("Export Categories")` ->
  `button:has-text("Export Data")`.

`tests/specs/06-enhanced-features.spec.ts`:

- Line 110 `getByRole('button', { name: 'Export Categories' })` ->
  `name: 'Export Data'`.
- Lines 171-177 `toHaveText` array: `Export Categories` and `Import Categories`
  become `Export Data` and `Import Data`.
- Line 178 `getByRole('button', { name: 'Import Categories' })` ->
  `name: 'Import Data'`.
- Line 154 regex `/Delete ALL category data/` -> `/Delete ALL data/`.
- Line 155 regex `/All category data deleted/` -> `/All data deleted/`.

### C. Test infrastructure strings

`tests/helpers/api.ts`:

- Line 95 `throw new Error('Failed to import categories: ...')` ->
  `Failed to import data: ...`.

`tests/global-setup.ts`:

- Line 4 `console.log('[Global Setup] Resetting all category data...')` ->
  `Resetting all data...`.

## 4. Unchanged - Delete All Data behavior

`deleteAllData()` in `src/lib/kv.ts:165` already does exactly what the product
requires. It deletes three Redis/in-memory keys:

- `project-categories` (selected categories per project per page)
- `project-renames` (canonical project name overrides)
- `project-additions` (projects added via the Add Project button)

It does not touch:

- Page numbers, defined statically in `src/lib/constants.ts` as `PAGE_PROJECTS`
  and `PAGE_NUMBERS`. They are never stored in KV, so they cannot be deleted.
- Page images, static JPG files at `public/images/page_*.jpg` served directly
  by Next.js. They are not KV-managed.

Existing tests already prove this: `tests/specs/04-destructive.spec.ts` test
04 verifies that after Delete All, the export still contains every page and
project with empty categories (structural survival proof). Test 06 on the
multi-project page asserts only that the compact export is empty (categories
gone), relying on the same delete-then-export mechanism. No new
`deleteAllData()` test is required by this change batch.

Because the behavior is already correct, this plan only edits the dialog text
around the Delete All Data button. The handler logic is unchanged.

## 5. Explicitly NOT Changed

- KV key names `project-categories`, `project-renames`, `project-additions`.
- Route paths under `/api/project-categories/*` and `/api/project-categories/export`,
  `/api/project-categories/import`.
- Function names `deleteAllData`, `importData`, and the context method
  `importCategories`. The latter stays as-is to avoid an API-wide rename; only
  user-facing text references are changed.
- The `CategoryData`, `ProjectRenames`, `ProjectAdditions`, `CategoryExportV4`,
  and `ValidatedImport` types.
- The exported JSON envelope shape and `schemaVersion`. Import compatibility
  with both V4 bundles and legacy `CategoryData` objects is preserved.
- Historical markdown plans (`3-buttons-plan*.md`). They are treated as
  historical artifacts and are not rewritten. Note:
  `ui-playwright-testing-process.md` is a *living* process guide, so per the
  review its two stale example locators are corrected (line 103 log string,
  line 210 "Export Categories" -> "Export Data"); only those example lines are
  touched, the prose is unchanged.

## 6. Visual Regression Snapshots (Critical Step)

The adversarial review identified that `tests/specs/05-visual-regression.spec.ts`
will break. All 11 baselines include the sidebar (with the two renamed
buttons). 10 of the 11 use `toHaveScreenshot({ fullPage: true })`; test 04
(`05-visual-regression.spec.ts:59`) uses `fullPage: false` but the default
viewport still includes the 280px sidebar, so test 04 breaks for viewport
inclusion rather than full-page inclusion — the conclusion (all 11 break) is
unchanged. Shortening `Export Categories` -> `Export Data` and
`Import Categories` -> `Import Data` changes sidebar text width and, on the
375px mobile and 1024px tablet viewports (tests 08 and 09), the layout around
those buttons.

The 11 baseline PNGs live at:

```
tests/specs/05-visual-regression.spec.ts-snapshots/*-chromium-win32.png
```

`maxDiffPixelRatio: 0.05` will not absorb these differences on the tight
viewports. The baselines must be regenerated after the source edits:

```text
npx playwright test tests/specs/05-visual-regression.spec.ts --update-snapshots
```

(`package.json` exposes a `test:update-snapshots` script too, but it runs
`--update-snapshots` against the whole suite; the targeted command above
refreshes only the 11 visual baselines.)

After regenerating, visually inspect at least the mobile (08) and tablet (09)
PNGs to confirm that only the sidebar button text/width shifted and nothing
else regressed. The existing baselines are the `chromium-win32` variants; if
the suite is also run on Linux or WSL, separate cross-platform baselines may
be required (a known Playwright footgun, out of scope for this change).

## 7. Verification

Run after all edits are applied and snapshots regenerated:

```text
npx tsc --noEmit --incremental false
npx playwright test
git diff --check
```

`package.json` has no `lint` or `typecheck` script, so `tsc --noEmit` is run
directly as a cheap syntax/build sanity check (it does not verify string
literals — the real safety net is the Playwright suite). The full Playwright
suite covers the renamed button locators, the updated dialog regexes, the fact
that no test asserts the download filename, and the regenerated visual
baselines.

## 8. Known Limits

- The internal method name `importCategories` on `ProjectContext` is kept to
  avoid an API-wide rename. Only user-facing copy and route error strings are
  updated, so a future reader may notice a minor terminology mismatch between
  the function name and the button label.
- Cross-platform visual baselines are not introduced by this change. Running
  the visual regression suite on a platform other than `chromium-win32` will
  require snapshot regeneration on that platform.

## 9. Kimi k3 review comments

Adversarial review performed against the live codebase. Every line-number
citation in this plan was spot-checked (~30 of them across `Sidebar.tsx`, both
API routes, `ProjectContext.tsx`, all five spec files, `tests/helpers/api.ts`,
and `tests/global-setup.ts`) and found to be exact. The central premise was
verified: `deleteAllData()` (`src/lib/kv.ts:165`) deletes exactly the three KV
keys `project-categories`, `project-renames`, `project-additions`; page numbers
are static in `src/lib/constants.ts` (`PAGE_PROJECTS`) and page images are 292
static `public/images/page_*.jpg` files. No logic change is genuinely required.
The section 6 catch (snapshot regeneration) was validated: all 11 baselines
include the sidebar and will break.

Verdict: **approve with amendments** — the plan is executable as-is and would
succeed; the items below are corrections and hardening, not blockers.

### Issues (ordered by severity)

1. **Factual error in section 6 (minor; conclusion unchanged).** The plan
   claims "Every one of its 11 tests uses `toHaveScreenshot({ fullPage: true })`".
   False: test 04 (`05-visual-regression.spec.ts:59`) uses `fullPage: false`.
   The conclusion survives because the viewport-only capture still contains the
   sidebar, so all 11 baselines still break — but for test 04 sidebar inclusion
   is viewport-dependent, not full-page-dependent. Fix the sentence.
2. **`ui-playwright-testing-process.md` exclusion is debatable.** Section 5
   treats it as a historical artifact, but it reads as a living process guide:
   line 210 shows `button:has-text("Export Categories")` and line 103 shows the
   old global-setup log string as example code for future test authors. Unlike
   `3-buttons-plan*.md` (genuinely historical), stale locators here actively
   mislead. Either update it or add a one-line "examples predate the Data
   rename" note.
3. **Undocumented terminology boundaries (defensible, should be explicit).**
   - `src/lib/data-transfer.ts` validation errors ("Categories must be an
     object", "contains unknown category 'X'") are user-facing: they surface
     via `alert(error.message)` on import failure in `Sidebar.tsx`. The plan
     claims to align "alert strings" but never mentions these. Keeping them is
     arguably correct (they reference the unchanged `categories` JSON envelope
     field), but that decision should be stated, not omitted.
   - `src/context/ProjectContext.tsx:394` Delete Project confirm says "Delete
     project 'X' and all its categories?". After this change, Delete All says
     "data" while Delete Project says "categories". Defensible (a project
     delete is category-scoped), but note that
     `06-enhanced-features.spec.ts:102` has a regex coupled to this string
     staying unchanged.
4. **Trivial nits.**
   - Section 0 quotes the requirement as "Import categories"; the actual label
     is `Import Categories`. Immaterial.
   - `package.json` already has a `test:update-snapshots` script; the section 6
     targeted `npx` command is fine but could reference it.
   - `npx tsc --noEmit` in section 7 is decorative here — string literals are
     not type-checked. The real safety net is entirely the Playwright suite
     (which is comprehensive for this change).
   - Section 4's claim that destructive test 06 verifies "multi-project page
     structure remains" is slightly loose: test 06 only asserts the compact
     export is empty; test 04 is the one that proves structure survives. The
     evidence cited still supports the conclusion.

### What the plan got notably right

- Filename rename is safe: tests only assert `suggestedFilename()` matches
  `/\.json$/` (verified in 02, 03, 04 specs), never the exact name. Both client
  `a.download` and server `Content-Disposition` are updated; the client one is
  what blob downloads actually use.
- Dialog-message coupling exists in exactly one place (06 spec lines 154-155);
  04-destructive and 05-visual auto-accept dialogs without message assertions.
  The plan caught the only place that matters.
- No locator collisions post-rename: `has-text("Export Data")` /
  `getByRole('button', { name: 'Import Data' })` cannot match "Delete All Data".
- It silently fixes a pre-existing inconsistency: `tests/helpers/api.ts`
  already said "Failed to export data" / "Failed to reset data" while line 95
  said "Failed to import categories".
- Snapshot regeneration is correctly sequenced after the source edits, with a
  manual inspection step for mobile/tablet.

### Requested amendments before execution

1. Correct the `fullPage` claim in section 6 (test 04 uses `fullPage: false`).
2. Reconsider or annotate the `ui-playwright-testing-process.md` exclusion.
3. Add a paragraph to section 2 explicitly listing the "categories" strings
   deliberately left in place (data-transfer validation messages, Delete
   Project confirm, load/save errors), so a future reader does not "helpfully"
   align them and break the 06-spec regex coupling.

### Out-of-scope observation (pre-existing, unrelated to this plan)

`package.json` scripts `test:visual` and `test:smoke` grep for
`@visual`/`@smoke` tags that appear in no spec titles, so they match zero
tests today. Worth a separate cleanup.