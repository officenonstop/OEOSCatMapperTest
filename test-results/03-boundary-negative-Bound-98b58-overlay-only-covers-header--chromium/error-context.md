# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-boundary-negative.spec.ts >> Boundary and Negative Testing >> 15 - Show Page overlay should cover the category grid [BUG: overlay only covers header]
- Location: tests\specs\03-boundary-negative.spec.ts:269:7

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  locator('.grid.grid-cols-4').getByRole('button', { name: /^[✓ ]*Residential$/ })
Expected: not visible
Received: visible
Timeout:  5000ms

Call log:
  - Expect "not toBeVisible" with timeout 5000ms
  - waiting for locator('.grid.grid-cols-4').getByRole('button', { name: /^[✓ ]*Residential$/ })
    13 × locator resolved to <button class="flex items-center gap-2 px-2 py-1 rounded text-xs border transition-colors bg-white border-gray-300 text-gray-700 hover:bg-gray-100">…</button>
       - unexpected value "visible"

```

```yaml
- button "Residential"
```

# Test source

```ts
  178 |     await page.goto(BASE_URL);
  179 | 
  180 |     page.on('dialog', (dialog) => dialog.accept());
  181 |     await page.locator('button:has-text("Delete All Data")').click();
  182 |     await page.waitForTimeout(500);
  183 | 
  184 |     const data = await exportDataCompact();
  185 |     expect(Object.keys(data as object).length).toBe(0);
  186 |   });
  187 | 
  188 |   test('11 - Export when no data exists — all pages present with empty categories', async ({ page }) => {
  189 |     await page.goto(BASE_URL);
  190 | 
  191 |     const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  192 |     await page.locator('button:has-text("Export Categories")').click();
  193 |     const download = await downloadPromise;
  194 | 
  195 |     const stream = await download.createReadStream();
  196 |     const chunks: Buffer[] = [];
  197 |     for await (const chunk of stream) {
  198 |       chunks.push(Buffer.from(chunk));
  199 |     }
  200 |     const bundle = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  201 |     const content = bundle.categories;
  202 | 
  203 |     // New export includes all pages with empty categories
  204 |     expect(Object.keys(content).length).toBe(PAGE_NUMBERS.length);
  205 |     for (const pageNum of PAGE_NUMBERS) {
  206 |       const pageStr = String(pageNum);
  207 |       expect(content[pageStr]).toBeDefined();
  208 |       for (const project of PAGE_PROJECTS[pageNum]) {
  209 |         expect(content[pageStr][project]).toEqual([]);
  210 |       }
  211 |     }
  212 |   });
  213 | 
  214 |   test('12 - Multi-project page with 6 projects — switch between all', async ({ page }) => {
  215 |     test.slow();
  216 |     await page.goto(BASE_URL);
  217 |     const targetPage = 235;
  218 |     const nextBtn = page.locator('text=Next Page >');
  219 |     for (let i = 0; i < PAGE_NUMBERS.indexOf(targetPage); i++) {
  220 |       await nextBtn.click();
  221 |       await page.waitForTimeout(100);
  222 |     }
  223 | 
  224 |     const projects = PAGE_PROJECTS[targetPage];
  225 |     expect(projects.length).toBe(6);
  226 | 
  227 |     const sidebar = page.locator('aside');
  228 |     for (const project of projects) {
  229 |       await sidebar.locator('button', { hasText: project }).click();
  230 |       await page.waitForTimeout(200);
  231 |       const header = page.locator('header');
  232 |       await expect(header.locator(`text=${project}`)).toBeVisible();
  233 |     }
  234 |   });
  235 | 
  236 |   test('13 - Verify page counter accuracy across multiple navigations', async ({ page }) => {
  237 |     await page.goto(BASE_URL);
  238 |     const nextBtn = page.locator('text=Next Page >');
  239 |     const header = page.locator('header');
  240 | 
  241 |     for (let i = 0; i < 5; i++) {
  242 |       await expect(header.locator(`text=Page ${PAGE_NUMBERS[i]}`)).toBeVisible();
  243 |       await nextBtn.click();
  244 |       await page.waitForTimeout(200);
  245 |     }
  246 |   });
  247 | 
  248 |   test('14 - Rename project then navigate away and back — name persists', async ({ page }) => {
  249 |     await page.goto(BASE_URL);
  250 |     const newName = 'Persist Test Name';
  251 | 
  252 |     await page.locator('button[title="Edit project name"]').click();
  253 |     const input = page.locator('header input[aria-label="Project name"]');
  254 |     await input.fill(newName);
  255 |     await input.press('Enter');
  256 |     await page.waitForTimeout(300);
  257 | 
  258 |     const nextBtn = page.locator('text=Next Page >');
  259 |     await nextBtn.click();
  260 |     await page.waitForTimeout(300);
  261 |     const prevBtn = page.locator('text=< Prev Page');
  262 |     await prevBtn.click();
  263 |     await page.waitForTimeout(300);
  264 | 
  265 |     const header = page.locator('header');
  266 |     await expect(header.locator(`text=${newName}`)).toBeVisible();
  267 |   });
  268 | 
  269 |   test('15 - Show Page overlay should cover the category grid [BUG: overlay only covers header]', async ({ page }) => {
  270 |     await page.goto(BASE_URL);
  271 | 
  272 |     const showPageBtn = page.locator('button:has-text("Show Page")');
  273 |     await showPageBtn.hover();
  274 |     await page.mouse.down();
  275 |     await page.waitForTimeout(500);
  276 | 
  277 |     const catBtn = categoryButton(page, 'Residential');
> 278 |     await expect(catBtn).not.toBeVisible();
      |                              ^ Error: expect(locator).not.toBeVisible() failed
  279 |   });
  280 | 
  281 |   test('16 - Navigate to page with no image — Show Page handles gracefully', async ({ page }) => {
  282 |     test.slow();
  283 |     await page.goto(BASE_URL);
  284 |     const nextBtn = page.locator('text=Next Page >');
  285 |     for (let i = 0; i < PAGE_NUMBERS.length - 1; i++) {
  286 |       await nextBtn.click();
  287 |       await page.waitForTimeout(50);
  288 |     }
  289 |     await page.waitForTimeout(500);
  290 | 
  291 |     const showPageBtn = page.locator('button:has-text("Show Page")');
  292 |     await showPageBtn.hover();
  293 |     await page.mouse.down();
  294 |     await page.waitForTimeout(500);
  295 | 
  296 |     const overlay = page.locator('.absolute.inset-0');
  297 |     await expect(overlay).toBeVisible();
  298 | 
  299 |     await page.mouse.up();
  300 |     await page.waitForTimeout(500);
  301 |     await expect(overlay).not.toBeVisible();
  302 |   });
  303 | });
  304 | 
  305 | 
  306 | 
  307 | 
  308 | 
  309 | 
  310 | 
  311 | 
  312 | 
```