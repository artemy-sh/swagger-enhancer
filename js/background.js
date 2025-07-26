// background.js — listens for messages and injects dark theme CSS when requested

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.action === 'inject-css' &&
    sender?.tab?.id &&
    Number.isInteger(sender.tab.id)
  ) {
    chrome.scripting.insertCSS({
      target: { tabId: sender.tab.id },
      files: ['css/dark.css']
    }).catch((error) => {
      console.error('Failed to inject dark.css:', error);
    });
  }
});
