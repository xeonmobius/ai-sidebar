export function setupCopyWebsite(browser, chrome) {
  function isPdfUrl(url) {
    if (!url) return false;
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.pdf');
  }

  browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'EXTRACT_PAGE') {
      console.log('[copy-website] EXTRACT_PAGE received');
      const allActiveTabs = await browser.tabs.query({ active: true });
      console.log('[copy-website] active tabs:', allActiveTabs.map(t => ({ id: t.id, url: t.url })));

      const tab = allActiveTabs.find(t =>
        t.url && !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('about:')
      );

      if (!tab) {
        browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: 'No extractable page found' }).catch(() => {});
        return;
      }

      console.log('[copy-website] selected tab:', tab.id, tab.url);

      if (isPdfUrl(tab.url) || tab.url.startsWith('file://')) {
        console.log('[copy-website] PDF detected, injecting fetch script');
        try {
          const result = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
              const response = await fetch(window.location.href);
              const buffer = await response.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              const chunk = 8192;
              for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
              }
              return {
                base64: btoa(binary),
                filename: window.location.href.split('/').pop().split('?')[0] || 'document.pdf',
                mimeType: 'application/pdf',
              };
            },
            world: 'ISOLATED',
          });
          const pdfData = result[0]?.result;
          if (pdfData) {
            browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', pdf: pdfData }).catch(() => {});
          }
        } catch (err) {
          console.log('[copy-website] PDF fetch error:', err);
          browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err?.message || err) }).catch(() => {});
        }
        return;
      }

      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/extractor.bundle.js'],
          world: 'ISOLATED',
        });
        console.log('[copy-website] extractor injected');
      } catch (err) {
        console.log('[copy-website] injection error:', err);
        browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err?.message || err) }).catch(() => {});
      }
    }

    if (msg.type === 'EXTRACT_RESULT') {
      console.log('[copy-website] forwarding EXTRACT_RESULT');
      browser.runtime.sendMessage(msg).catch(() => {});
    }
  });
}