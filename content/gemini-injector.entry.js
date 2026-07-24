import { waitForSelector } from '../src/utils/selectors.js';

const SELECTORS = {
  fileInput: [
    'input[type="file"]',
    'input[accept*="pdf"]',
    'rich-textarea input[type="file"]',
  ],
  promptFocus: 'rich-textarea div[contenteditable="true"]',
};

let pendingFile = null;

function attachFileToInput(input) {
  if (!pendingFile) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(pendingFile);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('[gemini-sidebar] file attached to input:', input);
    pendingFile = null;
    return true;
  } catch (err) {
    console.error('[gemini-sidebar] attachFileToInput error:', err);
    return false;
  }
}

const _inputClick = HTMLInputElement.prototype.click;
HTMLInputElement.prototype.click = function () {
  console.log('[gemini-sidebar] input.click() called, type:', this.type, 'pendingFile:', !!pendingFile);
  if (this.type === 'file' && pendingFile) {
    console.log('[gemini-sidebar] monkey-patch caught file input click');
    if (attachFileToInput(this)) return;
  }
  return _inputClick.call(this);
};

const _labelClick = HTMLLabelElement.prototype.click;
HTMLLabelElement.prototype.click = function () {
  if (pendingFile) {
    console.log('[gemini-sidebar] label.click() intercepted, control:', this.htmlFor, this.control?.type);
  }
  if (pendingFile && this.control && this.control.type === 'file') {
    console.log('[gemini-sidebar] label is for file input, attaching directly');
    if (attachFileToInput(this.control)) return;
  }
  return _labelClick.call(this);
};

const observer = new MutationObserver((mutations) => {
  if (!pendingFile) return;
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.nodeType !== 1) continue;
      const inputs = node.matches?.('input[type="file"]')
        ? [node]
        : Array.from(node.querySelectorAll?.('input[type="file"]') || []);
      for (const input of inputs) {
        console.log('[gemini-sidebar] file input detected via MutationObserver:', input);
        setTimeout(() => attachFileToInput(input), 50);
      }
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

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
  console.log('[gemini-sidebar] pendingFile set:', file.name, file.size, 'bytes');
  const existing = document.querySelector('input[type="file"]');
  if (existing) {
    console.log('[gemini-sidebar] existing file input found, attaching immediately');
    setTimeout(() => attachFileToInput(existing), 50);
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
