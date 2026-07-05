import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

let activeSession = null;
const enabledTabs = new Set();

async function runExtraction(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['content/extractor.bundle.js'],
    world: 'ISOLATED',
  });
}

async function triggerUpload() {
  if (activeSession) return;

  const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab) return;

  activeSession = { tabId: sourceTab.id };

  try {
    await runExtraction(sourceTab.id);
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] extraction failed:', err);
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRIGGER_UPLOAD') {
    triggerUpload();
    return;
  }

  if (msg.type === 'EXTRACT_RESULT') {
    if (msg.error) {
      activeSession = null;
      return;
    }

    const title = msg.result?.title || 'page';
    const markdown = msg.result?.markdown || '';
    const filename = `${slug(title)}.md`;

    browser.runtime
      .sendMessage({ type: 'ATTACH_FILE', markdown, filename })
      .catch(() => {})
      .finally(() => { activeSession = null; });
    return;
  }
});

browser.action.onClicked.addListener(async (tab) => {
  if (enabledTabs.has(tab.id)) {
    enabledTabs.delete(tab.id);
    browser.sidebarAction.close();
  } else {
    enabledTabs.add(tab.id);
    browser.sidebarAction.open();
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  activeSession = null;
  if (enabledTabs.has(activeInfo.tabId)) {
    browser.sidebarAction.open();
  } else {
    browser.sidebarAction.close();
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  enabledTabs.delete(tabId);
  browser.storage.session.remove('tab-url-' + tabId).catch(() => {});
});
