/** User-initiated reviews and sharing. Never includes documentation or API data. */
(() => {
  'use strict';

  const STORE_URL = 'https://chromewebstore.google.com/detail/swagger-enhancer/dnadagbnobcgafbdebbabcgicfkpciam';
  const REVIEW_URL = `${STORE_URL}/reviews`;
  const REASON = 'Your rating helps others discover Swagger Enhancer and supports future improvements.';

  let destroyHeaderMascot = () => {};

  window.createSwaggerSupportLink = () => {
    if (document.getElementById('swagger-extension-review')) return;
    const menu = document.querySelector('#swagger-floating-menu .swagger-menu-right');
    if (!menu) return;
    const link = document.createElement('a');
    link.id = 'swagger-extension-review';
    link.href = REVIEW_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `${REASON} Opens Chrome Web Store in a new tab.`;
    link.setAttribute('aria-label', 'Like it? Rate it. Rate Swagger Enhancer in Chrome Web Store (opens in a new tab)');
    link.innerHTML = `
      <span class="swagger-review-mascot" aria-hidden="true"></span>
      <span class="swagger-review-copy"><span class="swagger-review-prefix">Like it?</span> <span class="swagger-review-action">Rate it</span></span>`;
    menu.appendChild(link);
    destroyHeaderMascot();
    destroyHeaderMascot = window.SwaggerEnhancerMascot.mount(link.querySelector('.swagger-review-mascot'), link);
  };

  window.SwaggerEnhancerSupport = {
    destroyHeader() { destroyHeaderMascot(); destroyHeaderMascot = () => {}; },
    initPopup(panel) {
      if (!panel || panel.dataset.supportReady) return;
      panel.dataset.supportReady = 'true';
      window.SwaggerEnhancerMascot.mount(panel.querySelector('[data-support-mascot]'), panel);
      panel.querySelector('[data-support-review]').href = REVIEW_URL;
      const button = panel.querySelector('[data-support-share]');
      const status = panel.querySelector('[role="status"]');
      const manualLink = panel.querySelector('[data-support-url]');
      manualLink.value = STORE_URL;
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = '';
        manualLink.hidden = true;
        try {
          await navigator.clipboard.writeText(STORE_URL);
          status.textContent = 'Link copied. Share it with your team.';
        } catch {
          manualLink.hidden = false;
          manualLink.focus();
          manualLink.select();
          status.textContent = 'Copy unavailable. Select and copy the link below.';
        } finally {
          button.disabled = false;
        }
      });
    }
  };
})();
