/** Shortcut to Swagger's dialog with an optional client ID / username label. */
(() => {
  'use strict';

  // Swagger's original filled 20px lock silhouettes.
  const LOCK_PATH = 'M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8zM12 8H8V5.199C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8z';
  const UNLOCK_PATH = 'M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V6h2v-.801C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8z';

  const SOURCE = '.swagger-ui .auth-wrapper button.authorize';

  class AuthorizeFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super('authorizeInHeaderEnabled', 'css/authorize.css', { messageType: 'TOGGLE_AUTHORIZE_IN_HEADER' });
    }

    onEnable() {
      document.body.classList.add('swagger-authorization-enabled');
      this.identityHandler = event => {
        let names;
        try { names = JSON.parse(event.detail); } catch { return; }
        if (!Array.isArray(names) || !names.every(name => typeof name === 'string')) return;
        this.identity = names.join(', ');
        this.updateButton();
      };
      this.identityChangedHandler = () => {
        this.syncUIState();
        this.requestIdentity();
      };
      document.addEventListener('swagger-enhancer:auth-identity', this.identityHandler);
      document.addEventListener('swagger-enhancer:auth-changed', this.identityChangedHandler);
      document.addEventListener('swagger-enhancer:favorites-ready', this.identityChangedHandler);
      this.syncUIState();
      this.refresh();
      this.observer = new MutationObserver(mutations => {
        if (this.source?.isConnected && this.button?.isConnected) return;
        const selector = '.swagger-ui, .auth-wrapper, button.authorize, #swagger-floating-menu';
        if (this.source || mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes]
          .some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))))) {
          this.refresh();
        }
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    refresh() {
      const source = document.querySelector(SOURCE);
      const menu = document.querySelector('#swagger-floating-menu .swagger-menu-right');
      this.sourceObserver?.disconnect();
      this.source = source;
      if (!source || !menu) {
        this.removeButton();
        return;
      }
      if (!this.button?.isConnected) {
        this.button = document.createElement('button');
        this.button.id = 'swagger-header-authorize';
        this.button.type = 'button';
        this.button.setAttribute('aria-haspopup', 'dialog');
        this.button.addEventListener('click', () => {
          // Resolve again in case Swagger replaced its auth control since the last mutation.
          document.querySelector(SOURCE)?.click();
        });
        menu.prepend(this.button);
      }
      document.getElementById('swagger-floating-menu').classList.add('swagger-auth-in-header');
      this.requestIdentity();
      this.updateButton();
      this.sourceObserver = new MutationObserver(() => {
        this.requestIdentity();
        this.updateButton();
      });
      this.sourceObserver.observe(source, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'disabled', 'href', 'xlink:href']
      });
    }

    requestIdentity() {
      document.dispatchEvent(new Event('swagger-enhancer:auth-identity-request'));
    }

    syncUIState() {
      document.dispatchEvent(new CustomEvent('swagger-enhancer:auth-ui', { detail: JSON.stringify(this.enabled) }));
    }

    updateButton() {
      if (!this.button || !this.source) return;
      const authorized = this.source.classList.contains('locked');
      const label = authorized ? `Authorized${this.identity ? `: ${this.identity}` : ''}` : 'Authorize';
      this.button.disabled = this.source.disabled;
      this.button.classList.toggle('is-authorized', authorized);
      this.button.title = label;
      this.button.setAttribute('aria-label', this.button.title);
      const text = document.createElement('span');
      text.textContent = label;
      // Swagger's native button uses a closed lock for "authorized". Our header
      // deliberately shows access granted as an open lock, just like the routes.
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 20 20');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', authorized ? UNLOCK_PATH : LOCK_PATH);
      icon.appendChild(path);
      this.button.replaceChildren(icon, text);
    }

    removeButton() {
      this.button?.remove();
      this.button = null;
      document.getElementById('swagger-floating-menu')?.classList.remove('swagger-auth-in-header');
    }

    onDisable() {
      this.syncUIState();
      document.body.classList.remove('swagger-authorization-enabled');
      document.removeEventListener('swagger-enhancer:auth-identity', this.identityHandler);
      document.removeEventListener('swagger-enhancer:auth-changed', this.identityChangedHandler);
      document.removeEventListener('swagger-enhancer:favorites-ready', this.identityChangedHandler);
      this.identity = '';
      this.sourceObserver?.disconnect();
      this.sourceObserver = null;
      this.source = null;
      this.removeButton();
    }
  }

  window.AuthorizeFeature = AuthorizeFeature;
})();
