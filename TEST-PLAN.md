# E2E Test Plan — CatMapper

## Overview
Playwright + TypeScript test suite for **CatMapper** (`https://cat-mapper.vercel.app/`), an architecture brochure page scanner that allows users to map categories to architecture projects.

## Test Structure

```
tests/
├── global-setup.ts                     # Reset all data before suite
├── helpers/
│   ├── api.ts                          # Data reset, export, fetch/save categories
│   └── page-constants.ts              # Static data: pages, projects, categories
├── specs/
│   ├── 01-ui-visibility.spec.ts       # 13 tests — UI element presence & styling
│   ├── 02-happy-path.spec.ts          # 9 tests — complete user workflows
│   ├── 03-boundary-negative.spec.ts   # 16 tests — edge cases & negative scenarios
│   ├── 04-destructive.spec.ts         # 7 tests — destructive operations
│   └── 05-visual-regression.spec.ts   # 11 tests — screenshot comparisons
└── visual-snapshots/                   # Baseline images (auto-generated)
```

## Configuration
- **Target**: `https://cat-mapper.vercel.app/`
- **Browser**: Chromium (Desktop Chrome)
- **Viewport**: 1280×800 (default), 1024×768, 375×812
- **Retries**: 0 (local), 1 (CI)
- **Workers**: 1 (sequential for data integrity)
- **Global Setup**: Calls `DELETE /api/project-categories` before all tests
- **Artifacts**: Traces, screenshots, and videos retained on failure

## Test Suites

### Suite 01 — UI Visibility (13 tests)
| # | Test | Validation |
|---|------|------------|
| 1 | Page loads with correct title | `<title>` = "CatMapper" |
| 2 | Sidebar present with correct layout | Sidebar visible; Export/Delete buttons present |
| 3 | All 63 category buttons in 4-column grid | Count=63; grid layout |
| 4 | Header contains all expected elements | Prev/Next, page counter, project name, edit icon, Show Page |
| 5 | Default page is 23 with first project selected | Page 23 with "The Promenade by the River" selected (blue bg) |
| 6 | Uncategorized asterisk visible | `*` in header and sidebar |
| 7 | Export button green styling | `bg-green-600` class |
| 8 | Delete button red styling | `bg-red-600` class |
| 9 | All categories start unchecked | Empty checkbox state |
| 10 | Prev does not go below page 23 | Stay at 23 after repeated clicks |
| 11 | Next on last page stays at 289 | Stay at 289 after repeated clicks |
| 12 | Category buttons have hover effect | `hover:bg-gray-100` class |
| 13 | All 63 category labels present | Each category name visible in grid |

### Suite 02 — Happy Path (9 tests)
| # | Test | Steps |
|---|------|-------|
| 1 | Select categories, verify persistence | Toggle 3 → reload → verify via API export |
| 2 | Multi-project isolation | Page 61 → toggle on project A → switch to B (empty) → switch back (preserved) |
| 3 | Pagination forward and backward | Page 23 → Next→24 → Next→29 → Prev→24 → Prev→23 |
| 4 | Navigation preserves category state | Toggle → navigate away → return → state intact |
| 5 | Rename project | Edit → type → Enter → header+sidebar update → reload persists |
| 6 | Show Page overlay | Open overlay → image visible → close → overlay gone |
| 7 | Export JSON download | Toggle → Export → verify `.json` download with data |
| 8 | Delete All → clean state | Toggle → Delete → all unchecked → `*` returns → reload empty |
| 9 | Full e2e workflow | Rename → categorize → export → delete → verify empty |

### Suite 03 — Boundary & Negative (16 tests)
| # | Test | Validation |
|---|------|------------|
| 1 | Prev on first page (×3) | Stays at 23 |
| 2 | Next on last page (×3) | Stays at 289 |
| 3 | Rapid Next 10 clicks | Stable; correct final page |
| 4 | Toggle on → off | Final unchecked |
| 5 | Toggle all 63 on | All checked in export |
| 6 | Toggle all 63 on → all off | Empty export |
| 7 | Rename to empty string | Original name preserved |
| 8 | Rename to 500-char string | Gracefully handled |
| 9 | Rename with special chars | Saves correctly |
| 10 | Delete with no data | No error; empty export |
| 11 | Export with no data | Empty `{}` JSON |
| 12 | Page 235 (6 projects) switch all | Each project selectable |
| 13 | Page counter accuracy | Verify 5 sequential navigations |
| 14 | Rename → navigate away → back | Name persists |
| 15 | Click category while overlay open | No toggle occurs |
| 16 | Last page Show Page | Overlay opens with image |

### Suite 04 — Destructive (7 tests)
| # | Test | Validation |
|---|------|------------|
| 1 | Delete after toggling categories on 3 pages | All pages reset |
| 2 | Delete after renaming 2 projects | Renames cleared; originals restored |
| 3 | Rapid double-click Delete | No error |
| 4 | Delete then Export | Empty JSON |
| 5 | Refresh after toggle | Auto-save persists |
| 6 | Delete on multi-project mixed state | Both projects reset |
| 7 | Delete while overlay open | No interference |

### Suite 05 — Visual Regression (11 tests)
| # | Test | Viewport |
|---|------|----------|
| 1 | Initial page load | 1280×800 |
| 2 | Categories selected | 1280×800 |
| 3 | Multi-project page (61) | 1280×800 |
| 4 | Show Page overlay | 1280×800 |
| 5 | Rename inline editing | 1280×800 |
| 6 | After Delete All | 1280×800 |
| 7 | All 63 categories toggled | 1280×800 |
| 8 | Mobile viewport | 375×812 |
| 9 | Tablet viewport | 1024×768 |
| 10 | Sidebar 6 projects (page 235) | 1280×800 |
| 11 | Renamed with special chars | 1280×800 |

## Running Tests

```bash
npm test                          # Run all tests
npm run test:ui                   # Playwright UI mode
npm run test:debug                # Debug mode (Paused)
npm run test:visual               # Visual regression only
npm run test:smoke                # Smoke tests only
npm run test:update-snapshots     # Update visual baselines
npm run test:report               # Open HTML report
```

## CI Integration
- **Pre-requisite**: `npm install && npx playwright install chromium`
- **Command**: `npm test`
- **Artifacts**: `playwright-report/`, `test-results/`
