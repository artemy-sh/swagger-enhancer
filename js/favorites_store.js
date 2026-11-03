/** Origin-local, specification-scoped favorites. No credentials or request values. */
(() => {
  'use strict';

  const MIGRATION_KEY = 'swaggerFavoritesMigration:v1';
  let scope = `document:${location.origin}${location.pathname}${location.search}`;
  let error = false;
  const keys = () => ({
    favorites: `swaggerFavorites:v1:${encodeURIComponent(scope)}`,
    filter: `swaggerFavoritesFilterState:v1:${encodeURIComponent(scope)}`
  });
  const map = raw => {
    try {
      const value = JSON.parse(raw || '{}');
      return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter(([, favorite]) => favorite === true)) : {};
    } catch { return {}; }
  };
  const migrate = () => {
    // Claim legacy data once, keeping the original keys as a backup. Another
    // specification on this origin must never inherit the same favorites.
    if (localStorage.getItem(MIGRATION_KEY)) return;
    const legacy = localStorage.getItem('swaggerFavorites');
    const filter = localStorage.getItem('swaggerFavoritesFilterState');
    if (legacy === null && filter === null) return;
    const current = keys();
    if (localStorage.getItem(current.favorites) === null) {
      localStorage.setItem(current.favorites, JSON.stringify(map(legacy)));
    }
    if (localStorage.getItem(current.filter) === null) {
      localStorage.setItem(current.filter, ['0', '1', '2'].includes(filter) ? filter : '0');
    }
    localStorage.setItem(MIGRATION_KEY, scope);
  };
  const read = (kind, fallback) => {
    try {
      // A full storage quota can prevent the migration marker from being saved.
      // Existing scoped data must remain readable independently of that write.
      try { migrate(); } catch { error = true; }
      return localStorage.getItem(keys()[kind]);
    }
    catch { error = true; return fallback; }
  };
  const write = (kind, value) => {
    try {
      migrate();
      localStorage.setItem(keys()[kind], value);
      error = false;
      return true;
    } catch { error = true; return false; }
  };
  window.SwaggerEnhancerFavoritesStore = {
    keys,
    get scope() { return scope; },
    get error() { return error; },
    setScope(value) { if (typeof value === 'string' && value) { scope = value; error = false; } },
    getFavorites() { return map(read('favorites', '{}')); },
    saveFavorites(value) { return write('favorites', JSON.stringify(value)); },
    getFilterState() { const value = Number(read('filter', '0')); return [0, 1, 2].includes(value) ? value : 0; },
    saveFilterState(value) { return write('filter', String(value)); }
  };
})();
