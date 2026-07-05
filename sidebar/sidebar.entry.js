import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;
let lastUploadTab = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

function setupIframeObserver() {
  const iframe = document.getElementById('gemini');
  if (!iframe) return;
}

async function getCurrentGeminiUrl() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return GEMINI_BASE;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(GEMINI_BASE);
    }, 2000);
    function handler(event) {
      if (event.data?.type === 'CURRENT_URL') {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }
    }
    window.addEventListener('message', handler);
    iframe.contentWindow.postMessage({ type: 'GET_URL' }, '*');
  });
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

  setupIframeObserver();
  await new Promise((r) => setTimeout(r, 4000));

  const prefs = await getPrefs();
  if (prefs.tempChat) {
    const iframe = document.getElementById('gemini');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
  }
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
  const hasSavedUrl = !prefs.tempChat && tabUrls.has(newTabId);
  if (hasSavedUrl) {
    targetUrl = tabUrls.get(newTabId);
  }

  const iframe = document.getElementById('gemini');
  if (iframe) {
    iframe.src = targetUrl;
  }
  await new Promise((r) => setTimeout(r, 4000));

  if (!hasSavedUrl) {
    if (prefs.tempChat) {
      const iframe = document.getElementById('gemini');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
      }
    }
    await triggerUpload();
  }
}

onSidebarLoad();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TAB_CHANGED') {
    onTabChanged(msg.tabId);
    return;
  }
  if (msg.type === 'ATTACH_FILE') {
    const iframe = document.getElementById('gemini');
    if (iframe?.contentWindow) {
      const file = new File([msg.markdown], msg.filename, { type: 'text/markdown' });
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', file: file },
        '*'
      );
    }
  }
});
