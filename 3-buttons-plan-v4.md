# Enhancement Plan v4: Safe Project Mutations and Lossless Data Transfer

## 1. Goals

V4 keeps the three-button UI from v3 while fixing the release-blocking state,
validation, persistence, rename, export/import, and test-safety defects found in
the adversarial review.

The implementation remains compatible with existing plain `CategoryData` import
files. New exports use a versioned bundle so canonical renames can be restored as
renames instead of being converted into added projects.

## 2. Resolved Product Decisions

- Import behavior is merge-based. Included projects overwrite their categories;
  unrelated projects remain.
- Project names are trimmed, limited to 500 characters, and unique on a page by
  case-insensitive effective display name.
- Added projects can be renamed. Their entry in `project-additions` is renamed;
  they are not written to the canonical rename map.
- Deleting a canonical project clears its categories and keeps it visible.
- Deleting an added project removes it completely.
- If a selected canonical project is the only project on the page, deletion keeps
  it selected with an empty category state and a `*` marker.
- Unknown pages are rejected by add, delete, rename, and import operations.
- Imported categories must be known values from `CATEGORIES`.
- Import files are limited to 2 MiB.
- Playwright is destructive and therefore runs against loopback only by default.
  A non-loopback target requires `ALLOW_DESTRUCTIVE_TESTS=true` explicitly.

## 3. Export and Import Contract

### V4 Export Bundle

`GET /api/project-categories/export` and the Export button return:

```json
{
  "schemaVersion": 4,
  "categories": {
    "23": {
      "Renamed Promenade": ["Residential"],
      "User Added Project": []
    }
  },
  "renames": {
    "23": {
      "The Promenade by the River": "Renamed Promenade"
    }
  },
  "additions": {
    "23": ["User Added Project"]
  }
}
```

`categories` still contains every canonical page and project, using effective
display names, plus all additions. `?compact=true` removes empty category entries
and pages but keeps the same envelope.

### Import Compatibility

The import endpoint accepts:

1. A V4 bundle, restoring canonical rename metadata and additions correctly.
2. A legacy plain `CategoryData` object. A name matching a current effective
   canonical name updates that canonical project; otherwise it is merged as an
   addition.

The complete payload is validated before any write. Validation rejects malformed
objects, unknown pages, invalid names, duplicate effective names, unknown
categories, and invalid metadata.

## 4. Backend Changes

### Data Layer

`src/lib/kv.ts` will:

- Read Redis fresh when Redis is configured instead of trusting process caches.
- Surface configured Redis failures instead of converting them to empty stores.
- Add one batched state writer for categories, renames, and additions.
- Build imports entirely in memory and persist once after validation.
- Make add reject duplicate effective names without changing existing data.
- Make rename update either canonical rename metadata or the additions list.
- Make delete update categories and additions consistently.
- Resolve legacy chained renames to one effective name.
- Count only genuinely created additions in import statistics.

The three-key transaction prevents partial multi-key commits. It does not provide
compare-and-swap protection between two concurrent read/modify/write requests;
stable project IDs and Redis-side CAS remain a future storage migration.

### API Routes

- Validate page, project name, and body shape on every mutation route.
- Return `409` for duplicate names, `400`/`422` for invalid input, `404` for an
  unknown project, `413` for oversized imports, and `503` for storage failures.
- Return JSON errors consistently as `{ error: string }`.
- Import returns `{ success, format, stats }` only after persistence succeeds.

## 5. Frontend State Rules

### Add Project

- Validate against canonical effective names and additions.
- Optimistically add and select the project immediately.
- Initialize local categories to `[]`; never inherit the previous selection.
- Check `response.ok`; rollback project, selection, and categories on failure.

### Delete Project

- Optimistically clear canonical categories or remove an addition.
- Select the first remaining canonical project, then the first addition.
- Keep a lone canonical project selected with empty categories.
- Check `response.ok`; restore the previous state on failure.

### Rename Project

- Validate duplicates against all effective names.
- Update `projectRenames` for canonical projects.
- Update `addedProjects` for added projects.
- Move local category data to the new display key.
- Check `response.ok` and rollback on failure.

### Import

- Parse and validate the selected file before sending it.
- Check `response.ok` and show a useful failure alert.
- Refresh renames, additions, current project, and current page data without a
  full page reload.

### Async Loading

- Page/project loads are request-sequenced so stale responses cannot overwrite a
  newer selection.
- Mutation rollback changes global selection only if the user is still on the
  affected page/project.

## 6. Test Plan

### Safety

- Playwright defaults to `http://127.0.0.1:3100` and starts its own Next server.
- Redis environment variables are blanked for that server.
- Reset helpers refuse non-loopback URLs unless explicitly authorized.
- Tests use one worker because the local fallback store is process memory.

### Required Coverage

1. Buttons are visible, ordered, and styled.
2. New project is selected immediately and starts with no inherited categories.
3. Duplicate effective names are rejected without category loss.
4. Add rollback occurs on an HTTP 500.
5. Added project rename persists and can then be deleted.
6. Canonical deletion immediately clears categories and shows `*`.
7. Delete rollback occurs on an HTTP 500.
8. Fresh export contains all canonical pages and empty projects.
9. V4 rename/add/category export survives Delete All and import exactly.
10. Legacy `CategoryData` import remains supported.
11. Malformed JSON and structurally invalid JSON cause no mutation.
12. Import HTTP errors are surfaced.
13. Delete All clears categories, renames, and additions.

Tests use `page.once("dialog")`, response waits, downloads, and locator assertions.
They do not use persistent dialog listeners for multi-dialog workflows or fixed
sleep calls for synchronization.

## 7. Known Limits

- Stored category maps are still keyed by display name. A future schema with
  stable project IDs is required to represent two distinct same-name canonical
  projects or provide full cross-request compare-and-swap semantics.
- Legacy exports do not contain rename identity. If imported after renames were
  deleted, an unmatched legacy effective name is necessarily treated as an
  addition. V4 bundles do not have this limitation.

## 8. Verification

Run:

```text
npm run build
npx tsc --noEmit --incremental false
npm test
git diff --check
```
