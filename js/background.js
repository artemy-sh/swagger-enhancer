/** Initialize defaults on installation; updates preserve existing settings. */
(() => {
  'use strict';
  if (typeof importScripts === 'function') importScripts('site_rules.js');
  chrome.runtime.onInstalled.addListener(details => {
    if (details.reason !== 'install') return;
    chrome.storage.sync.set({
      darkThemeEnabled: false,
      swaggerSearchEnabled: true,
      swaggerFavoritesEnabled: true,
      scrollTopEnabled: true,
      hideResponsesEnabled: false,
      hideSchemasEnabled: false,
      schemaPreviewEnabled: false,
      authorizeInHeaderEnabled: false,
      copyFullUrlEnabled: false
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to set default settings:', chrome.runtime.lastError.message);
      }
    });
  });

  const sites = globalThis.SwaggerEnhancerSites;
  if (!sites || !chrome.scripting) return;
  const ids = ['swagger-enhancer-custom-ui', 'swagger-enhancer-custom-main'];
  let queue = Promise.resolve();
  const configure = async rules => {
    const manifest = chrome.runtime.getManifest();
    const patterns = [...new Set(rules.filter(rule => !sites.DEFAULTS.includes(rule)).map(sites.chromePattern))];
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids });
    if (!patterns.length) {
      if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(script => script.id) });
      return;
    }
    const scripts = manifest.content_scripts.map((entry, index) => ({
      id: ids[index], matches: patterns, excludeMatches: [...sites.DEFAULTS],
      js: entry.js, ...(entry.css ? { css: entry.css } : {}),
      runAt: entry.run_at, world: entry.world || 'ISOLATED', persistAcrossSessions: true
    }));
    const present = new Set(existing.map(script => script.id));
    const added = scripts.filter(script => !present.has(script.id));
    const updated = scripts.filter(script => present.has(script.id));
    if (added.length) await chrome.scripting.registerContentScripts(added);
    if (updated.length) await chrome.scripting.updateContentScripts(updated);
  };
  const enqueue = work => {
    const task = queue.then(work);
    queue = task.catch(() => {});
    return task;
  };
  const read = () => new Promise((resolve, reject) => {
    chrome.storage.sync.get([sites.KEY], result => chrome.runtime.lastError
      ? reject(new Error(chrome.runtime.lastError.message)) : resolve(sites.resolve(result[sites.KEY])));
  });
  const refresh = () => enqueue(async () => configure(await read())).catch(error => console.warn('Could not register Swagger sites:', error.message));
  refresh();
  chrome.runtime.onStartup?.addListener(refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.hasOwn(changes, sites.KEY)) refresh();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'SAVE_SWAGGER_SITE_RULES' || sender.url !== chrome.runtime.getURL('popup.html')) return;
    enqueue(async () => {
      const rules = sites.normalize(message.rules);
      await configure(rules);
      try {
        await new Promise((resolve, reject) => chrome.storage.sync.set({ [sites.KEY]: rules }, () =>
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
      } catch (error) {
        await configure(await read());
        throw error;
      }
      return { ok: true, rules };
    }).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  });
})();
