/** Page-world adapter: filter before virtualization and expose searchable operation metadata. */
(() => {
  'use strict';

  const UPDATE = 'swagger-enhancer:favorites-update';
  const READY = 'swagger-enhancer:favorites-ready';
  const SELECT_ALL = 'swagger-enhancer:favorites-select-all';
  const SEARCH_REQUEST = 'swagger-enhancer:search-request';
  const SEARCH_INDEX = 'swagger-enhancer:search-index';
  const SEARCH_CHANGED = 'swagger-enhancer:search-changed';
  const SEARCH_NAVIGATE = 'swagger-enhancer:search-navigate';
  const FAVORITES_KEY = 'swaggerFavorites';
  const refreshers = new Set();
  let enabled = false;
  let filterState = 0;
  let revision = 0;

  const readFavorites = () => {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  };

  document.addEventListener(UPDATE, event => {
    let state;
    try { state = JSON.parse(event.detail); } catch { return; }
    if (!state || typeof state.enabled !== 'boolean' || ![0, 1, 2].includes(state.filterState)) return;
    enabled = state.enabled;
    filterState = state.filterState;
    revision++;
    refreshers.forEach(refresh => refresh());
  });

  const plugin = () => {
    let lastSource;
    let lastRevision = -1;
    let result;
    let searchSource;
    let searchIndex;
    let notificationPending = false;
    let navigationFrame;
    const publishResult = value => {
      if (result && value.equals(result)) return result;
      if (value !== result && !notificationPending) {
        notificationPending = true;
        queueMicrotask(() => {
          notificationPending = false;
          document.dispatchEvent(new Event(SEARCH_CHANGED));
        });
      }
      return (result = value);
    };
    return {
      wrapComponents: {
        operations: (Original, { React }) => function MeasuredOperations(props) {
          const root = React.useRef(null);
          const wasVirtual = React.useRef(null);
          const [generation, setGeneration] = React.useState(0);
          React.useLayoutEffect(() => {
            const isVirtual = !!root.current?.querySelector('.operations-virtual');
            // Swagger UI 5 measures its scroll origin only on mount. Async specs and
            // small -> large filtered lists can mount the virtual DOM later, leaving
            // scrollMargin at zero (or tied to a detached element). Remount once at
            // this transition so Swagger measures the real list before scrolling.
            if (isVirtual && wasVirtual.current === false) setGeneration(value => value + 1);
            wasVirtual.current = isVirtual;
          });
          return React.createElement('div', { ref: root },
            React.createElement(Original, { ...props, key: generation }));
        }
      },
      statePlugins: {
        layout: {
          actions: { swaggerEnhancerFavoritesChanged: value => ({ type: 'SWAGGER_ENHANCER_FAVORITES_CHANGED', payload: value }) },
          reducers: { SWAGGER_ENHANCER_FAVORITES_CHANGED: (state, action) => state.set('swaggerEnhancerFavoritesRevision', action.payload) }
        },
        spec: {
          wrapSelectors: {
            taggedOperations: original => (...args) => {
              // Swagger passes the spec state to selector wrappers, but the bound original takes no state argument.
              const source = original(...args.slice(1));
              // Swagger may return a new Immutable map with identical contents.
              if (lastRevision === revision && (source === lastSource || source.equals(lastSource))) return result;
              lastSource = source;
              lastRevision = revision;
              if (!enabled || filterState === 0) return publishResult(source);
              const favorites = readFavorites();
              return publishResult(source.map(tag => tag.update('operations', operations => operations.filter(op => {
                const key = `${String(op.get('method')).toUpperCase()} ${op.get('path')}`;
                const favorite = favorites[key] === true;
                return filterState === 1 ? favorite : !favorite;
              }))).filter(tag => tag.get('operations').size > 0));
            }
          }
        }
      },
      afterLoad(system) {
        refreshers.add(() => system.layoutActions.swaggerEnhancerFavoritesChanged(revision));
        document.addEventListener(SEARCH_REQUEST, () => {
          const source = system.specSelectors.taggedOperations();
          if (source !== searchSource) {
            const entries = [];
            const validMethods = system.specSelectors.validOperationMethods?.() ||
              ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
            source.forEach((group, tag) => {
              entries.push({ type: 'tag', text: tag, tag });
              group.get('operations').forEach(op => {
                const method = op.get('method');
                if (!validMethods.includes(method)) return;
                entries.push({
                  type: 'route', tag, method: method.toUpperCase(), path: op.get('path'),
                  desc: op.getIn(['operation', 'summary']) || op.getIn(['operation', 'description']) || '',
                  description: op.getIn(['operation', 'description']) || '',
                  operationId: op.getIn(['operation', '__originalOperationId']) || op.getIn(['operation', 'operationId']) || ''
                });
              });
            });
            // Only documentation metadata crosses worlds, never auth state or request values.
            searchIndex = JSON.stringify(entries);
            searchSource = source;
          }
          document.dispatchEvent(new CustomEvent(SEARCH_INDEX, { detail: searchIndex }));
        });
        document.addEventListener(SEARCH_NAVIGATE, event => {
          let target;
          try { target = JSON.parse(event.detail); } catch { return; }
          if (!target || !['route', 'tag'].includes(target.type) || typeof target.tag !== 'string') return;
          const group = system.specSelectors.taggedOperations().get(target.tag);
          if (!group) return;
          let key = ['operations-tag', target.tag];
          if (target.type === 'route') {
            const op = group.get('operations').find(op => op.get('path') === target.path &&
              String(op.get('method')).toUpperCase() === target.method);
            if (!op) return;
            const operationId = op.getIn(['operation', '__originalOperationId']) || op.getIn(['operation', 'operationId']) ||
              `${op.get('method')}${op.get('path').replace(/\W/g, '_')}`;
            key = ['operations', target.tag, operationId];
          }
          const actions = system.layoutActions;
          actions.show(['operations-tag', target.tag], true);
          actions.show(key, true);
          actions.scrollTo(key);
          actions.scrollToVirtualizedOperation?.(key);

          // Let Swagger mount/measure the target, then account for the fixed header.
          // Unlike the old DOM-only search, this also reaches initially unmounted rows.
          cancelAnimationFrame(navigationFrame);
          let attempts = 0;
          let previousTop;
          let stableFrames = 0;
          const settle = () => {
            const element = target.type === 'tag'
              ? [...document.querySelectorAll('.swagger-ui h3.opblock-tag')].find(el => el.dataset.tag === target.tag)
              : [...document.querySelectorAll('.swagger-ui .opblock')].find(el => {
                const sectionTag = el.closest('.opblock-tag-section')?.querySelector('h3.opblock-tag')?.dataset.tag;
                return (!sectionTag || sectionTag === target.tag) &&
                  el.querySelector('.opblock-summary-method')?.textContent.trim() === target.method &&
                  el.querySelector('.opblock-summary-path')?.textContent.trim() === target.path;
              });
            const top = element?.getBoundingClientRect().top;
            stableFrames = top !== undefined && top === previousTop ? stableFrames + 1 : 0;
            previousTop = top;
            if (element && stableFrames >= 3) {
              const header = document.getElementById('swagger-floating-menu')?.offsetHeight || 55;
              const previousMargin = element.style.scrollMarginTop;
              element.style.scrollMarginTop = `${header + 8}px`;
              element.scrollIntoView({ block: 'start', behavior: 'instant' });
              element.style.scrollMarginTop = previousMargin;
              return;
            }
            if (++attempts < 120) navigationFrame = requestAnimationFrame(settle);
          };
          navigationFrame = requestAnimationFrame(settle);
        });
        document.addEventListener(SELECT_ALL, () => {
          if (!enabled) return;
          system.specSelectors.taggedOperations();
          const favorites = readFavorites();
          lastSource?.forEach(tag => tag.get('operations').forEach(op => {
            favorites[`${String(op.get('method')).toUpperCase()} ${op.get('path')}`] = true;
          }));
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        });
        document.documentElement.dataset.swaggerFavoritesBridge = 'ready';
        document.dispatchEvent(new Event(READY));
      }
    };
  };

  // UMD Swagger UI assigns this factory before the host calls it, including FastAPI's lexical `const ui`.
  const wrap = factory => typeof factory !== 'function' ? factory : new Proxy(factory, {
    apply(target, receiver, args) {
      const options = args[0];
      if (!options || typeof options !== 'object') return Reflect.apply(target, receiver, args);
      // Swagger invokes plugin factories again for afterLoad; keep selector/cache state shared.
      const favoritesPlugin = plugin();
      return Reflect.apply(target, receiver, [{ ...options, plugins: [...(options.plugins || []), () => favoritesPlugin] }, ...args.slice(1)]);
    }
  });
  const descriptor = Object.getOwnPropertyDescriptor(window, 'SwaggerUIBundle');
  if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
  let factory = wrap(window.SwaggerUIBundle);
  Object.defineProperty(window, 'SwaggerUIBundle', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: () => factory,
    set: value => { factory = wrap(value); }
  });
})();
