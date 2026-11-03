/** Editable URL tags, persisted only after a successful registration. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const sites = window.SwaggerEnhancerSites;
    const list = document.getElementById('swagger-site-list');
    const input = document.getElementById('swagger-site-input');
    const save = document.getElementById('swagger-site-save');
    const defaults = document.getElementById('swagger-site-defaults');
    const count = document.getElementById('swagger-site-count');
    const status = document.getElementById('swagger-site-status');
    const error = document.getElementById('swagger-site-error');
    let rules = [], loaded = false, busy = false;
    const fail = message => { error.textContent = message; error.hidden = false; };
    const clear = () => { error.textContent = ''; error.hidden = true; status.textContent = ''; };
    const render = () => {
      list.replaceChildren();
      count.textContent = `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`;
      rules.forEach((rule, index) => {
        const tag = document.createElement('span');
        tag.className = 'swagger-site-tag';
        const label = document.createElement('span');
        label.textContent = sites.label(rule);
        label.title = rule;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.disabled = busy;
        remove.setAttribute('aria-label', `Remove ${rule}`);
        remove.addEventListener('click', () => {
          rules.splice(index, 1); clear(); render();
          const next = list.querySelectorAll('button')[Math.min(index, rules.length - 1)];
          (next || input).focus();
        });
        tag.append(label, remove); list.append(tag);
      });
      input.disabled = save.disabled = defaults.disabled = !loaded || busy;
    };
    const add = text => {
      try {
        const next = text.split(/[,;\n]+/).map(value => value.trim()).filter(Boolean);
        rules = sites.normalize([...rules, ...next]);
        clear(); render(); return true;
      } catch (e) { fail(e.message); return false; }
    };
    input.addEventListener('input', () => {
      if (!input.value.includes(',')) return;
      const parts = input.value.split(',');
      const remainder = parts.pop();
      if (add(parts.join(','))) input.value = remainder;
    });
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.key !== 'Enter') return;
      event.preventDefault();
      if (add(input.value)) input.value = '';
    });
    defaults.addEventListener('click', () => { rules = [...sites.DEFAULTS]; input.value = ''; clear(); render(); });
    save.addEventListener('click', () => {
      if (busy || !loaded || !add(input.value)) return;
      input.value = ''; busy = true; render();
      try { chrome.runtime.sendMessage({ type: 'SAVE_SWAGGER_SITE_RULES', rules }, response => {
        const failure = chrome.runtime.lastError;
        busy = false;
        if (failure || !response?.ok) fail(response?.error || failure?.message || 'Could not save site rules. Try again.');
        else {
          rules = response.rules;
          status.textContent = rules.length ? 'Saved. Reload your Swagger pages to apply.' : 'Saved. No sites enabled.';
        }
        render();
      }); } catch (e) { busy = false; fail(e.message); render(); }
    });
    chrome.storage.sync.get([sites.KEY], result => {
      const failure = chrome.runtime.lastError;
      if (failure) { fail('Could not load sites. Reopen settings to retry.'); return; }
      try { rules = sites.resolve(result[sites.KEY]); loaded = true; render(); }
      catch (e) { fail(e.message); }
    });
  });
})();
