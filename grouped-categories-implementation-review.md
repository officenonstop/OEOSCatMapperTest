# Adversarial Review: Implementation vs. Plan — Grouped Categories

> I verified every file change against the plan in `grouped-categories.md` (§5 File-by-File Changes) and the review actions in §7.5. Below is my assessment of what was implemented correctly, what was missed, and what new issues the implementation introduced.

---

## 0. Overall Verdict

The implementation is **high-quality and faithful to the plan**. It addresses nearly every critical gap (B1–B4) and underspecified trap (C1–C5) identified in the review. The code compiles cleanly (`tsc --noEmit` passes). However, there are **3 residual issues** — one functional, one accessibility, and one test-fragility — plus a few minor deviations worth noting.

---

## 1. Plan Compliance: File-by-File

### 1.1 `src/lib/constants.ts` — ✅ Compliant

- **Plan**: Extend `CATEGORIES` to 66, insert `Compact Housing`, `Competition winner`, `Facade` alphabetically.
- **Implementation**: Lines 4-5 add all 3 in correct alphabetical positions. Total count is 66. ✅
- **Review §7.4.2** said "one-entry-per-line style untouched" was a false premise — the implementation confirms this: lines were rewrapped (e.g., line 4 now has `Compact Housing`, `Competition winner` inserted mid-line, line 5 has `Facade`). The diff is noisy but correct.

### 1.2 `src/lib/groups.ts` (new) — ✅ Excellent

- **Plan**: Export `ViewMode`, `CategoryGroup`, `CATEGORY_GROUPS` (8 entries), `CATEGORY_TO_GROUP`, `VIEW_BG_PALETTE`.
- **Implementation**: Exports `ViewMode`, `CategoryGroup`, `CATEGORY_GROUPS`. **Drops `CATEGORY_TO_GROUP` and `VIEW_BG_PALETTE`** — this is correct per review C4 (they were YAGNI, nothing consumed them). ✅
- **Review B3** (document color override): Lines 11-14 explicitly document that the file's `Color:` lines are intentionally overridden. ✅
- **Review B4** (membership invariant): Lines 84-100 implement a module-level assertion that `CATEGORY_GROUPS.flatMap(g => g.categories)` exactly covers `CATEGORIES`. This throws at import time if any typo exists. ✅
- **Review C2** (Tailwind JIT trap): Line 14 documents inline style as the mechanism. ✅
- **Review C3** (invented group names): Uses `"Group 1"` through `"Group 8"` — no invented names. ✅
- **Pastel palette**: All 8 colors match the plan exactly (`#E6E0F8`, `#D8D8F0`, `#CFE8FF`, `#D9F2D9`, `#FFF7CC`, `#FFE0C2`, `#FAD4D0`, `#FFFFFF`). ✅
- **Group counts**: 14+11+10+9+10+3+5+4 = 66. ✅

### 1.3 `src/context/ProjectContext.tsx` — ✅ Compliant

- **Plan**: Add `viewMode` state + `setViewMode`, hydrate from `localStorage`, persist via `useEffect`.
- **Implementation**: 
  - `viewMode` and `setViewMode` added to interface (lines 32-33), state (line 69), context value (lines 528-529). ✅
  - `ViewMode` type imported from `groups.ts` (line 14). ✅
- **Review C1** (localStorage hardening):
  - `isViewMode()` type guard (lines 19-21) validates the stored value — corrupt data falls back to `"sorted"`. ✅
  - Rehydration flash documented in comment (lines 66-68). ✅
  - `try/catch` around localStorage access (lines 84-92, 97-101) handles private mode/quota. ✅
  - Default is `"sorted"` for SSR safety (line 69). ✅

### 1.4 `src/components/Header.tsx` — ✅ Compliant (with caveats)

- **Plan**: Segmented toggle between `Next Page >` and `Show Page`, bound to `viewMode`/`setViewMode`.
- **Implementation**: Lines 93-120 render the toggle between the two buttons. ✅
- **Button text intact**: `Next Page >` (line 91), `Show Page` (line 127). ✅
- **Review §7.4.4** (header crowding at 375px): Header padding changed from `px-4` to `px-2 sm:px-4` (line 48), center cluster from `px-4` to `px-1 sm:px-4` (line 56). This gives more room on mobile. ✅
- **Accessibility** (review §3.1):
  - `role="group"` with `aria-label="Category view"` (lines 94-95). ✅
  - `aria-pressed` on both buttons (lines 100, 111). ✅
  - **But**: `role="group"` is generic — `role="radiogroup"` with `role="radio"` would be more semantically correct for a mutually exclusive toggle. 🟡
  - **No keyboard arrow navigation**: The toggle buttons are individually tabbable but don't implement arrow-key movement between options (expected for `radiogroup`/`tablist` patterns). 🟡

### 1.5 `src/components/CategoryGrid.tsx` — ✅ Compliant

- **Plan**: Branch on `viewMode`; sorted = current grid; grouped = vertical stack of group sections.
- **Implementation**: Lines 11-38 implement grouped view, lines 41-52 keep sorted view. ✅
- **Review B2** (overflow): The grouped view uses `flex flex-col gap-3` (line 13) — no `h-full` or `content-start` inherited. ✅
- **Review C5** (test locator scoping): Each group section has `data-testid="group-section"` (line 17). ✅
- **Sorted mode**: Keeps `h-full content-start` (line 42) — unchanged. ✅
- **Group label strip**: Lines 21-23 render `Group N (count)` with black text. ✅
- **Inner grids**: Each group uses `grid grid-cols-4` (line 24) — this means `.grid.grid-cols-4` matches 8 grids in grouped mode, but the new test uses `data-testid` scoping. ✅

### 1.6 `src/components/CategoryCard.tsx` — ✅ Compliant

- **Plan**: Accept `bgColor?: string`, selected style override for grouped mode.
- **Implementation**: `bgColor?: string` prop (line 10). ✅
- **Review C2** (inline style + hover):
  - Inline `style={{ backgroundColor: bgColor }}` (line 18). ✅
  - `hover:brightness-95` for hover feedback (lines 22-23) — works on top of inline color. ✅
  - Comment documents the mechanism (lines 7-9). ✅
- **Selected state in grouped mode**: `border-gray-900 ring-1 ring-gray-900` (line 22) — dark border, no blue tint. ✅
- **✓ chip**: Still present (line 32). ✅
- **Sorted mode**: Unchanged `bg-blue-100`/`bg-white`/`hover:bg-gray-100` (lines 25-26). ✅

### 1.7 `src/app/page.tsx` — ✅ Compliant

- **Plan**: (Not in original plan — review B2 added it.)
- **Implementation**: Line 13 changed `overflow-hidden` → `overflow-y-auto`. ✅
- **Review B2** (layout bug): Fixed. The grouped view can now scroll. ✅

### 1.8 `Master-categories.txt` — ✅ Compliant (beyond plan)

- **Plan**: Not mentioned in §5.
- **Review §7.4.1**: Flagged that it would go stale if not updated.
- **Implementation**: Updated to 66 entries, matching `CATEGORIES`. ✅

### 1.9 `Grouped-Categories.txt` — ✅ Unchanged (correct)

- The file is untracked (new to git) but its content is unchanged. The plan correctly treats it as a reference file, not a file to modify. ✅

---

## 2. Test Compliance

### 2.1 `tests/helpers/page-constants.ts` — ✅ Compliant

- **Review B1**: CATEGORIES updated to 66 entries (lines 6-7 add the 3 new categories). ✅
- Stays in sync with `src/lib/constants.ts`. ✅

### 2.2 `tests/specs/01-ui-visibility.spec.ts` — ✅ Compliant

- **Review B1**: 
  - Test 03 title: "All 66" (line 20). ✅
  - `toHaveCount(66)` (line 25). ✅
  - Test 13 title: "All 66" (line 121). ✅
- **Review §3.4** (test 12 `hover:bg-gray-100`): Test 12 (line 118) still asserts `hover:bg-gray-100`. This works because the default view is "sorted" and sorted cards still use that class. But it's **fragile** — if the default ever changes to "grouped" or the card component is refactored, this test breaks. 🟡

### 2.3 `tests/specs/03-boundary-negative.spec.ts` — ✅ Compliant

- Tests 05 and 06 titles updated from "63" to "66" (lines 79, 102). ✅
- Tests 05 and 06 are still `.skip`ped — the review correctly noted they provide zero coverage. ✅ (not a plan gap — the plan didn't ask to un-skip them)

### 2.4 `tests/specs/05-visual-regression.spec.ts` — ✅ Compliant

- Test 07 title updated to "All 66" (line 98). ✅
- All 11 snapshot baselines updated (confirmed via git status). ✅
- **Review §7.4.6**: No new test cases added to this file for toggle/grouped — those went to the new `07-grouped-view.spec.ts`. This is a reasonable design decision. ✅

### 2.5 `tests/specs/07-grouped-view.spec.ts` (new) — ✅ Excellent

- **Plan §5.8**: Add 2 cases — toggle renders/switches, grouped view shows 8 sections/black text.
- **Implementation**: 3 tests:
  1. Toggle placement + view switching without reload (lines 12-40). ✅
  2. 8 colored sections, all 66 cards, black text, membership invariant (lines 42-67). ✅
  3. Selection keeps group color + dark border (lines 69-86). ✅
- **Review B4** (membership test): Lines 49-54 assert per-group sizes and total count of 66. ✅
- **Review C5** (scoped locators): Uses `getByTestId('group-section')` throughout. ✅
- **No-reload marker**: Lines 29, 38-39 use a `window.__noReload` marker to verify no page reload. ✅

---

## 3. Residual Issues

### 3.1 🟡 ARIA role semantics incomplete

**Issue**: The toggle uses `role="group"` (line 94 of `Header.tsx`) with `aria-pressed` on each button. While functional, `role="group"` is a generic grouping container. For a mutually exclusive two-option toggle (segmented control), the semantically correct pattern is:
- `role="radiogroup"` on the container + `role="radio"` + `aria-checked` on each option, OR
- `role="tablist"` on the container + `role="tab"` + `aria-selected` on each option

**Impact**: Screen readers may not announce the mutual exclusivity correctly. A user navigating with a screen reader hears two separate buttons rather than a "2-option radio group".

**Also missing**: Arrow-key navigation between the two options (expected for `radiogroup`/`tablist` patterns per WAI-ARIA Authoring Practices).

**Severity**: 🟡 — functional but not fully accessible. The plan's review (§3.1) flagged this gap; the implementation partially addressed it (`aria-pressed` is better than nothing) but didn't go all the way.

### 3.2 🟡 Test 12 fragility — `hover:bg-gray-100` assertion

**Issue**: `01-ui-visibility.spec.ts` line 118 asserts:
```ts
expect(initialClass).toContain('hover:bg-gray-100');
```

This test passes today because:
1. The default view is "sorted"
2. Sorted cards still use `hover:bg-gray-100` (CategoryCard.tsx line 26)

But this is **fragile by design**:
- If a future developer changes the default to "grouped", the first card would be a grouped card using `hover:brightness-95`, and this test would fail with a confusing error.
- If the card component is refactored to use a single class string (instead of the current `grouped ? ... : ...` ternary), the exact class assertion may break.

**Recommendation**: Either (a) scope the locator to the sorted grid explicitly, or (b) assert the broader behavior (hover changes the class) rather than the exact class string.

### 3.3 🟡 Grouped inner grids still use `grid-cols-4` — strict-mode hazard persists for legacy helpers

**Issue**: `CategoryGrid.tsx` line 24:
```tsx
<div className="grid grid-cols-4 gap-1.5 p-1.5">
```

Each of the 8 group sections has an inner grid with `grid-cols-4`. The `categoryButton` helper (`tests/helpers/categories.ts:4`) locates `.grid.grid-cols-4` globally. In grouped mode, this matches 8 grids → Playwright strict-mode violation.

**Current mitigation**: The new `07-grouped-view.spec.ts` uses `data-testid` scoping, so it's fine. And the existing tests run in sorted mode (default), so they match only 1 grid.

**But**: If any existing test is ever run after switching to grouped mode (e.g., a test that clicks "Grouped" then calls `categoryButton`), it will fail with a strict-mode violation. The helper itself was not updated.

**Recommendation**: Update `tests/helpers/categories.ts` to scope to the sorted grid, e.g.:
```ts
return page.locator('[data-testid="sorted-grid"] .grid.grid-cols-4').getByRole(...)
```
Or add a `data-testid="sorted-grid"` to the sorted grid in `CategoryGrid.tsx`.

---

## 4. Minor Deviations (non-issues)

1. **`ViewMode` type location**: The review (§7.4.7) suggested it belongs in `src/lib/types.ts`. The implementation put it in `groups.ts` — this is fine since it's tightly coupled to the groups feature and `types.ts` only has data-transfer types.

2. **Header padding**: The implementation proactively changed `px-4` to `px-2 sm:px-4` (responsive) — this wasn't in the plan but addresses the review's §7.4.4 mobile crowding concern. Good defensive change.

3. **`03-boundary-negative.spec.ts` tests 05/06**: Still `.skip`ped. The plan didn't ask to un-skip them, and the review correctly noted they provide zero coverage. Leaving them skipped is acceptable — un-skipping would require fixing the React state-closure race condition that caused them to be skipped in the first place.

4. **`toBeGreaterThanOrEqual(60)`**: Still present in skipped test 05 (line 98). Dead code, but harmless since the test is skipped.

---

## 5. Summary Scorecard

| Plan Item | Status | Notes |
|-----------|--------|-------|
| §5.1 constants.ts → 66 | ✅ | All 3 categories added alphabetically |
| §5.2 groups.ts (new) | ✅ | All exports correct, B3/B4/C2/C3 addressed |
| §5.3 ProjectContext viewMode | ✅ | C1 fully hardened |
| §5.4 Header toggle | ✅ | Placement correct, ARIA partial |
| §5.5 CategoryGrid branching | ✅ | data-testid scoping |
| §5.6 CategoryCard bgColor | ✅ | Inline style + hover:brightness-95 |
| §5.7 page.tsx overflow (B2) | ✅ | overflow-y-auto |
| §5.8 Test updates | ✅ | All counts updated, new test file |
| Master-categories.txt | ✅ | Updated to 66 (beyond plan) |
| Review B1 (test counts) | ✅ | All 63→66 updates made |
| Review B2 (overflow) | ✅ | Fixed |
| Review B3 (color override) | ✅ | Documented in groups.ts |
| Review B4 (membership invariant) | ✅ | Module-level assertion + test |
| Review C1 (localStorage) | ✅ | Validated, hardened, documented |
| Review C2 (Tailwind JIT) | ✅ | Inline style + hover:brightness |
| Review C3 (group names) | ✅ | "Group N" only |
| Review C4 (unused exports) | ✅ | Dropped |
| Review C5 (test locators) | ✅ | data-testid in new tests |
| Review §3.1 (accessibility) | 🟡 | aria-pressed added, but role/keyboard incomplete |
| Review §3.3 (legacy helper) | 🟡 | categoryButton helper not updated |

**Overall: 9/10** — A faithful, well-executed implementation that addresses nearly every issue from the plan and review. The 3 residual issues are all 🟡 (minor) — none are implementation-blocking. The code compiles, the tests are comprehensive, and the review's critical gaps (B1–B4) are all resolved.