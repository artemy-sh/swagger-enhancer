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
  class HideSchemasFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super(STORAGE_KEY, 'css/hide_schemas.css', {
        messageType: 'TOGGLE_HIDE_SCHEMAS',
        debug: false
      });
    }

    async init() {
      this.initializing = true;
      try { return await super.init(); } finally { this.initializing = false; }
    }

    onEnable() {
      this.seen = new WeakSet();
      this.preserveTextNavigation = !!this.initializing && this.hasTextNavigation();
      this.toggleHandler = event => {
        if (this.collapsing) return;
        const section = event.target.closest?.('button.models-control')?.closest('section.models');
        if (section) this.seen.add(section);
      };
      this.noticeHandler = event => {
        try { const data = JSON.parse(event.detail); if (data.collapsed) this.showNotice(data.name); } catch { /* Invalid page message. */ }
      };
      document.addEventListener('click', this.toggleHandler, true);
      document.addEventListener('swagger-enhancer:schema-opened', this.noticeHandler);
      this.waitForModelsAndCollapse();
    }

    onSpecChanged() {
      this.seen = new WeakSet();
      queueMicrotask(() => { if (this.enabled && !this.destroyed) this.collapseSchemas(); });
    }

    onDisable() {
      document.removeEventListener('click', this.toggleHandler, true);
      document.removeEventListener('swagger-enhancer:schema-opened', this.noticeHandler);
      clearTimeout(this.noticeTimer);
      document.getElementById('swagger-schema-notice')?.remove();
      this.expandSchemas();
    }

    showNotice(name) {
      if (typeof name !== 'string') return;
      clearTimeout(this.noticeTimer);
      document.getElementById('swagger-schema-notice')?.remove();
      const notice = document.createElement('div');
      notice.id = 'swagger-schema-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = `Opened ${name}. Schemas are collapsed by default.`;
      document.body.appendChild(notice);
      this.noticeTimer = setTimeout(() => notice.remove(), 5000);
    }

    // === Schema Collapse Logic ===

    hasTextNavigation() {
      // Chromium hides text directives from location.href, but retains the
      // original URL in Navigation Timing. Keep models mounted so the browser
      // can find and scroll to a schema when opening a text-fragment link.
      const navigation = window.performance?.getEntriesByType?.('navigation')?.[0]?.name;
      return [window.location.href, navigation].some(value => {
        if (typeof value !== 'string') return false;
        try {
          const url = new URL(value);
          if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return false;
          const directive = url.hash.split(':~:')[1];
          return !!directive && new URLSearchParams(directive).has('text');
        } catch {
          return false;
        }
      });
    }

    /**
     * Collapse all schema sections
     */
    collapseSchemas() {
      if (this.preserveTextNavigation) return;
      document.querySelectorAll('section.models').forEach((section) => {
        const button = section.querySelector('button.models-control');
        if (!button || this.seen.has(section)) return;
        if (section.classList.contains('is-open')) {
          this.seen.add(section);
          this.collapsing = true;
          try { button.click(); } finally { this.collapsing = false; }
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
          if (!section.classList.contains('is-open')) button.click();
          delete section.dataset.collapsedByAddon;
        }
      });
    }

    // === Observer Management ===

    /**
     * Wait for models section to appear and then collapse it
     */
    waitForModelsAndCollapse() {
      this.collapseSchemas();
      this.startObserver();
    }

    startObserver() {
      if (this.observer) return;

      this.observer = new MutationObserver(() => {
        if (this.enabled) this.collapseSchemas();
      });

      this.observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
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
