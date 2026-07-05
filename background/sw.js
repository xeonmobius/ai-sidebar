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

function isPdfUrl(url) {
  if (!url) return false;
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.pdf') || clean.includes('.pdf');
}

async function fetchPdf(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'document.pdf';
  return { blob, filename };
}

async function triggerUpload() {
  if (activeSession) return;

  const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab) return;

  activeSession = { tabId: sourceTab.id };
  const url = sourceTab.url || '';

  if (isPdfUrl(url) || url.startsWith('file://')) {
    try {
      const { blob, filename } = await fetchPdf(url);
      const arrayBuffer = await blob.arrayBuffer();
      browser.runtime
        .sendMessage({
          type: 'ATTACH_PDF',
          arrayBuffer,
          filename,
          mimeType: blob.type || 'application/pdf',
        })
        .catch(() => {})
        .finally(() => { activeSession = null; });
    } catch (err) {
      activeSession = null;
      console.error('[gemini-sidebar] PDF fetch failed:', err);
    }
    return;
  }

  try {
    await runExtraction(sourceTab.id);
  } catch (err) {
    activeSession = null;
    if (url.startsWith('resource://') || url.startsWith('about:')) {
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

    browser.runtime
      .sendMessage({ type: 'ATTACH_FILE', markdown, filename })
      .catch(() => {})
      .finally(() => { activeSession = null; });
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
