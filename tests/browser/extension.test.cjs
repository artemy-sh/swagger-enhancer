const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const spec = {
  openapi: '3.0.3', info: { title: 'Extension regression fixture', version: '1.0' },
  paths: Object.fromEntries(['/pets', '/users'].map(url => [url, { get: { tags: ['Example'], summary: 'List ' + url.slice(1), responses: { 200: { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } } } }])),
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas: { Pet: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } } }
};

const largeSpec = {
  ...spec,
  info: { ...spec.info, description: Array(10).fill('API documentation with a long introduction above the operations list.').join('\n\n') },
  paths: Object.fromEntries(Array.from({ length: 400 }, (_, index) => {
    const group = Math.floor(index / 20);
    const route = `/group-${group}/route-${index % 20}`;
    return [route, { get: { ...spec.paths['/pets'].get, tags: [`Group ${group}`], summary: `Operation ${index}`,
      ...(index === 399 ? { operationId: 'farOperation', description: 'Unique distant description needle' } : {}) } }];
  }))
};

async function assertContinuousScrolling(page) {
  const samples = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 100; i++) {
      window.scrollTo(0, i < 50 ? 1000 + i * 170 : 1000 + (99 - i) * 170);
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const list = document.querySelector('.operations-virtual');
      const rows = [...document.querySelectorAll('.operations-virtual__item')];
      samples.push({ y: scrollY, top: rows[0]?.getBoundingClientRect().top, index: rows[0]?.dataset.index,
        origin: list.getBoundingClientRect().top + scrollY, offset: list.offsetTop,
        missing: document.querySelectorAll('.opblock-summary:not(:has(.swagger-fav-star))').length });
    }
    window.scrollTo(0, 0);
    return samples;
  });
  assert.equal(Math.max(...samples.map(sample => sample.missing)), 0, 'Every mounted route has its star during continuous scrolling');
  assert.ok(samples.every(sample => sample.top <= 50), `No blank area below the menu: ${JSON.stringify(samples.find(sample => sample.top > 50))}`);
}

for (const swaggerPackage of ['swagger-ui-dist', 'swagger-ui-legacy']) {
test(`installed MV3 extension with ${swaggerPackage}: popup, settings sync, favorites, search, responses, schemas and reload`, { timeout: 120000 }, async t => {
  const swaggerDir = require(swaggerPackage).getAbsoluteFSPath();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/pets') { res.setHeader('Content-Type', 'application/json'); res.end('[{"id":1,"name":"Milo"}]'); return; }
    if (url.pathname === '/spec') {
      res.setHeader('Content-Type', 'application/json');
      const selectedSpec = url.searchParams.has('large') ? largeSpec : spec;
      const responseSpec = url.searchParams.has('noauth') ? { ...selectedSpec, components: { schemas: spec.components.schemas } } : selectedSpec;
      setTimeout(() => res.end(JSON.stringify(responseSpec)), 100);
      return;
    }
    if (url.pathname === '/init.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(`const ui = SwaggerUIBundle({ url: '/spec' + location.search, dom_id: '#swagger', validatorUrl: null, docExpansion: new URLSearchParams(location.search).has('collapsed') ? 'none' : 'list' });`); return;
    }
    if (['/swagger-ui-bundle.js', '/swagger-ui.css'].includes(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      fs.createReadStream(path.join(swaggerDir, url.pathname.slice(1))).pipe(res); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "script-src 'self'; object-src 'none'");
    res.end(url.pathname === '/plain-docs' ? '<!doctype html><body>Ordinary documentation</body>' : '<!doctype html><html><head><link rel="stylesheet" href="/swagger-ui.css"></head><body><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    ...(process.env.SWAGGER_TEST_CHROMIUM ? { executablePath: process.env.SWAGGER_TEST_CHROMIUM } : {}),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get('swaggerSearchEnabled'))).toEqual({ swaggerSearchEnabled: true });
  const errors = [];
  context.on('page', page => {
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  });
  const page = await context.newPage();
  await page.goto(origin + '/docs');
  await expect(page.locator('.opblock')).toHaveCount(2);
  await expect(page.locator('.swagger-fav-star')).toHaveCount(2);
  await expect(page.locator('#swagger-search-container')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.runTests), 'undefined');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#favoritesToggle')).toBeChecked();
  const toggle = async (id, checked) => {
    if (await popup.locator('#' + id).isChecked() !== checked) await popup.locator(`label:has(#${id})`).click();
    await expect(popup.locator('#' + id)).toBeChecked({ checked });
  };
  await toggle('toggle', true);
  await expect(page.locator('html')).toHaveClass(/swagger-dark-theme/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(page.locator('#swagger-floating-menu')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-dark.png`), fullPage: true, animations: 'disabled' });
  const second = await context.newPage(); await second.goto(origin + '/swagger');
  await expect(second.locator('html')).toHaveClass(/swagger-dark-theme/);
  await toggle('toggle', false);
  await expect(page.locator('html')).not.toHaveClass(/swagger-dark-theme/);
  await expect(second.locator('html')).not.toHaveClass(/swagger-dark-theme/);

  const headerAuth = page.locator('#swagger-header-authorize');
  await expect(popup.locator('#authorizeInHeaderToggle')).not.toBeChecked();
  await expect(headerAuth).toHaveCount(0);
  await toggle('authorizeInHeaderToggle', true);
  await expect(headerAuth).toBeVisible();
  await expect(second.locator('#swagger-header-authorize')).toBeVisible();
  await page.evaluate(() => { document.body.style.minHeight = '2500px'; scrollTo(0, 600); });
  await headerAuth.click();
  const authDialog = page.locator('.dialog-ux');
  await expect(authDialog).toBeVisible();
  // Ignore one pixel of layout rounding while still catching a jump to the source button.
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - 600) <= 1, 'Header opens auth without scrolling to the original button');
  await authDialog.locator('input').fill('local-fixture-token');
  await authDialog.getByRole('button', { name: /^(Authorize|Apply credentials)$/ }).click();
  await expect(headerAuth).toHaveClass(/is-authorized/);
  await authDialog.getByRole('button', { name: /^(Logout|Remove authorization)$/ }).click();
  await expect(headerAuth).not.toHaveClass(/is-authorized/);
  await authDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { document.body.style.minHeight = ''; scrollTo(0, 0); });
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(headerAuth).toBeInViewport();
  const authBox = await headerAuth.boundingBox();
  assert.ok(authBox.x >= 0 && authBox.x + authBox.width <= 375, 'Auth remains inside the narrow header');
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-auth-mobile.png`), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await toggle('toggle', true);
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-auth-dark.png`), animations: 'disabled' });
  await toggle('toggle', false);
  await page.reload(); await expect(headerAuth).toBeVisible();
  await toggle('authorizeInHeaderToggle', false);
  await expect(headerAuth).toHaveCount(0);
  await expect(second.locator('#swagger-header-authorize')).toHaveCount(0);
  await expect(page.locator('.auth-wrapper > button.authorize')).toBeVisible();
  await toggle('authorizeInHeaderToggle', true);
  await second.goto(origin + '/docs?noauth');
  await expect(second.locator('.opblock')).toHaveCount(2);
  await expect(second.locator('#swagger-header-authorize')).toHaveCount(0);

  await page.locator('.swagger-fav-star').first().click();
  await page.locator('#swagger-fav-filter').click();
  await expect(page.locator('.opblock:visible')).toHaveCount(1);
  await toggle('favoritesToggle', false);
  await expect(page.locator('.opblock:visible')).toHaveCount(2);
  await toggle('favoritesToggle', true);
  await expect(page.locator('.opblock:visible')).toHaveCount(1);
  await page.locator('#swagger-fav-filter').click(); // hide favorites
  await expect(page.locator('.opblock:visible')).toHaveCount(1);
  await page.locator('#swagger-fav-filter').click(); // show all
  await expect(page.locator('.opblock:visible')).toHaveCount(2);
  await page.reload(); await expect(page.locator('.swagger-fav-star').first()).toHaveText('★');
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-light.png`), fullPage: true, animations: 'disabled' });

  const input = page.locator('.swagger-search-input');
  await input.fill('pets'); await expect(page.locator('.swagger-search-results')).toContainText('/pets');
  await input.fill(''); await expect(page.locator('.swagger-search-results')).toBeHidden();
  await toggle('searchToggle', false); await expect(input).toHaveCount(0);
  await toggle('searchToggle', true); await expect(input).toBeVisible();

  await toggle('hideSchemasToggle', true);
  await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
  await toggle('hideSchemasToggle', false);
  await expect(page.locator('section.models')).toHaveClass(/is-open/);

  const pets = page.locator('.opblock').filter({ has: page.locator('.opblock-summary-path', { hasText: '/pets' }) });
  await pets.locator('.opblock-summary-control').click();
  await toggle('hideResponsesToggle', true);
  await expect(pets.locator('.responses-wrapper')).toBeHidden();
  await pets.getByRole('button', { name: 'Try it out' }).click();
  await pets.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(pets.locator('.live-responses-table')).toBeVisible();
  await expect(pets.locator('.live-responses-table')).toContainText('Milo');
  await toggle('hideResponsesToggle', false);
  await expect(pets.locator('table.responses-table:not(.live-responses-table)')).toBeVisible();
  await toggle('hideResponsesToggle', true);
  await expect(pets.locator('.live-responses-table')).toBeVisible();

  await page.evaluate(() => { document.body.style.minHeight = '2500px'; window.scrollTo(0, 500); });
  await expect(page.locator('#swagger-scroll-top')).toBeVisible();
  await page.locator('#swagger-scroll-top').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await toggle('scrollTopToggle', false); await expect(page.locator('#swagger-scroll-top')).toHaveCount(0);
  await toggle('scrollTopToggle', true); await expect(page.locator('#swagger-scroll-top')).toHaveCount(1);

  await second.goto(origin + '/openapi?collapsed');
  await expect(second.locator('.opblock-tag')).toBeVisible();
  await expect(second.locator('.opblock')).toHaveCount(0);
  await second.locator('.swagger-search-input').fill('/pets');
  await second.locator('.swagger-search-results .route-path').click();
  await expect(second.locator('.opblock').filter({ hasText: '/pets' })).toHaveClass(/is-open/);
  await expect(second.locator('.swagger-fav-star')).toHaveCount(2);

  // Large specs use a different, virtualized DOM in Swagger UI 5.
  await page.evaluate(() => {
    localStorage.setItem('swaggerFavorites', JSON.stringify({ 'GET /group-0/route-0': true, 'GET /group-19/route-19': true }));
    localStorage.setItem('swaggerFavoritesFilterState', '0');
  });
  await page.goto(origin + '/docs?large');
  if (swaggerPackage === 'swagger-ui-dist') await expect(page.locator('.operations-virtual')).toBeVisible();
  await expect(page.locator('.swagger-fav-label')).toHaveText('Show all');
  if (swaggerPackage === 'swagger-ui-dist') await assertContinuousScrolling(page);
  const searchInput = page.locator('.swagger-search-input');
  const searchResults = page.locator('.swagger-search-results');
  const farRoute = page.locator('.opblock').filter({ has: page.locator('.opblock-summary-path', { hasText: '/group-19/route-19' }) });
  if (swaggerPackage === 'swagger-ui-dist') await expect(farRoute).toHaveCount(0);
  for (const query of ['/group-19/route-19', 'Operation 399', 'distant description needle', 'farOperation']) {
    await searchInput.fill(query);
    await expect(searchResults.locator('.route-path')).toHaveText('/group-19/route-19');
  }
  await searchResults.locator('.route-path').click();
  await expect(farRoute).toHaveClass(/is-open/);
  await expect(farRoute.locator('.opblock-summary')).toBeInViewport();
  await expect.poll(() => farRoute.locator('.opblock-summary').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(55);
  await searchInput.fill('Group 0');
  await searchResults.locator('.route-tag').filter({ hasText: '[Group 0]' }).click();
  await expect(page.locator('h3.opblock-tag[data-tag="Group 0"]')).toBeInViewport();
  await searchInput.fill('/group-19/route-18');
  await expect(searchResults.locator('.route-path')).toHaveText('/group-19/route-18');
  await page.locator('.swagger-fav-label').click();
  await expect(page.locator('.swagger-fav-label')).toHaveText('Show favorites');
  await expect(page.locator('.opblock:visible')).toHaveCount(2);
  await expect(page.locator('.opblock:visible .opblock-summary-path')).toHaveText(['/group-0/route-0', '/group-19/route-19']);
  await expect(page.locator('h3.opblock-tag:visible')).toHaveCount(2);
  await searchInput.focus(); // The same cached query must now respect favorites-only mode.
  await expect(searchResults).toBeHidden();
  await searchInput.fill('/group-19/route-19');
  await expect(searchResults.locator('.route-path')).toHaveText('/group-19/route-19');
  await page.locator('.swagger-fav-label').click(); // Hide favorites excludes the cached far favorite.
  await searchInput.focus();
  await expect(searchResults).toBeHidden();
  await searchInput.fill('/group-19/route-18');
  await expect(searchResults.locator('.route-path')).toHaveText('/group-19/route-18');
  await toggle('favoritesToggle', false); // Disabled filter searches all operations.
  await searchInput.fill('/group-19/route-19');
  await expect(searchResults.locator('.route-path')).toHaveText('/group-19/route-19');
  await toggle('favoritesToggle', true);
  await searchInput.focus();
  await expect(searchResults).toBeHidden();
  await page.locator('.swagger-fav-label').click(); // Show all.
  await page.locator('.swagger-fav-label').click(); // Show favorites again.
  await searchInput.fill('');
  await page.reload();
  await expect(page.locator('.opblock:visible')).toHaveCount(2);
  await expect(page.locator('h3.opblock-tag:visible')).toHaveCount(2);
  await page.locator('.swagger-fav-star').first().click();
  await expect(page.locator('.opblock:visible')).toHaveCount(1);
  await expect(page.locator('.opblock:visible .opblock-summary-path')).toHaveText('/group-19/route-19');
  await searchInput.fill('/group-0/route-0');
  await expect(searchResults).toBeHidden();
  await page.locator('.swagger-fav-star').click();
  await expect(page.locator('.opblock:visible')).toHaveCount(0);
  await expect(page.locator('h3.opblock-tag:visible')).toHaveCount(0);
  await page.locator('.swagger-fav-label').click(); // hide favorites, currently none
  await expect(page.locator('.opblock:visible').first()).toBeVisible();
  if (swaggerPackage === 'swagger-ui-dist') await assertContinuousScrolling(page);
  await page.locator('.swagger-fav-all').click();
  await expect(page.locator('.opblock:visible')).toHaveCount(0);
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('swaggerFavorites'))).length), 400);
  await page.locator('.swagger-fav-label').click(); // show all
  await expect(page.locator('.opblock:visible').first()).toBeVisible();
  await page.locator('.swagger-fav-reset').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('swaggerFavorites')), null);
  await toggle('favoritesToggle', false);
  await expect(page.locator('.swagger-fav-star')).toHaveCount(0);
  await expect(page.locator('.opblock:visible').first()).toBeVisible();
  await toggle('favoritesToggle', true);
  await expect(page.locator('.swagger-fav-star').first()).toBeVisible();
  await second.goto(origin + '/plain-docs');
  await expect(second.locator('#swagger-floating-menu')).toHaveCount(0);
  await expect(second.locator('body')).toHaveCSS('padding-top', '0px');
  await second.setViewportSize({ width: 375, height: 667 });
  await expect(second.locator('body')).toHaveCSS('padding-top', '0px');
  assert.deepEqual(errors, []);
  console.log(`Verified Chromium ${context.browser().version()}, Swagger UI ${require(swaggerPackage + '/package.json').version}`);
});
}
