(() => {
  let scrollTopEnabled = false;
  let button = null;

  const createScrollToTopButton = () => {
    if (button || document.getElementById('swagger-scroll-top')) return;

    button = document.createElement('div');
    button.id = 'swagger-scroll-top';
    button.className = 'swagger-scroll-top';
    button.title = 'Scroll to top';
    button.style.display = 'none';

    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="top-arrow" aria-hidden="true" focusable="false">
        <path d="M 17.418 14.908 C 17.69 15.176 18.127 15.176 18.397 14.908 C 18.667 14.64 18.668 14.207 18.397 13.939 L 10.489 6.109 C 10.219 5.841 9.782 5.841 9.51 6.109 L 1.602 13.939 C 1.332 14.207 1.332 14.64 1.602 14.908 C 1.873 15.176 2.311 15.176 2.581 14.908 L 10 7.767 L 17.418 14.908 Z"></path>
      </svg>
    `;

    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.body.appendChild(button);
    window.addEventListener('scroll', onScroll);
    onScroll();
  };

  const removeScrollToTopButton = () => {
    if (button) {
      button.remove();
      button = null;
    }
    window.removeEventListener('scroll', onScroll);
  };

  const onScroll = () => {
    if (!button) return;
    const show = window.scrollY > 150;
    button.style.display = show ? 'flex' : 'none';
  };

  const setScrollTopEnabled = (enabled) => {
    scrollTopEnabled = enabled;
    if (enabled) {
      createScrollToTopButton();
    } else {
      removeScrollToTopButton();
    }
  };

  // Init from storage
  chrome.storage.sync.get(['scrollTopEnabled'], (res) => {
    setScrollTopEnabled(res.scrollTopEnabled === true);
  });

  // React to popup changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_SCROLL_TOP') {
      setScrollTopEnabled(message.enabled === true);
    }
  });
})();
