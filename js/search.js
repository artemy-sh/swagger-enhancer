const SEARCH_ID = 'swagger-search-container';
const STYLE_ID  = 'swagger-search-style';
const MENU_ID   = 'swagger-floating-menu';
const FALLBACK_MENU_H = 55;
const SMOOTH_MS = 400;

/* -------- helpers -------- */

// current header height
const getMenuHeight = () =>
  document.getElementById(MENU_ID)?.offsetHeight || FALLBACK_MENU_H;

// custom smooth scroll with offset
function smoothScrollToElement(el, offset = 0, duration = SMOOTH_MS) {
  if (!el) return;
  const startY = window.scrollY;
  const targetY = el.getBoundingClientRect().top + startY - offset;
  const dist = targetY - startY;
  let start = null;

  const step = (t) => {
    if (!start) start = t;
    const p = Math.min((t - start) / duration, 1);
    const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    window.scrollTo(0, startY + dist * ease);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------- style loader -------- */

const loadSearchStyle = () => {
  if (!document.getElementById(STYLE_ID)) {
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('css/search.css');
    document.head.appendChild(link);
  }
};
loadSearchStyle();

/* -------- toggle from popup -------- */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'TOGGLE_SEARCH') return;
  msg.enabled
    ? insertSearchBar(
        document.querySelectorAll('h3.opblock-tag'),
        document.querySelectorAll('.opblock')
      )
    : document.getElementById(SEARCH_ID)?.remove();
});

/* -------- wait for Swagger UI -------- */

const observer = new MutationObserver(() => {
  const tags = document.querySelectorAll('h3.opblock-tag');
  const routes = document.querySelectorAll('.opblock');
  if (tags.length && routes.length) {
    observer.disconnect();
    chrome.storage.sync.get(['swaggerSearchEnabled'], (r) => {
      if (r.swaggerSearchEnabled) insertSearchBar(tags, routes);
    });
  }
});
document.querySelector('.swagger-ui') &&
  observer.observe(document.querySelector('.swagger-ui'), {
    childList: true,
    subtree: true,
  });

/* -------- search panel -------- */

function insertSearchBar(tags, routes) {
  if (document.getElementById(SEARCH_ID)) return;

  const container = document.createElement('div');
  container.id = SEARCH_ID;

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search for tag or route…';
  input.className = 'swagger-search-input';

  const results = document.createElement('ul');
  results.className = 'swagger-search-results';

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!val) return (results.style.display = 'none');

    const matches = [];

    tags.forEach((tag) => {
      const text = tag.dataset.tag || tag.textContent.trim();
      if (text.toLowerCase().includes(val))
        matches.push({ type: 'tag', text, el: tag });
    });

    routes.forEach((route) => {
      const m = route.querySelector('.opblock-summary-method')?.textContent?.trim();
      const p = route.querySelector('.opblock-summary-path')?.textContent?.trim();
      const d =
        route.querySelector('.opblock-summary-description')?.textContent?.trim() || '';
      if (m && p && `${m} ${p} ${d}`.toLowerCase().includes(val))
        matches.push({ type: 'route', method: m, path: p, desc: d, el: route });
    });

    if (!matches.length) return (results.style.display = 'none');

    matches.slice(0, 10).forEach((match) => {
      const li = document.createElement('li');
      li.innerHTML =
        match.type === 'tag'
          ? `<span class="route-tag">[${match.text}]</span>`
          : `<div><span class="route-method" data-method="${match.method}">${match.method}</span><span class="route-path">${match.path}</span></div><div class="route-desc">${match.desc}</div>`;
      li.onclick = () => {
        smoothScrollToElement(match.el, getMenuHeight());
        results.style.display = 'none';
        input.value = '';
      };
      results.appendChild(li);
    });

    results.style.display = 'block';
  });

  container.append(input, results);

  (document.querySelector('#swagger-floating-menu .swagger-menu-right') ||
    document.body).appendChild(container);
}
