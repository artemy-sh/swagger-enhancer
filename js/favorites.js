/**
 * Favorites functionality for Swagger Enhancer
 * Refactored to use BaseFeature architecture
 */

(() => {
  'use strict';

  const FAVORITES_KEY = 'swaggerFavorites';
  const FILTER_STATE_KEY = 'swaggerFavoritesFilterState';
  const STORAGE_KEY = 'swaggerFavoritesEnabled';

  /**
   * Favorites feature class extending BaseFeature
   */
  class FavoritesFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
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
      super(STORAGE_KEY, 'css/favorites.css', {
        messageType: 'TOGGLE_FAVORITES',
        debug: false
      });
      
      this.filterState = 0;
      this.searchCache = new Map();
    }

    onEnable() {
      document.body.classList.add('swagger-fav-enabled');
      this.injectFavoritesCSS();
      this.filterState = this.getFilterState();
      this.enhanceAllSummaries();
      this.insertFavoritesFilter();
      this.startObserver();
    }

    onDisable() {
      document.body.classList.remove('swagger-fav-enabled');
      this.stopObserver();
      this.clearFavoritesUI();
    }

    // === Storage Utils ===

    getFavoritesMap() {
      try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
      } catch {
        return {};
      }
    }

    saveFavoritesMap(favorites) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    getFilterState() {
      return parseInt(localStorage.getItem(FILTER_STATE_KEY) || '0', 10);
    }

    saveFilterState(state) {
      localStorage.setItem(FILTER_STATE_KEY, String(state));
    }

    // === Route Utils ===

    getRouteKey(summaryEl) {
      const method = summaryEl.querySelector('.opblock-summary-method')?.textContent?.trim();
      const path = summaryEl.querySelector('.opblock-summary-path')?.textContent?.trim();
      return method && path ? `${method} ${path}` : null;
    }

    // === UI Components ===

    createFavoriteButton(routeKey, summaryEl, isFavorited) {
      const star = document.createElement('span');
      star.className = 'swagger-fav-star';
      star.textContent = isFavorited ? '★' : '☆';
      star.title = 'Add to favorites';
      star.style.userSelect = 'none';

      star.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const currentFavorites = this.getFavoritesMap();
        const alreadyFavorited = !!currentFavorites[routeKey];
        this.toggleFavorite(routeKey, summaryEl, alreadyFavorited);
        if (this.filterState !== 0) this.applyFavoriteFilter();
      });

      return star;
    }

    markAsFavorite(summaryEl, isFavorited) {
      summaryEl.classList.toggle('swagger-favorite', isFavorited);
      const star = summaryEl.querySelector('.swagger-fav-star');
      if (star) star.textContent = isFavorited ? '★' : '☆';
    }

    toggleFavorite(routeKey, summaryEl, isFavorited) {
      const favorites = this.getFavoritesMap();
      if (isFavorited) {
        delete favorites[routeKey];
      } else {
        favorites[routeKey] = true;
      }
      this.saveFavoritesMap(favorites);
      this.markAsFavorite(summaryEl, !isFavorited);
    }

    // === DOM Enhancement ===

    enhanceAllSummaries() {
      if (!this.enabled) return;

      const favorites = this.getFavoritesMap();
      const summaries = document.querySelectorAll('.opblock-summary');

      summaries.forEach((summary) => {
        if (summary.dataset.favApplied) return;

        const routeKey = this.getRouteKey(summary);
        if (!routeKey) return;

        const methodEl = summary.querySelector('.opblock-summary-method');
        if (!methodEl) return;

        const isFavorited = !!favorites[routeKey];
        const star = this.createFavoriteButton(routeKey, summary, isFavorited);

        methodEl.parentNode.insertBefore(star, methodEl);
        this.markAsFavorite(summary, isFavorited);
        summary.dataset.favApplied = '1';
      });

      this.applyFavoriteFilter();
    }

    clearFavoritesUI() {
      document.querySelectorAll('.swagger-fav-star').forEach(el => el.remove());
      document.querySelectorAll('.swagger-favorite').forEach(el => el.classList.remove('swagger-favorite'));
      document.querySelectorAll('.opblock-summary').forEach(el => delete el.dataset.favApplied);
      document.getElementById('swagger-fav-filter')?.remove();
      document.getElementById('swagger-fav-control')?.remove();
    }

    // === Filter Control ===

    insertFavoritesFilter() {
      if (document.getElementById('swagger-fav-filter')) return;

      const container = document.createElement('div');
      container.id = 'swagger-fav-control';
      container.classList.add('swagger-fav-control');

      const filterBtn = document.createElement('button');
      filterBtn.id = 'swagger-fav-filter';
      filterBtn.className = 'swagger-fav-filter-button';
      filterBtn.textContent = '★';
      filterBtn.type = 'button';

      const label = document.createElement('span');
      label.className = 'swagger-fav-label';
      label.style.cursor = 'pointer';

      this.updateFilterButtonStyle(filterBtn, label);

      label.addEventListener('click', () => filterBtn.click());

      filterBtn.addEventListener('click', () => {
        this.filterState = (this.filterState + 1) % 3;
        this.saveFilterState(this.filterState);
        this.updateFilterButtonStyle(filterBtn, label);
        this.applyFavoriteFilter();
      });

      const all = document.createElement('span');
      all.className = 'swagger-fav-all';
      all.textContent = 'all';
      all.style.cursor = 'pointer';
      all.style.marginRight = '8px';
      all.addEventListener('click', () => {
        const favorites = this.getFavoritesMap();
        document.querySelectorAll('.opblock-summary').forEach((summary) => {
          const routeKey = this.getRouteKey(summary);
          if (routeKey) {
            favorites[routeKey] = true;
            this.markAsFavorite(summary, true);
          }
        });
        this.saveFavoritesMap(favorites);
        this.applyFavoriteFilter();
      });

      const reset = document.createElement('span');
      reset.className = 'swagger-fav-reset';
      reset.textContent = 'reset';
      reset.style.cursor = 'pointer';
      reset.addEventListener('click', () => {
        localStorage.removeItem(FAVORITES_KEY);
        document.querySelectorAll('.opblock-summary').forEach((summary) => {
          const routeKey = this.getRouteKey(summary);
          if (routeKey) this.markAsFavorite(summary, false);
        });
        this.applyFavoriteFilter();
      });

      container.appendChild(filterBtn);
      container.appendChild(label);
      container.appendChild(all);
      container.appendChild(reset);

      const leftMenu = document.querySelector('#swagger-floating-menu .swagger-menu-left');
      if (leftMenu) {
        leftMenu.appendChild(container);
      } else {
        const menu = document.getElementById('swagger-floating-menu');
        (menu || document.body).appendChild(container);
      }
    }

    updateFilterButtonStyle(button, label) {
      button.classList.remove('state-0', 'state-1', 'state-2');
      button.classList.add(`state-${this.filterState}`);

      const titles = {
        0: 'Show all',
        1: 'Show favorites',
        2: 'Hide favorites'
      };

      button.title = titles[this.filterState];

      if (label) {
        label.textContent = titles[this.filterState];
        label.classList.remove('state-0', 'state-1', 'state-2');
        label.classList.add(`state-${this.filterState}`);
      }
    }

    applyFavoriteFilter() {
      const favorites = this.getFavoritesMap();

      document.querySelectorAll('.opblock').forEach(opblock => {
        const method = opblock.querySelector('.opblock-summary-method')?.textContent?.trim();
        const path = opblock.querySelector('.opblock-summary-path')?.textContent?.trim();
        const routeKey = method && path ? `${method} ${path}` : null;
        if (!routeKey) return;

        const isFavorite = !!favorites[routeKey];
        if (this.filterState === 0) opblock.style.display = '';
        else if (this.filterState === 1) opblock.style.display = isFavorite ? '' : 'none';
        else opblock.style.display = isFavorite ? 'none' : '';
      });

      document.querySelectorAll('.opblock-tag-section').forEach(section => {
        const hasVisible = Array.from(section.querySelectorAll('.opblock'))
          .some(opblock => opblock.style.display !== 'none');
        section.style.display = hasVisible ? '' : 'none';
      });
    }

    // === Observer ===

    startObserver() {
      const root = document.querySelector('.swagger-ui');
      if (!root || this.observer) return;

      this.enhanceAllSummaries();
      this.insertFavoritesFilter();

      const utils = window.SwaggerEnhancerUtils;
      const debouncedEnhance = utils?.dom?.debounce || ((fn, delay) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      });

      this.observer = new MutationObserver(debouncedEnhance((mutations) => {
        const shouldUpdate = mutations.some((mutation) =>
          [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
            node.nodeType === 1 && (
              node.matches?.('.opblock') || node.querySelector?.('.opblock')
            )
          ) || mutation.type === 'attributes'
        );

        if (shouldUpdate) {
          this.enhanceAllSummaries();
        }
      }, 100));

      this.observer.observe(root, {
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

    // === CSS Injection ===

    injectFavoritesCSS() {
      // CSS is already injected by BaseFeature, no need to inject again
      // This method is kept for compatibility but does nothing
    }
  }

  // Export class to global scope
  window.FavoritesFeature = FavoritesFeature;

  // Don't auto-initialize - let main.js handle it

})();
