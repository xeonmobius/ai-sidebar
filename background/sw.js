import browser from 'webextension-polyfill';
import { slug } from '../src/utils/slug.js';
import { setupSidePanel } from './setup-sidepanel.js';

// Register session DNR rules at startup (more reliable than static rules in Chrome)
async function setupSessionRules() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'X-Frame-Options', operation: 'remove' },
            { header: 'Content-Security-Policy', operation: 'remove' },
            { header: 'Content-Security-Policy-Report-Only', operation: 'remove' },
          ],
        },
        condition: {
          urlFilter: '||gemini.google.com',
          resourceTypes: ['sub_frame'],
        },
      }],
    });
    console.log('[gemini-sidebar] session DNR rules registered');
  } catch (e) {
    console.warn('[gemini-sidebar] session DNR setup failed:', e);
  }
}

setupSessionRules();

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
  return clean.endsWith('.pdf');
}

async function fetchPdfFromTab(tabId) {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const response = await fetch(window.location.href);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    },
  });
  return results[0].result;
}

async function triggerUpload() {
  if (activeSession) return;

  const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!sourceTab) return;

  activeSession = { tabId: sourceTab.id };
  const url = sourceTab.url || '';

  if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('resource://')) {
    activeSession = null;
    return;
  }

  if (isPdfUrl(url) || url.startsWith('file://')) {
    try {
      const base64 = await fetchPdfFromTab(sourceTab.id);
      const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'document.pdf';
      browser.runtime
        .sendMessage({
          type: 'ATTACH_PDF',
          base64,
          filename,
          mimeType: 'application/pdf',
        })
        .catch(() => {})
        .finally(() => { activeSession = null; });
    } catch (err) {
      activeSession = null;
      browser.runtime.sendMessage({ type: 'PDF_PICKER_NEEDED' }).catch(() => {});
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

const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
  setupSidePanel(browser, chrome, triggerUpload);
} else {
  browser.action.onClicked.addListener(() => {
    triggerUpload();
  });
}

browser.tabs.onActivated.addListener(() => {
  activeSession = null;
});
