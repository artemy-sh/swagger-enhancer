/** Page-world adapter: filter before virtualization and expose searchable operation metadata. */
(() => {
  'use strict';

  // Swagger's original filled 20px lock silhouettes.
  const LOCK_PATH = 'M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8zM12 8H8V5.199C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8z';
  const UNLOCK_PATH = 'M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V6h2v-.801C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8z';
  const UPDATE = 'swagger-enhancer:favorites-update';
  const READY = 'swagger-enhancer:favorites-ready';
  const SELECT_ALL = 'swagger-enhancer:favorites-select-all';
  const SEARCH_REQUEST = 'swagger-enhancer:search-request';
  const SEARCH_INDEX = 'swagger-enhancer:search-index';
  const SEARCH_CHANGED = 'swagger-enhancer:search-changed';
  const SEARCH_NAVIGATE = 'swagger-enhancer:search-navigate';
  const AUTH_REQUEST = 'swagger-enhancer:auth-identity-request';
  const AUTH_IDENTITY = 'swagger-enhancer:auth-identity';
  const AUTH_CHANGED = 'swagger-enhancer:auth-changed';
  const AUTH_UI = 'swagger-enhancer:auth-ui';
  let authUIEnabled = false;
  const authUIListeners = new Set();
  document.addEventListener(AUTH_UI, event => {
    if (!['true', 'false'].includes(event.detail)) return;
    const next = event.detail === 'true';
    if (next === authUIEnabled) return;
    authUIEnabled = next;
    authUIListeners.forEach(refresh => refresh());
  });
  const useAuthUI = React => {
    const [active, setActive] = React.useState(authUIEnabled);
    React.useLayoutEffect(() => {
      const refresh = () => setActive(authUIEnabled);
      authUIListeners.add(refresh);
      refresh();
      return () => authUIListeners.delete(refresh);
    }, []);
    return active;
  };
  let copyURLEnabled = false;
  const copyURLListeners = new Set();
  document.addEventListener('swagger-enhancer:copy-url-ui', event => {
    if (!['true', 'false'].includes(event.detail)) return;
    const next = event.detail === 'true';
    if (next === copyURLEnabled) return;
    copyURLEnabled = next;
    copyURLListeners.forEach(refresh => refresh());
  });
  const useCopyURL = React => {
    const [active, setActive] = React.useState(copyURLEnabled);
    React.useLayoutEffect(() => {
      const refresh = () => setActive(copyURLEnabled);
      copyURLListeners.add(refresh);
      refresh();
      return () => copyURLListeners.delete(refresh);
    }, []);
    return active;
  };
  const authorizationNames = system => {
    const names = new Set();
    system.authSelectors.authorized()?.forEach(auth => {
      const schema = auth.get('schema');
      const isBasic = schema?.get('type') === 'basic' ||
        (schema?.get('type') === 'http' && schema.get('scheme') === 'basic');
      const basic = isBasic ? auth.get('value') : null;
      const candidates = [auth.get('clientId'), auth.get('client_id'), auth.get('username'),
        basic?.get?.('username') ?? basic?.username];
      const name = candidates.find(value => typeof value === 'string' && value.trim());
      if (name) names.add(name.trim());
    });
    return [...names];
  };
  const authIcon = (React, authorized) => React.createElement('svg', {
    width: 20, height: 20, viewBox: '0 0 20 20', fill: 'currentColor',
    'aria-hidden': 'true', focusable: 'false'
  }, React.createElement('path', { d: authorized ? UNLOCK_PATH : LOCK_PATH }));
  const copyText = async text => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* HTTP pages and denied clipboard access may need the legacy path. */ }
    const focused = document.activeElement;
    const selection = window.getSelection();
    const ranges = Array.from({ length: selection?.rangeCount || 0 }, (_, i) => selection.getRangeAt(i).cloneRange());
    const input = document.createElement('textarea');
    input.value = text;
    input.readOnly = true;
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(input);
    try {
      input.focus({ preventScroll: true });
      input.select();
      return document.execCommand?.('copy') === true;
    } catch {
      return false;
    } finally {
      input.remove();
      focused?.focus({ preventScroll: true });
      if (selection) {
        selection.removeAllRanges();
        ranges.forEach(range => selection.addRange(range));
      }
    }
  };
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
    let operationContext;
    const getOperationContext = React => operationContext ||= React.createContext(null);
    const authChanged = original => (...args) => {
      const value = original(...args);
      queueMicrotask(() => document.dispatchEvent(new Event(AUTH_CHANGED)));
      return value;
    };
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
        OperationSummary: (Original, { React }) => function SummaryWithCopyContext(props) {
          return React.createElement(getOperationContext(React).Provider, { value: props.operationProps },
            React.createElement(Original, props));
        },
        CopyToClipboardBtn: (Original, { React }) => function CopyRouteLinks(props) {
          const [feedback, setFeedback] = React.useState(null);
          const pending = React.useRef({ timer: null, request: 0 });
          const active = useCopyURL(React);
          const operation = React.useContext(getOperationContext(React));
          const path = props.textToCopy;
          const tag = operation?.get('tag');
          const operationId = operation?.get('operationId');
          let docsURL;
          if (typeof tag === 'string' && typeof operationId === 'string' && operationId) {
            // Use the exact tag and generated operationId used by Swagger's own DeepLink.
            const url = new URL(window.location.href);
            url.hash = '/' + `${tag}/${operationId}`.trim().replace(/\s/g, '%20');
            docsURL = url.href;
          }
          React.useLayoutEffect(() => {
            setFeedback(null);
            return () => {
              clearTimeout(pending.current.timer);
              pending.current.request++;
            };
          }, [active, path, docsURL]);
          const native = React.createElement(Original, props);
          if (!active || typeof path !== 'string' || !path.startsWith('/')) return native;
          const copyButton = (kind, text, label, icon) => {
            const state = feedback?.kind === kind ? feedback : null;
            const hint = state ? (state.ok ? 'Copied!' : 'Could not copy') : '';
            return React.createElement('button', {
              key: kind, type: 'button',
              className: `view-line-link swagger-copy-link swagger-copy-${kind}-url${state ? (state.ok ? ' is-copied' : ' is-copy-error') : ''}`,
              title: hint || label, 'aria-label': label,
              onClick: async event => {
                event.preventDefault();
                event.stopPropagation();
                const request = ++pending.current.request;
                clearTimeout(pending.current.timer);
                setFeedback(null);
                const ok = await copyText(text);
                if (request !== pending.current.request) return;
                setFeedback({ kind, ok });
                pending.current.timer = setTimeout(() => setFeedback(null), 2000);
              }
            }, React.createElement('svg', {
              width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
              stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
              strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false'
            }, React.createElement('path', { d: icon })),
            state ? React.createElement('span', { className: 'swagger-copy-hint', role: 'status' }, hint) : null);
          };
          return React.createElement(React.Fragment, null,
            docsURL ? copyButton('docs', docsURL, 'Copy documentation link', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6') : null,
            copyButton('full', window.location.origin + path, 'Copy full URL to clipboard', 'M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.7-1.7'),
            native);
        },
        authorizeBtn: (Original, system) => function NativeAuthorization(props) {
          const { React } = system;
          if (!useAuthUI(React)) return React.createElement(Original, props);
          const { isAuthorized, onClick, showPopup, getComponent } = props;
          const identity = isAuthorized ? authorizationNames(system).join(', ') : '';
          const label = isAuthorized ? `Authorized${identity ? `: ${identity}` : ''}` : 'Authorize';
          const Popup = getComponent('authorizationPopup', true);
          return React.createElement('div', { className: 'auth-wrapper' },
            React.createElement('button', {
              type: 'button',
              className: `btn authorize swagger-native-authorize ${isAuthorized ? 'locked is-authorized' : 'unlocked'}`,
              onClick, title: label, 'aria-label': label, 'aria-haspopup': 'dialog'
            }, authIcon(React, isAuthorized), React.createElement('span', null, label)),
            showPopup ? React.createElement(Popup, null) : null);
        },
        authorizeOperationBtn: (Original, { React }) => function RouteAuthorization(props) {
          if (!useAuthUI(React)) return React.createElement(Original, props);
          const { isAuthorized, onClick } = props;
          const label = isAuthorized ? 'Authorized' : 'Authorization required';
          return React.createElement('button', {
            type: 'button',
            className: `authorization__btn swagger-route-authorization${isAuthorized ? ' is-authorized' : ''}`,
            'aria-label': label, title: label,
            onClick: event => { event.stopPropagation(); onClick?.(); }
          }, authIcon(React, isAuthorized));
        },
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
        auth: {
          wrapActions: {
            authorize: authChanged,
            authorizeOauth2: authChanged,
            logout: authChanged,
            restoreAuthorization: authChanged
          }
        },
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
        document.addEventListener(AUTH_REQUEST, () => {
          // Only expose identity while the opt-in authorization feature is enabled.
          const names = authUIEnabled ? authorizationNames(system) : [];
          document.dispatchEvent(new CustomEvent(AUTH_IDENTITY, { detail: JSON.stringify(names) }));
        });
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
