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
  const wasEnabled = enabledTabs.has(tab.id);
  if (wasEnabled) {
    enabledTabs.delete(tab.id);
  } else {
    enabledTabs.add(tab.id);
  }
  await browser.runtime.sendMessage({
    type: 'SIDEBAR_TOGGLED',
    tabId: tab.id,
    enabled: !wasEnabled,
  }).catch(() => {});
});

browser.tabs.onActivated.addListener((activeInfo) => {
  activeSession = null;
  browser.runtime.sendMessage({
    type: 'TAB_CHANGED',
    tabId: activeInfo.tabId,
    enabled: enabledTabs.has(activeInfo.tabId),
  }).catch(() => {});
});

browser.tabs.onRemoved.addListener((tabId) => {
  enabledTabs.delete(tabId);
});
