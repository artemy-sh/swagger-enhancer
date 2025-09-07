/**
 * Hide schemas functionality for Swagger Enhancer
 * Refactored to use BaseFeature architecture
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'hideSchemasEnabled';

  /**
   * Hide schemas feature class extending BaseFeature
   */
  class HideSchemasFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
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
        messageType: 'TOGGLE_HIDE_SCHEMAS',
        debug: false
      });
    }

    onEnable() {
      this.waitForModelsAndCollapse();
    }

    onDisable() {
      this.expandSchemas();
    }

    // === Schema Collapse Logic ===

    /**
     * Collapse all schema sections
     */
    collapseSchemas() {
      document.querySelectorAll('section.models').forEach((section) => {
        const button = section.querySelector('button.models-control');
        if (button && section.classList.contains('is-open')) {
          button.click();
          section.dataset.collapsedByAddon = '1';
        }
      });
    }

    /**
     * Expand all schema sections that were collapsed by the addon
     */
    expandSchemas() {
      document.querySelectorAll('section.models').forEach((section) => {
        const button = section.querySelector('button.models-control');
        if (button && section.dataset.collapsedByAddon === '1') {
          button.click();
          delete section.dataset.collapsedByAddon;
        }
      });
    }

    // === Observer Management ===

    /**
     * Wait for models section to appear and then collapse it
     */
    waitForModelsAndCollapse() {
      const found = document.querySelector('section.models button.models-control');
      if (found) {
        this.collapseSchemas();
        this.stopObserver();
        return;
      }

      this.startObserver();
    }

    startObserver() {
      if (this.observer) return;

      this.observer = new MutationObserver(() => {
        const exists = document.querySelector('section.models button.models-control');
        if (exists) {
          this.collapseSchemas();
          this.stopObserver();
        }
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
  }

  // Export class to global scope
  window.HideSchemasFeature = HideSchemasFeature;

  // Don't auto-initialize - let main.js handle it

})();
