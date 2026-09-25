const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const route = (url = '/pets') => `<div class="opblock"><div class="opblock-summary"><button class="opblock-summary-control"><span class="opblock-summary-method">GET</span><span class="opblock-summary-path">${url}</span></button></div></div>`;
const wrapper = (live = false) => `<div class="responses-wrapper"><div class="opblock-section-header"><h4>Responses</h4></div><table class="responses-table"></table>${live ? '<table class="live-responses-table"></table>' : ''}</div>`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(t, html = '', settings = {}, url = 'https://example.test/docs') {
  const dom = new JSDOM(`<html><head></head><body>${html}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const instances = [];
  const errors = [];
  dom.window.addEventListener('error', event => errors.push(event.message));
  t.after(async () => {
    instances.forEach(instance => instance.destroy());
    if (dom.window.SwaggerEnhancerFeatureManager?.features.size) dom.window.SwaggerEnhancerFeatureManager.cleanup();
    await pause(0);
    dom.window.close();
    assert.deepEqual(errors, [], 'unexpected DOM errors');
  });
  const w = dom.window;
  const event = () => ({ listeners: new Set(), addListener(fn) { this.listeners.add(fn); }, removeListener(fn) { this.listeners.delete(fn); }, emit(...args) { this.listeners.forEach(fn => fn(...args)); } });
  w.chrome = { runtime: { getURL: p => `chrome-extension://test/${p}`, onMessage: event() }, storage: { onChanged: event(), sync: { get(keys, cb) { cb(Object.fromEntries(keys.filter(k => k in settings).map(k => [k, settings[k]]))); } } } };
  const load = name => w.eval(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'));
  load('utils');
  return { w, d: w.document, load, feature(name) { load(name); const key = { favorites: 'Favorites', search: 'Search', hide_responses: 'HideResponses', hide_schemas: 'HideSchemas', authorize: 'Authorize', copy_url: 'CopyURL', theme: 'Theme', scroll_top: 'ScrollTop' }[name]; const instance = new w[key + 'Feature'](); instances.push(instance); return instance; } };
}

test('disabling favorites restores filtered endpoints and preserves page display styles', t => {
  const { d, feature } = setup(t, `<div class="swagger-ui"><section class="opblock-tag-section">${route()}</section></div>`);
  const block = d.querySelector('.opblock'); block.style.display = 'flex';
  const f = feature('favorites'); f.setEnabled(true); f.filterState = 1; f.applyFavoriteFilter();
  assert.equal(block.style.display, 'none');
  f.setEnabled(false);
  assert.equal(block.style.display, 'flex');
  assert.notEqual(d.querySelector('section').style.display, 'none');
});
test('collapsed tags without rendered endpoints remain accessible', t => {
  const { d, feature } = setup(t, '<div class="swagger-ui"><section class="opblock-tag-section"><h3 class="opblock-tag">Pets</h3></section></div>');
  feature('favorites').setEnabled(true);
  assert.notEqual(d.querySelector('section').style.display, 'none');
});
test('favorites attach when Swagger renders late', async t => {
  const { d, feature } = setup(t);
  feature('favorites').setEnabled(true);
  d.body.insertAdjacentHTML('beforeend', `<div class="swagger-ui">${route()}</div>`);
  await pause(0);
  assert.equal(d.querySelectorAll('.swagger-fav-star').length, 1);
});
test('favorites follow a reused summary and stop enhancing after disable', async t => {
  const { w, d, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  const f = feature('favorites'); f.setEnabled(true);
  d.querySelector('.opblock-summary-path').textContent = '/users';
  await pause(0);
  d.querySelector('.swagger-fav-star').click();
  assert.deepEqual(JSON.parse(w.localStorage.getItem('swaggerFavorites')), { 'GET /users': true });
  f.setEnabled(false);
  d.querySelector('.swagger-ui').insertAdjacentHTML('beforeend', route('/new'));
  await pause(0);
  assert.equal(d.querySelectorAll('.swagger-fav-star').length, 0);
});
test('invalid persisted favorites do not break initialization', t => {
  const { w, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  w.localStorage.setItem('swaggerFavorites', 'null');
  w.localStorage.setItem('swaggerFavoritesFilterState', 'invalid');
  const f = feature('favorites'); f.setEnabled(true);
  assert.equal(f.filterState, 0);
});
test('header authorization follows late/replaced native controls and cleans up', async t => {
  const { w, d, load, feature } = setup(t, '<div class="swagger-ui"></div>');
  load('floating_menu'); w.createSwaggerFloatingMenu();
  const f = feature('authorize'); f.setEnabled(true);
  assert.equal(d.querySelector('#swagger-header-authorize'), null);
  const nativeMarkup = '<div class="auth-wrapper"><button class="authorize unlocked"><span>Authorize</span><svg><use href="#unlocked"></use></svg></button></div>';
  d.querySelector('.swagger-ui').innerHTML = nativeMarkup;
  await pause(0);
  let clicks = 0;
  let source = d.querySelector('.authorize');
  source.onclick = () => clicks++;
  const closedLock = d.querySelector('#swagger-header-authorize path').getAttribute('d');
  d.querySelector('#swagger-header-authorize').click();
  assert.equal(clicks, 1);
  source.className = 'authorize locked';
  source.querySelector('use').setAttribute('href', '#locked');
  await pause(0);
  assert.equal(d.querySelector('#swagger-header-authorize').classList.contains('is-authorized'), true);
  assert.notEqual(d.querySelector('#swagger-header-authorize path').getAttribute('d'), closedLock);
  d.querySelector('.swagger-ui').innerHTML = nativeMarkup;
  source = d.querySelector('.authorize'); source.onclick = () => clicks++;
  await pause(0);
  assert.equal(d.querySelectorAll('#swagger-header-authorize').length, 1);
  d.querySelector('#swagger-header-authorize').click(); assert.equal(clicks, 2);
  d.querySelector('.auth-wrapper').remove(); await pause(0);
  assert.equal(d.querySelector('#swagger-header-authorize'), null);
  f.setEnabled(false);
  d.querySelector('.swagger-ui').innerHTML = nativeMarkup; await pause(0);
  assert.equal(d.querySelector('#swagger-header-authorize'), null);
  assert.equal(d.querySelector('link[href$="authorize.css"]'), null);
});
test('existing executed responses remain visible when hiding static responses', t => {
  const { d, feature } = setup(t, wrapper(true));
  feature('hide_responses').setEnabled(true);
  assert.notEqual(d.querySelector('.responses-wrapper').style.display, 'none');
  assert.equal(d.querySelector('.responses-table').style.display, 'none');
});
test('authorization labels expose only active identities and route locks follow per-route state', async t => {
  const { w, d, load, feature } = setup(t, '<div class="swagger-ui"><div class="auth-wrapper"><button class="authorize locked">Authorize</button></div></div>');
  load('floating_menu'); w.createSwaggerFloatingMenu();
  let plugin;
  w.SwaggerUIBundle = options => { plugin = options.plugins.at(-1)(); };
  load('favorites_bridge'); w.SwaggerUIBundle({});
  const entry = value => ({ get: key => value[key] });
  let active = [entry({ clientId: 'cabinet-client', username: 'login', clientSecret: 'secret', token: { access_token: 'private-token' } })];
  plugin.afterLoad({ authSelectors: { authorized: () => active } });
  const f = feature('authorize'); f.setEnabled(true);
  const button = d.querySelector('#swagger-header-authorize');
  assert.equal(button.textContent, 'Authorized: cabinet-client');
  const headerOpenLock = button.querySelector('path').getAttribute('d');
  const cleanups = [], updates = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: value => [value, next => updates.push(next)],
    useLayoutEffect: effect => cleanups.push(effect())
  };
  t.after(() => cleanups.forEach(cleanup => cleanup?.()));
  const Original = () => {}, Popup = () => {};
  const NativeButton = plugin.wrapComponents.authorizeBtn(Original, { React, authSelectors: { authorized: () => active } });
  const nativeProps = { isAuthorized: true, showPopup: true, onClick: () => {}, getComponent: () => Popup };
  const native = NativeButton(nativeProps);
  assert.equal(native.children[0].children[0].type, 'svg');
  assert.equal(native.children[0].children[0].children[0].props.d, headerOpenLock);
  assert.equal(native.children[0].children[1].children[0], 'Authorized: cabinet-client');
  assert.equal(native.children[0].props.onClick, nativeProps.onClick);
  assert.equal(native.children[1].type, Popup);
  active = [entry({ schema: entry({ type: 'http', scheme: 'basic' }), value: { username: '<login>', password: 'private-password' } })];
  plugin.statePlugins.auth.wrapActions.authorize(() => {})();
  await pause(0);
  assert.equal(button.textContent, 'Authorized: <login>');
  assert.equal(button.querySelector('login'), null);
  active = [entry({ value: 'opaque-bearer-token' })];
  plugin.statePlugins.auth.wrapActions.authorize(() => {})(); await pause(0);
  assert.equal(button.textContent, 'Authorized');
  active = [];
  d.querySelector('.authorize').className = 'authorize unlocked';
  plugin.statePlugins.auth.wrapActions.logout(() => {})(); await pause(0);
  assert.equal(button.textContent, 'Authorize');
  assert.equal(button.classList.contains('is-authorized'), false);
  const headerClosedLock = button.querySelector('path').getAttribute('d');
  assert.notEqual(headerClosedLock, headerOpenLock);
  const RouteButton = plugin.wrapComponents.authorizeOperationBtn(Original, { React });
  let clicks = 0, stopped = 0;
  const locked = RouteButton({ isAuthorized: false, onClick: () => clicks++ });
  const unlocked = RouteButton({ isAuthorized: true });
  assert.equal(locked.props['aria-label'], 'Authorization required');
  assert.equal(unlocked.props['aria-label'], 'Authorized');
  assert.match(unlocked.props.className, /is-authorized/);
  assert.equal(locked.children[0].children[0].props.d, headerClosedLock);
  assert.equal(unlocked.children[0].children[0].props.d, headerOpenLock);
  assert.equal(unlocked.children[0].props.fill, 'currentColor');
  locked.props.onClick({ stopPropagation: () => stopped++ });
  assert.equal(clicks, 1); assert.equal(stopped, 1);
  f.setEnabled(false);
  assert.equal(d.body.classList.contains('swagger-authorization-enabled'), false);
  assert.equal(d.querySelector('#swagger-header-authorize'), null);
  assert.equal(updates.at(-1), false);
  const originalNative = NativeButton(nativeProps);
  assert.equal(originalNative.type, Original);
  assert.equal(originalNative.props, nativeProps);
  const routeProps = { isAuthorized: true, onClick: () => {} };
  assert.equal(RouteButton(routeProps).type, Original);
  assert.equal(RouteButton(routeProps).props, routeProps);
  f.setEnabled(true);
  assert.equal(updates.at(-1), true);
  assert.equal(NativeButton(nativeProps).type, 'div');
  assert.equal(RouteButton(routeProps).type, 'button');
});
test('disabling response hiding restores static tables after a live response arrives', async t => {
  const { d, feature } = setup(t, wrapper());
  const f = feature('hide_responses'); f.setEnabled(true);
  d.querySelector('.responses-wrapper').insertAdjacentHTML('beforeend', '<table class="live-responses-table"></table>');
  await pause(0);
  assert.notEqual(d.querySelector('.responses-wrapper').style.display, 'none');
  f.setEnabled(false);
  assert.equal(d.querySelector('.responses-table').style.display, '');
  assert.equal(d.querySelector('h4').style.display, '');
});
test('disabling schema collapse does not close a section reopened by the user', t => {
  const { d, feature } = setup(t, '<section class="models is-open"><button class="models-control">Schemas</button></section>');
  const section = d.querySelector('section'); const button = d.querySelector('button');
  button.onclick = () => section.classList.toggle('is-open');
  const f = feature('hide_schemas'); f.setEnabled(true); button.click(); f.setEnabled(false);
  assert.equal(section.classList.contains('is-open'), true);
});
test('search does not reappear after being disabled while waiting for Swagger', async t => {
  const { d, feature } = setup(t);
  const f = feature('search'); f.setEnabled(true); f.setEnabled(false);
  d.body.insertAdjacentHTML('beforeend', '<div class="swagger-ui"></div>');
  await pause(20);
  assert.equal(d.querySelector('#swagger-search-container'), null);
});
test('clearing search cancels pending results', async t => {
  const { w, d, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  feature('search').setEnabled(true); await pause(0);
  const input = d.querySelector('input');
  input.value = 'pets'; input.dispatchEvent(new w.Event('input'));
  input.value = ''; input.dispatchEvent(new w.Event('input'));
  await pause(220);
  assert.equal(d.querySelector('.swagger-search-results').style.display, 'none');
});
test('search invalidates results after Swagger rerenders endpoints', async t => {
  const { d, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  const f = feature('search'); f.setEnabled(true); await pause(0);
  const results = d.querySelector('ul'); f.performSearch('pets', results);
  d.querySelector('.swagger-ui').innerHTML = route('/pets/new');
  await pause(250); f.performSearch('pets', results);
  assert.match(results.textContent, /pets\/new/);
});
test('DOM fallback search excludes routes hidden by the favorites filter', async t => {
  const { d, feature } = setup(t, `<div class="swagger-ui">${route('/pets/first')}${route('/pets/second')}</div>`);
  const f = feature('search'); f.setEnabled(true);
  const results = d.querySelector('ul'); f.performSearch('pets', results);
  assert.equal(results.children.length, 2);
  d.querySelector('.opblock').style.display = 'none';
  await pause(0); f.performSearch('pets', results);
  assert.equal(results.children.length, 1);
  assert.match(results.textContent, /pets\/second/);
});
test('API method text cannot inject markup into search results', t => {
  const { w, d, feature } = setup(t);
  const results = d.createElement('ul');
  feature('search').displayResults([{ type: 'route', method: 'GET" onclick="window.injected=1', path: '/pets', desc: '', el: d.body }], results);
  results.querySelector('span').dispatchEvent(new w.Event('click'));
  assert.equal(results.querySelector('[onclick]'), null);
});
test('sync settings update every initialized feature without an active-tab message', async t => {
  const { w, feature } = setup(t);
  const f = feature('theme'); await f.init();
  w.chrome.storage.onChanged.emit({ darkThemeEnabled: { newValue: true } }, 'sync');
  assert.equal(f.isEnabled(), true);
  w.chrome.storage.onChanged.emit({ darkThemeEnabled: { newValue: false } }, 'local');
  assert.equal(f.isEnabled(), true);
});
test('manager reports actual enabled state', async t => {
  const { w, load } = setup(t);
  load('feature_manager'); load('theme');
  const manager = w.SwaggerEnhancerFeatureManager;
  manager.register('theme', w.ThemeFeature); await manager.initAll();
  assert.equal(manager.isFeatureEnabled('theme'), false);
});

test('manifest loads only production scripts and every declared asset exists', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const scripts = manifest.content_scripts.flatMap(entry => entry.js || []);
  assert.equal(scripts.includes('js/test_runner.js'), false);
  assert.equal(scripts[0], 'js/utils.js');
  for (const file of [...scripts, ...manifest.content_scripts[0].css, manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons)]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});
test('whole app leaves ordinary docs pages alone and initializes once when Swagger mounts', async t => {
  const { w, d, load } = setup(t, '<main>Documentation</main>', { swaggerSearchEnabled: true, swaggerFavoritesEnabled: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  for (const file of manifest.content_scripts[0].js.slice(1)) load(path.basename(file, '.js'));
  await pause(150);
  assert.equal(d.querySelector('#swagger-floating-menu'), null);
  assert.equal(d.body.classList.contains('swagger-enhancer-active'), false);
  d.body.insertAdjacentHTML('beforeend', `<div class="swagger-ui">${route()}</div>`);
  await pause(150);
  assert.equal(w.SwaggerEnhancerFeatureManager.getAllFeatures().size, 8);
  assert.equal(d.querySelectorAll('#swagger-floating-menu').length, 1);
  assert.equal(d.querySelectorAll('.swagger-fav-star').length, 1);
  assert.ok(d.querySelector('#swagger-search-container'));
  assert.equal(d.querySelector('script[src*="page_test_functions"]'), null);
});
test('cleanup removes feature UI, styles and listeners across enable/disable cycles', async t => {
  const { w, d, load } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  load('feature_manager');
  const manager = w.SwaggerEnhancerFeatureManager;
  for (const [file, name] of [['theme', 'Theme'], ['search', 'Search'], ['favorites', 'Favorites'], ['scroll_top', 'ScrollTop'], ['hide_responses', 'HideResponses'], ['hide_schemas', 'HideSchemas'], ['authorize', 'Authorize'], ['copy_url', 'CopyURL']]) {
    load(file); manager.register(file, w[name + 'Feature']);
  }
  await manager.initAll();
  for (const { instance } of manager.getAllFeatures().values()) {
    instance.setEnabled(true); instance.setEnabled(false); instance.setEnabled(true);
  }
  manager.cleanup();
  assert.equal(w.chrome.runtime.onMessage.listeners.size, 0);
  assert.equal(w.chrome.storage.onChanged.listeners.size, 0);
  assert.equal(d.querySelectorAll('.swagger-fav-star, #swagger-scroll-top, #swagger-search-container, link').length, 0);
});
test('installation uses callback API and updates do not overwrite stored preferences', t => {
  const { w, load } = setup(t);
  let installed, writes = 0;
  w.chrome.runtime.onInstalled = { addListener(fn) { installed = fn; } };
  w.chrome.storage.sync.set = (defaults, cb) => { writes++; assert.equal(defaults.swaggerSearchEnabled, true); cb(); };
  load('background'); installed({ reason: 'update' }); assert.equal(writes, 0);
  installed({ reason: 'install' }); assert.equal(writes, 1);
});

test('new settings win over an in-flight initial storage read', async t => {
  const { w, feature } = setup(t);
  let finishRead;
  w.chrome.storage.sync.get = (_keys, cb) => { finishRead = cb; };
  const f = feature('theme'); const pending = f.init();
  w.chrome.storage.onChanged.emit({ darkThemeEnabled: { newValue: true } }, 'sync');
  finishRead({ darkThemeEnabled: false }); await pending;
  assert.equal(f.isEnabled(), true);
});
test('response hiding handles every wrapper and hides cleared live responses again', async t => {
  const { d, feature } = setup(t);
  const f = feature('hide_responses'); f.setEnabled(true);
  d.body.insertAdjacentHTML('beforeend', `<main>${wrapper(true)}${wrapper(true)}</main>`);
  await pause(0);
  d.querySelectorAll('.responses-wrapper').forEach(el => assert.notEqual(el.style.display, 'none'));
  d.querySelectorAll('.live-responses-table').forEach(el => el.remove());
  await pause(0);
  d.querySelectorAll('.responses-wrapper').forEach(el => assert.equal(el.style.display, 'none'));
  f.setEnabled(false);
  d.querySelectorAll('.responses-wrapper, .responses-table, h4').forEach(el => assert.equal(el.style.display, ''));
});
test('search cache refreshes after React updates path text in place', async t => {
  const { d, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  const f = feature('search'); f.setEnabled(true);
  const results = d.querySelector('ul'); f.performSearch('pets', results);
  d.querySelector('.opblock-summary-path').firstChild.data = '/pets/changed';
  await pause(0); f.performSearch('pets', results);
  assert.match(results.textContent, /pets\/changed/);
});

test('destroy during pending initialization never restores feature UI or listeners', async t => {
  const { w, d, feature } = setup(t);
  let finishRead;
  w.chrome.storage.sync.get = (_keys, cb) => { finishRead = cb; };
  const f = feature('theme'); const pending = f.init();
  f.destroy();
  finishRead({ darkThemeEnabled: true }); await pending;
  assert.equal(f.isEnabled(), false);
  assert.equal(d.querySelector('link'), null);
  assert.equal(w.chrome.runtime.onMessage.listeners.size, 0);
  assert.equal(w.chrome.storage.onChanged.listeners.size, 0);
});

test('scroll control handles threshold, keyboard and cancellation on disable', async t => {
  const { w, d, feature } = setup(t);
  const calls = []; w.scrollTo = (...args) => calls.push(args);
  const f = feature('scroll_top'); f.setEnabled(true);
  const button = d.querySelector('#swagger-scroll-top');
  assert.equal(button.style.display, 'none');
  w.scrollY = 150; w.dispatchEvent(new w.Event('scroll')); await pause(25);
  assert.equal(button.style.display, 'none');
  w.scrollY = 151; w.dispatchEvent(new w.Event('scroll')); await pause(25);
  assert.equal(button.style.display, 'flex');
  assert.equal(button.getAttribute('aria-hidden'), 'false');
  for (const key of ['Enter', ' ']) {
    const event = new w.KeyboardEvent('keydown', { key, cancelable: true });
    button.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  }
  button.click(); assert.equal(calls.length, 3);
  assert.equal(calls[0][0].top, 0);
  w.dispatchEvent(new w.Event('scroll')); f.setEnabled(false); await pause(25);
  assert.equal(d.querySelector('#swagger-scroll-top'), null);
  assert.equal(f.isVisible, false);
  f.setEnabled(true); assert.equal(d.querySelectorAll('#swagger-scroll-top').length, 1);
});

test('schemas preserve originally collapsed sections and ignore late mounts after disable', async t => {
  const { d, feature } = setup(t);
  const f = feature('hide_schemas'); f.setEnabled(true); f.setEnabled(false);
  d.body.innerHTML = '<section class="models is-open"><button class="models-control"></button></section><section class="models"><button class="models-control"></button></section>';
  const sections = [...d.querySelectorAll('section')];
  sections.forEach(section => section.querySelector('button').onclick = () => section.classList.toggle('is-open'));
  await pause(0); assert.equal(sections[0].classList.contains('is-open'), true);
  f.setEnabled(true);
  assert.equal(sections[0].classList.contains('is-open'), false);
  f.setEnabled(false);
  assert.equal(sections[0].classList.contains('is-open'), true);
  assert.equal(sections[1].classList.contains('is-open'), false);
  assert.equal(d.querySelector('[data-collapsed-by-addon]'), null);
});

test('search Escape and outside click cancel queued results and index refresh cannot reopen them', async t => {
  const { w, d, feature } = setup(t, `<div class="swagger-ui">${route()}</div>`);
  feature('search').setEnabled(true);
  const input = d.querySelector('input'), results = d.querySelector('ul');
  for (const dismiss of [() => input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })), () => d.body.click()]) {
    input.value = 'pets'; input.dispatchEvent(new w.Event('input')); dismiss();
    d.dispatchEvent(new w.Event('swagger-enhancer:search-changed'));
    await pause(180);
    assert.equal(results.style.display, 'none');
  }
  input.focus(); assert.equal(results.style.display, 'block');
});

test('search caps result count and cache while escaping all displayed metadata', t => {
  const { d, feature } = setup(t, '<div class="swagger-ui"></div>');
  const f = feature('search'); f.setEnabled(true);
  const entries = Array.from({ length: 25 }, (_, i) => ({ type: 'route', method: 'GET', path: `/pets/${i}`, desc: '<img src=x onerror=alert(1)>' }));
  f.getSearchEntries = () => entries;
  const results = d.querySelector('ul'); f.performSearch('PETS', results);
  assert.equal(results.children.length, 10);
  assert.equal(results.querySelector('img'), null);
  assert.match(results.textContent, /<img/);
  for (let i = 0; i < 110; i++) f.performSearch(`query${i}`, results);
  assert.equal(f.searchCache.size, 100);
  assert.equal(f.searchCache.has('pets'), false);
});

test('every popup toggle persists its matching setting and message; failed writes revert', async t => {
  const { w, d, load } = setup(t, fs.readFileSync(path.join(root, 'popup.html'), 'utf8'));
  const writes = [], messages = [];
  let fail = false;
  w.console.error = () => {};
  w.chrome.storage.sync.set = (value, cb) => {
    if (fail) w.chrome.runtime.lastError = { message: 'quota exceeded' };
    else writes.push(value);
    cb(); delete w.chrome.runtime.lastError;
  };
  w.chrome.tabs = { query: (_query, cb) => cb([{ id: 7 }]), sendMessage: (id, message, cb) => { assert.equal(id, 7); messages.push(message); cb(); } };
  load('popup'); await pause(0);
  const config = [
    ['toggle', 'darkThemeEnabled', 'TOGGLE_THEME'],
    ['searchToggle', 'swaggerSearchEnabled', 'TOGGLE_SEARCH'],
    ['favoritesToggle', 'swaggerFavoritesEnabled', 'TOGGLE_FAVORITES'],
    ['scrollTopToggle', 'scrollTopEnabled', 'TOGGLE_SCROLL_TOP'],
    ['hideResponsesToggle', 'hideResponsesEnabled', 'TOGGLE_HIDE_RESPONSES'],
    ['hideSchemasToggle', 'hideSchemasEnabled', 'TOGGLE_HIDE_SCHEMAS'],
    ['authorizeInHeaderToggle', 'authorizeInHeaderEnabled', 'TOGGLE_AUTHORIZE_IN_HEADER'],
    ['copyFullUrlToggle', 'copyFullUrlEnabled', 'TOGGLE_COPY_FULL_URL']
  ];
  for (const [id, key, type] of config) {
    const toggle = d.getElementById(id); assert.equal(toggle.checked, false);
    toggle.checked = true; toggle.dispatchEvent(new w.Event('change')); await pause(0);
    assert.equal(writes.at(-1)[key], true); assert.equal(messages.at(-1).type, type);
    assert.equal(messages.at(-1).enabled, true);
  }
  assert.equal(writes.length, 8); assert.equal(messages.length, 8);
  fail = true;
  const toggle = d.getElementById('toggle'); toggle.checked = false; toggle.dispatchEvent(new w.Event('change')); await pause(0);
  assert.equal(toggle.checked, true);
  assert.equal(d.getElementById('container').classList.contains('dark'), true);
  assert.equal(messages.length, 8);
});

test('factory adapter preserves host options, statics, receiver and plugin instance', t => {
  const { w, load } = setup(t);
  let seen, receiver;
  const factory = function (...args) { seen = args; receiver = this; return 'host-result'; };
  factory.presets = { apis: {} };
  w.SwaggerUIBundle = factory; load('favorites_bridge');
  const hostPlugin = () => ({}), options = { plugins: [hostPlugin], layout: 'CustomLayout' }, context = {};
  assert.equal(w.SwaggerUIBundle.call(context, options, 'extra'), 'host-result');
  assert.equal(receiver, context); assert.equal(seen[1], 'extra');
  assert.equal(seen[0].layout, 'CustomLayout');
  assert.equal(seen[0].plugins[0], hostPlugin);
  assert.equal(options.plugins.length, 1, 'host configuration is not mutated');
  assert.equal(w.SwaggerUIBundle.presets, factory.presets);
  assert.equal(seen[0].plugins[1](), seen[0].plugins[1](), 'afterLoad and selector wrappers share cache');
  assert.equal(w.SwaggerUIBundle(null), 'host-result'); assert.equal(seen[0], null);
});

test('virtual operations remount only when virtual DOM first appears or returns', t => {
  const { w, load } = setup(t);
  let plugin;
  w.SwaggerUIBundle = options => { plugin = options.plugins.at(-1)(); };
  load('favorites_bridge'); w.SwaggerUIBundle({});
  const refs = [], effects = []; let cursor, generation = 0, remounts = 0, virtual = false;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: initial => refs[cursor++] ||= { current: initial },
    useState: () => [generation, update => { generation = update(generation); remounts++; }],
    useLayoutEffect: effect => effects.push(effect)
  };
  const Original = () => {}, Component = plugin.wrapComponents.operations(Original, { React });
  const render = () => {
    cursor = 0; const tree = Component({ marker: 'host' });
    tree.props.ref.current = { querySelector: () => virtual ? {} : null };
    effects.splice(0).forEach(effect => effect());
    assert.equal(tree.children[0].type, Original);
    assert.equal(tree.children[0].props.marker, 'host');
  };
  render(); assert.equal(remounts, 0);
  virtual = true; render(); assert.equal(remounts, 1);
  for (let i = 0; i < 100; i++) render();
  assert.equal(remounts, 1, 'ordinary scroll updates keep the same component');
  virtual = false; render(); virtual = true; render(); assert.equal(remounts, 2);
});

test('all authorization actions retain arguments/results and announce changes after completion', async t => {
  const { w, d, load } = setup(t);
  let plugin, changes = 0;
  w.SwaggerUIBundle = options => { plugin = options.plugins.at(-1)(); };
  load('favorites_bridge'); w.SwaggerUIBundle({});
  d.addEventListener('swagger-enhancer:auth-changed', () => changes++);
  for (const name of ['authorize', 'authorizeOauth2', 'logout', 'restoreAuthorization']) {
    const result = {}, args = [{ clientId: 'client' }, 'extra'];
    let seen;
    const wrapped = plugin.statePlugins.auth.wrapActions[name]((...value) => { seen = value; return result; });
    const before = changes;
    assert.equal(wrapped(...args), result); assert.deepEqual(seen, args);
    assert.equal(changes, before); await pause(0); assert.equal(changes, before + 1);
  }
});

test('authorization styles align icon spacing and only override native controls when enabled', t => {
  const { w, d } = setup(t, '<div class="swagger-ui"><button class="btn authorize swagger-native-authorize"><svg></svg><span>Authorize</span></button></div><button id="swagger-header-authorize"><svg></svg><span>Authorize</span></button>');
  const style = d.createElement('style');
  style.textContent = '.swagger-ui .btn.authorize svg { color: rgb(73, 204, 144); } .swagger-ui .btn.authorize span { padding-right: 20px; }\n' + fs.readFileSync(path.join(root, 'css/authorize.css'), 'utf8');
  d.head.appendChild(style);
  const native = d.querySelector('.authorize'), header = d.querySelector('#swagger-header-authorize');
  assert.equal(w.getComputedStyle(native.querySelector('svg')).color, 'rgb(73, 204, 144)');
  assert.equal(w.getComputedStyle(native.querySelector('span')).paddingRight, '20px');
  d.body.classList.add('swagger-authorization-enabled');
  assert.equal(w.getComputedStyle(native.querySelector('svg')).color, 'inherit');
  assert.equal(w.getComputedStyle(native.querySelector('span')).paddingRight, '0px');
  for (const property of ['gap', 'padding', 'lineHeight', 'alignItems']) {
    assert.equal(w.getComputedStyle(native)[property], w.getComputedStyle(header)[property], property);
  }
  d.body.classList.remove('swagger-authorization-enabled');
  assert.equal(w.getComputedStyle(native.querySelector('svg')).color, 'rgb(73, 204, 144)');
});

function copyURLControl(t, url, enabled = true) {
  const context = setup(t, '', {}, url);
  const { w, load } = context;
  let plugin;
  w.SwaggerUIBundle = options => { plugin = options.plugins.at(-1)(); };
  load('favorites_bridge'); w.SwaggerUIBundle({});
  const statuses = [], updates = [], hooks = [], effects = [], timers = new Map();
  let cursor = 0, operation = null, nextTimer = 1;
  const feature = context.feature('copy_url'); feature.setEnabled(enabled);
  // A small hook harness lets feedback rerender and cleans effects exactly once.
  // Timers are controlled explicitly, so a 2-second confirmation adds no test delay.
  w.setTimeout = callback => { const id = nextTimer++; timers.set(id, callback); return id; };
  w.clearTimeout = id => timers.delete(id);
  t.after(() => hooks.forEach(hook => hook?.cleanup?.()));
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props, children: children.filter(child => child != null) }),
    createContext: () => ({ Provider: Symbol('Provider') }),
    useContext: () => operation,
    useRef: value => hooks[cursor++] ||= { current: value },
    useState: value => {
      const slot = cursor++;
      hooks[slot] ||= { value };
      return [hooks[slot].value, next => {
        hooks[slot].value = next;
        (typeof value === 'boolean' ? updates : statuses).push(next);
      }];
    },
    useLayoutEffect: (effect, dependencies) => {
      const slot = cursor++, previous = hooks[slot];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects.push(() => { previous?.cleanup?.(); hooks[slot] = { dependencies, cleanup: effect() }; });
      }
    }
  };
  const Original = () => {};
  const Wrapped = plugin.wrapComponents.CopyToClipboardBtn(Original, { React });
  const Component = props => {
    cursor = 0; const tree = Wrapped(props); effects.splice(0).forEach(effect => effect()); return tree;
  };
  return { ...context, Original, Component, statuses, updates, copyFeature: feature,
    setOperation: value => { operation = { get: key => value[key] }; },
    summary: props => plugin.wrapComponents.OperationSummary(Original, { React })(props),
    expire: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    dispose: () => hooks.forEach(hook => hook?.cleanup?.()) };

}

test('full URL setting is off by default and sync toggles restore the original component', async t => {
  const { w, d, Component, Original, copyFeature, updates } = copyURLControl(t, undefined, false);
  await copyFeature.init();
  const props = { textToCopy: '/pets' };
  assert.equal(Component(props).type, Original);
  assert.equal(d.querySelector('link[href$="copy_url.css"]'), null);
  w.chrome.storage.onChanged.emit({ copyFullUrlEnabled: { newValue: true } }, 'sync');
  assert.equal(updates.at(-1), true);
  assert.equal(Component(props).children[0].type, 'button');
  assert.ok(d.querySelector('link[href$="copy_url.css"]'));
  w.chrome.runtime.onMessage.emit({ type: 'TOGGLE_COPY_FULL_URL', enabled: false });
  assert.equal(updates.at(-1), false);
  assert.equal(Component(props).type, Original);
  assert.equal(Component(props).props, props);
  assert.equal(d.querySelector('link[href$="copy_url.css"]'), null);
  copyFeature.setEnabled(true);
  assert.equal(Component(props).children[0].type, 'button');
  const states = [];
  d.addEventListener('swagger-enhancer:copy-url-ui', event => states.push(event.detail));
  d.dispatchEvent(new w.Event('swagger-enhancer:favorites-ready'));
  assert.equal(states.at(-1), 'true', 'late Swagger initialization receives the setting');
  copyFeature.destroy();
  const count = states.length;
  d.dispatchEvent(new w.Event('swagger-enhancer:favorites-ready'));
  assert.equal(states.length, count, 'destroy removes the ready listener');
  assert.equal(Component(props).type, Original);
});

test('full URL copy sits before the native path control and preserves route templates and query', async t => {
  const { w, Component, Original, statuses } = copyURLControl(t);
  const copied = []; w.navigator.clipboard = { writeText: async text => copied.push(text) };
  let prevented = 0, stopped = 0;
  for (const path of ['/api/pets/{pet_id}', '/api/pets?active=true', '//literal/path', '/']) {
    const props = { textToCopy: path, marker: 'host' };
    const tree = Component(props), [button, native] = tree.children;
    assert.equal(button.type, 'button'); assert.equal(button.props.type, 'button');
    assert.equal(button.props['aria-label'], 'Copy full URL to clipboard');
    assert.equal(native.type, Original); assert.equal(native.props, props);
    await button.props.onClick({ preventDefault: () => prevented++, stopPropagation: () => stopped++ });
    assert.equal(copied.at(-1), 'https://example.test' + path);
    assert.equal(statuses.at(-1).ok, true);
  }
  assert.equal(prevented, 4); assert.equal(stopped, 4);
  assert.equal(Component({ textToCopy: 'non-route text' }).type, Original);
  assert.equal(Component({}).type, Original);
});

test('full URL copy uses the current host and port after a route rerender', async t => {
  const { w, Component } = copyURLControl(t, 'http://localhost:8080/docs');
  w.history.replaceState(null, '', '/nested/docs?token=private#operation');
  const copied = []; w.navigator.clipboard = { writeText: async text => copied.push(text) };
  for (const path of ['/before', '/after']) {
    await Component({ textToCopy: path }).children[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  }
  assert.deepEqual(copied, ['http://localhost:8080/before', 'http://localhost:8080/after']);
});

test('clipboard fallback restores focus and selection and reports copy failure honestly', async t => {
  const { w, d, Component, statuses } = copyURLControl(t);
  d.body.innerHTML = '<button>Original focus</button><p>Selected text</p>';
  const focused = d.querySelector('button'); focused.focus();
  const range = d.createRange(); range.selectNodeContents(d.querySelector('p'));
  w.getSelection().removeAllRanges();
  w.getSelection().addRange(range);
  assert.equal(w.getSelection().toString(), 'Selected text');
  w.navigator.clipboard = { writeText: async () => { throw new Error('denied'); } };
  let copied;
  d.execCommand = command => { assert.equal(command, 'copy'); copied = d.activeElement.value; return true; };
  const button = Component({ textToCopy: '/api/pets/{id}' }).children[0];
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(copied, 'https://example.test/api/pets/{id}');
  assert.equal(d.activeElement, focused); assert.equal(w.getSelection().toString(), 'Selected text');
  assert.equal(d.querySelector('textarea'), null); assert.equal(statuses.at(-1).ok, true);
  delete w.navigator.clipboard;
  d.execCommand = () => false;
  await button.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(statuses.at(-1).ok, false);
  assert.equal(d.activeElement, focused); assert.equal(d.querySelector('textarea'), null);
  assert.match(Component({ textToCopy: '/api/pets/{id}' }).children[0].props.className, /is-copy-error/);
});

test('copy success turns blue with a visible confirmation until its timer expires', async t => {
  const { w, Component, expire } = copyURLControl(t);
  let finish;
  w.navigator.clipboard = { writeText: () => new Promise(resolve => { finish = resolve; }) };
  const props = { textToCopy: '/pets' };
  const pending = Component(props).children[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.doesNotMatch(Component(props).children[0].props.className, /is-copied/);
  finish(); await pending;
  const button = Component(props).children[0];
  assert.match(button.props.className, /is-copied/);
  assert.equal(button.children[1].props.role, 'status');
  assert.equal(button.children[1].children[0], 'Copied!');
  expire();
  assert.doesNotMatch(Component(props).children[0].props.className, /is-copied/);
  assert.equal(Component(props).children[0].children.length, 1);
});

test('documentation copy uses the exact operation anchor and sits left of the full URL copy', async t => {
  const { w, Component, Original, setOperation, summary } = copyURLControl(t);
  const operationProps = { tag: 'init_data', operationId: 'init_data_get_api_v1_common_init_data_get' };
  setOperation(operationProps);
  const originalProps = { operationProps, marker: 'host-summary' };
  const provider = summary(originalProps);
  assert.equal(provider.props.value, operationProps);
  assert.equal(provider.children[0].type, Original);
  assert.equal(provider.children[0].props, originalProps);
  const copied = []; w.navigator.clipboard = { writeText: async text => copied.push(text) };
  const props = { textToCopy: '/api/v1/common/init_data' };
  const [docs, full, native] = Component(props).children;
  assert.match(docs.props.className, /swagger-copy-docs-url/);
  assert.match(full.props.className, /swagger-copy-full-url/);
  assert.equal(native.type, Original);
  await docs.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(copied.at(-1), 'https://example.test/docs#/init_data/init_data_get_api_v1_common_init_data_get');
  assert.match(Component(props).children[0].props.className, /is-copied/);
  assert.doesNotMatch(Component(props).children[1].props.className, /is-copied/);
  w.history.replaceState(null, '', '/docs?url=other-spec.json#/old/operation');
  setOperation({ tag: 'Other tag', operationId: 'generated_get' });
  await Component(props).children[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(copied.at(-1), 'https://example.test/docs?url=other-spec.json#/Other%20tag/generated_get');
});

test('late clipboard results cannot restore feedback after disabling or unmounting', async t => {
  const { w, Component, statuses, copyFeature, dispose } = copyURLControl(t);
  let finish;
  w.navigator.clipboard = { writeText: () => new Promise(resolve => { finish = resolve; }) };
  const props = { textToCopy: '/pets' };
  let pending = Component(props).children[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  copyFeature.setEnabled(false); Component(props);
  const beforeDisable = statuses.length;
  finish(); await pending; assert.equal(statuses.length, beforeDisable);
  copyFeature.setEnabled(true);
  pending = Component(props).children[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  dispose(); const beforeUnmount = statuses.length;
  finish(); await pending; assert.equal(statuses.length, beforeUnmount);
});
