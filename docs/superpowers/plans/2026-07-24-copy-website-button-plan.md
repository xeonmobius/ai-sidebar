# Copy Website Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy Website" button to the sidebar that extracts the active tab's content as markdown and copies it to the system clipboard.

**Architecture:** Button click in sidebar sends a message to the background SW, which injects the existing extractor into the active tab. The extractor returns markdown. SW forwards it back to the sidebar, which writes it to the clipboard. The extraction logic is extracted into a testable `copy-website.js` module following the same pattern as `setup-sidepanel.js`.

**Tech Stack:** Chrome Extension MV3, webextension-polyfill, Vitest, esbuild

## Global Constraints

- Manifest permissions must include `clipboardWrite`
- Chrome MV3 sidePanel API
- webextension-polyfill for browser abstraction
- Vitest for tests
- esbuild for bundling
- Follow existing patterns from `setup-sidepanel.js` / `setup-sidepanel.test.js`

---

### Task 1: Create copy-website module with tests (TDD)

**Files:**
- Create: `background/copy-website.js`
- Create: `background/copy-website.test.js`

**Interfaces:**
- Produces: `setupCopyWebsite(browser, chrome)` — registers `runtime.onMessage` listener that handles `EXTRACT_PAGE` (injects extractor into active tab) and `EXTRACT_RESULT` (forwards markdown to sidebar)

- [ ] **Step 1: Write failing tests for EXTRACT_PAGE handling**

Create `background/copy-website.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupCopyWebsite } from './copy-website.js';

function createMockEnv() {
  const messageListeners = [];
  const activeTab = { id: 42, url: 'https://example.com/page' };

  const browser = {
    tabs: {
      query: vi.fn().mockResolvedValue([activeTab]),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };

  const chrome = {};
  return { browser, chrome, messageListeners, activeTab };
}

describe('setupCopyWebsite', () => {
  let env;
  beforeEach(() => { env = createMockEnv(); });

  it('injects extractor on EXTRACT_PAGE message', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(env.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content/extractor.bundle.js'],
      world: 'ISOLATED',
    });
  });

  it('forwards EXTRACT_RESULT to sidebar', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    const result = { title: 'Test', markdown: '# Test\ncontent', url: 'https://example.com' };
    await handler({ type: 'EXTRACT_RESULT', result });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', result });
  });

  it('forwards EXTRACT_RESULT errors', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_RESULT', error: 'boom' });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'boom' });
  });

  it('ignores unrelated messages', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'SOMETHING_ELSE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('skips extraction on chrome:// URLs', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: 'chrome://newtab/' }]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'Cannot extract from this page' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test`
Expected: FAIL — `copy-website.js` does not exist

- [ ] **Step 3: Write minimal implementation**

Create `background/copy-website.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add background/copy-website.js background/copy-website.test.js
git commit -m "feat: add copy-website module with extraction message handling"
```

---

### Task 2: Wire copy-website into service worker

**Files:**
- Modify: `background/sw.js`

**Interfaces:**
- Consumes: `setupCopyWebsite(browser, chrome)` from Task 1

- [ ] **Step 1: Add import and call to sw.js**

Add to the top of `background/sw.js` (after existing imports):

```js
import { setupCopyWebsite } from './copy-website.js';
```

Add after the `setupSessionRules()` call and before the sidePanel setup:

```js
setupCopyWebsite(browser, chrome);
```

Full updated `background/sw.js`:

```js
import browser from 'webextension-polyfill';
import { setupSidePanel } from './setup-sidepanel.js';
import { setupCopyWebsite } from './copy-website.js';

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
setupCopyWebsite(browser, chrome);

const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
  setupSidePanel(browser, chrome);
} else {
  browser.action.onClicked.addListener(() => {
    browser.sidebarAction.open();
  });
}
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `bun run test`
Expected: PASS — all existing tests still pass

- [ ] **Step 3: Commit**

```bash
git add background/sw.js
git commit -m "feat: wire copy-website into service worker"
```

---

### Task 3: Update sidebar HTML and CSS

**Files:**
- Modify: `sidebar/sidebar.html`
- Modify: `sidebar/sidebar.css`

- [ ] **Step 1: Update sidebar.html**

Replace entire contents of `sidebar/sidebar.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="sidebar.css" />
</head>
<body>
  <div id="toolbar">
    <button id="copy-website-btn">Copy Website</button>
  </div>
  <script src="sidebar.bundle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update sidebar.css**

Replace entire contents of `sidebar/sidebar.css`:

```css
html, body { margin: 0; height: 100vh; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
#toolbar {
  display: flex;
  padding: 6px 10px;
  background: #f0f4f9;
  border-bottom: 1px solid #dadce0;
  flex-shrink: 0;
}
#copy-website-btn {
  background: #1a73e8;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font: 13px system-ui;
}
#copy-website-btn:hover { background: #1557b0; }
#copy-website-btn:disabled { background: #999; cursor: default; }
iframe { width: 100%; flex: 1; border: none; }
```

- [ ] **Step 3: Commit**

```bash
git add sidebar/sidebar.html sidebar/sidebar.css
git commit -m "feat: add copy-website toolbar, remove dead pdf-picker"
```

---

### Task 4: Add button handler and clipboard logic to sidebar

**Files:**
- Modify: `sidebar/sidebar.entry.js`

**Interfaces:**
- Consumes: `EXTRACT_PAGE` message to SW, `EXTRACT_RESULT` message from SW
- Produces: clipboard write on button click

- [ ] **Step 1: Add button handler and result listener**

Add to `sidebar/sidebar.entry.js` after the `onSidebarLoad()` call:

```js
const copyBtn = document.getElementById('copy-website-btn');

copyBtn?.addEventListener('click', async () => {
  copyBtn.disabled = true;
  copyBtn.textContent = 'Extracting...';
  try {
    await browser.runtime.sendMessage({ type: 'EXTRACT_PAGE' });
  } catch {
    copyBtn.textContent = 'Failed';
    copyBtn.disabled = false;
    setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'EXTRACT_RESULT') {
    if (msg.error) {
      copyBtn.textContent = 'Failed';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
      return;
    }
    navigator.clipboard.writeText(msg.result.markdown).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
    }).catch(() => {
      copyBtn.textContent = 'Failed';
      copyBtn.disabled = false;
      setTimeout(() => { copyBtn.textContent = 'Copy Website'; }, 2000);
    });
  }
});
```

- [ ] **Step 2: Run tests to verify nothing broke**

Run: `bun run test`
Expected: PASS — all existing tests still pass

- [ ] **Step 3: Commit**

```bash
git add sidebar/sidebar.entry.js
git commit -m "feat: add copy-website button handler with clipboard write"
```

---

### Task 5: Add clipboardWrite permission to manifest

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add clipboardWrite to permissions array**

In `manifest.json`, add `"clipboardWrite"` to the `permissions` array:

```json
"permissions": [
  "sidePanel",
  "declarativeNetRequest",
  "activeTab",
  "scripting",
  "storage",
  "clipboardWrite"
],
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: add clipboardWrite permission"
```

---

### Task 6: Build and verify

- [ ] **Step 1: Run tests**

Run: `bun run test`
Expected: All tests pass

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: `Build complete → dist/chrome/ and dist/firefox/`

- [ ] **Step 3: Manual test**

Reload `dist/chrome/` in `chrome://extensions`:
1. Open sidebar on a normal webpage
2. Click "Copy Website" — button shows "Extracting..." then "Copied!"
3. Paste in any text field — markdown content should appear with title, source URL, and page content
4. Open sidebar on `chrome://newtab` — click "Copy Website" — button shows "Failed"

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: adjustments from manual testing"
```
