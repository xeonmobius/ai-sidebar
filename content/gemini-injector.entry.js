import browser from 'webextension-polyfill';
import { waitForSelector } from '../src/utils/selectors.js';
import { attachFileToInput } from '../src/injector/attach.js';
import { buildTxtRetryFile } from '../src/injector/retry.js';

const SELECTORS = {
  fileInput: [
    'input[type="file"]',
    'input[accept*="pdf"]',
    'rich-textarea input[type="file"]',
  ],
  promptFocus: 'rich-textarea div[contenteditable="true"]',
};

const ATTACH_TIMEOUT_MS = 8000;

async function tryAttach(file) {
  const input = await waitForSelector(SELECTORS.fileInput, { timeout: ATTACH_TIMEOUT_MS });
  attachFileToInput(input, file);
  return input;
}

async function clipboardFallback(file) {
  try {
    const text = await file.text();
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may require user gesture */
  }
  try {
    const el = await waitForSelector([SELECTORS.promptFocus], { timeout: 2000 });
    el.focus();
    el.click();
  } catch {
    /* best-effort */
  }
}

async function handleAttach(msg) {
  const file = msg.file;
  try {
    await tryAttach(file);
  } catch {
    try {
      await tryAttach(buildTxtRetryFile(file));
    } catch (e) {
      await clipboardFallback(file);
    }
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_URL') {
    window.parent.postMessage({ type: 'CURRENT_URL', url: location.href }, '*');
  }
  if (event.data?.type === 'CLICK_TEMP_CHAT') {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.toLowerCase() || '';
      if (text.includes('new chat') || text.includes('temporary') || text.includes('start')) {
        btn.click();
        break;
      }
    }
  }
  if (event.data?.type === 'ATTACH_FILE' && event.data.file) {
    waitForSelector(SELECTORS.fileInput, { timeout: ATTACH_TIMEOUT_MS }).then(() => {
      handleAttach(event.data);
    }).catch(() => {});
  }
});
