/**
 * Popup script for Swagger Enhancer
 * Saves settings, content scripts subscribe to chrome.storage.onChanged
 */

(() => {
  'use strict';

  // Configuration for toggles
  const TOGGLE_CONFIG = [
    { id: 'toggle', storageKey: 'darkThemeEnabled' },
    { id: 'searchToggle', storageKey: 'swaggerSearchEnabled' },
    { id: 'favoritesToggle', storageKey: 'swaggerFavoritesEnabled' },
    { id: 'scrollTopToggle', storageKey: 'scrollTopEnabled' },
    { id: 'hideResponsesToggle', storageKey: 'hideResponsesEnabled' },
    { id: 'hideSchemasToggle', storageKey: 'hideSchemasEnabled' },
    { id: 'schemaPreviewToggle', storageKey: 'schemaPreviewEnabled' },
    { id: 'authorizeInHeaderToggle', storageKey: 'authorizeInHeaderEnabled' },
    { id: 'copyFullUrlToggle', storageKey: 'copyFullUrlEnabled' }
  ];

  let elements = {};

  document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('keydown', () => document.body.classList.add('swagger-keyboard-navigation'), true);
    document.addEventListener('pointerdown', () => document.body.classList.remove('swagger-keyboard-navigation'), true);
    try { window.SwaggerEnhancerSupport?.initPopup(document.getElementById('swagger-support-panel')); }
    catch (error) { console.warn('Could not initialize extension support controls:', error); }
    try {
      // Get DOM elements
      elements = {
        container: document.getElementById('container'),
        error: document.getElementById('swagger-settings-error'),
        retry: document.getElementById('swagger-settings-retry'),
        toggles: TOGGLE_CONFIG.reduce((acc, config) => {
          acc[config.id] = document.getElementById(config.id);
          return acc;
        }, {})
      };

      setupEventListeners();
      elements.retry?.addEventListener('click', loadInitialState);
      await loadInitialState();

    } catch (error) {
      console.error('Popup initialization failed:', error);
      showError('Failed to initialize popup');
    }
  });

  /**
   * Load initial state from storage
   */
  async function loadInitialState() {
    Object.values(elements.toggles).forEach(toggle => { if (toggle) toggle.disabled = true; });
    if (elements.retry) elements.retry.disabled = true;
    try {
      const storageKeys = TOGGLE_CONFIG.map(config => config.storageKey);
      const result = await getStorage(storageKeys);

      TOGGLE_CONFIG.forEach(config => {
        const toggle = elements.toggles[config.id];
        if (toggle) {
          toggle.checked = !!result[config.storageKey];
          
          // Special handling for theme toggle
          if (config.id === 'toggle') {
            updateTheme(toggle.checked);
          }
          toggle.disabled = false;
        }
      });
      clearError();
    } catch (error) {
      console.error('Failed to load initial state:', error);
      showError('Could not load settings. Retry before making changes.');
      if (elements.retry) { elements.retry.hidden = false; elements.retry.disabled = false; }
    }
  }

  /**
   * Setup event listeners for all toggles
   */
  function setupEventListeners() {
    TOGGLE_CONFIG.forEach(config => {
      const toggle = elements.toggles[config.id];
      if (!toggle) return;

      toggle.addEventListener('change', async () => {
        if (toggle.disabled) return;
        const enabled = toggle.checked;
        const previous = !enabled;
        const hadFocus = document.activeElement === toggle;
        toggle.disabled = true;
        try {
          
          // Save to storage
          await setStorage({ [config.storageKey]: enabled });
          
          // Special handling for theme toggle
          if (config.id === 'toggle') {
            updateTheme(enabled);
          }
          // All Swagger tabs receive this change through storage.onChanged.
          clearError();
        } catch (error) {
          console.error(`Failed to handle toggle ${config.id}:`, error);
          // Revert toggle state on error
          toggle.checked = previous;
          showError('Could not save this setting. Your previous setting is unchanged.');
        } finally {
          toggle.disabled = false;
          if (hadFocus && document.activeElement === document.body) toggle.focus({ preventScroll: true });
        }
      });
    });
  }

  /**
   * Update popup theme
   */
  function updateTheme(isDark) {
    if (!elements.container) return;
    
    elements.container.classList.toggle('dark', isDark);
    elements.container.classList.toggle('light', !isDark);
  }

  /**
   * Storage utilities with error handling
   */
  function getStorage(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function setStorage(items) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Show error message to user
   */
  function clearError() {
    if (elements.error) { elements.error.textContent = ''; elements.error.hidden = true; }
    if (elements.retry) elements.retry.hidden = true;
  }

  function showError(message) {
    if (elements.error) { elements.error.textContent = message; elements.error.hidden = false; }
  }

})();
