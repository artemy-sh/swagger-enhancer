/** Initialize defaults on installation; updates preserve existing settings. */
(() => {
  'use strict';
  chrome.runtime.onInstalled.addListener(details => {
    if (details.reason !== 'install') return;
    chrome.storage.sync.set({
      darkThemeEnabled: false,
      swaggerSearchEnabled: true,
      swaggerFavoritesEnabled: true,
      scrollTopEnabled: true,
      hideResponsesEnabled: false,
      hideSchemasEnabled: false
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to set default settings:', chrome.runtime.lastError.message);
      }
    });
  });
})();
