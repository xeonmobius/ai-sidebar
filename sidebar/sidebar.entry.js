import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const iframes = new Map();
let currentTabId = null;
let lastUploadTab = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

function createIframe(tabId) {
  if (iframes.has(tabId)) return iframes.get(tabId);

  const iframe = document.createElement('iframe');
  iframe.id = 'gemini-' + tabId;
  iframe.src = GEMINI_BASE;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:none;position:absolute;top:0;left:0;';
  document.getElementById('iframe-container').appendChild(iframe);
  iframes.set(tabId, iframe);
  return iframe;
}

function showIframe(tabId) {
  for (const [id, iframe] of iframes) {
    iframe.style.display = id === tabId ? 'block' : 'none';
  }
  document.getElementById('disabled-panel').style.display = 'none';
}

function showDisabled() {
  for (const iframe of iframes.values()) {
    iframe.style.display = 'none';
  }
  document.getElementById('disabled-panel').style.display = 'flex';
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

async function enableForTab(tabId) {
  currentTabId = tabId;
  const isNew = !iframes.has(tabId);
  createIframe(tabId);
  showIframe(tabId);

  if (isNew) {
    await new Promise((r) => setTimeout(r, 4000));
    const prefs = await getPrefs();
    const iframe = iframes.get(tabId);
    if (prefs.tempChat && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
    await triggerUpload();
  } else {
    lastUploadTab = null;
    await triggerUpload();
  }
}

(async () => {
  const state = await browser.runtime.sendMessage({ type: 'GET_SIDEBAR_STATE' });
  currentTabId = state.tabId;
  if (state.enabled) {
    await enableForTab(state.tabId);
  } else {
    showDisabled();
  }
})();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SIDEBAR_TOGGLED') {
    if (msg.enabled) {
      enableForTab(msg.tabId);
    } else {
      showDisabled();
    }
    return;
  }
  if (msg.type === 'TAB_CHANGED') {
    currentTabId = msg.tabId;
    lastUploadTab = null;
    if (msg.enabled) {
      enableForTab(msg.tabId);
    } else {
      showDisabled();
    }
    return;
  }
  if (msg.type === 'ATTACH_FILE') {
    const iframe = iframes.get(currentTabId);
    if (iframe?.contentWindow) {
      const file = new File([msg.markdown], msg.filename, { type: 'text/markdown' });
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', file: file },
        '*'
      );
    }
  }
});
