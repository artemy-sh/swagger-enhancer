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
  class FavoritesFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super(STORAGE_KEY, null, {
        messageType: 'TOGGLE_FAVORITES',
        debug: false
      });
      
      this.filterState = 0;
      this.hiddenElements = new Map();
    }

    onEnable() {
      document.body.classList.add('swagger-fav-enabled');
      this.filterState = this.getFilterState();
      this.bridgeReadyHandler = () => this.applyFavoriteFilter();
      document.addEventListener('swagger-enhancer:favorites-ready', this.bridgeReadyHandler);
      this.enhanceAllSummaries();
      this.insertFavoritesFilter();
      this.startObserver();
    }

    onDisable() {
      document.body.classList.remove('swagger-fav-enabled');
      this.stopObserver();
      document.removeEventListener('swagger-enhancer:favorites-ready', this.bridgeReadyHandler);
      this.updateNativeFilter();
      this.clearFavoritesUI();
      this.hiddenElements.forEach((display, el) => { el.style.display = display; });
      this.hiddenElements.clear();
    }

    // === Storage Utils ===

    getFavoritesMap() {
      try {
        const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
        return favorites && typeof favorites === 'object' && !Array.isArray(favorites) ? favorites : {};
      } catch {
        return {};
      }
    }

    saveFavoritesMap(favorites) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }

    getFilterState() {
      const state = Number(localStorage.getItem(FILTER_STATE_KEY) || '0');
      return [0, 1, 2].includes(state) ? state : 0;
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

    createFavoriteButton(summaryEl, isFavorited) {
      const star = document.createElement('span');
      star.className = 'swagger-fav-star';
      star.textContent = isFavorited ? '★' : '☆';
      star.title = 'Add to favorites';
      star.style.userSelect = 'none';

      star.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // React may reuse the summary node for a different route.
        const currentRouteKey = this.getRouteKey(summaryEl);
        if (!currentRouteKey) return;
        const currentFavorites = this.getFavoritesMap();
        const alreadyFavorited = !!currentFavorites[currentRouteKey];
        this.toggleFavorite(currentRouteKey, summaryEl, alreadyFavorited);
        if (this.filterState !== 0) this.applyFavoriteFilter();
      });

      return star;
    }

    markAsFavorite(summaryEl, isFavorited) {
      summaryEl.classList.toggle('swagger-favorite', isFavorited);
      const star = summaryEl.querySelector('.swagger-fav-star');
      if (star && star.textContent !== (isFavorited ? '★' : '☆')) star.textContent = isFavorited ? '★' : '☆';
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
      this.enhanceSummaries(document.querySelectorAll('.opblock-summary'));
      this.applyFavoriteFilter();
    }

    enhanceSummaries(summaries) {
      const favorites = this.getFavoritesMap();
      summaries.forEach((summary) => {
        if (!summary.isConnected) return;
        const routeKey = this.getRouteKey(summary);
        if (!routeKey) return;

        const methodEl = summary.querySelector('.opblock-summary-method');
        if (!methodEl) return;

        const isFavorited = !!favorites[routeKey];
        if (!summary.querySelector('.swagger-fav-star')) {
          const star = this.createFavoriteButton(summary, isFavorited);
          methodEl.parentNode.insertBefore(star, methodEl);
        }
        this.markAsFavorite(summary, isFavorited);
        summary.dataset.favApplied = '1';
      });

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
        if (this.hasNativeFilter()) document.dispatchEvent(new Event('swagger-enhancer:favorites-select-all'));
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

    hasNativeFilter() {
      return document.documentElement.dataset.swaggerFavoritesBridge === 'ready';
    }

    updateNativeFilter() {
      const state = JSON.stringify({ enabled: this.enabled, filterState: this.filterState });
      const signature = state + localStorage.getItem(FAVORITES_KEY);
      if (this.nativeSignature === signature) return;
      this.nativeSignature = signature;
      document.dispatchEvent(new CustomEvent('swagger-enhancer:favorites-update', { detail: state }));
    }

    applyFavoriteFilter() {
      if (this.hasNativeFilter()) {
        this.hiddenElements.forEach((display, el) => { el.style.display = display; });
        this.hiddenElements.clear();
        this.updateNativeFilter();
        return;
      }
      const favorites = this.getFavoritesMap();

      document.querySelectorAll('.opblock').forEach(opblock => {
        const method = opblock.querySelector('.opblock-summary-method')?.textContent?.trim();
        const path = opblock.querySelector('.opblock-summary-path')?.textContent?.trim();
        const routeKey = method && path ? `${method} ${path}` : null;
        if (!routeKey) return;

        const isFavorite = !!favorites[routeKey];
        this.setFiltered(opblock, this.filterState === 1 ? !isFavorite : this.filterState === 2 && isFavorite);
      });

      document.querySelectorAll('.opblock-tag-section').forEach(section => {
        const blocks = Array.from(section.querySelectorAll('.opblock'));
        // A collapsed tag may not have mounted its operations yet. Keep its control accessible.
        this.setFiltered(section, this.filterState !== 0 && blocks.length > 0 &&
          blocks.every(opblock => this.hiddenElements.has(opblock)));
      });
      this.hiddenElements.forEach((display, el) => {
        if (!el.isConnected) this.hiddenElements.delete(el);
      });
    }

    setFiltered(element, hidden) {
      if (hidden) {
        if (!this.hiddenElements.has(element)) this.hiddenElements.set(element, element.style.display);
        element.style.display = 'none';
      } else if (this.hiddenElements.has(element)) {
        element.style.display = this.hiddenElements.get(element);
        this.hiddenElements.delete(element);
      }
    }

    startObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver(mutations => {
        if (!this.enabled) return;
        const summaries = new Set();
        for (const mutation of mutations) {
          // Ignore our own star updates. Enhance newly mounted/reused rows before paint,
          // without waiting for scrolling to stop or rescanning the entire document.
          if (mutation.target.nodeType === 1 && !mutation.target.closest('.swagger-fav-star')) {
            const summary = mutation.target.closest('.opblock-summary');
            if (summary) summaries.add(summary);
          }
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches('.opblock-summary')) summaries.add(node);
            node.querySelectorAll('.opblock-summary').forEach(summary => summaries.add(summary));
          }
        }
        if (summaries.size) {
          this.enhanceSummaries(summaries);
          if (!this.hasNativeFilter()) this.applyFavoriteFilter();
        }
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    stopObserver() {
      this.observer?.disconnect();
      this.observer = null;
    }

  }

  // Export class to global scope
  window.FavoritesFeature = FavoritesFeature;

  // Don't auto-initialize - let main.js handle it

})();
