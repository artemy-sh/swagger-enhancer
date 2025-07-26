const THEME_ID = 'swagger-dark-theme';

function addDarkTheme() {
  if (!document.getElementById(THEME_ID)) {
    const link = document.createElement('link');
    link.id = THEME_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('css/dark.css');
    document.head.appendChild(link);
  }
}

function removeDarkTheme() {
  const existing = document.getElementById(THEME_ID);
  if (existing) existing.remove();
}

chrome.storage.sync.get(['darkThemeEnabled'], (result) => {
  if (result.darkThemeEnabled) addDarkTheme();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_THEME') {
    message.enabled ? addDarkTheme() : removeDarkTheme();
  }
});
