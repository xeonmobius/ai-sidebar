import browser from 'webextension-polyfill';
import { extractMarkdown } from '../src/extractor/extract.js';

(async () => {
  console.log('[gemini-sidebar] extractor started on', location.href);
  try {
    const result = extractMarkdown({
      html: document.documentElement.outerHTML,
      title: document.title,
      url: location.href,
      fallbackText: (document.body && document.body.innerText) || '',
    });
    console.log('[gemini-sidebar] extractor result:', result.title, result.markdown.length, 'chars');
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', result });
    console.log('[gemini-sidebar] extractor sent EXTRACT_RESULT');
  } catch (err) {
    console.error('[gemini-sidebar] extractor error:', err);
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err && err.message || err) });
  }
})();
