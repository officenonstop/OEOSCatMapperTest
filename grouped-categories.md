# Grouped Categories — Requirement & Implementation Plan

## 1. Original Requirement

> Add a toggle somewhere (maybe in header), between "Next Page" and "Show Page" buttons. The toggle should say "Sorted" and "Grouped" as 2 choices. Right now all categories are sorted; add another choice for user to see them by group. While showing grouped categories, they should be grouped together and should have the same background color as per group. Use VIBGYOR and white colors as bg colors. Foreground/font color should be black. Use "grouped-categories.txt" for the groups. Pl note now there are 3 more categories, so total 66 categories.

## 2. Findings & Reconciliation

- **Header layout** (`src/components/Header.tsx:86-101`): the right cluster is `<div className="flex items-center gap-2">` containing `Next Page >` then `Show Page`. The toggle goes **between** these two buttons exactly as requested.
- **Render surface** (`src/components/CategoryGrid.tsx`): reads `CATEGORIES` from `src/lib/constants.ts`, maps to `CategoryCard` in a 4-column CSS grid. Single render path; branched on view mode.
- **Card** (`src/components/CategoryCard.tsx`): inline classes currently use `bg-white` / `bg-blue-100`. Selected state is encoded as blue tint + checkbox. Groups demand a different "selected" visual since the bg now carries group meaning.
- **Shared state holder** (`src/context/ProjectContext.tsx`): `Header` and `CategoryGrid` are siblings under `app/page.tsx`. Cleanest single source of truth is to add `viewMode` here.
- **Backend validation** (`src/lib/data-transfer.ts:46`): `new Set(CATEGORIES)` gates imported category names. Any new category *must* be added to `CATEGORIES` in `constants.ts` to remain importable.
- **Count reconciliation — important**: `CATEGORIES` and `src/Master-categories.txt` both currently list **63** categories. `Grouped-Categories.txt` lists **66** across 8 groups. The 3 present in the group file but missing from `CATEGORIES` are:
  - "Facade" (Group 2)
  - "Competition winner" (Group 2)
  - "Compact Housing" (Group 2)

  These are the "3 more categories" referenced in the requirement. The plan adds them to `CATEGORIES` (alphabetical) so the **Sorted** view also surfaces them.

- **Existing test impact** (flagged, not changed by plan):
  - `tests/specs/01-ui-visibility.spec.ts:32-33` asserts `Next Page >` and `Show Page` strings remain visible — the toggle must not alter those button labels.
  - `tests/specs/05-visual-regression.spec.ts` snapshots need refreshed baselines for the new toggle chrome and the grouped layout.

## 3. Architecture

```
Header.tsx  ─── (new) viewMode + setViewMode ──┐
                                              │  (from ProjectContext)
CategoryGrid.tsx ─── renders per viewMode ────┘
                              │
                              ├─ "sorted"  → CATEGORIES (alpha), present card style
                              └─ "grouped" → CATEGORY_GROUPS (group order),
                                             one section per group, group bg color,
                                             black text, contiguous cards
```

New module: `src/lib/groups.ts`

```ts
export type ViewMode = "sorted" | "grouped";
export interface CategoryGroup { name: string; bg: string; categories: string[]; }
export const CATEGORY_GROUPS: CategoryGroup[];          // 8 groups, in file order
export const CATEGORY_TO_GROUP: Record<string, number>; // reverse lookup, 0..7
export const VIEW_BG_PALETTE: readonly string[];        // VIBGYOR + white (8)
```

Color assignment (8 groups → 8 palette entries, in group-file order):

| Group | Categories (count) | Palette slot |
|-------|--------------------|--------------|
| 1     | Residential-family (14) | Violet |
| 2     | Redevelopment-family + new 3 (11) | Indigo |
| 3     | Villa-family (10) | Blue |
| 4     | Workplaces-family (9) | Green |
| 5     | Hotels-family (10) | Yellow |
| 6     | Hospitals-family (3) | Orange |
| 7     | Sports-family (5) | Red |
| 8     | University-family (4) | White |

> **Contrast risk** (resolved): pure violet/indigo/blue/green/red with **black** text fails WCAG AA for ~5 of 8 groups. Locked decision: use **pale VIBGYOR pastels** (e.g. lavender `#E6E0F8`, light-indigo `#D8D8F0`, sky-blue `#CFE8FF`, mint `#D9F2D9`, pastel-yellow `#FFF7CC`, peach `#FFE0C2`, salmon `#FAD4D0`, white `#FFFFFF`) so black text stays legible on the dense 4-col grid.

## 4. Resolved Decisions (locked by user)

- Toggle is a **segmented control** ("Sorted" | "Grouped") in the header, default = **Sorted** (today's behavior unchanged on load).
- **Grouped layout**: each group is rendered as a **contiguous colored block** with a small labeled strip at top (`Group 1 — Residential family`); cards inside share the group bg. Black text everywhere.
- **Selected state in grouped mode** no longer relies on a tint; it uses a dark border + the existing `✓` chip so the group color remains the dominant signal.
- **State lives in `ProjectContext`** as `viewMode` + `setViewMode`, **persisted to `localStorage`** (`catmapper.viewMode`) and rehydrated on mount.
- **Constants grown to 66**: add `Compact Housing`, `Competition winner`, `Facade` alphabetically to `CATEGORIES` in `src/lib/constants.ts`. Group ordering is owned by `groups.ts`, not `constants.ts`.
- **`Grouped-Categories.txt` becomes the single source** for group membership; `CATEGORY_GROUPS` in `groups.ts` is transcribed from it (not parsed at runtime — file is static).
- **Backend** requires no new routes; only `CATEGORIES` grows so the validator accepts the 3 new names. Existing export/import remain byte-compatible.

## 5. File-by-File Changes

1. `src/lib/constants.ts` — extend `CATEGORIES` to 66 (insert `Compact Housing`, `Competition winner`, `Facade` alphabetically; keep one-entry-per-line style untouched for diff cleanliness).
2. `src/lib/groups.ts` — **new file**. Export `ViewMode`, `CategoryGroup`, `CATEGORY_GROUPS` (8 entries), `CATEGORY_TO_GROUP`, `VIEW_BG_PALETTE`.
3. `src/context/ProjectContext.tsx` — add `viewMode` state + `setViewMode`. Hydrate from `localStorage`; persist via `useEffect`. Add to interface, context value, and `useProject()` return.
4. `src/components/Header.tsx` — between `Next Page >` and `Show Page`, render a segmented toggle bound to `viewMode` / `setViewMode`. Keep both outer buttons and their exact text intact.
5. `src/components/CategoryGrid.tsx` — branch on `viewMode`:
   - `"sorted"` → current 4-col grid over `CATEGORIES` (unchanged).
   - `"grouped"` → vertical stack of group sections; each section = group label strip + responsive inner grid of `CategoryCard` for that group's categories.
6. `src/components/CategoryCard.tsx` — accept `bgColor?: string` and `selected` style override so grouped mode keeps black text + dark border on selection while preserving the group color.
7. *(no change)* `src/lib/data-transfer.ts`, `src/lib/kv.ts`, API routes — they key off `CATEGORIES`, so they automatically accept the 3 new entries.
8. *(maintenance)* Playwright visual snapshots in `05-visual-regression.spec.ts-snapshots/` need new baselines after implementation. Add 2 cases:
   - toggle renders, switches view without page reload
   - grouped view shows 8 contiguous colored sections, each card black text

## 6. Verification (post-implementation)

```
npm run build
npx tsc --noEmit --incremental false
npm test           # playwright suites
```

Manual: toggle to Grouped → confirm 8 colored contiguous blocks, all 66 cards present, all text black, default reverts to Sorted on hard reload of a fresh browser. Then click a card → selected border shows without masking the group color.

---

## 7. Kimi review v1

Adversarial review of this plan against the actual codebase. Line refs, counts, and set reconciliation were re-verified during review.

### 7.0 Verdict

The plan's code archaeology is mostly accurate (line refs, count math, set reconciliation all check out), and the selected-state-in-grouped-mode insight is genuinely good. But it has **one guaranteed-red test suite it never mentions, one layout bug that makes the grouped view unusable on short viewports, one silently-ignored conflict inside `Grouped-Categories.txt` itself, and several factual errors and underspecified decisions.**

### 7.1 Verified as accurate (credit where due)

- `Header.tsx:86-101` — exact; right cluster is `flex items-center gap-2` with `Next Page >` then `Show Page`. Toggle placement complies with the requirement.
- `data-transfer.ts:46` — exact: `const knownCategories = new Set(CATEGORIES);`. Set-membership only, no count checks, so old 63-category exports remain importable. The "no backend changes" claim holds.
- `CategoryGrid.tsx` single render path over `CATEGORIES`, 4-col grid ✓. `CategoryCard.tsx` `bg-white`/`bg-blue-100` ✓ (lines 15-16).
- **Count reconciliation is correct.** `constants.ts:1-16` = 63; `Master-categories.txt` = 63; group file = 14+11+10+9+10+3+5+4 = 66. All 63 master names are present in the group file; the extras are exactly `Facade`, `Competition winner`, `Compact Housing` (all Group 2), including the lowercase "w" in "Competition winner". Alphabetical insertion points are valid (`Compact Housing`, `Competition winner` after `Commercial Mixed-Use`; `Facade` after `Data Centers`).
- `01-ui-visibility.spec.ts:32-33` does assert `Next Page >` / `Show Page` ✓. Snapshot dir `tests/specs/05-visual-regression.spec.ts-snapshots/` exists as claimed ✓. `npm test` / `npm run build` exist ✓.

### 7.2 Critical gaps

- **B1 — "Existing test impact" misses the assertion that is *guaranteed* to fail.** The plan flags only button-label assertions and snapshots. It misses:
  - `tests/specs/01-ui-visibility.spec.ts:20-26` — test 03 hard-codes `await expect(buttons).toHaveCount(63)`. Adding 3 categories turns the suite red on day one. Test title ("All 63…") and test 13's title (line 121) also go stale.
  - `tests/helpers/page-constants.ts:3-18` — the test suite **duplicates** `CATEGORIES` (63) in a helper. The plan never mentions updating it. Consequences if forgotten: test 13 silently never covers the 3 new categories; `05-visual-regression.spec.ts:98-109` (test 07, "All 63 categories toggled on") toggles only 63; `03-boundary-negative.spec.ts` derives expectations from the same list (`toBeGreaterThanOrEqual(60)`, sort-equality) and keeps passing while quietly testing less.
- **B2 — Layout bug: the grouped view will be clipped with no scroll.** `src/app/page.tsx:13` wraps `CategoryGrid` in `<div className="flex-1 p-4 overflow-hidden relative">` — **`overflow-hidden`, no scroll**. The grouped layout (8 label strips + up to 17 card rows) is significantly taller than the current grid. On a 600–768px-tall viewport (our own visual tests run at 1024×768 and 375×812) the lower groups will be **cut off and unreachable**. The plan's file-by-file list doesn't touch `page.tsx` and never discusses vertical overflow. Fix: `overflow-y-auto` on the container (and the grouped stack shouldn't inherit `h-full`).
- **B3 — `Grouped-Categories.txt` carries its own colors; the plan never acknowledges discarding them.** The file specifies a color per group: `#d89090, #fbb787, #f0d595, #b5d6a0, #96f4eb, #838afe, #C8BFA8, #f9a7e7` (lines 2, 20, 35, 49, 62, 76, 83, 92) — **not VIBGYOR** — and the parenthetical labels are objectively wrong (`#d89090` = "Dark Gray"? it's salmon; `#838afe` = "Bright Orange"? it's periwinkle blue; `#f9a7e7` = "Pale Tan"? it's pink). The requirement overrides with VIBGYOR + white, and the pastel decision is defensible — but §4 declares the file "the single source for group membership" while silently ignoring half its content. If not called out explicitly, a future maintainer will "fix" the palette to match the file.
- **B4 — No integrity check between `groups.ts` and `constants.ts`.** Hand-transcribing 66 names into 8 groups ("not parsed at runtime") is typo-prone: a single typo silently drops a category from grouped view — it still renders in sorted mode, nothing throws, no test catches it (the proposed grouped test checks "8 colored sections, black text", not membership). Mandate a module-level assertion (or one Playwright assertion) that `CATEGORY_GROUPS.flatMap(g => g.categories)` sorted deep-equals `CATEGORIES` sorted and has 66 unique entries. Manual eyeballing (§6) is not a verification strategy for 66 transcribed strings.

### 7.3 Underspecified / traps

- **C1 — localStorage persistence: unrequested and under-thought.**
  - The requirement asks only for a toggle. Persistence is gold-plating, and it's the **first** localStorage use in the codebase (search: zero hits) — a new pattern introduced with no justification.
  - **No validation of the stored value.** If `catmapper.viewMode` contains anything but the two literals, both render branches fail → blank grid. The plan doesn't mention a guard.
  - **Rehydration flash.** Initial paint is always "sorted" (correct for hydration), then `useEffect` flips to "grouped" → a full-grid relayout on every reload for grouped users. §4's "today's behavior unchanged on load" and §6's "reverts to Sorted on hard reload" are only true for a fresh browser — the plan half-acknowledges this ("fresh browser") but never addresses the flash for returning users. Either gate rendering until hydrated, accept-and-document the flash, or drop persistence (reviewer's vote: drop it — it buys nothing the requirement asks for).
- **C2 — Tailwind class-generation trap for `bgColor`.** §5.6 says the card accepts `bgColor?: string` but never states the mechanism. Interpolated classes (`` `bg-[${hex}]` `` / `bg-${color}`) generate nothing under Tailwind JIT → all groups render white. Literal class strings in `groups.ts` *would* be scanned (`tailwind.config.ts:4` includes `./src/**/*.ts`), but the robust answer is an inline `style={{ backgroundColor }}`. Knock-on effect nobody mentioned: inline style defeats `hover:bg-gray-100`, so grouped cards get **no hover feedback** — needs an explicit decision.
- **C3 — Invented group names presented as fact.** §3/§4 use labels like "Group 1 — Residential family". The file has **no group names**, only "GROUP 1..8". Worse, the labels mislead: Group 1 contains Commercial & Retail, Healthcare, Infrastructure, Iconic, Ideas — a miscellany, not a "Residential family". Either mark the names as *proposed* (pending user sign-off) or render "Group N" only.
- **C4 — Speculative API surface (YAGNI).** `CATEGORY_TO_GROUP` and `VIEW_BG_PALETTE` are exported in §3 but **nothing in §5 consumes them** — the grid uses `CATEGORY_GROUPS`, the card takes a prop. Also `CATEGORY_TO_GROUP: Record<string, number>` means an unknown name returns `undefined` *typed as `number`* (no `noUncheckedIndexedAccess` in tsconfig). Drop both, or name their consumer.
- **C5 — Future Playwright strict-mode hazard.** `tests/helpers/categories.ts:4` locates `.grid.grid-cols-4` globally. If grouped sections reuse `grid-cols-4` per group, that locator matches 8 grids → strict-mode violation in any grouped-mode test reusing the helper. The 2 new test cases need scoped locators (or grouped sections should carry a distinct class/`data-testid` — decide now, in the plan).

### 7.4 Factual errors & nits

1. **`src/Master-categories.txt` doesn't exist** — it's `Master-categories.txt` at repo root. Related: the plan grows `CATEGORIES` to 66 but leaves this file at 63 without stating whether it's intentionally frozen or an oversight. If it mirrors the app's list (its name says so), it goes stale.
2. **§5.1 "keep one-entry-per-line style untouched"** — false premise: `constants.ts` packs 3–6 entries per line. Alphabetical insertion will rewrap lines and produce a noisy diff regardless; just say so.
3. **White group is invisible.** Group 8 gets `#FFFFFF` on the app's white background — its "contiguous colored block" reads as ungrouped. Suggest a light neutral or a section border. (The pastel palette in §3 is otherwise a sound, well-reasoned deviation — good WCAG catch.)
4. **Header crowding at 375px.** The segmented control adds ~150px to the right cluster inside a fixed `h-14` row that already holds 3 controls + a truncating project name. Snapshots will catch it, but the plan should list mobile as an explicit check rather than discovering it in a red snapshot.
5. **"Byte-compatible" is sloppy wording** (§4). What it means: schema v4 unchanged, set-membership validation, old exports still import. The reverse isn't noted: exports containing the 3 new names will be *rejected* by any older deployed instance. One line, for completeness.
6. **§6 verification omissions.** Missing `npm run test:update-snapshots` (exists, `package.json:15`) — and note that `npm test` runs *all* specs; since every snapshot is full-page with the header in-frame, the toggle chrome invalidates **all 11 baselines**, not selectively. Also add: a grep for `63` across `tests/` (3 files match) as part of the change.
7. `ViewMode` arguably belongs in `src/lib/types.ts` with the other shared types rather than `groups.ts`. Minor.

### 7.5 Required actions before this plan is implementation-ready

| # | Severity | Action |
|---|----------|--------|
| B1 | 🔴 | Add `01-ui-visibility.spec.ts` test 03/13 and `tests/helpers/page-constants.ts` to the change list |
| B2 | 🔴 | Add `src/app/page.tsx` (overflow) to the change list |
| B3 | 🟠 | Document that the file's `Color:` lines are intentionally overridden |
| B4 | 🟠 | Add a groups↔constants membership invariant + test |
| C1 | 🟠 | Justify, harden (validate stored value), or drop persistence; address flash |
| C2 | 🟠 | Specify inline-style mechanism + grouped-mode hover decision |
| C3/C4/C5 | 🟡 | Mark group names proposed; drop unused exports; scope grouped test locators |
| D | 🟡 | Fix path, style premise, white-group visibility, verification commands |
