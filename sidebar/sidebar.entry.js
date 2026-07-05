import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;
let injectorReady = false;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: false, ...result?.prefs };
}

async function injectIntoIframe() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return false;

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return false;
    const tabId = tabs[0].id;

    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const geminiFrame = frames.find(f => f.url.includes('gemini.google.com'));
    if (!geminiFrame) return false;

    await browser.scripting.executeScript({
      target: { tabId, frameId: geminiFrame.frameId },
      files: ['content/gemini-injector.bundle.js'],
    });
    injectorReady = true;
    return true;
  } catch (e) {
    console.log('[gemini-sidebar] injectIntoIframe failed:', e.message);
    return false;
  }
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

async function reloadIframe(url) {
  const iframe = document.getElementById('gemini');
  if (!iframe) return;
  injectorReady = false;
  iframe.src = url;
}

async function waitForInjector() {
  for (let i = 0; i < 20; i++) {
    if (injectorReady) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function onSidebarLoad() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) currentTabId = tabs[0].id;

  await new Promise((r) => setTimeout(r, 3000));
  await injectIntoIframe();
  await waitForInjector();

  const prefs = await getPrefs();
  if (prefs.tempChat) {
    await new Promise((r) => setTimeout(r, 1000));
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

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
  }

  await reloadIframe(targetUrl);
  await new Promise((r) => setTimeout(r, 3000));
  await injectIntoIframe();
  await waitForInjector();

  if (prefs.tempChat) {
    await new Promise((r) => setTimeout(r, 1000));
    const iframe = document.getElementById('gemini');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
  }
  await triggerUpload();
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
