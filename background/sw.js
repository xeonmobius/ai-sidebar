import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

let activeSession = null;

async function runExtraction(tabId) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['content/extractor.bundle.js'],
    world: 'ISOLATED',
  });
}

async function sendToSidebar(markdown, filename) {
  browser.runtime
    .sendMessage({ type: 'ATTACH_FILE', markdown, filename })
    .catch(() => {})
    .finally(() => { activeSession = null; });
}

async function triggerUpload() {
  if (activeSession) return;

  const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab) return;

  activeSession = { tabId: sourceTab.id };

  const url = sourceTab.url || '';
  const isPdf = sourceTab.isArticle === false && /\.(pdf)$/i.test(url);

  try {
    await runExtraction(sourceTab.id);
  } catch (err) {
    activeSession = null;
    if (url.startsWith('file://') || url.startsWith('resource://') || url.startsWith('about:')) {
      console.log('[gemini-sidebar] cannot extract restricted URL, skipping:', url);
      return;
    }
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

    sendToSidebar(markdown, filename);
    return;
  }
});

browser.action.onClicked.addListener(() => {
  triggerUpload();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  activeSession = null;
  browser.runtime.sendMessage({ type: 'TAB_CHANGED', tabId: activeInfo.tabId }).catch(() => {});
});
