/** Start only after Swagger UI mounts, including asynchronously loaded specs. */
(() => {
  'use strict';

  const manager = window.SwaggerEnhancerFeatureManager;
  let currentRoot = null;
  let siteRules;
  let policyReady = false;
  let policyRevision = 0;
  const initializeApp = () => {
    document.body.classList.add('swagger-enhancer-active');
    window.createSwaggerFloatingMenu();
    window.createSwaggerSupportLink();
    const features = {
      theme: window.ThemeFeature,
      search: window.SearchFeature,
      favorites: window.FavoritesFeature,
      scrollTop: window.ScrollTopFeature,
      hideResponses: window.HideResponsesFeature,
      hideSchemas: window.HideSchemasFeature,
      schemaPreview: window.SchemaPreviewFeature,
      authorize: window.AuthorizeFeature,
      copyURL: window.CopyURLFeature
    };
    Object.entries(features).forEach(([name, Feature]) => manager.register(name, Feature));
    manager.initAll().then(() => console.log('Swagger Enhancer: Ready'));
  };

  const reconcileSwagger = () => {
    if (!window.document) return;
    const root = policyReady && window.SwaggerEnhancerSites.matches(location.href, siteRules)
      ? document.querySelector('.swagger-ui') : null;
    if (root === currentRoot) return;
    if (currentRoot) {
      document.dispatchEvent(new Event('swagger-enhancer:detach'));
      window.SwaggerEnhancerSupport.destroyHeader();
      manager.cleanup();
      document.getElementById('swagger-floating-menu')?.remove();
      document.body.classList.remove('swagger-enhancer-active', 'swagger-keyboard-navigation');
    }
    currentRoot = root;
    if (root) initializeApp();
  };
  const applyPolicy = value => {
    try { siteRules = window.SwaggerEnhancerSites.resolve(value); }
    catch { siteRules = []; }
    policyReady = true;
    reconcileSwagger();
  };
  const policyChanged = (changes, area) => {
    if (area !== 'sync' || !Object.hasOwn(changes, window.SwaggerEnhancerSites.KEY)) return;
    policyRevision++;
    applyPolicy(changes[window.SwaggerEnhancerSites.KEY].newValue);
  };
  const waitForSwagger = () => {
    chrome.storage.onChanged.addListener(policyChanged);
    const revision = policyRevision;
    chrome.storage.sync.get([window.SwaggerEnhancerSites.KEY], result => {
      if (revision === policyRevision) applyPolicy(chrome.runtime.lastError ? undefined : result[window.SwaggerEnhancerSites.KEY]);
    });
    const observer = new MutationObserver(reconcileSwagger);
    observer.observe(document.body, { childList: true, subtree: true });
  };

  document.addEventListener('keydown', () => {
    if (currentRoot) document.body.classList.add('swagger-keyboard-navigation');
  }, true);
  document.addEventListener('pointerdown', () => {
    document.body.classList.remove('swagger-keyboard-navigation');
  }, true);

  document.addEventListener('swagger-enhancer:spec-changed', event => {
    try { if (JSON.parse(event.detail).changed) manager.refreshSpec(); } catch { /* Invalid page message. */ }
  });

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
    version: '2.1.0'
  };
})();
