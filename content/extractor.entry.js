import browser from 'webextension-polyfill';
import { extractMarkdown } from '../src/extractor/extract.js';

(async () => {
  try {
    const result = extractMarkdown({
      html: document.documentElement.outerHTML,
      title: document.title,
      url: location.href,
      fallbackText: (document.body && document.body.innerText) || '',
    });
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', result });
  } catch (err) {
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err && err.message || err) });
  }
})();
