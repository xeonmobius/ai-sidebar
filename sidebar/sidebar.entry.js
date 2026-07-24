import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const iframes = new Map();
let currentTabId = null;
let lastUploadTab = null;

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
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
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

  const iframe = createIframe(currentTabId);
  showIframe(currentTabId);

  await new Promise((r) => setTimeout(r, 4000));

  const prefs = await getPrefs();
  if (prefs.tempChat && iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
  }
  await triggerUpload();
}

onSidebarLoad();

document.getElementById('pdf-input')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const iframe = getIframe(currentTabId);
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'ATTACH_FILE', file }, '*');
  }
  const picker = document.getElementById('pdf-picker');
  if (picker) picker.style.display = 'none';
});

browser.tabs.onRemoved.addListener((tabId) => {
  removeIframe(tabId);
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeInfo.tabId === currentTabId) return;
  currentTabId = activeInfo.tabId;
  lastUploadTab = null;

  if (!iframes.has(activeInfo.tabId)) {
    createIframe(activeInfo.tabId);
    await new Promise((r) => setTimeout(r, 4000));
    const prefs = await getPrefs();
    const iframe = getIframe(activeInfo.tabId);
    if (prefs.tempChat && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
  }
  showIframe(activeInfo.tabId);
  await triggerUpload();
});

browser.runtime.onMessage.addListener((msg) => {
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
  if (msg.type === 'PDF_PICKER_NEEDED') {
    const picker = document.getElementById('pdf-picker');
    if (picker) picker.style.display = 'flex';
  }
  if (msg.type === 'ATTACH_PDF') {
    const iframe = getIframe(currentTabId);
    if (iframe?.contentWindow) {
      const binary = atob(msg.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const file = new File([bytes], msg.filename, { type: msg.mimeType || 'application/pdf' });
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', file: file },
        '*'
      );
    }
  }
});
