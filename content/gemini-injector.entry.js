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

async function focusPrompt() {
  try {
    const el = await waitForSelector([SELECTORS.promptFocus], { timeout: 2000 });
    el.focus();
    el.click();
  } catch {
    /* best-effort */
  }
}

async function clipboardFallback(file) {
  try {
    const text = await file.text();
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may require user gesture; status will guide user */
  }
  await focusPrompt();
}

function ack(ok, message) {
  browser.runtime.sendMessage({ type: 'ATTACH_ACK', ok, message }).catch(() => {});
}

async function handleAttach(msg) {
  const file = msg.file;
  try {
    await tryAttach(file);
    ack(true);
  } catch {
    try {
      await tryAttach(buildTxtRetryFile(file));
      ack(true);
    } catch (e) {
      await clipboardFallback(file);
      ack(false, e.message);
    }
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ATTACH_FILE') return handleAttach(msg);
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_URL') {
    window.postMessage({ type: 'CURRENT_URL', url: location.href }, '*');
  }
});

browser.runtime.sendMessage({ type: 'INJECTOR_READY' }).catch(() => {});
