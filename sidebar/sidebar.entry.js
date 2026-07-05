import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const iframes = new Map();
let currentTabId = null;
let lastUploadTab = null;
let sidebarEnabled = false;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

function getIframe(tabId) {
  return iframes.get(tabId);
}

function createIframe(tabId) {
  const existing = document.getElementById('gemini-' + tabId);
  if (existing) return existing;

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
}

function removeIframe(tabId) {
  const iframe = iframes.get(tabId);
  if (iframe) {
    iframe.remove();
    iframes.delete(tabId);
  }
}

function showDisabled() {
  document.getElementById('disabled-panel').style.display = 'flex';
  for (const iframe of iframes.values()) {
    iframe.style.display = 'none';
  }
}

function showEnabled(tabId) {
  document.getElementById('disabled-panel').style.display = 'none';
  createIframe(tabId);
  showIframe(tabId);
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

async function enableSidebar(tabId) {
  sidebarEnabled = true;
  currentTabId = tabId;
  showEnabled(tabId);

  const isNew = !iframes.has(tabId) || true;
  await new Promise((r) => setTimeout(r, 4000));

  const prefs = await getPrefs();
  const iframe = getIframe(tabId);
  if (prefs.tempChat && iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
  }
  await triggerUpload();
}

function disableSidebar() {
  sidebarEnabled = false;
  showDisabled();
}

async function onTabChanged(newTabId, enabled) {
  if (!enabled) {
    disableSidebar();
    return;
  }

  sidebarEnabled = true;
  const wasNew = !iframes.has(newTabId);
  showEnabled(newTabId);

  if (wasNew) {
    await new Promise((r) => setTimeout(r, 4000));
    const prefs = await getPrefs();
    const iframe = getIframe(newTabId);
    if (prefs.tempChat && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
  }

  currentTabId = newTabId;
  lastUploadTab = null;
  await triggerUpload();
}

(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) currentTabId = tabs[0].id;
  showDisabled();
})();

browser.tabs.onRemoved.addListener((tabId) => {
  removeIframe(tabId);
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SIDEBAR_TOGGLED') {
    if (msg.enabled) {
      enableSidebar(msg.tabId);
    } else {
      disableSidebar();
    }
    return;
  }
  if (msg.type === 'TAB_CHANGED') {
    onTabChanged(msg.tabId, msg.enabled);
    return;
  }
  if (msg.type === 'ATTACH_FILE') {
    const iframe = getIframe(currentTabId);
    if (iframe?.contentWindow) {
      const file = new File([msg.markdown], msg.filename, { type: 'text/markdown' });
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', file: file },
        '*'
      );
    }
  }
});
