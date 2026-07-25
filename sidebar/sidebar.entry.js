import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const iframes = new Map();
let currentTabId = null;

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

async function onSidebarLoad() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) currentTabId = tabs[0].id;

  createIframe(currentTabId);
  showIframe(currentTabId);

  await new Promise((r) => setTimeout(r, 4000));

  const prefs = await getPrefs();
  const iframe = getIframe(currentTabId);
  if (prefs.tempChat && iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
  }
}

onSidebarLoad();

const copyBtn = document.getElementById('copy-website-btn');

copyBtn?.addEventListener('click', async () => {
  copyBtn.disabled = true;
  copyBtn.textContent = 'Extracting...';
  try {
    await browser.runtime.sendMessage({ type: 'EXTRACT_PAGE' });
  } catch (err) {
    copyBtn.textContent = 'Failed';
    copyBtn.disabled = false;
    setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  console.log('[sidebar] received message:', msg.type);
  if (msg.type === 'EXTRACT_RESULT') {
    console.log('[sidebar] EXTRACT_RESULT received, error:', msg.error);
    if (msg.error) {
      copyBtn.textContent = 'Failed';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
      return;
    }
    if (msg.pdf) {
      handlePdfResult(msg.pdf);
      return;
    }
    navigator.clipboard.writeText(msg.result.markdown).then(() => {
      console.log('[sidebar] clipboard write success');
      copyBtn.textContent = 'Copied!';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
    }).catch((err) => {
      console.log('[sidebar] clipboard write error:', err);
      copyBtn.textContent = 'Failed';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
    });
  }
});

async function handlePdfResult(pdf) {
  try {
    const binary = atob(pdf.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: pdf.mimeType || 'application/pdf' });

    const clipboardItem = new ClipboardItem({ [pdf.mimeType || 'application/pdf']: blob });
    await navigator.clipboard.write([clipboardItem]);
    console.log('[sidebar] PDF clipboard write success');
    copyBtn.textContent = 'Copied!';
  } catch (err) {
    console.log('[sidebar] PDF clipboard write failed:', err);
    copyBtn.textContent = 'Failed';
  }
  copyBtn.disabled = false;
  setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
}

browser.tabs.onRemoved.addListener((tabId) => {
  removeIframe(tabId);
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeInfo.tabId === currentTabId) return;
  currentTabId = activeInfo.tabId;

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
});