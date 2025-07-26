(() => {
  const FAVORITES_KEY = 'swaggerFavorites';
  const FILTER_STATE_KEY = 'swaggerFavoritesFilterState'; // 0 = all, 1 = only favorites, 2 = exclude favorites
  const STYLE_HREF = chrome.runtime.getURL('css/favorites.css');

  let favoritesEnabled = false;
  let observer = null;
  let filterState = 0;

  // === Utils ===

  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const getFavoritesMap = () => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
    } catch {
      return {};
    }
  };

  const saveFavoritesMap = (favorites) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  };

  const getFilterState = () => parseInt(localStorage.getItem(FILTER_STATE_KEY) || '0', 10);

  const saveFilterState = (state) => {
    localStorage.setItem(FILTER_STATE_KEY, String(state));
  };

  const getRouteKey = (summaryEl) => {
    const method = summaryEl.querySelector('.opblock-summary-method')?.textContent?.trim();
    const path = summaryEl.querySelector('.opblock-summary-path')?.textContent?.trim();
    return method && path ? `${method} ${path}` : null;
  };

  // === Favorite button ===

  const createFavoriteButton = (routeKey, summaryEl, isFavorited) => {
    const star = document.createElement('span');
    star.className = 'swagger-fav-star';
    star.textContent = isFavorited ? '★' : '☆';
    star.title = 'Add to favorites';
    star.style.userSelect = 'none';

    star.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const currentFavorites = getFavoritesMap();
      const alreadyFavorited = !!currentFavorites[routeKey];
      toggleFavorite(routeKey, summaryEl, alreadyFavorited);
      if (filterState !== 0) applyFavoriteFilter();
    });

    return star;
  };

  const markAsFavorite = (summaryEl, isFavorited) => {
    summaryEl.classList.toggle('swagger-favorite', isFavorited);
    const star = summaryEl.querySelector('.swagger-fav-star');
    if (star) star.textContent = isFavorited ? '★' : '☆';
  };

  // === DOM Enhancements ===

  const enhanceAllSummaries = () => {
    if (!favoritesEnabled) return;

    const favorites = getFavoritesMap();
    const summaries = document.querySelectorAll('.opblock-summary');

    summaries.forEach((summary) => {
      if (summary.dataset.favApplied) return;

      const routeKey = getRouteKey(summary);
      if (!routeKey) return;

      const methodEl = summary.querySelector('.opblock-summary-method');
      if (!methodEl) return;

      const isFavorited = !!favorites[routeKey];
      const star = createFavoriteButton(routeKey, summary, isFavorited);

      methodEl.parentNode.insertBefore(star, methodEl);
      markAsFavorite(summary, isFavorited);
      summary.dataset.favApplied = '1';
    });

    applyFavoriteFilter();
  };

  const clearFavoritesUI = () => {
    document.querySelectorAll('.swagger-fav-star').forEach(el => el.remove());
    document.querySelectorAll('.swagger-favorite').forEach(el => el.classList.remove('swagger-favorite'));
    document.querySelectorAll('.opblock-summary').forEach(el => delete el.dataset.favApplied);
    document.getElementById('swagger-fav-filter')?.remove();
  };

  const toggleFavorite = (routeKey, summaryEl, isFavorited) => {
    const favorites = getFavoritesMap();
    if (isFavorited) delete favorites[routeKey];
    else favorites[routeKey] = true;

    saveFavoritesMap(favorites);
    markAsFavorite(summaryEl, !isFavorited);
  };

  const injectFavoritesCSS = () => {
    const alreadyInjected = [...document.styleSheets].some(sheet => sheet.href === STYLE_HREF);
    if (alreadyInjected) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    document.head.appendChild(link);
  };

  // === Filter Control Button ===

  const insertFavoritesFilter = () => {
    if (document.getElementById('swagger-fav-filter')) return;

    let container = document.getElementById('swagger-fav-control');
    if (!container) {
      container = document.createElement('div');
      container.id = 'swagger-fav-control';
      document.body.appendChild(container);
    }

    const filterBtn = document.createElement('button');
    filterBtn.id = 'swagger-fav-filter';
    filterBtn.className = 'swagger-fav-filter-button';
    filterBtn.textContent = '★';
    filterBtn.type = 'button';

    updateFilterButtonStyle(filterBtn);

    filterBtn.addEventListener('click', () => {
      filterState = (filterState + 1) % 3;
      saveFilterState(filterState);
      updateFilterButtonStyle(filterBtn);
      applyFavoriteFilter();
    });

    container.appendChild(filterBtn);
  };

  const updateFilterButtonStyle = (button) => {
    button.classList.remove('state-0', 'state-1', 'state-2');
    button.classList.add(`state-${filterState}`);
    button.title = {
      0: 'Show all',
      1: 'Show only favorites',
      2: 'Hide favorites'
    }[filterState];
  };

  const applyFavoriteFilter = () => {
    const favorites = getFavoritesMap();

    document.querySelectorAll('.opblock').forEach(opblock => {
      const method = opblock.querySelector('.opblock-summary-method')?.textContent?.trim();
      const path = opblock.querySelector('.opblock-summary-path')?.textContent?.trim();
      const routeKey = method && path ? `${method} ${path}` : null;
      if (!routeKey) return;

      const isFavorite = !!favorites[routeKey];

      if (filterState === 0) {
        opblock.style.display = '';
      } else if (filterState === 1) {
        opblock.style.display = isFavorite ? '' : 'none';
      } else {
        opblock.style.display = isFavorite ? 'none' : '';
      }
    });

    // Hide empty tag groups
    document.querySelectorAll('.opblock-tag-section').forEach(section => {
      const hasVisible = Array.from(section.querySelectorAll('.opblock'))
        .some(opblock => opblock.style.display !== 'none');
      section.style.display = hasVisible ? '' : 'none';
    });
  };

  // === DOM Watcher ===

  const debouncedEnhance = debounce(() => {
    enhanceAllSummaries();
    insertFavoritesFilter();
  }, 100);

  const startObserver = () => {
    const root = document.querySelector('.swagger-ui');
    if (!root || observer) return;

    enhanceAllSummaries();
    insertFavoritesFilter();

    observer = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some((mutation) =>
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node.nodeType === 1 && (
            node.matches?.('.opblock') || node.querySelector?.('.opblock')
          )
        ) || mutation.type === 'attributes'
      );

      if (shouldUpdate) debouncedEnhance();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  };

  const stopObserver = () => {
    observer?.disconnect();
    observer = null;
  };

  // === Enable / Disable ===

  const setFavoritesEnabledState = (enabled) => {
    favoritesEnabled = enabled;

    const apply = () => {
      document.body.classList.toggle('swagger-fav-enabled', enabled);

      if (enabled) {
        injectFavoritesCSS();
        filterState = getFilterState();
        enhanceAllSummaries();
        insertFavoritesFilter();
        startObserver();
      } else {
        stopObserver();
        clearFavoritesUI();
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', apply);
    } else {
      apply();
    }
  };

  // === Init ===

  chrome.storage.sync.get(['swaggerFavoritesEnabled'], (res) => {
    setFavoritesEnabledState(res.swaggerFavoritesEnabled === true);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_FAVORITES') {
      setFavoritesEnabledState(message.enabled === true);
    }
  });
})();
