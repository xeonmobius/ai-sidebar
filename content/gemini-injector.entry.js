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

let pendingFile = null;

const _inputClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function() {
  if (this.type === 'file' && pendingFile) {
    const dt = new DataTransfer();
    dt.items.add(pendingFile);
    this.files = dt.files;
    const input = this;
    setTimeout(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      pendingFile = null;
    }, 100);
    return;
  }
  return _inputClick.call(this);
};

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

async function handleAttach(file) {
  pendingFile = file;
  try {
    const input = await waitForSelector(SELECTORS.fileInput, { timeout: ATTACH_TIMEOUT_MS });
    attachFileToInput(input, file);
    pendingFile = null;
  } catch {
    try {
      const input = await waitForSelector(SELECTORS.fileInput, { timeout: ATTACH_TIMEOUT_MS });
      attachFileToInput(input, buildTxtRetryFile(file));
      pendingFile = null;
    } catch {
      await clipboardFallback(file);
      pendingFile = null;
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
    handleAttach(event.data.file);
  }
});
