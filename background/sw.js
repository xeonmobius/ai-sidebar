import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';

const EXTRACT_TIMEOUT_MS = 20000;
let activeSession = null;
let injectorReady = false;
let injectorReadyResolver = null;

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
  if (injectorReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('injector not ready')), timeout);
    injectorReadyResolver = () => { clearTimeout(timer); resolve(); };
  });
}

async function triggerUpload() {
  if (activeSession) {
    console.log('[gemini-sidebar] session active, skipping');
    return;
  }
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  const tab = tabs[0];
  activeSession = { tabId: tab.id };
  console.log('[gemini-sidebar] triggerUpload, tab:', tab.id, 'url:', tab.url);

  try {
    console.log('[gemini-sidebar] waiting for injector...');
    await waitForInjectorReady(EXTRACT_TIMEOUT_MS);
    console.log('[gemini-sidebar] injector ready, extracting page...');
    await runExtraction(tab.id);
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] upload failed:', err);
  }
}

browser.runtime.onMessage.addListener(async (msg, _sender) => {
  switch (msg.type) {
    case 'TRIGGER_UPLOAD':
      console.log('[gemini-sidebar] TRIGGER_UPLOAD received');
      triggerUpload();
      return;
    case 'INJECTOR_READY':
      console.log('[gemini-sidebar] INJECTOR_READY received');
      injectorReady = true;
      if (injectorReadyResolver) injectorReadyResolver();
      return;
    case 'EXTRACT_RESULT': {
      console.log('[gemini-sidebar] EXTRACT_RESULT received');
      if (msg.error) {
        console.error('[gemini-sidebar] extract error:', msg.error);
        activeSession = null;
        return;
      }
      const title = msg.result.title || 'page';
      const filename = `${slug(title)}.md`;
      const file = new File([msg.result.markdown], filename, { type: 'text/markdown' });
      console.log('[gemini-sidebar] sending ATTACH_FILE:', filename, msg.result.markdown.length, 'chars');
      try {
        await browser.runtime.sendMessage({ type: 'ATTACH_FILE', file });
      } catch {
        console.warn('[gemini-sidebar] no injector listening for ATTACH_FILE');
      }
      return;
    }
    case 'ATTACH_ACK':
      console.log('[gemini-sidebar] ATTACH_ACK, ok:', msg.ok);
      activeSession = null;
      return;
  }
});

browser.action.onClicked.addListener((_tab) => {
  triggerUpload();
});
