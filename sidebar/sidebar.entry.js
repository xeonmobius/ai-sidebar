import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;
let lastUploadTab = null;
let geminiTabId = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

async function ensureGeminiTab() {
  if (geminiTabId !== null) {
    try {
      const tab = await browser.tabs.get(geminiTabId);
      if (tab && tab.url?.includes('gemini.google.com')) {
        return geminiTabId;
      }
    } catch {
      geminiTabId = null;
    }
  }

  const tabs = await browser.tabs.query({ url: 'https://gemini.google.com/*' });
  if (tabs.length) {
    geminiTabId = tabs[0].id;
    return geminiTabId;
  }

  const tab = await browser.tabs.create({ url: GEMINI_BASE, active: false });
  geminiTabId = tab.id;
  await new Promise((r) => setTimeout(r, 3000));
  return geminiTabId;
}

async function getCurrentGeminiUrl() {
  if (geminiTabId === null) return GEMINI_BASE;
  try {
    const tab = await browser.tabs.get(geminiTabId);
    return tab?.url || GEMINI_BASE;
  } catch {
    return GEMINI_BASE;
  }
}

async function navigateGemini(url) {
  const tabId = await ensureGeminiTab();
  await browser.tabs.update(tabId, { url });
  await new Promise((r) => setTimeout(r, 3000));
}

async function triggerUpload() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  const tabId = tabs[0].id;

  if (lastUploadTab === tabId) return;
  lastUploadTab = tabId;

  await new Promise((r) => setTimeout(r, 500));
  try {
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' });
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' }).catch(() => {});
  }
}

async function onSidebarLoad() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) currentTabId = tabs[0].id;

  await ensureGeminiTab();
  await triggerUpload();
}

async function onTabChanged(newTabId) {
  const prefs = await getPrefs();
  const oldTabId = currentTabId;

  if (!prefs.tempChat && oldTabId !== null) {
    const url = await getCurrentGeminiUrl();
    tabUrls.set(oldTabId, url);
  }

  currentTabId = newTabId;
  lastUploadTab = null;

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
  }

  await navigateGemini(targetUrl);
  await triggerUpload();
}

onSidebarLoad();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TAB_CHANGED') {
    onTabChanged(msg.tabId);
    return;
  }
  if (msg.type === 'GET_GEMINI_TAB_ID') {
    ensureGeminiTab().then((tabId) => {
      browser.runtime.sendMessage({ type: 'GEMINI_TAB_ID', tabId }).catch(() => {});
    });
    return;
  }
  if (msg.type === 'ATTACH_FILE') {
    if (geminiTabId === null) return;
    const file = new File([msg.markdown], msg.filename, { type: 'text/markdown' });
    browser.tabs.sendMessage(geminiTabId, { type: 'ATTACH_FILE', file }).catch(() => {});
  }
});
