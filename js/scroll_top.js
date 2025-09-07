/**
 * Scroll to top functionality for Swagger Enhancer
 * Provides a floating button to quickly scroll to page top
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'scrollTopEnabled';
  const BUTTON_ID = 'swagger-scroll-top';
  const SCROLL_THRESHOLD = 150;
  const SCROLL_DEBOUNCE_MS = 16; // ~60fps

  /**
   * Scroll to top feature class
   */
  class ScrollTopFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
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
    debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }
  }) {
    constructor() {
      super(STORAGE_KEY, 'css/scroll_top.css');
      this.button = null;
      this.isVisible = false;
      this.debouncedScrollHandler = (window.SwaggerEnhancerUtils?.dom?.debounce || this.debounce)(
        this.handleScroll.bind(this), 
        SCROLL_DEBOUNCE_MS
      );
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'TOGGLE_SCROLL_TOP') {
          this.setEnabled(message.enabled === true);
        }
      });
    }

    onEnable() {
      this.createButton();
      this.attachScrollListener();
      this.handleScroll(); // Initial check
    }

    onDisable() {
      this.removeButton();
      this.detachScrollListener();
    }

    /**
     * Create the scroll to top button
     */
    createButton() {
      if (this.button || document.getElementById(BUTTON_ID)) return;

      this.button = document.createElement('button');
      this.button.id = BUTTON_ID;
      this.button.className = 'swagger-scroll-top';
      this.button.title = 'Scroll to top';
      this.button.setAttribute('aria-label', 'Scroll to top');
      this.button.style.display = 'none';

      // SVG icon
      this.button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="top-arrow" aria-hidden="true" focusable="false">
          <path d="M 17.418 14.908 C 17.69 15.176 18.127 15.176 18.397 14.908 C 18.667 14.64 18.668 14.207 18.397 13.939 L 10.489 6.109 C 10.219 5.841 9.782 5.841 9.51 6.109 L 1.602 13.939 C 1.332 14.207 1.332 14.64 1.602 14.908 C 1.873 15.176 2.311 15.176 2.581 14.908 L 10 7.767 L 17.418 14.908 Z"></path>
        </svg>
      `;

      // Click handler
      this.button.addEventListener('click', this.scrollToTop.bind(this));
      
      // Keyboard handler
      this.button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.scrollToTop();
        }
      });

      document.body.appendChild(this.button);
    }

    /**
     * Remove the scroll to top button
     */
    removeButton() {
      if (this.button) {
        this.button.remove();
        this.button = null;
      }
      this.isVisible = false;
    }

    /**
     * Attach scroll event listener
     */
    attachScrollListener() {
      window.addEventListener('scroll', this.debouncedScrollHandler, { passive: true });
    }

    /**
     * Detach scroll event listener
     */
    detachScrollListener() {
      window.removeEventListener('scroll', this.debouncedScrollHandler);
    }

    /**
     * Handle scroll events
     */
    handleScroll() {
      if (!this.button) return;

      const shouldShow = window.scrollY > SCROLL_THRESHOLD;
      
      if (shouldShow !== this.isVisible) {
        this.isVisible = shouldShow;
        this.button.style.display = shouldShow ? 'flex' : 'none';
        this.button.setAttribute('aria-hidden', !shouldShow);
      }
    }

    /**
     * Scroll to top with smooth animation
     */
    scrollToTop() {
      try {
        window.scrollTo({ 
          top: 0, 
          behavior: 'smooth' 
        });
      } catch (error) {
        // Fallback for older browsers
        window.scrollTo(0, 0);
      }
    }
  }

  // Export class to global scope
  window.ScrollTopFeature = ScrollTopFeature;

  // Don't auto-initialize - let main.js handle it

})();
