/** Start only after Swagger UI mounts, including asynchronously loaded specs. */
(() => {
  'use strict';

  const manager = window.SwaggerEnhancerFeatureManager;
  const initializeApp = () => {
    document.body.classList.add('swagger-enhancer-active');
    window.createSwaggerFloatingMenu();
    window.createSwaggerGithubLink();
    const features = {
      theme: window.ThemeFeature,
      search: window.SearchFeature,
      favorites: window.FavoritesFeature,
      scrollTop: window.ScrollTopFeature,
      hideResponses: window.HideResponsesFeature,
      hideSchemas: window.HideSchemasFeature,
      authorize: window.AuthorizeFeature,
      copyURL: window.CopyURLFeature
    };
    Object.entries(features).forEach(([name, Feature]) => manager.register(name, Feature));
    manager.initAll().then(() => console.log('Swagger Enhancer: Ready'));
  };

  const waitForSwagger = () => {
    if (document.querySelector('.swagger-ui')) {
      initializeApp();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector('.swagger-ui')) {
        observer.disconnect();
        initializeApp();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForSwagger, { once: true });
  } else {
    waitForSwagger();
  }

  // Available in the extension's isolated content-script context for debugging.
  window.SwaggerEnhancer = {
    manager: () => manager,
    utils: () => window.SwaggerEnhancerUtils,
    features: () => manager.getAllFeatures(),
    version: '1.0.1'
  };
})();
