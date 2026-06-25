// background.js — Service worker
// When user clicks the extension icon, opens the full UI in a new tab

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
