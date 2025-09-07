/**
 * Search functionality for Swagger Enhancer
 * Refactored to use BaseFeature architecture
 */

(() => {
  'use strict';

  const SEARCH_ID = 'swagger-search-container';
  const STYLE_ID = 'swagger-search-style';
  const MENU_ID = 'swagger-floating-menu';
  const FALLBACK_MENU_H = 55;
  const STORAGE_KEY = 'swaggerSearchEnabled';
  const MAX_RESULTS = 10;
  const SEARCH_DEBOUNCE_MS = 150;

  /**
   * Search feature class extending BaseFeature
   */
  class SearchFeature extends (window.SwaggerEnhancerUtils?.features?.BaseFeature || class {
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
      super(STORAGE_KEY, 'css/search.css', {
        messageType: 'TOGGLE_SEARCH',
        debug: false
      });
      
      this.searchCache = new Map();
    }

    onEnable() {
      this.loadSearchStyle();
      this.initializeSearch();
    }

    onDisable() {
      this.cleanupSearch();
    }

    // === CSS Management ===

    loadSearchStyle() {
      const utils = window.SwaggerEnhancerUtils;
      if (utils?.dom?.injectCSS) {
        utils.dom.injectCSS('css/search.css', STYLE_ID);
      } else {
        // Fallback CSS injection
        if (document.getElementById(STYLE_ID)) return;
        const link = document.createElement('link');
        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('css/search.css');
        document.head.appendChild(link);
      }
    }

    // === Search Initialization ===

    async initializeSearch() {
      try {
        const utils = window.SwaggerEnhancerUtils;
        let swaggerUI;
        
        if (utils?.dom?.waitForElement) {
          swaggerUI = await utils.dom.waitForElement('.swagger-ui');
        } else {
          // Fallback wait for element
          swaggerUI = document.querySelector('.swagger-ui');
          if (!swaggerUI) {
            await new Promise((resolve) => {
              const observer = new MutationObserver(() => {
                const found = document.querySelector('.swagger-ui');
                if (found) {
                  observer.disconnect();
                  resolve(found);
                }
              });
              observer.observe(document.body, { childList: true, subtree: true });
              setTimeout(() => {
                observer.disconnect();
                resolve(null);
              }, 5000);
            });
          }
        }
        
        if (swaggerUI) {
          this.startObserver();
          this.insertSearchBar();
        }
      } catch (error) {
        console.error('Search initialization failed:', error);
      }
    }

    // === Observer Management ===

    startObserver() {
      if (this.observer) return;

      const utils = window.SwaggerEnhancerUtils;
      const debouncedFn = utils?.dom?.debounce || ((fn, delay) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      });
      
      this.observer = new MutationObserver(debouncedFn(() => {
        if (this.enabled && !document.getElementById(SEARCH_ID)) {
          this.insertSearchBar();
        }
      }, 200));

      const swaggerUI = document.querySelector('.swagger-ui');
      if (swaggerUI) {
        this.observer.observe(swaggerUI, {
          childList: true,
          subtree: true
        });
      }
    }

    cleanupSearch() {
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

      // Debounced search handler
      const utils = window.SwaggerEnhancerUtils;
      const debouncedSearch = utils?.dom?.debounce || ((fn, delay) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      });
      const debouncedSearchFn = debouncedSearch((value) => {
        this.performSearch(value, results);
      }, SEARCH_DEBOUNCE_MS);

      input.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value.length === 0) {
          results.style.display = 'none';
          results.innerHTML = '';
        } else if (value.length >= 2) {
          debouncedSearchFn(value);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.value = '';
          results.style.display = 'none';
          input.blur();
        }
      });

      // Hide results when clicking outside
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          results.style.display = 'none';
        }
      });

      container.append(input, results);

      const menuRight = document.querySelector('#swagger-floating-menu .swagger-menu-right');
      if (menuRight) {
        menuRight.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }

    // === Search Logic ===

    performSearch(query, resultsContainer) {
      const lowerQuery = query.toLowerCase();
      
      // Check cache first
      if (this.searchCache.has(lowerQuery)) {
        this.displayResults(this.searchCache.get(lowerQuery), resultsContainer);
        return;
      }

      const matches = [];
      
      // Search tags
      const tags = document.querySelectorAll('h3.opblock-tag');
      tags.forEach((tag) => {
        const text = tag.dataset.tag || tag.textContent.trim();
        if (text.toLowerCase().includes(lowerQuery)) {
          matches.push({ 
            type: 'tag', 
            text: text, 
            el: tag,
            score: this.calculateScore(text, lowerQuery)
          });
        }
      });

      // Search routes
      const routes = document.querySelectorAll('.opblock');
      routes.forEach((route) => {
        const methodEl = route.querySelector('.opblock-summary-method');
        const pathEl = route.querySelector('.opblock-summary-path');
        const descEl = route.querySelector('.opblock-summary-description');
        
        if (!methodEl || !pathEl) return;

        const method = methodEl.textContent.trim();
        const path = pathEl.textContent.trim();
        const desc = descEl?.textContent.trim() || '';
        const searchText = `${method} ${path} ${desc}`.toLowerCase();

        if (searchText.includes(lowerQuery)) {
          matches.push({ 
            type: 'route', 
            method, 
            path, 
            desc, 
            el: route,
            score: this.calculateScore(searchText, lowerQuery)
          });
        }
      });

      // Sort by relevance score and limit results
      const sortedMatches = matches
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS);

      // Cache results
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
              <span class="route-method" data-method="${this.escapeHtml(match.method)}">${this.escapeHtml(match.method)}</span>
              <span class="route-path">${this.escapeHtml(match.path)}</span>
            </div>
            <div class="route-desc">${this.escapeHtml(match.desc)}</div>
          `;
        }
        
        const clickHandler = () => {
          const utils = window.SwaggerEnhancerUtils;
          if (utils?.dom?.smoothScrollToElement) {
            utils.dom.smoothScrollToElement(match.el, this.getMenuHeight());
          } else {
            // Fallback smooth scroll
            this.smoothScrollToElement(match.el, this.getMenuHeight());
          }
          resultsContainer.style.display = 'none';
          document.getElementById(SEARCH_ID)?.querySelector('input')?.focus();
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

    smoothScrollToElement(element, offset = 0, duration = 400) {
      if (!element) return;

      const startY = window.scrollY;
      const targetY = element.getBoundingClientRect().top + startY - offset;
      const distance = targetY - startY;
      let start = null;

      const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
        
        window.scrollTo(0, startY + distance * ease);
        
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    }
  }

  // Export class to global scope
  window.SearchFeature = SearchFeature;

  // Don't auto-initialize - let main.js handle it

})();
