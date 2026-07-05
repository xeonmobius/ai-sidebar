import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

const EXTRACT_TIMEOUT_MS = 10000;
let activeSession = null;

const isFirefox = typeof browser.runtime.getBrowserInfo === 'function';

// Firefox: strip framing headers via webRequest (best-effort — Firefox may still
// enforce X-Frame-Options at a deeper layer, so we also use a tab fallback).
// Chrome: declarativeNetRequest static rules handle this (see rules/remove_headers.json).
const STRIP_HEADERS = new Set([
  'x-frame-options', 'frame-options',
  'content-security-policy', 'content-security-policy-report-only',
]);
const native = globalThis.browser || globalThis.chrome;
if (native && native.webRequest && native.webRequest.onHeadersReceived) {
  native.webRequest.onHeadersReceived.addListener(
    (details) => {
      const responseHeaders = (details.responseHeaders || []).filter(
        (h) => !STRIP_HEADERS.has(h.name.toLowerCase()),
      );
      return { responseHeaders };
    },
    { urls: ['*://gemini.google.com/*'] },
    ['blocking', 'responseHeaders'],
  );
}

async function openOrFocusGeminiTab() {
  const tabs = await browser.tabs.query({ url: 'https://gemini.google.com/*' });
  if (tabs.length > 0) {
    await browser.tabs.update(tabs[0].id, { active: true });
    return tabs[0].id;
  }
  const tab = await browser.tabs.create({ url: 'https://gemini.google.com/app', active: true });
  return tab.id;
}

async function openSidebar(tabId) {
  if (browser.sidePanel && browser.sidePanel.open) {
    const tab = await browser.tabs.get(tabId);
    await browser.sidePanel.open({ tabId, windowId: tab.windowId });
  } else if (browser.sidebarAction && browser.sidebarAction.open) {
    await browser.sidebarAction.open();
  }
}

async function runExtraction(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content/extractor.bundle.js'],
    });
  } catch (err) {
    console.error('[gemini-sidebar] extractor injection failed:', err);
  }
}

let injectorReadyResolver = null;
function waitForInjectorReady(timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('injector not ready')), timeout);
    injectorReadyResolver = () => { clearTimeout(timer); resolve(); };
  });
}

async function onActionClicked(tab) {
  if (activeSession) return;
  activeSession = { tabId: tab.id };
  try {
    if (isFirefox) {
      // Firefox: open/focus Gemini tab + sidebar as control panel
      await openOrFocusGeminiTab();
      await openSidebar(tab.id);
    } else {
      // Chrome: sidePanel has the iframe
      await openSidebar(tab.id);
    }
    await waitForInjectorReady(EXTRACT_TIMEOUT_MS);
    await runExtraction(tab.id);
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] action failed:', err);
  }
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  switch (msg.type) {
    case 'OPEN_GEMINI_TAB':
      await openOrFocusGeminiTab();
      return;
    case 'INJECTOR_READY':
      if (injectorReadyResolver) injectorReadyResolver();
      return;
    case 'EXTRACT_RESULT': {
      if (msg.error) {
        console.error('[gemini-sidebar] extract error:', msg.error);
        activeSession = null;
        return;
      }
      const title = msg.result.title || 'page';
      const filename = `${slug(title)}.md`;
      const file = new File([msg.result.markdown], filename, { type: 'text/markdown' });
      try {
        await browser.runtime.sendMessage({ type: 'ATTACH_FILE', file });
      } catch {
        console.warn('[gemini-sidebar] no injector listening for ATTACH_FILE');
      }
      activeSession = null;
      return;
    }
    case 'ATTACH_ACK':
      activeSession = null;
      return;
  }
});

browser.action.onClicked.addListener(onActionClicked);
