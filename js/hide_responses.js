// hide-responses.js
//
// 1. Hide every default “Responses” block (header + static table) on load.
// 2. When a live‑response table appears, reveal its wrapper while keeping
//    the static parts hidden.
// 3. Can be enabled / disabled at runtime via Chrome storage or a runtime
//    message (`type: "TOGGLE_HIDE_RESPONSES"`).

(() => {
  const STORAGE_KEY = 'hideResponsesEnabled';
  let enabled = false;
  let observer = null;

  // === Utils ===

  /** Hide an entire `.responses-wrapper` and mark it as processed. */
  const hideWrapper = (wrapper) => {
    if (!wrapper || wrapper.dataset.hiddenByAddon === '1') return;

    wrapper.dataset.hiddenByAddon = '1';
    wrapper.style.display = 'none';

    const header = wrapper.querySelector(':scope > .opblock-section-header');
    if (header) header.style.display = 'none';
  };

  /**
   * Reveal wrapper that now contains a live response and
   * keep only the dynamic part visible.
   */
  const revealLiveResponse = (wrapper) => {
    if (!wrapper || wrapper.dataset.hiddenByAddon !== '1') return;

    delete wrapper.dataset.hiddenByAddon;
    wrapper.style.display = '';

    // Hide static header inside the wrapper
    const hdr = wrapper.querySelector(':scope > .opblock-section-header');
    if (hdr) hdr.style.display = 'none';

    // Hide static tables
    wrapper
      .querySelectorAll('table.responses-table:not(.live-responses-table)')
      .forEach((tbl) => (tbl.style.display = 'none'));

    // Hide any inner “Responses” <h4>
    wrapper
      .querySelectorAll('h4')
      .forEach((h4) => {
        if (h4.textContent.trim() === 'Responses') h4.style.display = 'none';
      });
  };

  /** First pass: hide everything already in the DOM. */
  const initialHide = () => {
    document.querySelectorAll('.responses-wrapper').forEach(hideWrapper);
  };

  /** Undo all hiding (used when the feature is turned off). */
  const restoreEverything = () => {
    // reset wrappers
    document.querySelectorAll('.responses-wrapper').forEach((wrapper) => {
      if (wrapper.dataset.hiddenByAddon === '1') {
        delete wrapper.dataset.hiddenByAddon;
        wrapper.style.display = '';
        const header = wrapper.querySelector(':scope > .opblock-section-header');
        if (header) header.style.display = '';
        wrapper
          .querySelectorAll('table.responses-table, h4')
          .forEach((el) => (el.style.display = ''));
      }
    });
  };

  /** Process added/changed nodes from the MutationObserver. */
  const handleNode = (node) => {
    if (node.nodeType !== 1) return;

    // New wrappers
    if (node.matches('.responses-wrapper')) {
      hideWrapper(node);
    } else {
      node.querySelectorAll?.('.responses-wrapper').forEach(hideWrapper);
    }

    // Live response table appeared
    const live =
      node.matches?.('.live-responses-table')
        ? node
        : node.querySelector?.('.live-responses-table');

    if (live) revealLiveResponse(live.closest('.responses-wrapper'));
  };

  const startObserver = () => {
    if (observer) return;
    observer = new MutationObserver((muts) =>
      muts.forEach((m) => m.addedNodes.forEach(handleNode)),
    );
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const stopObserver = () => {
    observer?.disconnect();
    observer = null;
  };

  // === Enable / Disable ===

  const setEnabled = (state) => {
    enabled = state;
    if (state) {
      initialHide();
      startObserver();
    } else {
      stopObserver();
      restoreEverything();
    }
  };

  // === Bootstrap ===

  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    setEnabled(res[STORAGE_KEY] === true);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_HIDE_RESPONSES') {
      chrome.storage.sync.set({ [STORAGE_KEY]: msg.enabled === true });
      setEnabled(msg.enabled === true);
    }
  });
})();
