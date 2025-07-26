// popup.js — handles UI toggle switches and communicates with content script

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');               // Theme toggle checkbox
  const searchToggle = document.getElementById('searchToggle');   // Search toggle checkbox
  const favoritesToggle = document.getElementById('favoritesToggle'); // Favorites toggle checkbox
  const scrollTopToggle = document.getElementById('scrollTopToggle'); // Scroll to Top toggle checkbox
  const container = document.getElementById('container');         // Popup container for styling

  // Load current settings from Chrome storage
  chrome.storage.sync.get(
    ['darkThemeEnabled', 'swaggerSearchEnabled', 'swaggerFavoritesEnabled', 'scrollTopEnabled'],
    (result) => {
      const darkEnabled = !!result.darkThemeEnabled;
      toggle.checked = darkEnabled;
      updateTheme(darkEnabled);

      const searchEnabled = !!result.swaggerSearchEnabled;
      if (searchToggle) {
        searchToggle.checked = searchEnabled;
      }

      const favoritesEnabled = result.swaggerFavoritesEnabled === true;
      if (favoritesToggle) {
        favoritesToggle.checked = favoritesEnabled;
      }

      const scrollTopEnabled = result.scrollTopEnabled === true;
      if (scrollTopToggle) {
        scrollTopToggle.checked = scrollTopEnabled;
      }
    }
  );

  // Handle theme toggle
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ darkThemeEnabled: enabled }, () => {
      updateTheme(enabled);
      notifyContent('TOGGLE_THEME', enabled);
    });
  });

  // Handle search toggle
  if (searchToggle) {
    searchToggle.addEventListener('change', () => {
      const enabled = searchToggle.checked;
      chrome.storage.sync.set({ swaggerSearchEnabled: enabled }, () => {
        notifyContent('TOGGLE_SEARCH', enabled);
      });
    });
  }

  // Handle favorites toggle
  if (favoritesToggle) {
    favoritesToggle.addEventListener('change', () => {
      const enabled = favoritesToggle.checked;
      chrome.storage.sync.set({ swaggerFavoritesEnabled: enabled }, () => {
        notifyContent('TOGGLE_FAVORITES', enabled);
      });
    });
  }

  // Handle scroll-to-top toggle
  if (scrollTopToggle) {
    scrollTopToggle.addEventListener('change', () => {
      const enabled = scrollTopToggle.checked;
      chrome.storage.sync.set({ scrollTopEnabled: enabled }, () => {
        notifyContent('TOGGLE_SCROLL_TOP', enabled);
      });
    });
  }

  // Send message to content script
  function notifyContent(type, enabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type,
          enabled
        });
      }
    });
  }

  // Update popup container theme class
  function updateTheme(enabled) {
    container.classList.toggle('dark', enabled);
    container.classList.toggle('light', !enabled);
  }
});
