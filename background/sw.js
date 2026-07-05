import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

const EXTRACT_TIMEOUT_MS = 15000;
let activeSession = null;
let injectorReady = false;
let injectorReadyResolver = null;

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

function waitForInjectorReady(timeout) {
  if (injectorReady) {
    console.log('[gemini-sidebar] injector already ready');
    return Promise.resolve();
  }
  console.log('[gemini-sidebar] waiting for injector...');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('injector not ready')), timeout);
    injectorReadyResolver = () => { clearTimeout(timer); resolve(); };
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function onActionClicked(tab) {
  if (activeSession) {
    console.log('[gemini-sidebar] session active, skipping');
    return;
  }
  activeSession = { tabId: tab.id };
  console.log('[gemini-sidebar] action clicked, tab:', tab.id, 'url:', tab.url);
  try {
    await openSidebar(tab.id);
    console.log('[gemini-sidebar] sidebar opened');

    await waitForInjectorReady(EXTRACT_TIMEOUT_MS);
    console.log('[gemini-sidebar] injector ready');

    // Give Gemini UI a moment to render the file input
    await sleep(1500);

    console.log('[gemini-sidebar] extracting page...');
    await runExtraction(tab.id);
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] action failed:', err);
  }
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  switch (msg.type) {
    case 'INJECTOR_READY':
      console.log('[gemini-sidebar] INJECTOR_READY received');
      injectorReady = true;
      if (injectorReadyResolver) injectorReadyResolver();
      return;
    case 'EXTRACT_RESULT': {
      console.log('[gemini-sidebar] EXTRACT_RESULT received, error?', !!msg.error);
      if (msg.error) {
        console.error('[gemini-sidebar] extract error:', msg.error);
        activeSession = null;
        return;
      }
      const title = msg.result.title || 'page';
      const filename = `${slug(title)}.md`;
      const file = new File([msg.result.markdown], filename, { type: 'text/markdown' });
      console.log('[gemini-sidebar] sending ATTACH_FILE, file:', filename, msg.result.markdown.length, 'chars');
      try {
        await browser.runtime.sendMessage({ type: 'ATTACH_FILE', file });
      } catch {
        console.warn('[gemini-sidebar] no injector listening for ATTACH_FILE');
      }
      activeSession = null;
      return;
    }
    case 'ATTACH_ACK':
      console.log('[gemini-sidebar] ATTACH_ACK received, ok:', msg.ok);
      activeSession = null;
      return;
  }
});

browser.action.onClicked.addListener(onActionClicked);
