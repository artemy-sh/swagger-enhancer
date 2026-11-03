const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const spec = {
  openapi: '3.0.3', info: { title: 'Extension regression fixture', version: '1.0' },
  paths: Object.fromEntries(['/pets', '/users'].map(url => [url, { get: { tags: ['Example'], summary: 'List ' + url.slice(1), ...(url === '/users' ? {security: [{bearerAuth: []}]} : {}), responses: { 200: { description: 'Success', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } } } }])),
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

const contrastRatio = (a, b) => {
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  };

for (const swaggerPackage of ['swagger-ui-dist', 'swagger-ui-legacy']) {
test(`installed MV3 extension with ${swaggerPackage}: popup, settings sync, favorites, search, responses, schemas and reload`, { timeout: 120000 }, async t => {
  const swaggerDir = require(swaggerPackage).getAbsoluteFSPath();
  let executions = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/pets') { executions++; res.setHeader('Content-Type', 'application/json'); res.end('[{"id":1,"name":"Milo"}]'); return; }
    if (url.pathname === '/spec') {
      res.setHeader('Content-Type', 'application/json');
      const selectedSpec = url.searchParams.has('large') ? largeSpec : spec;
      const responseSpec = url.searchParams.has('noauth') ? { ...selectedSpec, components: { schemas: spec.components.schemas }, paths: Object.fromEntries(Object.entries(selectedSpec.paths).map(([path,item])=>[path,{get:{...item.get,security:[]}}])) } : selectedSpec;
      setTimeout(() => res.end(JSON.stringify(responseSpec)), 100);
      return;
    }
    if (url.pathname === '/init.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(`window.fixtureUI = SwaggerUIBundle({ url: '/spec' + location.search, dom_id: '#swagger', validatorUrl: null, docExpansion: new URLSearchParams(location.search).has('collapsed') ? 'none' : 'list' });`); return;
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
  await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get('swaggerSearchEnabled')), { timeout: 15000 }).toEqual({ swaggerSearchEnabled: true });
  const errors = [];
  context.on('page', page => {
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    page.on('console', message => { if (message.type() === 'error' || /Message not delivered|Message send error|message port closed|Receiving end does not exist/i.test(message.text())) { errors.push(message.text()); console.error(message.text()); } });
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
  const reviewURL = 'https://chromewebstore.google.com/detail/swagger-enhancer/dnadagbnobcgafbdebbabcgicfkpciam/reviews';
  const reviewLink = page.locator('#swagger-extension-review');
  await expect(reviewLink).toHaveAttribute('href', reviewURL);
  await expect(reviewLink).toHaveAttribute('rel', 'noopener noreferrer');
  const cat = reviewLink.locator('.se-cat');
  await expect(cat).toBeVisible();
  await page.bringToFront();
  await page.mouse.move(20, 500);
  await expect.poll(() => cat.evaluate(el => parseFloat(el.style.getPropertyValue('--cat-look-x')))).toBeLessThan(0);
  const eyeOffset = () => cat.evaluate(el => {
    const origin = new DOMPoint(30, 32).matrixTransform(el.querySelector('.se-cat-head').getScreenCTM());
    const pupil = el.querySelector('.se-cat-pupils circle').getBoundingClientRect();
    return pupil.left + pupil.width / 2 - origin.x;
  });
  await expect.poll(eyeOffset).toBeLessThan(-0.1);

  await page.mouse.move(1250, 500);
  await expect.poll(() => cat.evaluate(el => parseFloat(el.style.getPropertyValue('--cat-look-x')))).toBeGreaterThan(0);
  await expect.poll(eyeOffset).toBeGreaterThan(0.1);
  const actionStyle = await reviewLink.locator('.swagger-review-action').evaluate(el => {
    const css = getComputedStyle(el); return { decoration: css.textDecorationLine, color: css.color };
  });
  await expect(reviewLink.locator('.swagger-review-copy')).toHaveText('Like it? Rate it');
  await expect(reviewLink.locator('.swagger-review-action')).toHaveText('Rate it');
  await expect(reviewLink.locator('.swagger-review-prefix')).toHaveCSS('font-weight', '400');
  await expect(reviewLink.locator('.swagger-review-action')).toHaveCSS('font-weight', '600');
  assert.equal(await reviewLink.locator('.swagger-review-action svg').count(), 0);
  assert.equal(actionStyle.decoration, 'underline');
  assert.equal(await cat.locator('.se-cat-head').evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(actionStyle.color, await reviewLink.evaluate(el => getComputedStyle(el).color));

  await reviewLink.hover();
  await expect(cat).toHaveClass(/is-engaged/);
  assert.equal(await cat.locator('.se-cat-pose').evaluate(el => getComputedStyle(el).animationName), 'se-cat-hop');
  await expect.poll(() => cat.locator('.se-cat-pose').evaluate(el =>
    new DOMMatrix(getComputedStyle(el).transform).f
  )).toBeLessThan(-3);
  assert.equal(await cat.locator('.se-cat-heart, .se-cat-spark').count(), 0);
  assert.equal(await cat.locator('.se-cat-tail').evaluate(el => getComputedStyle(el).animationName), 'se-cat-tail');
  await page.evaluate(() => document.documentElement.classList.add('swagger-dark-theme'));
  await expect(reviewLink).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.mouse.move(20, 500);
  await expect(cat).not.toHaveClass(/is-engaged/);
  await expect(reviewLink).toHaveCSS('color', 'rgb(161, 166, 173)');
  await expect(cat.locator('.se-cat-pose')).toHaveCSS('transform', 'none');
  await page.evaluate(() => document.documentElement.classList.remove('swagger-dark-theme'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reviewLink.hover();
  await expect(cat).not.toHaveClass(/is-engaged/);
  await expect(cat.locator('.se-cat-pose')).toHaveCSS('transform', 'none');
  assert.equal(await cat.locator('.se-cat-eyes').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await cat.evaluate(el => el.style.getPropertyValue('--cat-look-x')), '0px');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/plain-docs');
  await page.goBack();
  await expect(cat).toBeVisible();
  await page.mouse.move(1250, 500);
  await expect.poll(() => cat.evaluate(el => parseFloat(el.style.getPropertyValue('--cat-look-x')))).toBeGreaterThan(0);

  if (process.env.SWAGGER_TEST_SCREENSHOTS && swaggerPackage === 'swagger-ui-dist') {
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle('swagger-dark-theme', value), dark);
      const folder = path.join(process.env.SWAGGER_TEST_SCREENSHOTS, dark ? 'mascot-frames-dark' : 'mascot-frames');
      fs.mkdirSync(folder, { recursive: true });
      for (let frame = 0; frame < 36; frame++) {
        if (frame < 12) await page.mouse.move(30 + frame * 105, 300);
        else if (frame === 12) await reviewLink.hover();
        // Seek the actual CSS hover animation for a compact demonstration.
        if (frame >= 12) await cat.evaluate((el, time) => {
          for (const animation of el.getAnimations({ subtree: true })) {
            if (animation.animationName !== 'se-cat-blink') { animation.pause(); animation.currentTime = time; }
          }
        }, (frame - 12) * 55);
        await reviewLink.screenshot({ path: path.join(folder, `${String(frame).padStart(2, '0')}.png`) });
      }
      await cat.evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) if (animation.animationName !== 'se-cat-blink') animation.finish(); });
      await page.mouse.move(20, 500);
    }
    await page.evaluate(() => document.documentElement.classList.remove('swagger-dark-theme'));
  }

  await expect(popup.locator('[data-support-review]')).toHaveAttribute('href', reviewURL);
  await popup.evaluate(() => {
    navigator.clipboard.writeText = async value => { window.sharedExtensionURL = value; };
  });
  await popup.locator('[data-support-share]').click();
  await expect(popup.locator('.swagger-support-status')).toHaveText('Link copied. Share it with your team.');
  assert.equal(await popup.evaluate(() => window.sharedExtensionURL), reviewURL.replace('/reviews', ''));
  await popup.setViewportSize({ width: 320, height: 600 });
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await popup.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-popup-support-light.png`), fullPage: true, animations: 'disabled' });
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await popup.locator('#swagger-support-panel').screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-mascot-card-light.png`), animations: 'disabled' });


  const toggle = async (id, checked) => {
    await expect(popup.locator('#' + id)).toBeEnabled();
    if (await popup.locator('#' + id).isChecked() !== checked) await popup.locator(`label:has(#${id})`).click();
    await expect(popup.locator('#' + id)).toBeChecked({ checked });
    await expect(popup.locator('#' + id)).toBeEnabled();
    if (id === 'toggle') {
      if (checked) await expect(page.locator('html')).toHaveClass(/swagger-dark-theme/);
      else await expect(page.locator('html')).not.toHaveClass(/swagger-dark-theme/);
    }
  };
  await toggle('toggle', true);
  await expect(page.locator('html')).toHaveClass(/swagger-dark-theme/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 18, 18)');
  await expect(page.locator('#swagger-floating-menu')).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await popup.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-popup-support-dark.png`), fullPage: true, animations: 'disabled' });
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await popup.locator('#swagger-support-panel').screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-mascot-card-dark.png`), animations: 'disabled' });


  if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-dark.png`), fullPage: true, animations: 'disabled' });
  // Issue #7 used the standard Swashbuckle localhost URL, without "docs" in its path.
  const second = await context.newPage(); await second.goto(origin.replace('127.0.0.1', 'localhost') + '/swagger/index.html');
  await expect(second.locator('html')).toHaveClass(/swagger-dark-theme/);
  await toggle('toggle', false);
  await expect(page.locator('html')).not.toHaveClass(/swagger-dark-theme/);
  await expect(second.locator('html')).not.toHaveClass(/swagger-dark-theme/);
  await popup.locator('#toggle').focus();
  await popup.locator('#toggle').press('Space');
  await expect(popup.locator('#toggle')).toBeEnabled();
  await expect(popup.locator('#toggle')).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/swagger-dark-theme/);
  await toggle('toggle', false);

  // Popup settings must also work with a normal page active, without any receiver.
  const ordinary = await context.newPage();
  await ordinary.goto(origin + '/plain-docs');
  await ordinary.bringToFront();
  await expect(popup.locator('#toggle')).toBeEnabled();
  await popup.evaluate(() => {
    document.querySelector('#toggle').checked = true;
    document.querySelector('#toggle').dispatchEvent(new Event('change'));
  });
  await expect(page.locator('html')).toHaveClass(/swagger-dark-theme/);
  await expect(second.locator('html')).toHaveClass(/swagger-dark-theme/);
  await expect(popup.locator('#toggle')).toBeEnabled();
  await popup.evaluate(() => {
    document.querySelector('#toggle').checked = false;
    document.querySelector('#toggle').dispatchEvent(new Event('change'));
  });
  await expect(page.locator('html')).not.toHaveClass(/swagger-dark-theme/);
  await expect(second.locator('html')).not.toHaveClass(/swagger-dark-theme/);
  await ordinary.close();


  const headerAuth = page.locator('#swagger-header-authorize');
  await expect(popup.locator('#authorizeInHeaderToggle')).not.toBeChecked();
  await expect(headerAuth).toHaveCount(0);
  await toggle('authorizeInHeaderToggle', true);
  await expect(headerAuth).toBeVisible();
  await expect(second.locator('#swagger-header-authorize')).toBeVisible();
  await expect(page.locator('.auth-wrapper > button.authorize')).toHaveCSS('padding-top', '7px');
  await page.evaluate(() => { document.body.style.minHeight = '2500px'; scrollTo(0, 600); });
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 600) <= 2)).toBe(true);
  const authDialog = page.locator('.dialog-ux');
  const protectedRoute = page.locator('.opblock').filter({ has: page.locator('.opblock-summary-path', { hasText: '/users' }) });
  const routeLock = protectedRoute.locator('.swagger-route-authorization');
  for (const dark of [false, true]) {
    await toggle('toggle', dark);
    await expect(page.locator('body')).toHaveCSS('background-color', dark ? 'rgb(18, 18, 18)' : 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const beforeAuthScroll = await page.evaluate(() => scrollY);
    await headerAuth.click();
    await expect(authDialog).toBeVisible();
    const afterAuthScroll = await page.evaluate(() => scrollY);
    assert.ok(Math.abs(afterAuthScroll - beforeAuthScroll) <= 1, `Header auth does not scroll to its source button: ${beforeAuthScroll} -> ${afterAuthScroll}`);
    await authDialog.locator('input').fill('local-fixture-token');
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-auth-dialog-${dark ? 'dark' : 'light'}.png`) });
    await authDialog.getByRole('button', { name: /^(Authorize|Apply credentials)$/ }).click();
    await expect(headerAuth).toHaveClass(/is-authorized/);
    await expect(routeLock).toHaveClass(/is-authorized/);
    assert.ok(contrastRatio(await routeLock.evaluate(el => getComputedStyle(el).color), dark ? 'rgb(30, 30, 30)' : 'rgb(255, 255, 255)') >= 3, 'Authorized route icons remain visible');
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await protectedRoute.locator('.opblock-summary').screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-authorized-route-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
    assert.doesNotMatch(await headerAuth.textContent(), /local-fixture-token/);
    await authDialog.getByRole('button', { name: /^(Logout|Remove authorization)$/ }).click();
    await expect(headerAuth).not.toHaveClass(/is-authorized/);
    await expect(routeLock).not.toHaveClass(/is-authorized/);
    await authDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(authDialog).toBeHidden();
    const expanded = await protectedRoute.locator('.opblock-summary-control').getAttribute('aria-expanded');
    await routeLock.click();
    await expect(authDialog).toBeVisible();
    assert.equal(await protectedRoute.locator('.opblock-summary-control').getAttribute('aria-expanded'), expanded, 'The lock opens authorization without expanding its route');
    await authDialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.ok(contrastRatio(await headerAuth.evaluate(el => getComputedStyle(el).color), dark ? 'rgb(30, 30, 30)' : 'rgb(255, 255, 255)') >= 4.5);
  }
  await toggle('toggle', false);
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

  // Light-theme actions must remain readable in every favorites state.
  for (const label of ['Show favorites', 'Hide favorites', 'Show all']) {
    await page.locator('#swagger-fav-filter').click();
    await expect(page.locator('.swagger-fav-label')).toHaveText(label);
    await page.locator('#swagger-fav-control').hover();
    await expect(page.locator('#swagger-fav-control')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    for (const selector of ['.swagger-fav-label', '.swagger-fav-all', '.swagger-fav-reset']) {
      const color = await page.locator(selector).evaluate(el => getComputedStyle(el).color);
      assert.ok(contrastRatio(color, 'rgb(255, 255, 255)') >= 4.5, `${label}: ${selector} contrast`);
    }
    if (label === 'Show favorites' && process.env.SWAGGER_TEST_SCREENSHOTS) await page.locator('#swagger-floating-menu').screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-favorites-light.png`), animations: 'disabled' });
  }
  await toggle('copyFullUrlToggle', true);
  const summary = page.locator('.opblock-summary').first();
  await expect(summary.locator('.swagger-copy-link')).toHaveCount(3);
  await page.evaluate(() => {
    window.testLastCopied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.testLastCopied = text; } } });
    document.execCommand = command => { if (command !== 'copy') return false; window.testLastCopied = getSelection().toString(); return true; };
  });
  for (const dark of [false, true]) {
    await toggle('toggle', dark);
    await summary.hover();
    await expect.poll(() => summary.locator('.swagger-copy-path-url').evaluate(el => el.getBoundingClientRect().width)).toBe(26);
    const controls = await summary.locator(':scope > .view-line-link').evaluateAll(elements => elements.map(el => ({
      left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      width: el.getBoundingClientRect().width, color: getComputedStyle(el).color
    })));
    assert.equal(controls.length, 3);
    assert.ok(controls.every((control, i) => control.width >= 25 && (!i || control.left >= controls[i - 1].right)), 'copy icons never overlap');
    assert.ok(controls.every(control => contrastRatio(control.color, dark ? 'rgb(30, 30, 30)' : 'rgb(255, 255, 255)') >= 4.5));
    await expect(summary.locator('.swagger-copy-path-url')).toHaveCSS('background-image', 'none');
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await summary.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-copy-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
  }
  const expandedBeforeCopy = await summary.locator('.opblock-summary-control').getAttribute('aria-expanded');
  await summary.locator('.swagger-copy-full-url').click();
  await expect.poll(() => page.evaluate(() => window.testLastCopied)).toBe(origin + '/pets');
  await summary.locator('.swagger-copy-docs-url').click();
  assert.match(await page.evaluate(() => window.testLastCopied), /#\/Example\/.+/);
  await summary.getByRole('button', { name: 'Copy path to clipboard', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.testLastCopied)).toBe('/pets');
  await expect(summary.locator('.swagger-copy-path-url .swagger-copy-hint')).toHaveText('Copied!');
  assert.equal(await summary.locator('.opblock-summary-control').getAttribute('aria-expanded'), expandedBeforeCopy);
  await toggle('copyFullUrlToggle', false);
  await expect(summary.locator('.swagger-copy-link')).toHaveCount(0);
  await toggle('toggle', false);
  await page.reload();
  await expect(page.locator('.opblock')).toHaveCount(2);

  for (const dark of [false, true]) {
    await toggle('toggle', dark);
    const search = page.locator('.swagger-search-input');
    await search.fill('pets');
    await expect(page.locator('.swagger-search-results')).toBeVisible();
    await search.press('ArrowDown');
    const active = page.locator('.swagger-search-results [aria-selected="true"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveCSS('background-color', 'rgb(36, 103, 194)');
    const colors = await active.evaluate(el => ({ background: getComputedStyle(el).backgroundColor,
      colors: [...el.querySelectorAll('.route-tag, .route-path')].map(node => getComputedStyle(node).color) }));
    assert.ok(colors.colors.every(color => contrastRatio(color, colors.background) >= 4.5), 'selected results stay readable');
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-search-${dark ? 'dark' : 'light'}.png`) });
    await search.press('Escape');
    await expect(page.locator('.swagger-search-results')).toBeHidden();
    await search.fill('nothing-matches-this-fixture');
    await expect(page.locator('.swagger-search-empty')).toBeVisible();
    await search.press('Escape');
    await expect(page.locator('.swagger-search-empty')).toBeHidden();
  }
  await toggle('toggle', false);
  const input = page.locator('.swagger-search-input');
  await input.fill('pets'); await expect(page.locator('.swagger-search-results')).toContainText('/pets');
  await page.locator('.swagger-search-results .route-path').click();
  await expect(page.locator('.swagger-search-results')).toBeHidden();

  await input.fill(''); await expect(page.locator('.swagger-search-results')).toBeHidden();
  await toggle('searchToggle', false); await expect(input).toHaveCount(0);
  await toggle('searchToggle', true); await expect(input).toBeVisible();

  const pets = page.locator('.opblock').filter({ has: page.locator('.opblock-summary-path', { hasText: '/pets' }) });
  for (const dark of [false, true]) {
    await toggle('toggle', dark);
    await toggle('hideSchemasToggle', true);
    await expect(page.locator('section.models')).not.toHaveClass(/is-open/);
    await toggle('hideSchemasToggle', false);
    await expect(page.locator('section.models')).toHaveClass(/is-open/);
    if (!/\bis-open\b/.test(await pets.getAttribute('class'))) await pets.locator('.opblock-summary-control').click();
    await toggle('hideResponsesToggle', true);
    await expect(pets.locator('table.responses-table:not(.live-responses-table)')).toBeHidden();
    await pets.getByRole('button', { name: 'Try it out' }).click();
    const before = executions;
    await pets.getByRole('button', { name: 'Execute', exact: true }).click();
    await expect.poll(() => executions).toBe(before + 1);
    await expect(pets.locator('.live-responses-table')).toBeVisible();
    await expect(pets.locator('.live-responses-table')).toContainText('Milo');
    await toggle('hideResponsesToggle', false);
    await expect(pets.locator('table.responses-table:not(.live-responses-table)')).toBeVisible();
    await toggle('hideResponsesToggle', true);
    await expect(pets.locator('.live-responses-table')).toBeVisible();
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await pets.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-live-response-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' });
    await pets.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('.opblock-summary-control').first().click();
    await expect(page.locator('.opblock-summary-control').first()).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.opblock-summary-control').first()).toBeFocused();
    await expect(page.locator('.opblock-summary-control').first()).toHaveCSS('outline-style', 'solid');
  }
  await toggle('toggle', false);

  await page.evaluate(() => { document.body.style.minHeight = '2500px'; window.scrollTo(0, 500); });
  await expect(page.locator('#swagger-scroll-top')).toBeVisible();
  await page.locator('#swagger-scroll-top').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const scrollTop = page.locator('#swagger-scroll-top');
  await expect(scrollTop).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'instant' }));
  await expect(scrollTop).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 151, behavior: 'instant' }));
  await expect(scrollTop).toBeVisible();
  for (const key of ['Enter', 'Space']) {
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
    await expect(scrollTop).toBeVisible();
    await scrollTop.focus();
    await expect(scrollTop).toHaveCSS('opacity', '1');
    await scrollTop.press(key);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(scrollTop).toBeHidden();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    window.scrollTo({ top: 800, behavior: 'instant' });
  });
  await expect(scrollTop).toBeVisible();
  await scrollTop.focus();
  await expect(scrollTop).toHaveCSS('animation-name', 'none');
  assert.equal(await page.evaluate(() => { document.getElementById('swagger-scroll-top').click(); return scrollY; }), 0, 'reduced motion scrolls immediately even when the host requests smooth scrolling');
  await page.evaluate(() => document.documentElement.style.removeProperty('scroll-behavior'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
  await expect(scrollTop).toBeInViewport();
  const scrollBox = await scrollTop.boundingBox();
  assert.ok(scrollBox.x >= 0 && scrollBox.x + scrollBox.width <= 375 && scrollBox.y + scrollBox.height <= 667, 'the control fits a narrow viewport');
  await scrollTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await toggle('scrollTopToggle', false); await expect(page.locator('#swagger-scroll-top')).toHaveCount(0);
  await toggle('scrollTopToggle', true); await expect(page.locator('#swagger-scroll-top')).toHaveCount(1);

  await second.goto(origin + '/openapi?collapsed');
  await expect(second.locator('.opblock-tag')).toBeVisible();
  await expect(second.locator('.opblock')).toHaveCount(0);
  await second.locator('.swagger-search-input').fill('/pets');
  await second.locator('.swagger-search-results .route-path').click();
  await expect(second.locator('.opblock').filter({ hasText: '/pets' })).toHaveClass(/is-open/);
  await expect(second.locator('.swagger-fav-star')).toHaveCount(2);

  // Keyboard navigation never expands a route when toggling its independent star.
  await second.goto(origin + '/docs');
  await expect(second.locator('.swagger-fav-star').first()).toHaveAttribute('aria-pressed', 'true');
  const secondStar = second.locator('.swagger-fav-star').first();
  await second.keyboard.press('Tab');
  await secondStar.focus();
  await expect(secondStar).toBeFocused();
  assert.equal(await secondStar.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await secondStar.press('Space');
  await expect(secondStar).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.swagger-fav-star').first()).toHaveAttribute('aria-pressed', 'false');
  await secondStar.press('Enter');
  await expect(page.locator('.swagger-fav-star').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(second.locator('.opblock.is-open')).toHaveCount(0);
  const keyboardSearch = second.locator('.swagger-search-input');
  await keyboardSearch.fill('users');
  await expect(second.locator('.swagger-search-results')).toBeVisible();
  await keyboardSearch.press('ArrowDown');
  await expect(keyboardSearch).toBeFocused();
  await expect(second.locator('[role="option"][aria-selected="true"]')).toContainText('/users');
  if (process.env.SWAGGER_TEST_SCREENSHOTS) await second.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-keyboard.png`), animations: 'disabled' });
  await keyboardSearch.press('Enter');
  await expect(second.locator('.opblock').filter({ hasText: '/users' })).toHaveClass(/is-open/);
  await keyboardSearch.press('Escape');
  await expect(keyboardSearch).toBeFocused();
  await expect(keyboardSearch).toHaveAttribute('aria-expanded', 'false');

  // Switching the selected document, including shared route paths, isolates favorites.
  await toggle('hideSchemasToggle', true);
  await second.evaluate(spec => {
    window.fixtureUI.specActions.updateUrl('/spec-b');
    window.fixtureUI.specActions.updateJsonSpec(spec);
  }, { ...spec, info: { ...spec.info, title: 'Second API' } });
  await expect(second.locator('.swagger-fav-star[aria-pressed="true"]')).toHaveCount(0);
  await expect(second.locator('section.models')).not.toHaveClass(/is-open/);
  await second.locator('button.models-control').click();
  await expect(second.locator('section.models')).toHaveClass(/is-open/);
  await second.evaluate(() => { document.querySelector('.swagger-ui').appendChild(document.createElement('span')); });
  await expect(second.locator('section.models')).toHaveClass(/is-open/);
  await second.evaluate(spec => {
    window.fixtureUI.specActions.updateUrl('/spec');
    window.fixtureUI.specActions.updateJsonSpec(spec);
  }, spec);
  await expect(second.locator('.swagger-fav-star').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(second.locator('section.models')).not.toHaveClass(/is-open/);

  // A host SPA can leave Swagger, then mount a fresh instance without reloading.
  await second.evaluate(() => { document.querySelector('#swagger').remove(); });
  await expect(second.locator('#swagger-floating-menu')).toHaveCount(0);
  await expect(second.locator('body')).toHaveCSS('padding-top', '0px');
  await second.evaluate(() => {
    const mount = document.createElement('div'); mount.id = 'swagger'; document.body.appendChild(mount);
    window.fixtureUI = SwaggerUIBundle({ url: '/spec', dom_id: '#swagger', validatorUrl: null });
  });
  await expect(second.locator('#swagger-floating-menu')).toHaveCount(1);
  await expect(second.locator('.swagger-fav-star')).toHaveCount(2);
  await expect(second.locator('section.models')).not.toHaveClass(/is-open/);
  await toggle('hideSchemasToggle', false);

  // Large specs use a different, virtualized DOM in Swagger UI 5.
  await page.evaluate(() => {
    const scope = encodeURIComponent('url:' + new URL('/spec?large', location.href).href);
    localStorage.setItem('swaggerFavorites:v1:' + scope, JSON.stringify({ 'GET /group-0/route-0': true, 'GET /group-19/route-19': true }));
    localStorage.setItem('swaggerFavoritesFilterState:v1:' + scope, '0');
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
  await expect(scrollTop).toBeVisible();
  await scrollTop.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(scrollTop).toBeHidden();
  await expect(page.locator('h3.opblock-tag[data-tag="Group 0"]')).toBeInViewport();
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
  await page.locator('.swagger-fav-star').first().focus();
  await page.locator('.swagger-fav-star').first().press('Space');
  await expect(page.locator('#swagger-fav-filter')).toBeFocused();
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
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('swaggerFavorites:v1:' + encodeURIComponent('url:' + new URL('/spec?large', location.href).href)))).length), 400);
  await page.locator('.swagger-fav-label').click(); // show all
  await expect(page.locator('.opblock:visible').first()).toBeVisible();
  await page.locator('.swagger-fav-reset').click();
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('swaggerFavorites:v1:' + encodeURIComponent('url:' + new URL('/spec?large', location.href).href)))).length), 0);
  await toggle('favoritesToggle', false);
  await expect(page.locator('.swagger-fav-star')).toHaveCount(0);
  await expect(page.locator('.opblock:visible').first()).toBeVisible();
  await toggle('favoritesToggle', true);
  await expect(page.locator('.swagger-fav-star').first()).toBeVisible();

  await second.evaluate(spec => {
    const paths = Object.fromEntries(Object.entries(spec.paths).map(([path, operation]) => [path, {
      get: { ...operation.get, tags: ['Example', 'Second tag'] }
    }]));
    window.fixtureUI.specActions.updateJsonSpec({ ...spec, paths });
  }, spec);
  const duplicatePets = second.locator('.opblock').filter({ has: second.locator('.opblock-summary-path', { hasText: '/pets' }) }).locator('.swagger-fav-star');
  await expect(duplicatePets).toHaveCount(2);
  const wasFavorite = await duplicatePets.first().getAttribute('aria-pressed');
  await duplicatePets.first().click();
  await expect(duplicatePets.nth(0)).toHaveAttribute('aria-pressed', wasFavorite === 'true' ? 'false' : 'true');
  await expect(duplicatePets.nth(1)).toHaveAttribute('aria-pressed', wasFavorite === 'true' ? 'false' : 'true');
  await second.goto(origin + '/plain-docs');
  await expect(second.locator('#swagger-floating-menu')).toHaveCount(0);
  await expect(second.locator('body')).toHaveCSS('padding-top', '0px');
  await second.setViewportSize({ width: 375, height: 667 });
  await expect(second.locator('body')).toHaveCSS('padding-top', '0px');
  // Visual review of every HTTP badge, selected rows and empty states in both themes.
  const palette = { ...spec, info: { title: 'Method palette', version: '1' },
    paths: Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'].map(method =>
      [`/review/${method}`, { [method]: { tags: ['Review'], summary: `Review ${method}`, responses: { 200: { description: 'OK' } } } }])) };
  await page.evaluate(spec => fixtureUI.specActions.updateJsonSpec(spec), palette);
  await expect(page.locator('.opblock')).toHaveCount(8);
  for (const dark of [false, true]) {
    await toggle('toggle', dark);
    const search = page.locator('.swagger-search-input');
    await search.fill('review');
    const badges = page.locator('.swagger-search-results .route-method');
    await expect(badges).toHaveCount(8);
    const colors = await badges.evaluateAll(elements => elements.map(el => ({ method: el.textContent, foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor })));
    for (const badge of colors) {
      assert.ok(contrastRatio(badge.foreground, badge.background) >= 4.5, `${badge.method} method contrast`);
    }
    if (process.env.SWAGGER_TEST_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.SWAGGER_TEST_SCREENSHOTS, `${swaggerPackage}-method-palette-${dark ? 'dark' : 'light'}.png`) });
    await search.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log(`Verified Chromium ${context.browser().version()}, Swagger UI ${require(swaggerPackage + '/package.json').version}`);
});
}
