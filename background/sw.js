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

async function triggerUpload() {
  if (activeSession) {
    console.log('[gemini-sidebar] session active, skipping');
    return;
  }

  const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab) return;

  activeSession = { tabId: sourceTab.id };
  console.log('[gemini-sidebar] triggerUpload, source tab:', sourceTab.id);

  try {
    console.log('[gemini-sidebar] extracting source page...');
    await runExtraction(sourceTab.id);
    console.log('[gemini-sidebar] extractor injected, waiting for EXTRACT_RESULT...');
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] extraction failed:', err);
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRIGGER_UPLOAD') {
    console.log('[gemini-sidebar] TRIGGER_UPLOAD received');
    triggerUpload();
    return;
  }

  if (msg.type === 'EXTRACT_RESULT') {
    console.log('[gemini-sidebar] EXTRACT_RESULT received');
    if (msg.error) {
      console.error('[gemini-sidebar] extract error:', msg.error);
      activeSession = null;
      return;
    }

    const title = msg.result?.title || 'page';
    const markdown = msg.result?.markdown || '';
    const filename = `${slug(title)}.md`;
    console.log('[gemini-sidebar] sending to sidebar:', filename, markdown.length, 'chars');

    browser.runtime
      .sendMessage({ type: 'ATTACH_FILE', markdown, filename })
      .then(() => console.log('[gemini-sidebar] sidebar acknowledged ATTACH_FILE'))
      .catch((e) => console.warn('[gemini-sidebar] sidebar not listening:', e))
      .finally(() => { activeSession = null; });
    return;
  }
});

browser.action.onClicked.addListener(() => {
  triggerUpload();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  browser.runtime.sendMessage({ type: 'TAB_CHANGED', tabId: activeInfo.tabId }).catch(() => {});
});
