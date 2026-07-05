import browser from 'webextension-polyfill';
import { statusReducer, INITIAL_STATUS } from '../src/status/reducer.js';

const statusEl = document.getElementById('status');
const pdfInput = document.getElementById('pdf-input');
const attachPdfBtn = document.getElementById('attach-pdf');
const openGeminiBtn = document.getElementById('open-gemini');
const iframe = document.getElementById('gemini');
const firefoxNotice = document.getElementById('firefox-notice');

// Firefox blocks X-Frame-Options at a layer below all extension APIs.
// Hide the iframe, show the notice + "open Gemini tab" button.
const isFirefox = typeof browser.runtime.getBrowserInfo === 'function';
if (isFirefox) {
  iframe.hidden = true;
  firefoxNotice.hidden = false;
  openGeminiBtn.hidden = false;
} else {
  // Chrome: load Gemini in the iframe (DNR strips X-Frame-Options)
  iframe.src = 'https://gemini.google.com/app';
}

let status = INITIAL_STATUS;

function setStatus(event) {
  status = statusReducer(status, event);
  statusEl.textContent = status.message || labelFor(status.state);
  statusEl.className = `status ${classNameFor(status.state)}`;
}

function labelFor(state) {
  return {
    IDLE: 'Ready',
    EXTRACTING: 'Extracting page…',
    UPLOADING: 'Uploading to Gemini…',
    ATTACHED: 'Attached ✓',
    FALLBACK_CLIPBOARD: 'Auto-attach failed. Press ⌘V in Gemini.',
    ERROR: `Error: ${status.message}`,
  }[state] || state;
}

function classNameFor(state) {
  return { IDLE: 'idle', EXTRACTING: 'busy', UPLOADING: 'busy', ATTACHED: 'ok',
           FALLBACK_CLIPBOARD: 'error', ERROR: 'error' }[state] || 'idle';
}

attachPdfBtn.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', () => {
  const file = pdfInput.files && pdfInput.files[0];
  if (!file) return;
  setStatus({ type: 'START_EXTRACT' });
  browser.runtime.sendMessage({ type: 'ATTACH_FILE', file }).catch(() => {});
});
openGeminiBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'OPEN_GEMINI_TAB' }).catch(() => {});
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ATTACH_ACK') {
    setStatus(msg.ok ? { type: 'ATTACHED' } : { type: 'FALLBACK' });
  }
});

setStatus({ type: 'RESET' });
