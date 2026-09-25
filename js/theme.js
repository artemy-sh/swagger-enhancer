/**
 * Theme management for Swagger Enhancer
 * Handles dark/light theme switching
 */

(() => {
  'use strict';

  const THEME_CSS_ID = 'swagger-dark-theme';
  const STORAGE_KEY = 'darkThemeEnabled';

  /**
   * Theme feature class extending base feature
   */
  class ThemeFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super(STORAGE_KEY, 'css/dark.css', { messageType: 'TOGGLE_THEME' });
      this.cssId = THEME_CSS_ID;
    }

    onEnable() {
      document.documentElement.classList.add('swagger-dark-theme');
    }

    onDisable() {
      document.documentElement.classList.remove('swagger-dark-theme');
    }
  }

  // Export class to global scope
  window.ThemeFeature = ThemeFeature;

  // Don't auto-initialize - let main.js handle it

})();
