# Playwright E2E Testing Guide — CatMapper App

## 1. How to Setup Playwright

### Prerequisites
- Node.js 18+
- npm

### Installation
```bash
npm init -y
npm install @playwright/test
npx playwright install chromium
```

### Playwright Config (`playwright.config.ts`)
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: false,       // keep 1 worker for stateful tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/test-results.json' }],
  ],
  globalSetup: require.resolve('./tests/global-setup'),
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,            // false for headed debugging
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

### Configuring Timeouts
Different operations need different timeouts:

```typescript
// Per-test timeout in the config (global default: 30s)
// use: { timeout: 60000 }

// Per-test override in the test itself
test('slow test', async ({ page }) => {
  test.setTimeout(120000);
});

// Action timeout (per locator action)
// use: { actionTimeout: 10000 }

// waitForEvent timeout
await page.waitForEvent('download', { timeout: 15000 });
```

### Chrome / Headed vs Headless

| Mode | Pros | Cons |
|------|------|------|
| Headless | Faster, CI-friendly | Harder to debug; `networkidle` may never resolve with HMR |
| Headed (`--headed`) | See what browser is doing; easier debugging | Slower; requires display |

For Next.js apps with HMR (Hot Module Replacement), the WebSocket connection keeps the page in a perpetual loading state. **Use `load` state instead of `networkidle`:**
```typescript
await page.waitForLoadState('load');  // works with HMR
// NOT: await page.waitForLoadState('networkidle');  // hangs forever
```

### Directory Structure
```
tests/
  specs/             — test files (*.spec.ts)
  helpers/           — reusable test utilities
    api.ts           — server API calls (resetAllData, exportData, fetchCategories)
    categories.ts    — category locator and toggle helpers
    page-constants.ts — page numbers, project names, categories list
  visual-snapshots/  — baseline images for visual regression
global-setup.ts     — runs once before all test files
playwright.config.ts — test configuration
```

### Global Setup Pattern
```typescript
// global-setup.ts
import { resetAllData } from './tests/helpers/api';

export default async function () {
  console.log('[Global Setup] Resetting all data...');
  await resetAllData();
  console.log('[Global Setup] Data reset complete.');
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:update": "playwright test --update-snapshots",
    "test:report": "playwright show-report playwright-report"
  }
}
```

---

## 2. Dos and Don'ts

### DO
- **Use `test.beforeEach` to reset server state** — prevents `memoryStore` leakage between tests
- **Use `test.slow()` on tests with many interactions** (navigating 80+ pages, toggling 63 categories twice)
- **Use regex locators for buttons with dynamic accessible names** — e.g., `name: /^[✓ ]*CategoryName$/`
- **Use `page.waitForEvent('framenavigated')` to detect page reloads** — started BEFORE the action, awaited after
- **Use `{ force: true }` on clicks through overlays** when testing behind modal/overlay elements
- **Validate exact JSON content in download tests** — check keys, project names, and category arrays match precisely
- **Use `page.on('dialog', (d) => d.accept())` set up BEFORE the triggering click** — modal dialogs block the event loop
- **Use `hover() + mouse.down() / mouse.up()` for React pointer events** — React ignores Playwright's `dispatchEvent`
- **Read error-context.md page snapshots to debug failures** — button `[active]` state, dialog visibility, etc.
- **Kill stale dev server processes before starting fresh** — port 3000 may be occupied by a zombie process
- **Use `cmd /c` wrapper for complex shell commands** — PowerShell has different syntax for `&&`, `>`, `|`
- **Configure git proxy for corporate networks** — `git config http.proxy http://proxy:port`

### DON'T
- **Don't override `window.location.reload`** — it's a non-configurable property; assignment silently fails
- **Don't rely on `waitForTimeout` for cross-test state synchronization** — use navigation events instead
- **Don't use `waitForLoadState('load')` before a navigation starts** — if called before the async fetch completes, it resolves immediately on the current page
- **Don't use `Promise.all` with `waitForLoadState` + click if the navigation is async** — the click resolves before the navigation begins
- **Don't catch download events after a pending page reload** — the reload destroys the page and cancels the download
- **Don't use `dispatchEvent` for React synthetic events** — React's synthetic event system ignores Playwright-dispatched events
- **Don't assume data persists between tests** — always reset in `beforeEach` per test, not just per file
- **Don't edit source files mid-test-run** — Next.js HMR re-initializes server modules and resets `memoryStore`
- **Don't assume CSS class names are stable** — `.fixed.inset-0` became `.absolute.inset-0` after DOM restructuring
- **Don't fix app code just to make a test pass** — a test exposing a real bug is valuable documentation
- **Don't assume page numbers are sequential** — CatMapper pages are non-consecutive (23, 24, 29, 34...); navigate by index
- **Don't rely on `exportData()` API helper for E2E validation** — it bypasses the UI; use the UI download button instead

---

## 3. Best Practices for Creating Test Cases

### Structure by Category
Group tests in `test.describe` blocks by test type:
- **UI Visibility** — element presence, styling, layout (test 01-13)
- **Happy Path** — complete user workflows (test 01-10)
- **Boundary / Negative** — edge cases, empty states, rapid clicks (test 01-16)
- **Destructive** — delete operations, reset flows (test 01-07)
- **Visual Regression** — screenshots with `expect(page).toHaveScreenshot()`

### Locator Strategy (in order of preference)
1. `getByRole('button', { name: /pattern/ })` — accessible name matching (handles ✓ prefix)
2. `locator('text=visible text')` — visible text content
3. `locator('button:has-text("label")')` — containing text
4. CSS selectors only as fallback

### Helper Function Pattern
Extract reusable locators into helpers:
```typescript
// tests/helpers/categories.ts
export function categoryButton(page: Page, name: string) {
  return page.locator('.grid.grid-cols-4').getByRole('button', {
    name: new RegExp(`^[✓ ]*${escapeRegex(name)}$`)
  });
}

export async function toggleCategory(page: Page, name: string) {
  await categoryButton(page, name).click();
}
```

### Async State Handling
- **Start navigation listeners BEFORE the action** that triggers them
- **Don't use `Promise.all` for async navigations** — the action resolves before the navigation starts

```typescript
// Correct pattern for async navigation:
page.on('dialog', (dialog) => dialog.accept());
const nav = page.waitForEvent('framenavigated');
await page.locator('button:has-text("Delete All Data")').click();
await nav;                          // waits for reload to START
await page.waitForLoadState('load'); // waits for reload to FINISH
```

- **Wait for UI feedback, not arbitrary timeouts:**
```typescript
await expect(categoryButton(page, 'Sustainable'))
  .toHaveAccessibleName('Sustainable', { timeout: 5000 });
```

### Exact Content Validation
For download/export tests, validate the complete JSON tree:

```typescript
const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await page.locator('button:has-text("Export Data")').click();
const download = await downloadPromise;

const stream = await download.createReadStream();
const chunks: Buffer[] = [];
for await (const chunk of stream) chunks.push(Buffer.from(chunk));
const content = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

// Validate every level
expect(Object.keys(content).sort()).toEqual([pageKey1, pageKey2].sort());
expect(Object.keys(content[pageKey1])).toEqual([project1]);
expect(content[pageKey1][project1]).toEqual(['Residential', 'Waterfront']);
expect(content[pageKey2][project2a]).toEqual(['Sustainable']);
expect(content[pageKey2][project2b]).toEqual(['Hotel & Hospitality', 'Mixed-Use']);
```

### Dialog Handling
```typescript
// WRONG — click hangs because modal dialog blocks the event loop:
const dialog = page.waitForEvent('dialog');
await page.locator('button').click();
await dialog;          // click never completes!
await dialog.accept();

// CORRECT — set up auto-accept BEFORE the click:
page.on('dialog', (dialog) => dialog.accept());
await page.locator('button').click();
```

### Multi-Page Navigation with Non-Sequential Pages
Pages are not consecutive (23, 24, 29, 34...). Use index-based navigation:

```typescript
const targetPage = 102;
const nextBtn = page.locator('text=Next Page >');
const startIdx = PAGE_NUMBERS.indexOf(FIRST_PAGE);   // 0
const targetIdx = PAGE_NUMBERS.indexOf(targetPage);   // e.g. 48
for (let i = startIdx; i < targetIdx; i++) {
  await nextBtn.click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1000); // let page data fully load
```

### Slow Test Marking
```typescript
test('Toggle all 63 categories on then off', async ({ page }) => {
  test.slow();   // triples default timeout
});
```

### Visual Snapshot Tests
- Generate baselines first: `npx playwright test --update-snapshots`
- Use consistent viewport sizes across environments
- Snapshots are OS-dependent (font rendering, anti-aliasing differ)

```typescript
test('Initial page load', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500); // let fonts/render settle
  await expect(page).toHaveScreenshot('initial-page-load.png');
});
```

### Debugging with Error Context
When a test fails, Playwright generates `error-context.md` with a YAML page snapshot:
```
- generic [ref=e1]:
  - button "Export Categories" [active] [ref=e10] [cursor=pointer]
```

The `[active]` state means the button's `:active` CSS pseudo-class was applied — confirms the click fired but the handler may not have completed. Use this to diagnose whether:
- The button was actually clicked
- A dialog is blocking execution
- The page was in the expected state

---

## 4. Lessons Learned

### What Worked

| Approach | Why it worked |
|----------|--------------|
| `framenavigated` event for auto-reload detection | Reliably catches page reloads without timing races because it detects navigation events, not state transitions |
| Regex locators with `^[✓ ]*name$` | Toggling changes the accessible name from "Category" to "✓ Category"; regex matches both |
| `hover() + mouse.down()/up()` for React pointer events | React's synthetic event system only responds to browser-native events, not Playwright's `dispatchEvent` |
| `deleteAllAndWait()` helper encapsulating full delete flow | Prevents cross-test `ERR_ABORTED` by properly awaiting the async navigation |
| `test.beforeEach` with API reset call | Eliminates `memoryStore` data leakage between tests |
| Exact JSON content validation in export tests | Caught the stale `selectedCategories` project-switch bug |
| `page.waitForTimeout(2000)` after async toggles before export | PUT requests are async; export must wait for server-side persistence |
| `page.on('dialog', ...)` set up before click | Modal dialogs block the browser's event loop; the handler must be registered before the action |
| Running individual failing tests with `-g` pattern | Faster debugging than re-running the full suite |
| Error context page snapshots (`error-context.md`) | YAML snapshot shows button `[active]` states, dialog presence, and current selection |
| `globalThis` + `Symbol.for()` for in-memory state across API routes | Next.js dev mode bundles each API route separately; module-level `let memoryStore = {}` gets different instances per route. Using `(globalThis as any)[Symbol.for("key")]` ensures ALL route handlers share the same store regardless of Webpack chunk boundaries. |
| System Chrome via `channel: 'chrome'` | Playwright's bundled Chromium failed to launch on this Windows environment (timeout while setting up "page"). Adding `channel: 'chrome'` to the chromium project config uses the host's installed Chrome instead — launches reliably headless. |
| Response-waiting between sequential category toggles | Rapid sequential `toggleCategory` calls all capture the same `selectedCategories` from the React closure. Without awaiting each PUT response + a 50ms React re‑render window, later toggles overwrite earlier ones (last-write-wins). Pattern: `const r = page.waitForResponse(...); await click; await r; await page.waitForTimeout(50);` |
| `cmd /c` wrapper for real‑time PowerShell output | `npx playwright test` output is heavily buffered by PowerShell. Running via `cmd /c "npx playwright test ... 2>&1"` gives line‑by‑line ✓/✘ progress as each test completes. |
| `aria-pressed` on project sidebar buttons | Setting `aria-pressed={isActive}` makes the selected project discoverable by `getByRole('button', { name, pressed: true })` — no more ambiguous CSS class matching. |
| Monitored test runner with hang detection | `tests/run-monitored.mjs` spawns Playwright, streams output, and force‑kills the process tree if no output appears for 120s. Guarantees tests never hang silently. |

### What Didn't Work

| Approach | Why it failed |
|----------|--------------|
| `window.location.reload = () => {}` to prevent auto-reload | Property is non-configurable; assignment silently fails |
| `dispatchEvent('pointerdown')` for React overlays | React synthetic event system ignores Playwright-dispatched events |
| `page.waitForLoadState('load')` after async click | Navigation starts asynchronously (after the fetch resolves), so `waitForLoadState` resolves before the reload begins |
| `Promise.all([waitForLoadState, click])` | Click resolves before the fetch completes, so the navigation hasn't started yet; `waitForLoadState` never catches it |
| `page.waitForEvent('dialog')` + manual accept | Playwright's click action is blocked by the modal dialog; the accept must be pre-registered |
| `waitForTimeout` for cross-test page state | Auto-reload from the previous test may still be in progress; timeout ending doesn't mean the page is stable |
| Headless mode with `networkidle` | Next.js HMR WebSocket keeps the page loading indefinitely; `networkidle` never resolves |
| Vercel deployment URL | Corporate SSO/firewall blocks outbound HTTPS to Vercel |
| Overriding `window.location.reload` via `Object.defineProperty` | The browser enforces that `location` properties are non-configurable |
| `hasText` locator for sidebar buttons with partial name matches | `hasText: 'The'` would match both "The Orchard" and "The Vibrant Podium"; must use full unique substring |
| `page.goto` after a test that triggered auto-reload | The in-progress navigation aborts the new `goto` with `net::ERR_ABORTED` |
| Module-level `let` variables in Next.js dev mode API routes | Next.js dev server compiles each API route as a separate Webpack entry point. A `let memoryStore = {}` in a shared `lib/kv.ts` module gets a **different instance per route file** — data written by `add-project/route.ts` is invisible to `export/route.ts`. Fix: move to `globalThis` with `Symbol.for()`. |
| `page.waitForEvent('filechooser')` with system Chrome headless | Clicking a hidden `<input type="file">` via `ref.current?.click()` does not reliably open the OS file‑picker dialog with system Chrome in headless mode. Use `page.locator('input[type="file"]').setInputFiles(...)` directly on the hidden input instead. |
| Rapid sequential toggle tests without response‑waiting | Toggling 63 categories in a tight loop sends 63 PUTs that all read the same stale `selectedCategories` closure value `[]`. Each PUT writes exactly 1 category, and the last one wins. Only 1–4 categories survive. Must await each response and let React re‑render between toggles. |
| PowerShell piping of `npx` output | PowerShell buffers child‑process stdout for tens of seconds. `npx playwright test | Select-String ...` appears frozen. Always use `cmd /c "npx playwright test ..."` wrapper or the monitored runner script. |

### Key Bug Discovered — Stale `selectedCategories` on Project Switch

**Location**: `src/context/ProjectContext.tsx:101-106`

**Root cause**: `setCurrentProject` used `pageProjects[page]?.[project]` from the closure. When switching to a project with no stored data, `pageProjects[page]?.[project]` returned `undefined`, and the old code only updated `selectedCategories` when `cats !== undefined`:

```typescript
// OLD (buggy)
const cats = pageProjects[String(currentPage)]?.[project];
if (cats !== undefined) {
  setSelectedCategories(cats);
}
// When cats === undefined, selectedCategories keeps the previous project's data
```

**Consequence**: Toggling a category on the new project would include ALL categories from the previous project, because `selectedCategories` still held the old project's data. The PUT request sent the wrong data to the server.

**Fix**: Always reset `selectedCategories`, defaulting to empty array:
```typescript
// NEW (fixed)
const cats = pageProjects[String(currentPage)]?.[project];
setSelectedCategories(cats ?? []);
```

### Other Real-Time Findings

- **Download events after page reload** — Initially suspected `URL.revokeObjectURL()` was called too early, preventing the download. Proved wrong: Chromium resolves small blob URLs synchronously within the same microtask, so the download fires before the revocation takes effect. The actual issue was the auto-reload from Delete All racing with the export click.
- **`URL.revokeObjectURL` is NOT a real bug** — The download event fires correctly even with immediate revocation, for both empty and non-empty blobs.
- **Export returning stale/empty data** — Two causes: (1) PUT from `toggleCategory` hadn't completed (timing), and (2) HMR reset `memoryStore` when editing source files mid-session.
- **Playwright timeouts are misleading** — A `page.waitForEvent('download')` timeout doesn't mean the download API is broken; examine the page snapshot to see if a dialog or navigation is blocking it.
- **Button `[active]` state in page snapshots** — When a button appears with `[active]`, it means the `:active` CSS pseudo-class was applied, which happens during a `mousedown` that hasn't been followed by a `mouseup`. This indicates the click handler may be stuck (e.g., on a modal dialog).
- **HMR resets `memoryStore`** — Next.js dev server HMR (Hot Module Replacement) re-initializes server-side modules when source files change. If you edit `src/lib/kv.ts` or any file that imports it, `memoryStore = null` and all saved test data is lost. Always restart the dev server after editing source files.
- **Port conflicts** — A zombie `node.exe` process may hold port 3000. Check with `netstat -ano | findstr ":3000"` and kill the PID with `Stop-Process -Id <PID> -Force`.
- **Shell differences (PowerShell vs cmd)** — PowerShell interprets `&&`, `>`, `|` differently than cmd. Use `cmd /c "command"` wrapper for complex git/CLI commands. Environment variables use `$env:VAR` in PowerShell, not `$VAR`.
- **Corporate proxy** — Both `HTTP_PROXY` and `HTTPS_PROXY` env vars are set. Git needs explicit proxy config: `git config http.proxy http://proxy:port`. Without this, `git fetch` hangs indefinitely.
- **Port cleanup between test runs** — After a test run, the dev server may still hold port 3000. Run `taskkill //F //IM node.exe` before starting a new run. The monitored runner (`tests/run-monitored.mjs`) does this automatically on hang detection.
- **Visual regression baselines are OS/Chrome‑version dependent** — Screenshot tests (`05-visual-regression.spec.ts`) compare against platform‑specific baselines. System Chrome produces different anti‑aliasing and font metrics than Playwright‑bundled Chromium. Run `--update-snapshots` once per environment, or skip visual tests on environments without matching baselines.
- **Monitored runner guarantees pass/fail in finite time** — Ordinary `npx playwright test` can hang silently if the browser crashes, the server wedges, or a dialog blocks the event loop. `tests/run-monitored.mjs` wraps Playwright with a 120s idle timeout: if no test completes within that window, it kills the whole process tree and reports the hang. Use it as the default test command: `node tests/run-monitored.mjs`.
- **`^M` (CRLF) warnings in `git diff --check` are harmless** — On Windows, git warns about LF→CRLF conversion for every checked‑out file. These are not errors and do not indicate code issues. Only trailing‑whitespace lines need fixing.

### Command Reference
```bash
# Run all tests (recommended — monitored, guaranteed pass/fail)
node tests/run-monitored.mjs

# Run all tests (vanilla — may hang on browser crash)
npx playwright test

# Run with timeout override
npx playwright test --timeout=60000

# Run a specific test file
npx playwright test tests/specs/02-happy-path.spec.ts

# Run tests matching a name pattern
npx playwright test -g "Export"

# Run headed (visible browser)
npx playwright test --headed

# Update visual snapshots
npx playwright test --update-snapshots

# Show HTML report
npx playwright show-report playwright-report

# Show trace viewer
npx playwright show-trace path/to/trace.zip
```
