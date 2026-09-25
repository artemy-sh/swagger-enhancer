const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

// Real Swagger selectors, Immutable values and plugin registration, without a
// browser, HTTP requests or React rendering. Layout is covered by the opt-in E2E suite.
function setup(t, pkg) {
  const dom = new JSDOM('<div class="swagger-ui"></div>', {
    url: 'https://example.test/docs', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, d = w.document, features = [], errors = [];
  w.addEventListener('error', event => errors.push(event.message));
  w.chrome = { runtime: { getURL: p => `chrome-extension://test/${p}` } };
  const load = name => w.eval(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'));
  load('utils');
  w.eval(fs.readFileSync(require.resolve(pkg + '/swagger-ui-bundle.js'), 'utf8'));
  // Swagger gives each afterLoad a separate bound system. Record the bridge's
  // system so navigation/privacy spies observe the calls it actually makes.
  const factory = w.SwaggerUIBundle;
  let system;
  w.SwaggerUIBundle = options => {
    const plugin = options.plugins.at(-1)();
    const afterLoad = plugin.afterLoad;
    plugin.afterLoad = value => { system = value; afterLoad(value); };
    return factory(options);
  };
  load('favorites_bridge');
  const paths = {};
  for (let i = 0; i < 400; i++) paths[`/pets/${i}`] = { get: {
    tags: ['Group ' + Math.floor(i / 20)], summary: 'Summary ' + i,
    description: 'Description marker' + i, operationId: 'readPet' + i,
    responses: { 200: { description: 'OK' } }
  } };
  const spec = { openapi: '3.0.0', info: { title: 'Regression', version: '1' }, paths };
  w.SwaggerUIBundle({ spec, validatorUrl: null });
  const send = (name, detail) => d.dispatchEvent(new w.CustomEvent('swagger-enhancer:' + name, { detail: JSON.stringify(detail) }));
  const entries = () => {
    let result;
    d.addEventListener('swagger-enhancer:search-index', event => { result = JSON.parse(event.detail); }, { once: true });
    d.dispatchEvent(new w.Event('swagger-enhancer:search-request'));
    return result;
  };
  t.after(async () => {
    features.forEach(f => f.destroy()); await pause(); w.close();
    assert.deepEqual(errors, []);
  });
  return { w, d, system, spec, send, entries, feature(name, className) {
    load(name); const f = new w[className](); features.push(f); f.setEnabled(true); return f;
  } };
}

for (const pkg of ['swagger-ui-dist', 'swagger-ui-legacy']) {
  test(`${pkg}: favorites filter the whole spec; all/reset and disable preserve source data`, async t => {
    const { w, d, system, send, entries, feature } = setup(t, pkg);
    const original = JSON.stringify(system.specSelectors.specJson().toJS());
    w.localStorage.setItem('swaggerFavorites', JSON.stringify({ 'GET /pets/0': true, 'GET /pets/399': true }));
    const f = feature('favorites', 'FavoritesFeature');
    assert.equal(entries().filter(e => e.type === 'route').length, 400);
    d.querySelector('#swagger-fav-filter').click();
    assert.equal(w.localStorage.getItem('swaggerFavoritesFilterState'), '1');
    assert.deepEqual(entries().filter(e => e.type === 'route').map(e => e.path), ['/pets/0', '/pets/399']);
    assert.equal(entries().filter(e => e.type === 'tag').length, 2);
    d.querySelector('#swagger-fav-filter').click();
    assert.equal(entries().filter(e => e.type === 'route').length, 398);
    d.querySelector('.swagger-fav-all').click();
    assert.equal(Object.keys(JSON.parse(w.localStorage.getItem('swaggerFavorites'))).length, 400);
    assert.equal(entries().length, 0);
    d.querySelector('.swagger-fav-reset').click();
    assert.equal(entries().filter(e => e.type === 'route').length, 400);
    send('favorites-update', { enabled: true, filterState: 1 });
    assert.equal(entries().length, 0);
    f.setEnabled(false);
    assert.equal(entries().filter(e => e.type === 'route').length, 400);
    assert.equal(JSON.stringify(system.specSelectors.specJson().toJS()), original);
    await pause();
  });

  test(`${pkg}: full-spec search finds unmounted metadata and follows favorites scope`, async t => {
    const { w, d, send, feature } = setup(t, pkg);
    const f = feature('search', 'SearchFeature'), results = d.querySelector('ul');
    assert.equal(d.querySelector('.opblock'), null);
    for (const query of ['/pets/399', 'Summary 399', 'marker399', 'READPET399']) {
      f.performSearch(query, results); assert.match(results.textContent, /\/pets\/399/);
    }
    f.performSearch('Group 19', results); assert.match(results.textContent, /Group 19/);
    w.localStorage.setItem('swaggerFavorites', '{"GET /pets/0":true}');
    send('favorites-update', { enabled: true, filterState: 1 });
    f.performSearch('/pets/399', results); assert.equal(results.children.length, 0);
    send('favorites-update', { enabled: true, filterState: 2 });
    f.performSearch('/pets/399', results); assert.match(results.textContent, /\/pets\/399/);
    f.performSearch('/pets/0', results); assert.equal(results.children.length, 0);
    send('favorites-update', { enabled: false, filterState: 1 });
    f.performSearch('/pets/0', results); assert.match(results.textContent, /\/pets\/0/);
    await pause();
  });

  test(`${pkg}: equivalent selectors stay stable; a replaced spec invalidates the index`, async t => {
    const { d, system, spec, entries, send } = setup(t, pkg);
    const first = system.specSelectors.taggedOperations();
    await pause();
    let changes = 0; d.addEventListener('swagger-enhancer:search-changed', () => changes++);
    for (let i = 0; i < 50; i++) {
      send('favorites-update', { enabled: true, filterState: 0 });
      assert.equal(system.specSelectors.taggedOperations(), first);
      entries();
    }
    await pause(); assert.equal(changes, 0, 'no index refresh loop during rerenders');
    const next = { ...spec, paths: { '/new': { post: { tags: ['New'], summary: 'Replacement', responses: { 200: { description: 'OK' } } } } } };
    system.specActions.updateJsonSpec(next);
    assert.deepEqual(entries().filter(e => e.type === 'route').map(e => [e.method, e.path]), [['POST', '/new']]);
    await pause(); assert.equal(changes, 1);
  });

  test(`${pkg}: navigation revalidates scope and opens offscreen operations without executing`, t => {
    const { w, system, send } = setup(t, pkg);
    const calls = [];
    for (const action of ['show', 'scrollTo', 'scrollToVirtualizedOperation']) {
      system.layoutActions[action] = (...args) => calls.push([action, ...args]);
    }
    system.specActions.execute = () => assert.fail('search must never execute an API operation');
    w.requestAnimationFrame = () => 1; w.cancelAnimationFrame = () => {};
    const target = { type: 'route', tag: 'Group 19', path: '/pets/399', method: 'GET' };
    send('search-navigate', target);
    assert.equal(calls.length, 4);
    assert.equal(JSON.stringify(calls[1]), JSON.stringify(['show', ['operations', 'Group 19', 'readPet399'], true]));
    calls.length = 0;
    send('favorites-update', { enabled: true, filterState: 1 });
    for (const value of [target, null, {}, { ...target, method: 'POST' }, { ...target, tag: '<missing>' }]) send('search-navigate', value);
    assert.equal(calls.length, 0);
    send('favorites-update', { enabled: false, filterState: 1 });
    send('search-navigate', { type: 'tag', tag: 'Group 19' });
    assert.equal(JSON.stringify(calls[0]), JSON.stringify(['show', ['operations-tag', 'Group 19'], true]));
  });

  test(`${pkg}: malformed bridge messages do not corrupt the active filter`, t => {
    const { w, d, send, entries } = setup(t, pkg);
    w.localStorage.setItem('swaggerFavorites', '{broken');
    send('favorites-update', { enabled: true, filterState: 1 }); assert.equal(entries().length, 0);
    for (const detail of ['broken', 'null', '[]', '{"enabled":true,"filterState":3}', '{"enabled":"false","filterState":0}']) {
      d.dispatchEvent(new w.CustomEvent('swagger-enhancer:favorites-update', { detail }));
      assert.equal(entries().length, 0);
    }
    send('favorites-update', { enabled: false, filterState: 1 });
    assert.equal(entries().filter(e => e.type === 'route').length, 400);
  });

  test(`${pkg}: auth identity is opt-in, deduplicated and never reads credentials`, async t => {
    const { w, d, system, send } = setup(t, pkg);
    let reads = 0, identities;
    const auth = data => ({ get(key) {
      assert.ok(!['token', 'password', 'clientSecret', 'client_secret'].includes(key), `private field ${key}`);
      return data[key];
    } });
    system.authSelectors.authorized = () => {
      reads++;
      return [auth({ clientId: ' client ', username: 'ignored' }), auth({ client_id: 'client' }),
        auth({ schema: auth({ type: 'http', scheme: 'basic' }), value: auth({ username: 'login' }) }),
        auth({ schema: auth({ type: 'http', scheme: 'bearer' }), get value() { assert.fail('bearer value read'); } })];
    };
    d.addEventListener('swagger-enhancer:auth-identity', event => { identities = JSON.parse(event.detail); });
    const request = () => d.dispatchEvent(new w.Event('swagger-enhancer:auth-identity-request'));
    request(); assert.equal(reads, 0); assert.deepEqual(identities, []);
    send('auth-ui', true); request(); assert.deepEqual(identities, ['client', 'login']);
    send('auth-ui', false); const before = reads; request();
    assert.equal(reads, before); assert.deepEqual(identities, []);
    await pause();
  });
}
