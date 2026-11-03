/** Resolve schema links against the full spec before scrolling Swagger's virtual list. */
(() => {
  'use strict';

  const parseLink = value => {
    try {
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return null;
      const [fragment, directive] = url.hash.slice(1).split(':~:');
      const reference = fragment.match(/^(?:\/components\/schemas\/|\/definitions\/|model-)(.+)$/);
      if (reference) {
        const name = decodeURIComponent(reference[1]);
        return { name: fragment.startsWith('model-') ? name : name.replace(/~1/g, '/').replace(/~0/g, '~'), exact: true };
      }
      // Split before decoding, since schema names can contain encoded commas.
      const text = directive?.split('&').find(part => part.startsWith('text='))?.slice(5);
      if (!text) return null;
      const terms = text.split(',');
      if (terms[0].endsWith('-')) terms.shift();
      if (terms.at(-1)?.startsWith('-')) terms.pop();
      if (terms.length !== 1) return null;
      const name = decodeURIComponent(terms[0]);
      return name ? { name, exact: false } : null;
    } catch {
      return null;
    }
  };

  window.SwaggerEnhancerSchemaNavigation = {
    attach(system) {
      let frame = 0;
      let pending = null;
      let destroyed = false;
      const disposers = [];
      const listen = (target, name, handler, options) => {
        target.addEventListener(name, handler, options);
        disposers.push(() => target.removeEventListener(name, handler, options));
      };
      const cancel = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        pending = null;
      };
      const entries = () => {
        const selectors = system.specSelectors;
        const modern = selectors.isOAS31?.() || selectors.isOAS32?.();
        if (modern && selectors.selectSchemas) return Object.entries(selectors.selectSchemas() || {});
        const definitions = selectors.definitions?.();
        return definitions?.entrySeq?.().toArray() || [];
      };
      const resolve = (query, schemas = entries()) => {
        const matches = schemas.map(([name, schema], index) => ({ name, schema, index })).filter(entry => {
          if (query.exact) return entry.name === query.name;
          const title = entry.schema?.get?.('title') ?? entry.schema?.title;
          const lower = query.name.toLocaleLowerCase();
          return entry.name.toLocaleLowerCase() === lower || (typeof title === 'string' && title.toLocaleLowerCase() === lower);
        });
        return matches.length === 1 ? { ...matches[0], count: schemas.length } : null;
      };
      const modelControl = row => {
        const selector = 'article[data-json-schema-level="0"], .model-container[data-name]';
        const model = row.matches(selector) ? row : row.querySelector(selector);
        if (model?.matches('article')) {
          const button = model.querySelector(':scope > .json-schema-2020-12-head > button.json-schema-2020-12-accordion');
          return { button, collapsed: model.querySelector(':scope > .json-schema-2020-12-body')?.classList.contains('json-schema-2020-12-body--collapsed') };
        }
        const button = model?.querySelector('button.model-box-control');
        return { button, collapsed: button?.getAttribute('aria-expanded') === 'false' };
      };
      const step = () => {
        frame = 0;
        if (!pending || destroyed) return;
        const request = pending;
        // A slow spec fetch can resume this bounded job through refresh().
        if (++request.attempts > 180) return;
        try {
          const schemas = entries();
          const target = resolve(request.query, schemas);
          if (!target && schemas.length) { cancel(); return; }
          const section = document.querySelector('.swagger-ui section.models');
          if (target && section) {
            if (!section.classList.contains('is-open')) {
              section.querySelector('button.models-control')?.click();
              if (!request.announced) {
                request.announced = true;
                document.dispatchEvent(new CustomEvent('swagger-enhancer:schema-opened', { detail: JSON.stringify({ name: target.name, collapsed: true }) }));
              }
              request.cooldown = 2;
            } else if (request.cooldown > 0) {
              request.cooldown--;
            } else {
              const virtual = section.classList.contains('models--virtualized');
              const row = virtual
                ? [...section.querySelectorAll('.models-virtual-item')].find(el => Number(el.dataset.index) === target.index)
                : [...section.querySelectorAll('article[data-json-schema-level="0"], .model-container[data-name]')][target.index];
              if (row) {
                const { button, collapsed } = modelControl(row);
                if (request.row !== row) {
                  request.row = row;
                  request.settled = 0;
                  row.scrollIntoView({ block: 'center', behavior: 'instant' });
                }
                if (collapsed && button) {
                  // Open only the requested model, preserving models already open.
                  if (request.opening !== button) {
                    request.opening = button;
                    button.click();
                  }
                  request.settled = 0;
                  request.cooldown = 2;
                } else if (++request.settled >= 4) {
                  // Expansion changes row height, so center its heading rather
                  // than the whole model, which can be taller than the viewport.
                  const focus = button || row.querySelector('button, [tabindex]');
                  (focus || row).scrollIntoView({ block: 'center', behavior: 'instant' });
                  focus?.focus({ preventScroll: true });
                  cancel();
                  return;
                }
              } else if (virtual) {
                const list = section.querySelector('.models-scroll');
                const rows = [...section.querySelectorAll('.models-virtual-item')];
                if (list?.clientHeight && rows.length) {
                  const max = Math.max(0, list.scrollHeight - list.clientHeight);
                  let offset;
                  // Measuring new rows changes the virtual list's total height.
                  // Old bounds can otherwise make its last schemas unreachable.
                  if (request.max !== max) {
                    request.max = max;
                    request.low = undefined;
                    request.high = max;
                  }
                  if (request.low === undefined) {
                    request.low = 0;
                    request.high = max;
                    offset = Math.min(max, list.scrollHeight * target.index / target.count);
                  } else {
                    // Binary search mounted indices, so expanded rows and variable
                    // heights do not make an estimated pixel offset unreliable.
                    const first = Number(rows[0].dataset.index);
                    const last = Number(rows.at(-1).dataset.index);
                    if (target.index < first) request.high = list.scrollTop;
                    else if (target.index > last) request.low = list.scrollTop;
                    offset = (request.low + Math.min(request.high, max)) / 2;
                  }
                  list.scrollTop = offset;
                  request.cooldown = 2;
                }
              }
            }
          }
        } catch {
          // Custom Swagger components/selectors may not support this enhancement.
          cancel();
          return;
        }
        if (pending) frame = requestAnimationFrame(step);
      };
      const navigate = query => {
        if (!query || destroyed) return;
        cancel();
        pending = { query, attempts: 0, cooldown: 0, settled: 0 };
        frame = requestAnimationFrame(step);
      };
      const refresh = () => {
        if (!pending || destroyed) return;
        const query = pending.query;
        navigate(query);
      };
      listen(document, 'click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.hasAttribute('download')) return;
        const target = link.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target');
        if (target && !['_self', '_top', '_parent'].includes(target)) return;
        const query = parseLink(link.href);
        // Preserve normal navigation, history, modifier clicks and new tabs.
        try { if (query && resolve(query)) navigate(query); }
        catch { /* Leave unsupported host selectors and their links alone. */ }
      });
      listen(document, 'swagger-enhancer:schema-inspect', event => {
        try {
          const request = JSON.parse(event.detail);
          const query = parseLink(request.href);
          const target = query && resolve(query);
          if (!target || typeof request.id !== 'string') return;
          const schema = target.schema?.toJS?.() ?? target.schema;
          document.dispatchEvent(new CustomEvent('swagger-enhancer:schema-details', { detail: JSON.stringify({ id: request.id, name: target.name, schema }) }));
        } catch { /* Unavailable or unsupported schema. */ }
      });
      listen(document, 'swagger-enhancer:schema-reveal', event => {
        try { const query = parseLink(JSON.parse(event.detail).href); if (query && resolve(query)) navigate(query); } catch { /* Unsupported target. */ }
      });
      const locationChanged = () => navigate(parseLink(location.href));
      listen(window, 'hashchange', locationChanged);
      listen(window, 'popstate', locationChanged);
      listen(document, 'pointerdown', cancel, { passive: true });
      listen(document, 'wheel', cancel, { passive: true });
      listen(document, 'touchstart', cancel, { passive: true });
      listen(document, 'keydown', event => {
        if (['Escape', 'Tab', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' '].includes(event.key)) cancel();
      });
      const navigation = window.performance?.getEntriesByType?.('navigation')?.[0]?.name;
      navigate(parseLink(location.href) || (navigation && parseLink(navigation)));
      return {
        refresh,
        cancel,
        destroy() {
          destroyed = true;
          cancel();
          disposers.forEach(dispose => dispose());
        }
      };
    }
  };
})();
