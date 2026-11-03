/** Small vector mascot. Pointer coordinates stay in memory and are never stored. */
(() => {
  'use strict';

  const cats = new Set();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  let listening = false;
  let frame = 0;
  let pointer = null;
  let suspended = false;
  const canAnimate = () => !suspended && !reducedMotion?.matches && !document.hidden;
  const reset = () => {
    pointer = null;
    cancelAnimationFrame(frame);
    frame = 0;
    cats.forEach(cat => {
      cat.element.style.setProperty('--cat-look-x', '0px');
      cat.element.style.setProperty('--cat-look-y', '0px');
    });
  };
  const paint = () => {
    frame = 0;
    if (!pointer || !canAnimate()) return;
    // Read layout before writing styles, once per pointer frame, never in an idle loop.
    const positions = [...cats].map(cat => ({ cat, rect: cat.element.getBoundingClientRect() }));
    positions.forEach(({ cat, rect }) => {
      if (!rect.width || !rect.height || !cat.element.isConnected) return;
      const x = Math.tanh((pointer.x - rect.left - rect.width / 2) / 220);
      const y = Math.tanh((pointer.y - rect.top - rect.height / 2) / 220);
      cat.element.style.setProperty('--cat-look-x', `${(x * 2.2).toFixed(2)}px`);
      cat.element.style.setProperty('--cat-look-y', `${(y * 1.6).toFixed(2)}px`);
    });
  };
  const move = event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const syncTracking = () => {
    const next = cats.size > 0 && !!finePointer?.matches && canAnimate();
    if (next !== listening) {
      document[next ? 'addEventListener' : 'removeEventListener']('pointermove', move, { passive: true });
      document[next ? 'addEventListener' : 'removeEventListener']('pointerleave', reset);
      window[next ? 'addEventListener' : 'removeEventListener']('blur', reset);
      listening = next;
    }
    if (!next) {
      reset();
      cats.forEach(cat => cat.rest());
    }
  };
  const destroyAll = () => { [...cats].forEach(cat => cat.destroy()); };
  const pageHide = event => {
    if (event.persisted) { suspended = true; syncTracking(); }
    else destroyAll();
  };
  const pageShow = () => { suspended = false; syncTracking(); };

  const artwork = `<svg class="se-cat-art" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g class="se-cat-pose"><path class="se-cat-tail" d="M54 75c16 2 24-12 19-21-3-6-11-6-13-1-2 5 4 10 7 6"/>
    <path class="se-cat-body" d="M27 49C26 54 20 62 20 68C20 74 24 76 31 76L50 76C57 76 63 74 60 66C58 60 55 54 53 49"/>
    <path class="se-cat-paw se-cat-paw-left" d="M33 58C31 63 31 70 33 75"/>
    <path class="se-cat-paw se-cat-paw-right" d="M47 75C49 70 49 63 47 58"/>
    <g class="se-cat-head">
      <path d="m17 31 1-20c0-4 2-5 5-2l10 9c4-1 10-1 14 0l10-9c3-3 5-2 5 2l1 20c3 12-5 20-23 20s-26-8-23-20Z"/>
      <g class="se-cat-eyes">
        <g class="se-cat-pupils" fill="currentColor" stroke="none">
          <circle class="se-cat-eye" cx="30" cy="32" r="2.5"/><circle class="se-cat-eye" cx="50" cy="32" r="2.5"/>
        </g>
      </g>
      <path d="M38 40h4l-2 2-2-2Z" fill="currentColor" stroke="none"/>
      <path d="M40 42v3m0 0c-2 2-4 2-5 0m5 0c2 2 4 2 5 0m-23-8-8-2m8 7-8 2m44-7 8-2m-8 7 8 2"/>
    </g>
    </g>
  </svg>`;

  window.SwaggerEnhancerMascot = {
    mount(host, trigger = host) {
      if (!host) return () => {};
      const element = document.createElement('span');
      element.className = 'se-cat';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = artwork;
      host.replaceChildren(element);
      const cat = {
        element,
        rest() { element.classList.remove('is-engaged'); }
      };
      const hop = event => {
        if (!canAnimate() || (event.type === 'pointerenter' && !finePointer?.matches)) return;
        element.classList.add('is-engaged');
      };
      const finishHop = event => {
        if (event.animationName === 'se-cat-hop' && event.target.classList.contains('se-cat-pose')) cat.rest();
      };
      element.addEventListener('animationend', finishHop);
      const destroy = () => {
        cat.rest();
        trigger.removeEventListener('pointerenter', hop);
        trigger.removeEventListener('focusin', hop);
        element.removeEventListener('animationend', finishHop);
        cats.delete(cat);
        syncTracking();
        if (!cats.size) {
          reducedMotion?.removeEventListener?.('change', syncTracking);
          finePointer?.removeEventListener?.('change', syncTracking);
          document.removeEventListener('visibilitychange', syncTracking);
          window.removeEventListener('pagehide', pageHide);
          window.removeEventListener('pageshow', pageShow);
          suspended = false;
        }
      };
      cat.destroy = destroy;
      if (!cats.size) {
        reducedMotion?.addEventListener?.('change', syncTracking);
        finePointer?.addEventListener?.('change', syncTracking);
        document.addEventListener('visibilitychange', syncTracking);
        window.addEventListener('pagehide', pageHide);
        window.addEventListener('pageshow', pageShow);
      }
      cats.add(cat);
      trigger.addEventListener('pointerenter', hop);
      trigger.addEventListener('focusin', hop);
      syncTracking();
      return destroy;
    },
    destroyAll
  };
})();
