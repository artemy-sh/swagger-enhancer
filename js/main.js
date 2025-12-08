/**
 * Main entry point for Swagger Enhancer
 * Centralized initialization and feature management
 */

(() => {
  'use strict';

  // Wait for all dependencies to load
  const initializeApp = () => {
    // console.log('Swagger Enhancer: Starting initialization...');

    // Check if this is actually a Swagger UI page
    const checkSwaggerUI = () => {
      // Check for Swagger UI element
      if (document.querySelector('.swagger-ui')) {
        return true;
      }
      // Also check for common Swagger UI indicators
      if (document.querySelector('[data-testid="swagger-ui"]') || 
          document.querySelector('#swagger-ui') ||
          document.querySelector('.swagger-container')) {
        return true;
      }
      return false;
    };

    // Wait a bit for Swagger UI to load, then check
    const checkAndInit = () => {
      if (!checkSwaggerUI()) {
        // If Swagger UI is not found, don't initialize
        return;
      }

      // Check if all required utilities are available
      if (!window.SwaggerEnhancerUtils) {
        console.error('SwaggerEnhancerUtils not loaded');
        return;
      }

      if (!window.SwaggerEnhancerFeatureManager) {
        console.error('SwaggerEnhancerFeatureManager not loaded');
        return;
      }

      // Continue with initialization
      initFeatures();
    };

    const initFeatures = () => {

    // console.log('Swagger Enhancer: Core utilities loaded');
    // console.log('SwaggerEnhancerUtils:', window.SwaggerEnhancerUtils);
    // console.log('BaseFeature available:', !!window.SwaggerEnhancerUtils?.features?.BaseFeature);

      // Wait a bit for all feature classes to be available
      setTimeout(() => {
        // console.log('Swagger Enhancer: Registering features...');
        
        // Check feature availability
        // console.log('Available features:');
        // console.log('- ThemeFeature:', !!window.ThemeFeature);
        // console.log('- SearchFeature:', !!window.SearchFeature);
        // console.log('- FavoritesFeature:', !!window.FavoritesFeature);
        // console.log('- ScrollTopFeature:', !!window.ScrollTopFeature);
        // console.log('- HideResponsesFeature:', !!window.HideResponsesFeature);
        // console.log('- HideSchemasFeature:', !!window.HideSchemasFeature);
        
        // Register all features
        registerFeatures();

        // Check if we have any features registered
        const features = window.SwaggerEnhancerFeatureManager.getAllFeatures();
        // console.log(`Swagger Enhancer: ${features.size} features registered`);

        // Initialize all features
        window.SwaggerEnhancerFeatureManager.initAll()
          .then(() => {
            console.log('Swagger Enhancer: Ready');
            
            // Log feature status
            // const features = window.SwaggerEnhancerFeatureManager.getAllFeatures();
            // features.forEach((featureData, name) => {
            //   console.log(`Feature '${name}': ${featureData.enabled ? 'enabled' : 'disabled'}`);
            // });
          })
          .catch((error) => {
            console.error('Swagger Enhancer: Feature initialization failed:', error);
          });
      }, 100);
    };

    // Try to check immediately, and also wait a bit in case Swagger UI loads asynchronously
    if (checkSwaggerUI()) {
      checkAndInit();
    } else {
      // Wait a bit for Swagger UI to load, check multiple times
      let attempts = 0;
      const maxAttempts = 5;
      const checkInterval = setInterval(() => {
        attempts++;
        if (checkSwaggerUI()) {
          clearInterval(checkInterval);
          checkAndInit();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          // Swagger UI not found, don't initialize
        }
      }, 500);
    }
  };

  /**
   * Register all available features
   */
  const registerFeatures = () => {
    const manager = window.SwaggerEnhancerFeatureManager;

    // console.log('Swagger Enhancer: Registering features...');

    // Theme feature (already using BaseFeature)
    if (window.ThemeFeature) {
      // console.log('Registering theme feature');
      try {
        manager.register('theme', window.ThemeFeature);
      } catch (error) {
        console.error('Failed to register theme feature:', error);
      }
    } else {
      console.warn('ThemeFeature not found');
    }

    // Search feature (refactored)
    if (window.SearchFeature) {
      // console.log('Registering search feature');
      try {
        manager.register('search', window.SearchFeature);
      } catch (error) {
        console.error('Failed to register search feature:', error);
      }
    } else {
      console.warn('SearchFeature not found');
    }

    // Favorites feature (refactored)
    if (window.FavoritesFeature) {
      // console.log('Registering favorites feature');
      try {
        manager.register('favorites', window.FavoritesFeature);
      } catch (error) {
        console.error('Failed to register favorites feature:', error);
      }
    } else {
      console.warn('FavoritesFeature not found');
    }

    // Scroll top feature (already using BaseFeature)
    if (window.ScrollTopFeature) {
      // console.log('Registering scroll top feature');
      try {
        manager.register('scrollTop', window.ScrollTopFeature);
      } catch (error) {
        console.error('Failed to register scroll top feature:', error);
      }
    } else {
      console.warn('ScrollTopFeature not found');
    }

    // Hide responses feature (refactored)
    if (window.HideResponsesFeature) {
      // console.log('Registering hide responses feature');
      try {
        manager.register('hideResponses', window.HideResponsesFeature);
      } catch (error) {
        console.error('Failed to register hide responses feature:', error);
      }
    } else {
      console.warn('HideResponsesFeature not found');
    }

    // Hide schemas feature (refactored)
    if (window.HideSchemasFeature) {
      // console.log('Registering hide schemas feature');
      try {
        manager.register('hideSchemas', window.HideSchemasFeature);
      } catch (error) {
        console.error('Failed to register hide schemas feature:', error);
      }
    } else {
      console.warn('HideSchemasFeature not found');
    }

    // console.log(`Swagger Enhancer: Registered ${manager.getAllFeatures().size} features`);
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    // DOM is already ready
    initializeApp();
  }

  // Expose global API for debugging
  window.SwaggerEnhancer = {
    manager: () => window.SwaggerEnhancerFeatureManager,
    utils: () => window.SwaggerEnhancerUtils,
    features: () => window.SwaggerEnhancerFeatureManager?.getAllFeatures(),
    version: '1.0.2'
  };

  // Check if testing functions are available
  setTimeout(() => {
    // console.log('🧪 Testing functions available:');
    // console.log('- runTests:', typeof window.runTests);
    // console.log('- startAutoTests:', typeof window.startAutoTests);
    // console.log('- getHealthStatus:', typeof window.getHealthStatus);
    // console.log('🧪 Testing objects available:');
    // console.log('- testRunner:', typeof window.testRunner);
    // console.log('- autoTester:', typeof window.autoTester);
    // console.log('- healthMonitor:', typeof window.healthMonitor);
    
    // Check if we're in content script context
    // console.log('🧪 Context check:');
    // console.log('- window === globalThis:', window === globalThis);
    // console.log('- window === self:', window === self);
    // console.log('- typeof chrome:', typeof chrome);
    // console.log('- document.URL:', document.URL);
    
    // Use postMessage to communicate with page context
    try {
      // Inject page test functions
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('js/page_test_functions.js');
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
      
      // Listen for messages from page context
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SWAGGER_ENHANCER_TEST') {
          if (event.data.action === 'runTests') {
            if (window.testRunner) {
              window.testRunner.runAll();
            } else {
              console.error('testRunner not available');
            }
          }
        }
      });
    } catch (error) {
      console.error('Failed to setup page context communication:', error);
    }
  }, 2000);

})();
