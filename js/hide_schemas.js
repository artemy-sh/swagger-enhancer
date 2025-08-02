// hide-schemas.js
//
// 1. Waits for .models to appear (Swagger renders it late).
// 2. Clicks the native toggle to collapse it.
// 3. Controlled via Chrome storage or a runtime message.

(() => {
  const STORAGE_KEY = 'hideSchemasEnabled';
  let observer = null;

  const collapseSchemas = () => {
    document.querySelectorAll('section.models').forEach((section) => {
      const button = section.querySelector('button.models-control');
      if (button && section.classList.contains('is-open')) {
        button.click();
        section.dataset.collapsedByAddon = '1';
      }
    });
  };

  const expandSchemas = () => {
    document.querySelectorAll('section.models').forEach((section) => {
      const button = section.querySelector('button.models-control');
      if (button && section.dataset.collapsedByAddon === '1') {
        button.click();
        delete section.dataset.collapsedByAddon;
      }
    });
  };

  const waitForModelsAndCollapse = () => {
    const found = document.querySelector('section.models button.models-control');
    if (found) {
      collapseSchemas();
      observer?.disconnect();
      observer = null;
      return;
    }

    observer = new MutationObserver(() => {
      const exists = document.querySelector('section.models button.models-control');
      if (exists) {
        collapseSchemas();
        observer.disconnect();
        observer = null;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  const setEnabled = (enabled) => {
    if (enabled) {
      waitForModelsAndCollapse();
    } else {
      expandSchemas();
    }
  };

  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    setEnabled(res[STORAGE_KEY] === true);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_HIDE_SCHEMAS') {
      chrome.storage.sync.set({ [STORAGE_KEY]: msg.enabled === true });
      setEnabled(msg.enabled === true);
    }
  });
})();
