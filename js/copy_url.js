/** Opt-in controls for copying full route URLs and documentation links. */
(() => {
  'use strict';

  class CopyURLFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super('copyFullUrlEnabled', 'css/copy_url.css', { messageType: 'TOGGLE_COPY_FULL_URL' });
      this.readyHandler = () => this.syncUIState();
    }

    syncUIState() {
      document.dispatchEvent(new CustomEvent('swagger-enhancer:copy-url-ui', {
        detail: JSON.stringify(this.enabled)
      }));
    }

    onEnable() {
      document.addEventListener('swagger-enhancer:favorites-ready', this.readyHandler);
      this.syncUIState();
    }

    onDisable() {
      document.removeEventListener('swagger-enhancer:favorites-ready', this.readyHandler);
      this.syncUIState();
    }
  }

  window.CopyURLFeature = CopyURLFeature;
})();
