/**
 * Theme management for Swagger Enhancer
 * Handles dark/light theme switching
 */

(() => {
  'use strict';

  const THEME_CSS_ID = 'swagger-dark-theme';
  const STORAGE_KEY = 'darkThemeEnabled';

  /**
   * Theme feature class extending base feature
   */
  class ThemeFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
    constructor(storageKey, cssFile = null) {
      this.storageKey = storageKey;
      this.cssFile = cssFile;
      this.cssId = cssFile ? `swagger-${storageKey}-style` : null;
      this.enabled = false;
      this.observer = null;
    }
    async init() {
      const result = await this.getStorage([this.storageKey]);
      this.setEnabled(result[this.storageKey] === true);
      this.setupMessageListener();
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (enabled) this.enable();
      else this.disable();
    }
    enable() {
      if (this.cssFile) this.injectCSS(this.cssFile, this.cssId);
      this.onEnable();
    }
    disable() {
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
    setupMessageListener() {}
    onEnable() {}
    onDisable() {}
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
      super(STORAGE_KEY, 'css/dark.css');
      this.cssId = THEME_CSS_ID;
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'TOGGLE_THEME') {
          this.setEnabled(message.enabled === true);
        }
      });
    }

    onEnable() {
      document.documentElement.classList.add('swagger-dark-theme');
    }

    onDisable() {
      document.documentElement.classList.remove('swagger-dark-theme');
    }
  }

  // Export class to global scope
  window.ThemeFeature = ThemeFeature;

  // Don't auto-initialize - let main.js handle it

})();
