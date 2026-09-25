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
