const { test } = require('node:test');
const { chromium, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

for (const swaggerPackage of ['swagger-ui-dist', 'swagger-ui-legacy']) {
test(`${swaggerPackage}: schema links reach offscreen models in new and existing tabs with automatic collapse enabled`, { timeout: 90000 }, async t => {
  const modern = swaggerPackage === 'swagger-ui-dist';
  const swaggerDir = (modern && process.env.SWAGGER_TEST_SCHEMA_DIR) || require(swaggerPackage).getAbsoluteFSPath();
  const spec = {
    openapi: modern ? '3.1.0' : '3.0.3', info: { title: 'Schema navigation fixture', version: '1' },
    paths: {},
    components: { schemas: { InitDataGetResponse: { type: 'object', properties: { id: { type: 'integer' } } } } }
  };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (['/swagger-ui-bundle.js', '/swagger-ui.css'].includes(pathname)) {
      res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      fs.createReadStream(path.join(swaggerDir, pathname.slice(1))).pipe(res); return;
    }
    if (pathname === '/spec') {
      res.setHeader('Content-Type', 'application/json');
      const url = new URL(req.url, 'http://localhost');
      const filler = index => [index < 200 ? `Admin${index}` : `Zed${index}`, {
        type: 'object', properties: index === 0
          ? Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`field${i}`, { type: 'string' }]))
          : { id: { type: 'integer' } }
      }];
      const schemas = url.searchParams.has('large')
        ? Object.fromEntries([...Array.from({ length: 200 }, (_, i) => filler(i)), ...Object.entries(spec.components.schemas), ...Array.from({ length: 199 }, (_, i) => filler(i + 200))])
        : spec.components.schemas;
      setTimeout(() => res.end(JSON.stringify({ ...spec, openapi: url.searchParams.has('oas30') ? '3.0.3' : spec.openapi, components: { schemas } })), 100); return;
    }
    if (pathname === '/init.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end('SwaggerUIBundle({url:"/spec"+location.search,dom_id:"#swagger",validatorUrl:null,deepLinking:true});'); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const search = new URL(req.url, 'http://localhost').search;
    res.end(pathname === '/start'
      ? `<!doctype html><a href="/docs${search}#:~:text=InitDataGetResponse,-Expand%20all" target="_blank">InitDataGetResponse</a>`
      : '<!doctype html><link rel="stylesheet" href="/swagger-ui.css"><style>section.models{margin-top:1600px!important}</style><div id="swagger"></div><script src="/swagger-ui-bundle.js"></script><script src="/init.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const enhanced of modern ? [false, true] : [true]) {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true,
      ...(process.env.SWAGGER_TEST_CHROMIUM ? { executablePath: process.env.SWAGGER_TEST_CHROMIUM } : {}),
      args: enhanced ? [`--disable-extensions-except=${root}`, `--load-extension=${root}`] : []
    });
    try {
      if (enhanced) {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get('hideSchemasEnabled'))).toEqual({ hideSchemasEnabled: false });
        await worker.evaluate(() => chrome.storage.sync.set({ hideSchemasEnabled: true }));
      }
      for (const search of enhanced ? (modern ? ['', '?large', '?large&oas30'] : ['', '?large']) : ['']) {
        const page = await context.newPage();
        await page.goto(origin + '/start' + search);
        const destinationPromise = context.waitForEvent('page');
        await page.getByRole('link', { name: 'InitDataGetResponse', exact: true }).click();
        const destination = await destinationPromise;
        await destination.waitForLoadState('networkidle');
        await expect(destination.locator('section.models')).toHaveClass(/is-open/);
        await expect.poll(() => destination.evaluate(() => scrollY)).toBeGreaterThan(500);
        await expect(destination.getByRole('button', { name: 'InitDataGetResponse', exact: true })).toBeInViewport();
        if (enhanced) {
          const model = destination.locator('article[data-json-schema-level="0"], .model-container[data-name]').filter({ has: destination.getByRole('button', { name: 'InitDataGetResponse', exact: true }) });
          await expect(model.getByText('id', {exact:true})).toBeVisible();
        }
        if (search) {
          if (modern) await expect(destination.locator('section.models')).toHaveClass(/models--virtualized/);
          await expect(destination.locator('.models-virtual-item')).not.toHaveCount(400);
          await expect(destination.getByRole('button', { name: 'InitDataGetResponse', exact: true })).toBeFocused();
        }

        if (enhanced) {
          // An ordinary documentation visit must still honor the user's setting.
          await page.goto(origin + '/docs' + search);
          await expect(page.locator('#swagger-search-container')).toBeVisible();
          await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
          await destination.getByRole('button', { name: 'Schemas', exact: true }).click();
          await expect(destination.locator('section.models')).not.toHaveClass(/is-open/);
          if (search) {
            await page.getByRole('button', { name: 'Schemas', exact: true }).click();
            await page.getByRole('button', { name: 'Admin0', exact: true }).click();
            // Simulate the same-document markdown link, without replacing native navigation.
            await page.evaluate(() => {
              const link = document.createElement('a');
              link.href = '#:~:text=InitDataGetResponse,-Expand%20all';
              link.textContent = 'Open schema'; document.body.prepend(link);
            });
            await page.getByRole('link', { name: 'Open schema', exact: true }).click();
            await expect(page.getByRole('button', { name: 'InitDataGetResponse', exact: true })).toBeInViewport();
            await expect(page.getByRole('button', { name: 'InitDataGetResponse', exact: true })).toBeFocused();
            const model = page.locator('article[data-json-schema-level="0"], .model-container[data-name]').filter({ has: page.getByRole('button', { name: 'InitDataGetResponse', exact: true }) });
            await expect(model.getByText('id', {exact:true})).toBeVisible();
            // Visiting an already expanded model must not collapse it.
            await page.getByRole('link', { name: 'Open schema', exact: true }).click();
            await expect(model.getByText('id', {exact:true})).toBeVisible();
          }
        }
        await destination.close(); await page.close();
      }
    } finally {
      await context.close();
    }
  }
});
}
