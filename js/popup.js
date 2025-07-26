// popup.js — handles UI toggle switches and communicates with content script

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');               // Theme toggle checkbox
  const searchToggle = document.getElementById('searchToggle');   // Search toggle checkbox
  const favoritesToggle = document.getElementById('favoritesToggle'); // Favorites toggle checkbox
  const container = document.getElementById('container');         // Popup container for styling

  // Load current settings from Chrome storage
  chrome.storage.sync.get(['darkThemeEnabled', 'swaggerSearchEnabled', 'swaggerFavoritesEnabled'], (result) => {
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
  });

  // Handle theme toggle
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;

    chrome.storage.sync.set({ darkThemeEnabled: enabled }, () => {
      updateTheme(enabled);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_THEME',
            enabled
          });
        }
      });
    });
  });

  // Handle search toggle
  if (searchToggle) {
    searchToggle.addEventListener('change', () => {
      const enabled = searchToggle.checked;

      chrome.storage.sync.set({ swaggerSearchEnabled: enabled }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'TOGGLE_SEARCH',
              enabled
            });
          }
        });
      });
    });
  }

  // Handle favorites toggle
  if (favoritesToggle) {
    favoritesToggle.addEventListener('change', () => {
      const enabled = favoritesToggle.checked;

      chrome.storage.sync.set({ swaggerFavoritesEnabled: enabled }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'TOGGLE_FAVORITES',
              enabled
            });
          }
        });
      });
    });
  }

  // Update popup container theme class
  function updateTheme(enabled) {
    container.classList.toggle('dark', enabled);
    container.classList.toggle('light', !enabled);
  }
});
