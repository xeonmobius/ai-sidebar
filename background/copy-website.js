export function setupCopyWebsite(browser, chrome) {
  browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'EXTRACT_PAGE') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const url = tab.url || '';
      if (!url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('edge://')) {
        browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: 'Cannot extract from this page' }).catch(() => {});
        return;
      }

      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/extractor.bundle.js'],
          world: 'ISOLATED',
        });
      } catch (err) {
        browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err?.message || err) }).catch(() => {});
      }
    }

    if (msg.type === 'EXTRACT_RESULT') {
      browser.runtime.sendMessage(msg).catch(() => {});
    }
  });
}
