const SEARCH_ID = 'swagger-search-container';
const STYLE_ID = 'swagger-search-style';

function loadSearchStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('css/search.css');
    document.head.appendChild(link);
  }
}
loadSearchStyle();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_SEARCH') {
    if (message.enabled) {
      const tags = document.querySelectorAll('h3.opblock-tag');
      const routes = document.querySelectorAll('.opblock');
      insertSearchBar(tags, routes);
    } else {
      const existing = document.getElementById(SEARCH_ID);
      if (existing) existing.remove();
    }
  }
});

const observer = new MutationObserver(() => {
  const tags = document.querySelectorAll('h3.opblock-tag');
  const routes = document.querySelectorAll('.opblock');
  if (tags.length && routes.length) {
    observer.disconnect();
    chrome.storage.sync.get(['swaggerSearchEnabled'], (result) => {
      if (result.swaggerSearchEnabled) {
        insertSearchBar(tags, routes);
      }
    });
  }
});

const swaggerRoot = document.querySelector('.swagger-ui');
if (swaggerRoot) {
  observer.observe(swaggerRoot, { childList: true, subtree: true });
}

function insertSearchBar(tags, routes) {
  if (document.getElementById(SEARCH_ID)) return;

  const container = document.createElement('div');
  container.id = SEARCH_ID;

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search for tag or route...';

  const results = document.createElement('ul');

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!value) return (results.style.display = 'none');

    const matches = [];

    tags.forEach(tag => {
      const text = tag.dataset.tag || tag.textContent.trim();
      if (text.toLowerCase().includes(value)) {
        matches.push({ type: 'tag', text, el: tag });
      }
    });

    routes.forEach(route => {
      const methodEl = route.querySelector('.opblock-summary-method');
      const pathEl = route.querySelector('.opblock-summary-path');
      const descEl = route.querySelector('.opblock-summary-description');
      if (methodEl && pathEl) {
        const method = methodEl.textContent.trim();
        const path = pathEl.textContent.trim();
        const desc = descEl?.textContent.trim() || '';
        const searchText = `${method} ${path} ${desc}`.toLowerCase();
        if (searchText.includes(value)) {
          matches.push({ type: 'route', method, path, desc, el: route });
        }
      }
    });

    if (!matches.length) return (results.style.display = 'none');

    matches.slice(0, 10).forEach(match => {
      const li = document.createElement('li');
      if (match.type === 'tag') {
        li.innerHTML = `<span class="route-tag">[${match.text}]</span>`;
      } else {
        li.innerHTML = `
          <div>
            <span class="route-method" data-method="${match.method}">${match.method}</span>
            <span class="route-path">${match.path}</span>
          </div>
          <div class="route-desc">${match.desc}</div>
        `;
      }

      li.addEventListener('click', () => {
        match.el.scrollIntoView({ behavior: 'smooth' });
        results.style.display = 'none';
        input.value = '';
      });

      results.appendChild(li);
    });

    results.style.display = 'block';
  });

  container.appendChild(input);
  container.appendChild(results);
  document.body.appendChild(container);
}
