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

      
      const initPromises = Array.from(this.features.values()).map(async (featureData) => {
        try {
          await featureData.instance.init();
          featureData.enabled = true;
        } catch (error) {
          console.error(`FeatureManager: Failed to initialize '${featureData.name}':`, error);
          featureData.enabled = false;
        }
      });

      await Promise.allSettled(initPromises);
      this.initialized = true;
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
      return featureData ? featureData.instance.isEnabled() : false;
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
          if (featureData.instance.destroy) {
            featureData.instance.destroy();
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


})();
