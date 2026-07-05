import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;
let lastUploadTab = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

async function injectIntoIframe() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return;
    const tabId = tabs[0].id;

    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const geminiFrame = frames.find(f => f.url.includes('gemini.google.com'));
    if (!geminiFrame) {
      console.log('[gemini-sidebar] no gemini frame found');
      return;
    }

    console.log('[gemini-sidebar] injecting into frame:', geminiFrame.url);
    await browser.scripting.executeScript({
      target: { tabId, frameId: geminiFrame.frameId },
      files: ['content/gemini-injector.bundle.js'],
    });
    console.log('[gemini-sidebar] injection complete');
  } catch (e) {
    console.log('[gemini-sidebar] inject failed:', e.message);
  }
}

function setupIframeObserver() {
  const iframe = document.getElementById('gemini');
  if (!iframe) return;

  iframe.addEventListener('load', async () => {
    console.log('[gemini-sidebar] iframe loaded, re-injecting...');
    await new Promise((r) => setTimeout(r, 1500));
    await injectIntoIframe();
  });
}

async function getCurrentGeminiUrl() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) {
    console.log('[gemini-sidebar] getCurrentGeminiUrl: no iframe');
    return GEMINI_BASE;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log('[gemini-sidebar] getCurrentGeminiUrl: TIMEOUT');
      window.removeEventListener('message', handler);
      resolve(GEMINI_BASE);
    }, 2000);
    function handler(event) {
      if (event.data?.type === 'CURRENT_URL') {
        console.log('[gemini-sidebar] getCurrentGeminiUrl: got', event.data.url);
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }
    }
    window.addEventListener('message', handler);
    console.log('[gemini-sidebar] getCurrentGeminiUrl: sending GET_URL');
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
  console.log('[gemini-sidebar] sidebar loaded, currentTabId:', currentTabId);

  setupIframeObserver();
  await new Promise((r) => setTimeout(r, 3000));
  await injectIntoIframe();
  await new Promise((r) => setTimeout(r, 1000));

  const prefs = await getPrefs();
  console.log('[gemini-sidebar] tempChat:', prefs.tempChat);
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

  console.log('[gemini-sidebar] TAB_CHANGED:', newTabId, 'from:', oldTabId, 'tempChat:', prefs.tempChat);

  if (!prefs.tempChat && oldTabId !== null) {
    const url = await getCurrentGeminiUrl();
    console.log('[gemini-sidebar] saving URL for tab', oldTabId, ':', url);
    tabUrls.set(oldTabId, url);
    console.log('[gemini-sidebar] tabUrls now has', tabUrls.size, 'entries');
  }

  currentTabId = newTabId;
  lastUploadTab = null;

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
    console.log('[gemini-sidebar] RESTORING URL for tab', newTabId, ':', targetUrl);
  } else {
    console.log('[gemini-sidebar] no saved URL for tab', newTabId, ', using fresh chat');
  }

  const iframe = document.getElementById('gemini');
  if (iframe) {
    console.log('[gemini-sidebar] setting iframe.src to:', targetUrl);
    iframe.src = targetUrl;
  }
  await new Promise((r) => setTimeout(r, 3000));
  await injectIntoIframe();
  await new Promise((r) => setTimeout(r, 1000));

  if (prefs.tempChat) {
    const iframe = document.getElementById('gemini');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
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
