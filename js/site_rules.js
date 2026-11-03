/** Shared URL policy for the popup, content scripts and service worker. */
(() => {
  'use strict';
  const KEY = 'swaggerSiteRules';
  const DEFAULTS = Object.freeze(['*://*/*docs*', '*://*/*swagger*', '*://*/*openapi*']);
  const MAX_RULES = 20;
  const invalid = () => new Error('Enter a domain or an HTTP(S) URL pattern.');
  const parse = value => {
    if (typeof value !== 'string') throw invalid();
    value = value.trim();
    if (!value || value.length > 240 || /[\s#\\]/.test(value)) throw invalid();
    const input = value.trim().includes('://') ? value.trim() : '*://' + value.trim();
    const parts = input.match(/^(\*|https?):\/\/([^/?#]+)(\/[^#]*)?$/i);
    if (!parts) throw invalid();
    const authority = parts[2].match(/^(\[[0-9a-f:.]+\]|(?:\*\.)?[a-z0-9._-]+|\*)(?::(\d+|\*))?$/i);
    if (!authority || (authority[2] && authority[2] !== '*' && Number(authority[2]) > 65535)) throw invalid();
    const scheme = parts[1].toLowerCase();
    let host = authority[1].toLowerCase();
    const port = authority[2] && authority[2] !== '*' ? String(Number(authority[2])) : '';
    try {
      if (host !== '*') {
        const wildcard = host.startsWith('*.');
        const name = wildcard ? host.slice(2) : host;
        const parsed = new URL('https://' + name);
        if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/') throw invalid();
        host = (wildcard ? '*.' : '') + parsed.hostname;
      }
    } catch { throw invalid(); }
    let path = parts[3] || '/*';
    if (!path.includes('*')) path += '*';
    // URL encodes Unicode and keeps literal wildcard characters intact.
    try { const url = new URL('https://example.test' + path); path = url.pathname + url.search; }
    catch { throw invalid(); }
    return { scheme, host, port, path, value: `${scheme}://${host}${port ? ':' + port : ''}${path}` };
  };
  const normalize = values => {
    if (!Array.isArray(values) || values.length > 200) throw new Error(`Use up to ${MAX_RULES} site rules.`);
    const rules = [...new Set(values.map(value => parse(value).value))];
    if (rules.length > MAX_RULES) throw new Error(`Use up to ${MAX_RULES} site rules.`);
    return rules;
  };
  const resolve = values => values === undefined ? [...DEFAULTS] : normalize(values);
  const escape = value => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  let cacheKey, compiled;
  const matches = (address, values) => {
    let url;
    try { url = new URL(address); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const rules = resolve(values);
    const key = rules.join('\n');
    if (key !== cacheKey) {
      compiled = rules.map(value => { const rule = parse(value); return { ...rule, pathRE: new RegExp('^' + escape(rule.path) + '$') }; });
      cacheKey = key;
    }
    return compiled.some(rule => {
      const hostname = url.hostname.toLowerCase();
      const hostMatches = rule.host === '*' || rule.host === hostname ||
        (rule.host.startsWith('*.') && (hostname === rule.host.slice(2) || hostname.endsWith('.' + rule.host.slice(2))));
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      return (rule.scheme === '*' || rule.scheme + ':' === url.protocol) && hostMatches &&
        (!rule.port || rule.port === port) && rule.pathRE.test(url.pathname + url.search);
    });
  };
  globalThis.SwaggerEnhancerSites = Object.freeze({
    KEY, DEFAULTS, MAX_RULES, normalize, resolve, matches,
    // Registration covers all ports, the content-script guard enforces a specific port.
    chromePattern(value) { const rule = parse(value); return `${rule.scheme}://${rule.host}${rule.path}`; },
    label(value) { return value.startsWith('*://') && value.endsWith('/*') ? value.slice(4, -2) : value; }
  });
})();
