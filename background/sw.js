import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

const EXTRACT_TIMEOUT_MS = 10000;
let activeSession = null;

async function openSidebar(tabId) {
  if (browser.sidePanel && browser.sidePanel.open) {
    const tab = await browser.tabs.get(tabId);
    await browser.sidePanel.open({ tabId, windowId: tab.windowId });
  } else if (browser.sidebarAction && browser.sidebarAction.open) {
    await browser.sidebarAction.open();
  } else {
    throw new Error('No sidebar API available');
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
    await openSidebar(tab.id);
    await waitForInjectorReady(EXTRACT_TIMEOUT_MS);
    await runExtraction(tab.id);
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] action failed:', err);
  }
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  switch (msg.type) {
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
