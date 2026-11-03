const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

function setup(t, { schemas = { Pet: { type: 'object' } }, navigation } = {}) {
  const w = new JSDOM('<div class="swagger-ui"><section class="models is-open"><button class="models-control">Schemas</button><article data-json-schema-level="0"><button>Pet</button></article></section></div>', {
    url: 'https://example.test/docs', runScripts: 'outside-only', pretendToBeVisual: true
  }).window;
  const d = w.document, frames = new Map();
  let id = 0, scrolls = 0;
  w.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  w.cancelAnimationFrame = key => frames.delete(key);
  w.HTMLElement.prototype.scrollIntoView = () => scrolls++;
  w.performance.getEntriesByType = () => navigation ? [{ name: navigation }] : [];
  w.eval(fs.readFileSync(path.resolve(__dirname, '../js/schema_navigation.js'), 'utf8'));
  const controller = w.SwaggerEnhancerSchemaNavigation.attach({ specSelectors: {
    isOAS31: () => true, selectSchemas: () => schemas
  } });
  t.after(() => { controller.destroy(); w.close(); });
  const flush = (count = 10) => {
    for (let i = 0; i < count && frames.size; i++) {
      const jobs = [...frames.values()]; frames.clear(); jobs.forEach(fn => fn());
    }
  };
  const click = (href, options = {}) => {
    const link = d.createElement('a'); link.href = href;
    if (options.target) link.target = options.target;
    link.textContent = 'Schema'; d.body.prepend(link);
    let prevented;
    d.addEventListener('click', event => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
    link.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...options }));
    assert.equal(prevented, false, 'the enhancement preserves native link navigation');
  };
  return { w, d, frames, controller, flush, click, scrolls: () => scrolls, setSchemas(value) { schemas = value; } };
}

test('schema links resolve Chromium hidden text directives and focus the model', t => {
  const env = setup(t, { navigation: 'https://example.test/docs#:~:text=Pet,-Expand%20all' });
  env.flush();
  assert.equal(env.scrolls(), 2, 'position the model, then its heading after settling');
  assert.equal(env.d.activeElement.textContent, 'Pet');
  assert.equal(env.frames.size, 0, 'there is no idle animation loop');
});

test('schema navigation resumes after slow spec loading and stops on cleanup', t => {
  const env = setup(t, { schemas: {}, navigation: 'https://example.test/docs#:~:text=Pet' });
  env.flush(200);
  assert.equal(env.frames.size, 0, 'the initial wait is bounded');
  assert.equal(env.scrolls(), 0);
  env.setSchemas({ Pet: {} }); env.controller.refresh(); env.flush();
  assert.equal(env.scrolls(), 2);
  env.click('#:~:text=Pet');
  env.controller.destroy(); env.flush();
  assert.equal(env.scrolls(), 2, 'detached navigation cannot scroll');
});

test('schema navigation ignores external documents, ranges, malformed and ambiguous targets', t => {
  const env = setup(t, { schemas: { Pet: { title: 'Duplicate' }, Other: { title: 'Duplicate' } } });
  for (const href of ['https://other.test/docs#:~:text=Pet', '/other/docs#:~:text=Pet', '#:~:text=Pet,end', '#:~:text=%ZZ', '#:~:text=Duplicate', '#:~:text=Missing']) {
    env.click(href); env.flush();
  }
  assert.equal(env.scrolls(), 0);
});

test('schema links preserve modifier clicks and new-tab targets', t => {
  const env = setup(t);
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { target: '_blank' }]) {
    env.click('#:~:text=Pet', options); env.flush();
  }
  assert.equal(env.scrolls(), 0, 'only the destination tab should perform navigation');
});

test('schema navigation handles encoded names and JSON pointers without CSS interpolation', t => {
  const name = 'Pet/a,b~c';
  const env = setup(t, { schemas: { [name]: {} } });
  env.click('#:~:text=prefix-,Pet%2Fa%2Cb~c,-Expand%20all'); env.flush();
  assert.equal(env.scrolls(), 2);
  env.click('#/components/schemas/Pet~1a%2Cb~0c'); env.flush();
  assert.equal(env.scrolls(), 4);
});

test('manual scrolling cancels pending schema navigation', t => {
  const env = setup(t);
  env.click('#:~:text=Pet');
  env.d.dispatchEvent(new env.w.WheelEvent('wheel'));
  env.flush();
  assert.equal(env.scrolls(), 0);
  env.controller.refresh(); env.flush();
  assert.equal(env.frames.size, 0, 'spec updates cannot revive a canceled request');
});

for (const modern of [true, false]) {
  test(`${modern ? 'OpenAPI 3.1' : 'legacy model'}: navigation opens the target once and keeps nested models collapsed`, t => {
    const env = setup(t);
    const section = env.d.querySelector('section.models');
    section.classList.add('models--virtualized');
    section.querySelector('article').remove();
    const row = env.d.createElement('div'); row.className = 'models-virtual-item'; row.dataset.index = '0';
    row.innerHTML = modern
      ? '<article data-json-schema-level="0"><div class="json-schema-2020-12-head"><button class="json-schema-2020-12-accordion">Pet</button><button class="expand-all">Expand all</button></div><div class="json-schema-2020-12-body json-schema-2020-12-body--collapsed"><article data-json-schema-level="1"><button aria-expanded="false">Nested</button></article></div></article>'
      : '<div class="model-container" data-name="Pet"><button class="model-box-control" aria-expanded="false">Pet</button><button aria-expanded="false">Nested</button></div>';
    section.append(row);
    const button = row.querySelector('button'); let opens = 0;
    button.addEventListener('click', () => {
      opens++; button.setAttribute('aria-expanded','true');
      row.querySelector('.json-schema-2020-12-body')?.classList.remove('json-schema-2020-12-body--collapsed');
    });
    row.querySelector('.expand-all')?.addEventListener('click', () => assert.fail('Do not expand every nested schema'));
    for (let i = 0; i < 2; i++) {
      env.click('#/components/schemas/Pet'); env.flush(20);
      assert.equal(opens,1, 'repeated navigation never collapses an expanded model');
      assert.equal(env.d.activeElement,button);
      assert.equal(row.querySelector('button[aria-expanded="false"]').textContent,'Nested');
      assert.equal(env.frames.size,0);
    }
  });
}
