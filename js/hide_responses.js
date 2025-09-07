/**
 * Hide responses functionality for Swagger Enhancer
 * Refactored to use BaseFeature architecture
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'hideResponsesEnabled';

  /**
   * Hide responses feature class extending BaseFeature
   */
  class HideResponsesFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
    constructor(storageKey, cssFile = null, options = {}) {
      this.storageKey = storageKey;
      this.cssFile = cssFile;
      this.cssId = cssFile ? `swagger-${storageKey}-style` : null;
      this.enabled = false;
      this.observer = null;
      this.options = { autoInit: true, debug: false, ...options };
      this.messageType = options.messageType || `TOGGLE_${storageKey.toUpperCase()}`;
    }
    async init() {
      try {
        if (this.options.debug) console.log(`[${this.constructor.name}] Initializing...`);
        const result = await this.getStorage([this.storageKey]);
        this.setEnabled(result[this.storageKey] === true);
        this.setupMessageListener();
        if (this.options.debug) console.log(`[${this.constructor.name}] Initialized successfully`);
      } catch (error) {
        console.error(`[${this.constructor.name}] Initialization failed:`, error);
        throw error;
      }
    }
    setEnabled(enabled) {
      if (this.enabled === enabled) return;
      this.enabled = enabled;
      if (enabled) this.enable();
      else this.disable();
    }
    enable() {
      if (this.options.debug) console.log(`[${this.constructor.name}] Enabling...`);
      if (this.cssFile) this.injectCSS(this.cssFile, this.cssId);
      this.onEnable();
    }
    disable() {
      if (this.options.debug) console.log(`[${this.constructor.name}] Disabling...`);
      if (this.cssId) this.removeCSS(this.cssId);
      this.cleanup();
      this.onDisable();
    }
    cleanup() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }
    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === this.messageType) {
          this.setEnabled(message.enabled === true);
        }
      });
    }
    onEnable() {}
    onDisable() {}
    isEnabled() { return this.enabled; }
    toggle() { this.setEnabled(!this.enabled); }
    async getStorage(keys) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(keys, (result) => {
          resolve(chrome.runtime.lastError ? {} : result);
        });
      });
    }
    injectCSS(cssFile, id) {
      if (document.getElementById(id)) return true;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(cssFile);
      document.head.appendChild(link);
      return true;
    }
    removeCSS(id) {
      const element = document.getElementById(id);
      if (element) element.remove();
    }
  }) {
    constructor() {
      super(STORAGE_KEY, null, {
        messageType: 'TOGGLE_HIDE_RESPONSES',
        debug: false
      });
    }

    onEnable() {
      this.initialHide();
      this.startObserver();
    }

    onDisable() {
      this.stopObserver();
      this.restoreEverything();
    }

    // === Response Hiding Logic ===

    /**
     * Hide an entire `.responses-wrapper` and mark it as processed
     */
    hideWrapper(wrapper) {
      if (!wrapper || wrapper.dataset.hiddenByAddon === '1') return;

      wrapper.dataset.hiddenByAddon = '1';
      wrapper.style.display = 'none';

      const header = wrapper.querySelector(':scope > .opblock-section-header');
      if (header) header.style.display = 'none';
    }

    /**
     * Reveal wrapper that now contains a live response and
     * keep only the dynamic part visible
     */
    revealLiveResponse(wrapper) {
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

      // Hide any inner "Responses" <h4>
      wrapper
        .querySelectorAll('h4')
        .forEach((h4) => {
          if (h4.textContent.trim() === 'Responses') h4.style.display = 'none';
        });
    }

    /**
     * First pass: hide everything already in the DOM
     */
    initialHide() {
      document.querySelectorAll('.responses-wrapper').forEach(wrapper => {
        this.hideWrapper(wrapper);
      });
    }

    /**
     * Undo all hiding (used when the feature is turned off)
     */
    restoreEverything() {
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
    }

    // === Observer Management ===

    startObserver() {
      if (this.observer) return;

      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            this.handleNode(node);
          });
        });
      });

      this.observer.observe(document.body, { 
        childList: true, 
        subtree: true 
      });
    }

    stopObserver() {
      this.observer?.disconnect();
      this.observer = null;
    }

    /**
     * Process added/changed nodes from the MutationObserver
     */
    handleNode(node) {
      if (node.nodeType !== 1) return;

      // New wrappers
      if (node.matches('.responses-wrapper')) {
        this.hideWrapper(node);
      } else {
        node.querySelectorAll?.('.responses-wrapper').forEach(wrapper => {
          this.hideWrapper(wrapper);
        });
      }

      // Live response table appeared
      const live =
        node.matches?.('.live-responses-table')
          ? node
          : node.querySelector?.('.live-responses-table');

      if (live) this.revealLiveResponse(live.closest('.responses-wrapper'));
    }
  }

  // Export class to global scope
  window.HideResponsesFeature = HideResponsesFeature;

  // Don't auto-initialize - let main.js handle it

})();
