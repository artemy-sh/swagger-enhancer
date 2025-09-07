/**
 * Page context test functions
 * This file is injected into the page context to provide global test functions
 */

(() => {
  'use strict';

  // Create global function in page context
  window.runTests = function() {
    console.log('🧪 Running Swagger Enhancer tests...');
    window.postMessage({
      type: 'SWAGGER_ENHANCER_TEST',
      action: 'runTests'
    }, '*');
  };

})();

