/**
 * Search functionality for Swagger Enhancer
 * Refactored to use BaseFeature architecture
 */

(() => {
  'use strict';

  const SEARCH_ID = 'swagger-search-container';
  const MENU_ID = 'swagger-floating-menu';
  const FALLBACK_MENU_H = 55;
  const STORAGE_KEY = 'swaggerSearchEnabled';
  const MAX_RESULTS = 10;
  const MAX_CACHE_ENTRIES = 100;
  const SEARCH_DEBOUNCE_MS = 150;

  /**
   * Search feature class extending BaseFeature
   */
  class SearchFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super(STORAGE_KEY, null, {
        messageType: 'TOGGLE_SEARCH',
        debug: false
      });
      
      this.searchCache = new Map();
    }

    onEnable() {
      this.indexHandler = event => {
        if (event.detail === this.indexSignature) return;
        let entries;
        try { entries = JSON.parse(event.detail); } catch { return; }
        if (!Array.isArray(entries)) return;
        this.nativeEntries = entries.filter(entry => entry && typeof entry.tag === 'string' &&
          (entry.type === 'tag' ? typeof entry.text === 'string' : entry.type === 'route' &&
            ['method', 'path', 'desc', 'description', 'operationId'].every(key => typeof entry[key] === 'string')));
        this.indexSignature = event.detail;
        this.searchCache.clear();
      };
      this.indexChangedHandler = () => {
        this.searchCache.clear();
        const input = document.querySelector(`#${SEARCH_ID} input`);
        const results = document.querySelector(`#${SEARCH_ID} ul`);
        if (this.searchActive && input?.value.trim().length >= 2 && results) {
          this.performSearch(input.value.trim(), results);
        }
      };
      document.addEventListener('swagger-enhancer:search-index', this.indexHandler);
      document.addEventListener('swagger-enhancer:search-changed', this.indexChangedHandler);
      document.addEventListener('swagger-enhancer:favorites-ready', this.indexChangedHandler);
      this.startObserver();
      if (document.querySelector('.swagger-ui')) this.insertSearchBar();
    }

    onDisable() {
      this.cleanupSearch();
    }

    startObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver(mutations => {
        const relevant = mutations.some(mutation =>
          (mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement)?.closest('.swagger-ui') ||
          [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
            node.nodeType === 1 && (node.matches('.swagger-ui') || node.querySelector('.swagger-ui'))));
        if (!relevant || !this.enabled) return;
        // Scrolling only mounts a subset of routes; it does not change the native index.
        if (!this.hasNativeSearch()) this.searchCache.clear();
        if (document.querySelector('.swagger-ui')) this.insertSearchBar();
      });
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['style'] });
    }

    cleanupSearch() {
      this.debouncedSearch?.cancel();
      document.removeEventListener('swagger-enhancer:search-index', this.indexHandler);
      document.removeEventListener('swagger-enhancer:search-changed', this.indexChangedHandler);
      document.removeEventListener('swagger-enhancer:favorites-ready', this.indexChangedHandler);
      this.nativeEntries = null;
      this.indexSignature = null;
      this.searchActive = false;
      if (this.outsideClickHandler) document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
      const searchContainer = document.getElementById(SEARCH_ID);
      if (searchContainer) {
        searchContainer.remove();
      }

      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      this.searchCache.clear();
    }

    // === Search UI ===

    insertSearchBar() {
      if (document.getElementById(SEARCH_ID)) return;

      const container = document.createElement('div');
      container.id = SEARCH_ID;

      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = 'Search for tag or route…';
      input.className = 'swagger-search-input';
      input.autocomplete = 'off';

      const results = document.createElement('ul');
      results.className = 'swagger-search-results';
      results.style.display = 'none';

      this.debouncedSearch = window.SwaggerEnhancerUtils.dom.debounce((value) => {
        if (this.enabled && input.value.trim() === value) this.performSearch(value, results);
      }, SEARCH_DEBOUNCE_MS);

      input.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        this.searchActive = value.length >= 2;
        this.debouncedSearch.cancel();
        if (value.length < 2) {
          results.style.display = 'none';
          results.innerHTML = '';
        } else if (value.length >= 2) {
          this.debouncedSearch(value);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.searchActive = false;
          this.debouncedSearch.cancel();
          input.value = '';
          results.style.display = 'none';
          input.blur();
        }
      });
      input.addEventListener('focus', () => {
        this.searchActive = input.value.trim().length >= 2;
        if (this.searchActive) this.performSearch(input.value.trim(), results);
      });

      // Hide results when clicking outside
      this.outsideClickHandler = (e) => {
        if (!container.contains(e.target)) {
          this.searchActive = false;
          this.debouncedSearch.cancel();
          results.style.display = 'none';
        }
      };
      document.addEventListener('click', this.outsideClickHandler);

      container.append(input, results);

      const menuRight = document.querySelector('#swagger-floating-menu .swagger-menu-right');
      if (menuRight) {
        menuRight.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }

    // === Search Logic ===

    hasNativeSearch() {
      return document.documentElement.dataset.swaggerFavoritesBridge === 'ready';
    }

    getSearchEntries() {
      if (this.hasNativeSearch()) {
        document.dispatchEvent(new Event('swagger-enhancer:search-request'));
        return this.nativeEntries || [];
      }
      // Compatibility fallback for custom builds without a SwaggerUIBundle factory.
      const entries = [];
      const hidden = element => {
        for (let el = element; el; el = el.parentElement) {
          if (el.hidden || el.style.display === 'none') return true;
        }
        return false;
      };
      document.querySelectorAll('h3.opblock-tag').forEach(el => {
        if (!hidden(el)) entries.push({ type: 'tag', text: el.dataset.tag || el.textContent.trim(), el });
      });
      document.querySelectorAll('.opblock').forEach(el => {
        const method = el.querySelector('.opblock-summary-method')?.textContent.trim();
        const path = el.querySelector('.opblock-summary-path')?.textContent.trim();
        if (method && path && !hidden(el)) entries.push({ type: 'route', method, path,
          desc: el.querySelector('.opblock-summary-description')?.textContent.trim() || '', el });
      });
      return entries;
    }

    performSearch(query, resultsContainer) {
      const lowerQuery = query.toLowerCase();
      // Request the current filtered snapshot before consulting the cache.
      const entries = this.getSearchEntries();
      if (this.searchCache.has(lowerQuery)) {
        this.displayResults(this.searchCache.get(lowerQuery), resultsContainer);
        return;
      }
      const matches = [];
      entries.forEach(entry => {
        const text = entry.type === 'tag' ? entry.text :
          `${entry.method} ${entry.path} ${entry.desc} ${entry.description || ''} ${entry.operationId || ''}`;
        if (text.toLowerCase().includes(lowerQuery)) matches.push({ ...entry, score: this.calculateScore(text, lowerQuery) });
      });

      // Sort by relevance score and limit results
      const sortedMatches = matches
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS);

      // Cache results
      if (this.searchCache.size >= MAX_CACHE_ENTRIES) {
        this.searchCache.delete(this.searchCache.keys().next().value);
      }
      this.searchCache.set(lowerQuery, sortedMatches);

      this.displayResults(sortedMatches, resultsContainer);
    }

    calculateScore(text, query) {
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      
      let score = 0;
      
      // Exact match bonus
      if (lowerText === lowerQuery) score += 100;
      
      // Starts with bonus
      if (lowerText.startsWith(lowerQuery)) score += 50;
      
      // Contains bonus (inverse of position)
      const index = lowerText.indexOf(lowerQuery);
      if (index !== -1) {
        score += Math.max(0, 20 - index);
      }
      
      // Length bonus (shorter matches are more relevant)
      score += Math.max(0, 10 - (lowerText.length - lowerQuery.length) / 10);
      
      return score;
    }

    displayResults(matches, resultsContainer) {
      resultsContainer.innerHTML = '';
      
      if (matches.length === 0) {
        resultsContainer.style.display = 'none';
        return;
      }

      matches.forEach((match) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.tabIndex = 0;
        
        if (match.type === 'tag') {
          li.innerHTML = `<span class="route-tag">[${this.escapeHtml(match.text)}]</span>`;
        } else {
          li.innerHTML = `
            <div>
              <span class="route-method" data-method="">${this.escapeHtml(match.method)}</span>
              <span class="route-path">${this.escapeHtml(match.path)}</span>
            </div>
            <div class="route-desc">${this.escapeHtml(match.desc)}</div>
          `;
        }
        
        const methodLabel = li.querySelector('.route-method');
        if (methodLabel) methodLabel.dataset.method = match.method;

        const clickHandler = () => {
          if (this.hasNativeSearch() && match.tag !== undefined) {
            document.dispatchEvent(new CustomEvent('swagger-enhancer:search-navigate', { detail: JSON.stringify({
              type: match.type, tag: match.tag, method: match.method, path: match.path
            }) }));
          } else if (match.el?.isConnected) {
            window.SwaggerEnhancerUtils.dom.smoothScrollToElement(match.el, this.getMenuHeight());
          }
          resultsContainer.style.display = 'none';
          document.getElementById(SEARCH_ID)?.querySelector('input')?.focus({ preventScroll: true });
          this.searchActive = false;
          resultsContainer.style.display = 'none';
        };
        
        li.addEventListener('click', clickHandler);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clickHandler();
          }
        });
        
        resultsContainer.appendChild(li);
      });

      resultsContainer.style.display = 'block';
    }

    // === Utility Methods ===

    getMenuHeight() {
      return document.getElementById(MENU_ID)?.offsetHeight || FALLBACK_MENU_H;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }


  }

  // Export class to global scope
  window.SearchFeature = SearchFeature;

  // Don't auto-initialize - let main.js handle it

})();
