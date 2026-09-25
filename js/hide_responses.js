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
  class HideResponsesFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super(STORAGE_KEY, null, {
        messageType: 'TOGGLE_HIDE_RESPONSES',
        debug: false
      });
    }

    onEnable() {
      this.hiddenElements = new Map();
      this.updateResponses();
      this.observer = new MutationObserver(mutations => {
        const wrappers = new Set();
        for (const mutation of mutations) {
          const parent = mutation.target.closest?.('.responses-wrapper');
          if (parent) wrappers.add(parent);
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches('.responses-wrapper')) wrappers.add(node);
            node.querySelectorAll('.responses-wrapper').forEach(wrapper => wrappers.add(wrapper));
          }
        }
        wrappers.forEach(wrapper => this.updateWrapper(wrapper));
        this.hiddenElements.forEach((display, el) => {
          if (!el.isConnected) this.hiddenElements.delete(el);
        });
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    onDisable() {
      this.hiddenElements.forEach((display, el) => { el.style.display = display; });
      this.hiddenElements.clear();
    }

    setHidden(element, hidden) {
      if (hidden) {
        if (!this.hiddenElements.has(element)) this.hiddenElements.set(element, element.style.display);
        element.style.display = 'none';
      } else if (this.hiddenElements.has(element)) {
        element.style.display = this.hiddenElements.get(element);
        this.hiddenElements.delete(element);
      }
    }

    updateResponses() {
      document.querySelectorAll('.responses-wrapper').forEach(wrapper => this.updateWrapper(wrapper));
    }

    updateWrapper(wrapper) {
      const hasLiveResponse = !!wrapper.querySelector('.live-responses-table');
      this.setHidden(wrapper, !hasLiveResponse);
      wrapper.querySelectorAll(':scope > .opblock-section-header, table.responses-table:not(.live-responses-table)')
        .forEach(el => this.setHidden(el, true));
      wrapper.querySelectorAll('h4').forEach(el => {
        if (el.textContent.trim() === 'Responses') this.setHidden(el, true);
      });
    }

  }

  // Export class to global scope
  window.HideResponsesFeature = HideResponsesFeature;

  // Don't auto-initialize - let main.js handle it

})();
