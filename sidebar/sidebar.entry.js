import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: true, ...result?.prefs };
}

async function getCurrentGeminiUrl() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return GEMINI_BASE;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(GEMINI_BASE), 1000);
    window.addEventListener('message', function handler(event) {
      if (event.data?.type === 'CURRENT_URL') {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }
    });
    iframe.contentWindow.postMessage({ type: 'GET_URL' }, '*');
  });
}

async function reloadIframe(url) {
  const iframe = document.getElementById('gemini');
  if (!iframe) return;
  iframe.src = url;
}

async function tryClickTemporaryChat() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return;
  await new Promise((r) => setTimeout(r, 2000));
  iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
}

async function triggerUpload() {
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

  const prefs = await getPrefs();
  if (prefs.tempChat) {
    await tryClickTemporaryChat();
  }
  await triggerUpload();
}

async function onTabChanged(newTabId) {
  const prefs = await getPrefs();
  const iframe = document.getElementById('gemini');

  if (!prefs.tempChat && currentTabId !== null) {
    const url = await getCurrentGeminiUrl();
    tabUrls.set(currentTabId, url);
  }

  currentTabId = newTabId;

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
  }

  await reloadIframe(targetUrl);
  await new Promise((r) => setTimeout(r, 2000));

  if (prefs.tempChat) {
    await tryClickTemporaryChat();
  }
  await triggerUpload();
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
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', markdown: msg.markdown, filename: msg.filename },
        '*'
      );
    }
  }
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'INJECTOR_STATUS') {
    console.log('[gemini-sidebar] injector:', event.data.status, '-', event.data.detail);
  }
});