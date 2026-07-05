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
  if (!iframe?.contentWindow) {
    console.log('[gemini-sidebar] getCurrentGeminiUrl: no iframe contentWindow');
    return GEMINI_BASE;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log('[gemini-sidebar] getCurrentGeminiUrl: TIMEOUT - injector did not respond');
      window.removeEventListener('message', handler);
      resolve(GEMINI_BASE);
    }, 1000);
    function handler(event) {
      if (event.data?.type === 'CURRENT_URL') {
        console.log('[gemini-sidebar] getCurrentGeminiUrl: got URL:', event.data.url);
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }
    }
    window.addEventListener('message', handler);
    console.log('[gemini-sidebar] getCurrentGeminiUrl: sending GET_URL to iframe');
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
  const oldTabId = currentTabId;

  console.log('[gemini-sidebar] TAB_CHANGED:', newTabId, 'tempChat:', prefs.tempChat, 'oldTabId:', oldTabId);

  if (!prefs.tempChat && oldTabId !== null) {
    const url = await getCurrentGeminiUrl();
    console.log('[gemini-sidebar] saving URL for tab', oldTabId, ':', url);
    tabUrls.set(oldTabId, url);
  }

  currentTabId = newTabId;

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
    console.log('[gemini-sidebar] restoring URL for tab', newTabId, ':', targetUrl);
  } else {
    console.log('[gemini-sidebar] no saved URL for tab', newTabId, ', using fresh chat');
  }

  console.log('[gemini-sidebar] reloading iframe with:', targetUrl);
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
      const file = new File([msg.markdown], msg.filename, { type: 'text/markdown' });
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', file: file },
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
