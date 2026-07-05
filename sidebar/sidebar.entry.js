import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

async function getSavedUrl(tabId) {
  const key = 'tab-url-' + tabId;
  const data = await browser.storage.session.get(key);
  return data[key] || null;
}

async function saveUrl(tabId, url) {
  await browser.storage.session.set({ ['tab-url-' + tabId]: url });
}

async function getCurrentGeminiUrl(iframe) {
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
  await new Promise((r) => setTimeout(r, 500));
  try {
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' });
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' }).catch(() => {});
  }
}

let currentTabId = null;
let urlSaveInterval = null;

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  currentTabId = tabs[0].id;

  const savedUrl = await getSavedUrl(currentTabId);
  const targetUrl = savedUrl || GEMINI_BASE;

  const iframe = document.getElementById('gemini');
  iframe.src = targetUrl;

  await new Promise((r) => setTimeout(r, 4000));

  if (!savedUrl) {
    const prefs = await getPrefs();
    if (prefs.tempChat && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
    await triggerUpload();
  }

  if (urlSaveInterval) clearInterval(urlSaveInterval);
  urlSaveInterval = setInterval(async () => {
    const url = await getCurrentGeminiUrl(iframe);
    await saveUrl(currentTabId, url);
  }, 2000);
}

init();

browser.runtime.onMessage.addListener((msg) => {
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
