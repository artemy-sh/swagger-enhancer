const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function policy() {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/site_rules.js'), 'utf8'), context);
  return context.SwaggerEnhancerSites;
}
test('default sites cover docs, Swagger and OpenAPI, including localhost nonstandard ports', () => {
  const sites = policy();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.deepEqual([...sites.DEFAULTS], manifest.content_scripts[0].matches);
  for (const url of ['http://localhost:5130/swagger/index.html', 'https://example.test/docs', 'https://example.test/openapi']) assert.equal(sites.matches(url), true);
  assert.equal(sites.matches('https://example.test/reference'), false);
  assert.equal(sites.matches('https://docs.example.test/'), false, 'the default matches a path, not a hostname substring');
});
test('custom domains, subdomains, paths and ports are normalized and matched precisely', () => {
  const sites = policy();
  const rules = sites.normalize([' api.example.test ', '*.internal.test', 'http://localhost:5130/reference', 'api.example.test']);
  assert.equal(rules.length, 3);
  for (const url of ['https://api.example.test/anything', 'http://internal.test/', 'https://a.internal.test/', 'http://localhost:5130/reference/index.html']) assert.equal(sites.matches(url, rules), true, url);
  for (const url of ['https://api.example.test.evil.test/', 'https://internal.test.evil.test/', 'http://localhost:5131/reference', 'https://localhost:5130/reference']) assert.equal(sites.matches(url, rules), false, url);
  assert.equal(sites.chromePattern(rules[2]), 'http://localhost/reference*');
});
test('deleting defaults and saving an empty list restricts activation without restoring defaults', () => {
  const sites = policy();
  assert.equal(sites.matches('https://example.test/swagger', ['*://*/*docs*']), false);
  assert.equal(sites.matches('https://example.test/docs', []), false);
  assert.equal(sites.resolve([]).length, 0);
  assert.equal(sites.resolve(undefined).length, 3);
  assert.equal(sites.matches('chrome://extensions/', ['*://*/*']), false);
});
test('invalid schemes, credentials, fragments and oversized lists are rejected', () => {
  const sites = policy();
  for (const rule of ['javascript:alert(1)', 'ftp://api.example.test', 'https://user:secret@api.example.test/', 'api.example.test/#secret', 'bad host', 'localhost:65536', '*bad.example.test', '']) assert.throws(() => sites.normalize([rule]), undefined, rule);
  assert.throws(() => sites.normalize(Array.from({length:21}, (_, i) => `host${i}.test`)));
  assert.equal(sites.normalize(Array(25).fill('api.example.test')).length, 1, 'duplicates do not consume the rule limit');
});

function background(t) {
  const sites = policy();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const event = () => ({ handlers: [], addListener(fn) { this.handlers.push(fn); } });
  const stored = {}, registered = new Map();
  let registrationFailure = false, writeFailure = false;
  const chrome = {
    runtime: { onInstalled:event(), onStartup:event(), onMessage:event(), getManifest:()=>manifest, getURL:p=>'chrome-extension://test/'+p },
    storage: { onChanged:event(), sync: {
      get(keys, cb) { cb(Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]]))); },
      set(values, cb) {
        if (writeFailure) { chrome.runtime.lastError={message:'Storage unavailable'}; cb(); delete chrome.runtime.lastError; return; }
        Object.assign(stored, values); cb();
        chrome.storage.onChanged.handlers.forEach(fn => fn(Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{newValue:value}])), 'sync'));
      }
    } },
    scripting: {
      async getRegisteredContentScripts() { return [...registered.values()]; },
      async registerContentScripts(scripts) { if (registrationFailure) throw new Error('Registration failed'); scripts.forEach(script => registered.set(script.id, script)); },
      async updateContentScripts(scripts) { if (registrationFailure) throw new Error('Registration failed'); scripts.forEach(script => registered.set(script.id, script)); },
      async unregisterContentScripts({ids}) { ids.forEach(id => registered.delete(id)); }
    }
  };
  const context=vm.createContext({chrome,SwaggerEnhancerSites:sites,console});
  vm.runInContext(fs.readFileSync(path.join(root,'js/background.js'),'utf8'),context);
  return {stored,registered,sites,
    failRegistration() { registrationFailure=true; }, failWrite() { writeFailure=true; },
    save(rules) { return new Promise(resolve => {
      const result=chrome.runtime.onMessage.handlers[0]({type:'SAVE_SWAGGER_SITE_RULES',rules},{url:chrome.runtime.getURL('popup.html')},resolve);
      assert.equal(result,true,'keep the asynchronous response port open until registration and saving complete');
    }); }
  };
}
test('saving custom sites registers both worlds and excludes static pages to prevent duplicate scripts', async t => {
  const b=background(t);
  const result=await b.save([...b.sites.DEFAULTS,'http://localhost:5130/reference','api.example.test']);
  assert.equal(result.ok,true);
  assert.equal(b.registered.size,2);
  const scripts=[...b.registered.values()];
  assert.equal(scripts.find(s=>s.world==='MAIN').runAt,'document_start');
  assert.equal(scripts.find(s=>s.world==='ISOLATED').css.includes('css/copy_url.css'),true);
  for (const script of scripts) {
    assert.deepEqual([...script.excludeMatches],[...b.sites.DEFAULTS]);
    assert.deepEqual([...script.matches],['http://localhost/reference*','*://api.example.test/*']);
  }
  assert.equal(b.stored[b.sites.KEY].length,5);
  assert.equal((await b.save([])).ok,true);
  assert.equal(b.registered.size,0);
  assert.equal(b.stored[b.sites.KEY].length,0);
});
test('registration failures preserve saved site rules', async t => {
  const b=background(t);
  await b.save(['first.example.test']);
  await new Promise(setImmediate); b.failRegistration();
  const result=await b.save(['second.example.test']);
  assert.equal(result.ok,false);
  assert.match(result.error,/Registration failed/);
  assert.equal(b.stored[b.sites.KEY][0],'*://first.example.test/*');
});
test('a storage failure restores the registered rules instead of applying unsaved settings', async t => {
  const b=background(t);
  await b.save(['first.example.test']); b.failWrite();
  const result=await b.save(['second.example.test']);
  assert.equal(result.ok,false);
  assert.match(result.error,/Storage unavailable/);
  assert.deepEqual([...([...b.registered.values()][0].matches)],['*://first.example.test/*']);
});
