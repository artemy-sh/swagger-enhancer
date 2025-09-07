/**
 * Feature Manager for Swagger Enhancer
 * Centralized management of all features with consistent initialization
 */

(() => {
  'use strict';

  /**
   * Feature Manager class
   * Handles registration, initialization, and lifecycle of all features
   */
  class FeatureManager {
    constructor() {
      this.features = new Map();
      this.initialized = false;
    }

    /**
     * Register a feature with the manager
     * @param {string} name - Feature name
     * @param {Function} FeatureClass - Feature class constructor
     * @param {object} options - Additional options
     */
    register(name, FeatureClass, options = {}) {
      if (this.features.has(name)) {
        console.warn(`Feature '${name}' is already registered`);
        return;
      }

      try {
        const feature = new FeatureClass();
        this.features.set(name, {
          instance: feature,
          name,
          options,
          enabled: false
        });
        
        // console.log(`Feature '${name}' registered successfully`);
      } catch (error) {
        console.error(`Failed to register feature '${name}':`, error);
      }
    }

    /**
     * Initialize all registered features
     */
    async initAll() {
      if (this.initialized) {
        console.warn('FeatureManager already initialized');
        return;
      }

      // console.log('FeatureManager: Initializing all features...');
      
      const initPromises = Array.from(this.features.values()).map(async (featureData) => {
        try {
          // console.log(`FeatureManager: Initializing '${featureData.name}'...`);
          await featureData.instance.init();
          featureData.enabled = true;
          // console.log(`FeatureManager: '${featureData.name}' initialized successfully`);
        } catch (error) {
          console.error(`FeatureManager: Failed to initialize '${featureData.name}':`, error);
          featureData.enabled = false;
        }
      });

      const results = await Promise.allSettled(initPromises);
      this.initialized = true;
      
      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failCount = results.filter(result => result.status === 'rejected').length;
      
      // console.log(`FeatureManager: Initialization complete. ${successCount} succeeded, ${failCount} failed out of ${this.features.size} total.`);
    }

    /**
     * Get a feature instance by name
     * @param {string} name - Feature name
     * @returns {object|null} Feature instance or null
     */
    getFeature(name) {
      const featureData = this.features.get(name);
      return featureData ? featureData.instance : null;
    }

    /**
     * Check if a feature is enabled
     * @param {string} name - Feature name
     * @returns {boolean} Feature enabled status
     */
    isFeatureEnabled(name) {
      const featureData = this.features.get(name);
      return featureData ? featureData.enabled : false;
    }

    /**
     * Get all registered features
     * @returns {Map} Map of all features
     */
    getAllFeatures() {
      return this.features;
    }

    /**
     * Cleanup all features
     */
    cleanup() {
      console.log('Cleaning up FeatureManager...');
      
      this.features.forEach((featureData) => {
        try {
          if (featureData.instance.cleanup) {
            featureData.instance.cleanup();
          }
        } catch (error) {
          console.error(`Error cleaning up feature '${featureData.name}':`, error);
        }
      });

      this.features.clear();
      this.initialized = false;
    }
  }

  // Create global instance
  window.SwaggerEnhancerFeatureManager = new FeatureManager();

  // Expose to global scope for debugging
  window.SwaggerEnhancerFeatureManager = window.SwaggerEnhancerFeatureManager;

})();
