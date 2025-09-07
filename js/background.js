/**
 * Background script for Swagger Enhancer
 * Handles CSS injection and extension lifecycle
 */

(() => {
  'use strict';

  // Extension installation/update handler
  chrome.runtime.onInstalled.addListener((details) => {
    console.log('Swagger Enhancer installed/updated:', details.reason);
    
    if (details.reason === 'install') {
      // Set default settings on first install
      chrome.storage.sync.set({
        darkThemeEnabled: false,
        swaggerSearchEnabled: true,
        swaggerFavoritesEnabled: true,
        scrollTopEnabled: true,
        hideResponsesEnabled: false,
        hideSchemasEnabled: false
      }).catch(error => {
        console.error('Failed to set default settings:', error);
      });
    }
  });

  // Handle CSS injection requests
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message?.action === 'inject-css' && sender?.tab?.id) {
          if (!Number.isInteger(sender.tab.id)) {
            throw new Error('Invalid tab ID');
          }

          await chrome.scripting.insertCSS({
            target: { tabId: sender.tab.id },
            files: ['css/dark.css']
          });

          console.log('Dark theme CSS injected successfully');
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Invalid message format' });
        }
      } catch (error) {
        console.error('CSS injection failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    // Return true to indicate async response
    return true;
  });

  // Handle extension errors
  chrome.runtime.onSuspend?.addListener(() => {
    console.log('Swagger Enhancer suspending');
  });

})();
