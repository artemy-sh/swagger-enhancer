/**
 * Popup script for Swagger Enhancer
 * Manages UI switches and communicates with content scripts
 */

(() => {
  'use strict';

  // Configuration for toggles
  const TOGGLE_CONFIG = [
    { id: 'toggle', storageKey: 'darkThemeEnabled', messageType: 'TOGGLE_THEME' },
    { id: 'searchToggle', storageKey: 'swaggerSearchEnabled', messageType: 'TOGGLE_SEARCH' },
    { id: 'favoritesToggle', storageKey: 'swaggerFavoritesEnabled', messageType: 'TOGGLE_FAVORITES' },
    { id: 'scrollTopToggle', storageKey: 'scrollTopEnabled', messageType: 'TOGGLE_SCROLL_TOP' },
    { id: 'hideResponsesToggle', storageKey: 'hideResponsesEnabled', messageType: 'TOGGLE_HIDE_RESPONSES' },
    { id: 'hideSchemasToggle', storageKey: 'hideSchemasEnabled', messageType: 'TOGGLE_HIDE_SCHEMAS' }
  ];

  let elements = {};

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Get DOM elements
      elements = {
        container: document.getElementById('container'),
        toggles: TOGGLE_CONFIG.reduce((acc, config) => {
          acc[config.id] = document.getElementById(config.id);
          return acc;
        }, {})
      };

      // Load and apply initial state
      await loadInitialState();
      
      // Setup event listeners
      setupEventListeners();

    } catch (error) {
      console.error('Popup initialization failed:', error);
      showError('Failed to initialize popup');
    }
  });

  /**
   * Load initial state from storage
   */
  async function loadInitialState() {
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
        }
      });
    } catch (error) {
      console.error('Failed to load initial state:', error);
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
        try {
          const enabled = toggle.checked;
          
          // Save to storage
          await setStorage({ [config.storageKey]: enabled });
          
          // Special handling for theme toggle
          if (config.id === 'toggle') {
            updateTheme(enabled);
          }
          
          // Notify content script
          await notifyContent(config.messageType, enabled);
          
        } catch (error) {
          console.error(`Failed to handle toggle ${config.id}:`, error);
          // Revert toggle state on error
          toggle.checked = !toggle.checked;
          showError('Failed to save setting');
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
   * Notify content script in active tab
   */
  async function notifyContent(type, enabled) {
    try {
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });

      if (tabs[0]?.id) {
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabs[0].id, { type, enabled }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Message not delivered:', chrome.runtime.lastError.message);
            }
            resolve(response);
          });
        });
      }
    } catch (error) {
      console.error('Failed to notify content script:', error);
    }
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
  function showError(message) {
    // Simple error display - could be enhanced with better UI
    console.error(message);
  }

})();
