/**
 * Shared utilities for Swagger Enhancer
 * Reduces code duplication and improves maintainability
 */

(() => {
  'use strict';

  // Create global namespace for utilities
  window.SwaggerEnhancerUtils = {
    
    // Storage utilities
    storage: {
      /**
       * Get storage value with error handling
       * @param {string|string[]} keys - Storage keys to retrieve
       * @returns {Promise<object>} Storage result
       */
      get(keys) {
        return new Promise((resolve) => {
          try {
            chrome.storage.sync.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                console.error('Storage get error:', chrome.runtime.lastError);
                resolve({});
              } else {
                resolve(result);
              }
            });
          } catch (error) {
            console.error('Storage get exception:', error);
            resolve({});
          }
        });
      },

      /**
       * Set storage value with error handling
       * @param {object} items - Items to store
       * @returns {Promise<boolean>} Success status
       */
      set(items) {
        return new Promise((resolve) => {
          try {
            chrome.storage.sync.set(items, () => {
              if (chrome.runtime.lastError) {
                console.error('Storage set error:', chrome.runtime.lastError);
                resolve(false);
              } else {
                resolve(true);
              }
            });
          } catch (error) {
            console.error('Storage set exception:', error);
            resolve(false);
          }
        });
      }
    },

    // DOM utilities
    dom: {
      /**
       * Debounce function calls
       * @param {Function} fn - Function to debounce
       * @param {number} delay - Delay in milliseconds
       * @returns {Function} Debounced function
       */
      debounce(fn, delay) {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      },

      /**
       * Wait for element to appear in DOM
       * @param {string} selector - CSS selector
       * @param {number} timeout - Timeout in milliseconds
       * @returns {Promise<Element|null>} Found element or null
       */
      waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
            return;
          }

          const observer = new MutationObserver((mutations, obs) => {
            const found = document.querySelector(selector);
            if (found) {
              obs.disconnect();
              resolve(found);
            }
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true
          });

          // Timeout fallback
          setTimeout(() => {
            observer.disconnect();
            resolve(null);
          }, timeout);
        });
      },

      /**
       * Inject CSS with error handling
       * @param {string} cssFile - CSS file path
       * @param {string} id - Unique ID for the link element
       * @returns {boolean} Success status
       */
      injectCSS(cssFile, id) {
        try {
          if (document.getElementById(id)) {
            return true; // Already injected
          }

          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.href = chrome.runtime.getURL(cssFile);
          link.onerror = () => console.error(`Failed to load CSS: ${cssFile}`);
          document.head.appendChild(link);
          return true;
        } catch (error) {
          console.error(`CSS injection error for ${cssFile}:`, error);
          return false;
        }
      },

      /**
       * Remove CSS
       * @param {string} id - CSS link element ID
       */
      removeCSS(id) {
        try {
          const element = document.getElementById(id);
          if (element) {
            element.remove();
          }
        } catch (error) {
          console.error(`CSS removal error for ${id}:`, error);
        }
      },

      /**
       * Smooth scroll to element with offset
       * @param {Element} element - Target element
       * @param {number} offset - Offset from top
       * @param {number} duration - Animation duration in ms
       */
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
    },

    // Message utilities
    messaging: {
      /**
       * Send message to content script with error handling
       * @param {string} type - Message type
       * @param {any} data - Message data
       * @returns {Promise<any>} Response or null
       */
      sendToActiveTab(type, data = {}) {
        return new Promise((resolve) => {
          try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { type, ...data }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn('Message send error:', chrome.runtime.lastError.message);
                  }
                  resolve(response || null);
                });
              } else {
                resolve(null);
              }
            });
          } catch (error) {
            console.error('Messaging error:', error);
            resolve(null);
          }
        });
      }
    },

    // Feature management
    features: {
      /**
       * Base class for feature modules
       * Provides consistent API and lifecycle management
       */
      BaseFeature: class {
        constructor(storageKey, cssFile = null, options = {}) {
          this.storageKey = storageKey;
          this.cssFile = cssFile;
          this.cssId = cssFile ? `swagger-${storageKey}-style` : null;
          this.enabled = false;
          this.observer = null;
          this.options = {
            autoInit: true,
            debug: false,
            ...options
          };
          this.messageType = options.messageType || `TOGGLE_${storageKey.toUpperCase()}`;
        }

        /**
         * Initialize the feature
         */
        async init() {
          try {
            if (this.options.debug) {
              console.log(`[${this.constructor.name}] Initializing...`);
            }

            const result = await SwaggerEnhancerUtils.storage.get([this.storageKey]);
            this.setEnabled(result[this.storageKey] === true);
            this.setupMessageListener();
            
            if (this.options.debug) {
              console.log(`[${this.constructor.name}] Initialized successfully`);
            }
          } catch (error) {
            console.error(`[${this.constructor.name}] Initialization failed:`, error);
            throw error;
          }
        }

        /**
         * Set enabled state and trigger appropriate actions
         * @param {boolean} enabled - Whether feature should be enabled
         */
        setEnabled(enabled) {
          if (this.enabled === enabled) return;
          
          this.enabled = enabled;
          
          if (enabled) {
            this.enable();
          } else {
            this.disable();
          }
        }

        /**
         * Enable the feature
         */
        enable() {
          if (this.options.debug) {
            console.log(`[${this.constructor.name}] Enabling...`);
          }

          if (this.cssFile) {
            SwaggerEnhancerUtils.dom.injectCSS(this.cssFile, this.cssId);
          }
          
          this.onEnable();
        }

        /**
         * Disable the feature
         */
        disable() {
          if (this.options.debug) {
            console.log(`[${this.constructor.name}] Disabling...`);
          }

          if (this.cssId) {
            SwaggerEnhancerUtils.dom.removeCSS(this.cssId);
          }
          
          this.cleanup();
          this.onDisable();
        }

        /**
         * Clean up resources
         */
        cleanup() {
          if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
          }
        }

        /**
         * Setup message listener for runtime communication
         */
        setupMessageListener() {
          chrome.runtime.onMessage.addListener((message) => {
            if (message.type === this.messageType) {
              this.setEnabled(message.enabled === true);
            }
          });
        }

        /**
         * Called when feature is enabled - override in subclasses
         */
        onEnable() {
          // Override in subclasses
        }

        /**
         * Called when feature is disabled - override in subclasses
         */
        onDisable() {
          // Override in subclasses
        }

        /**
         * Get current enabled state
         * @returns {boolean} Current enabled state
         */
        isEnabled() {
          return this.enabled;
        }

        /**
         * Toggle enabled state
         */
        toggle() {
          this.setEnabled(!this.enabled);
        }
      }
    }
  };

  // Export to global scope
  window.SwaggerEnhancerUtils = SwaggerEnhancerUtils;

  // Mark as loaded
  // console.log('SwaggerEnhancerUtils loaded');
})();

