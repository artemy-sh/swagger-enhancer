// popup.js ─ manages UI switches and notifies the active Swagger tab

document.addEventListener('DOMContentLoaded', () => {
  // === Controls ===
  const themeToggle       = document.getElementById('toggle');                // dark / light
  const searchToggle      = document.getElementById('searchToggle');          // search bar
  const favoritesToggle   = document.getElementById('favoritesToggle');       // favourites
  const scrollTopToggle   = document.getElementById('scrollTopToggle');       // “scroll‑to‑top”
  const hideRespToggle    = document.getElementById('hideResponsesToggle');   // hide default responses
  const hideSchemasToggle = document.getElementById('hideSchemasToggle');     // hide schemas
  const container         = document.getElementById('container');

  // === Initial state ===
  chrome.storage.sync.get(
    [
      'darkThemeEnabled',
      'swaggerSearchEnabled',
      'swaggerFavoritesEnabled',
      'scrollTopEnabled',
      'hideResponsesEnabled',
      'hideSchemasEnabled',
    ],
    (cfg) => {
      // theme
      themeToggle.checked = !!cfg.darkThemeEnabled;
      updateTheme(themeToggle.checked);

      // other switches
      if (searchToggle)       searchToggle.checked       = !!cfg.swaggerSearchEnabled;
      if (favoritesToggle)    favoritesToggle.checked    = !!cfg.swaggerFavoritesEnabled;
      if (scrollTopToggle)    scrollTopToggle.checked    = !!cfg.scrollTopEnabled;
      if (hideRespToggle)     hideRespToggle.checked     = !!cfg.hideResponsesEnabled;
      if (hideSchemasToggle)  hideSchemasToggle.checked  = !!cfg.hideSchemasEnabled;
    },
  );

  // === Listeners ===
  themeToggle.addEventListener('change', () => {
    const enabled = themeToggle.checked;
    chrome.storage.sync.set({ darkThemeEnabled: enabled }, () => {
      updateTheme(enabled);
      notifyContent('TOGGLE_THEME', enabled);
    });
  });

  attachSimpleToggle(searchToggle,      'swaggerSearchEnabled',   'TOGGLE_SEARCH');
  attachSimpleToggle(favoritesToggle,   'swaggerFavoritesEnabled','TOGGLE_FAVORITES');
  attachSimpleToggle(scrollTopToggle,   'scrollTopEnabled',       'TOGGLE_SCROLL_TOP');
  attachSimpleToggle(hideRespToggle,    'hideResponsesEnabled',   'TOGGLE_HIDE_RESPONSES');
  attachSimpleToggle(hideSchemasToggle, 'hideSchemasEnabled',     'TOGGLE_HIDE_SCHEMAS');

  // === Helpers ===

  /**
   * Attaches a change‑handler that stores the toggle value
   * and notifies the content script.
   */
  function attachSimpleToggle(el, storageKey, msgType) {
    if (!el) return;
    el.addEventListener('change', () => {
      const enabled = el.checked;
      chrome.storage.sync.set({ [storageKey]: enabled }, () => {
        notifyContent(msgType, enabled);
      });
    });
  }

  /** Notify the active tab’s content script. */
  function notifyContent(type, enabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type, enabled });
      }
    });
  }

  /** Switch popup theme. */
  function updateTheme(isDark) {
    container.classList.toggle('dark',  isDark);
    container.classList.toggle('light', !isDark);
  }
});
