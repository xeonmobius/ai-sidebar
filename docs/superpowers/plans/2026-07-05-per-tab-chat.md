# Per-Tab Chat Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each browser tab gets its own independent Gemini chat session in the sidebar. Switching tabs reloads the sidebar's Gemini iframe. An options toggle controls whether chats are temporary (default) or persistent (restorable per-tab).

**Architecture:** The background script listens for `tabs.onActivated` and notifies the sidebar. The sidebar maintains a `Map<tabId, geminiUrl>` in memory. On tab switch, the sidebar asks the injector for the current Gemini URL, stores it for the outgoing tab, then reloads the iframe with the incoming tab's stored URL (or `/app` for a fresh chat). In temporary mode, the URL map is not used — every tab switch loads `/app` and clicks the temp chat button.

**Tech Stack:** Firefox MV3 extension, webextension-polyfill, esbuild, Bun

## Global Constraints

- Firefox MV3, `strict_min_version: "128.0"`
- Shared codebase for Chrome + Firefox (esbuild bundles both)
- `webextension-polyfill` for cross-browser `browser.*` API
- Build: `bun run build` → `dist/chrome/` and `dist/firefox/`
- No new dependencies (YAGNI)
- No comments in code unless asked

---

## File Structure

| File | Responsibility |
|------|---------------|
| `options/options.html` | Add temp chat toggle UI |
| `options/options.entry.js` | Read/write `tempChat` pref in storage |
| `background/sw.js` | Add `tabs.onActivated` listener, send `TAB_CHANGED` to sidebar |
| `sidebar/sidebar.entry.js` | Per-tab URL tracking, iframe reload on tab switch, temp chat click after reload |
| `content/gemini-injector.entry.js` | Add `GET_URL` handler in isolated-world relay |

---

### Task 1: Add temp chat toggle to options page

**Files:**
- Modify: `options/options.html`
- Modify: `options/options.entry.js`

**Interfaces:**
- Produces: `prefs.tempChat` (boolean) in `browser.storage.local` under key `prefs`

- [ ] **Step 1: Add checkbox to options.html**

Add after the auto-attach label (line 6):

```html
  <label><input type="checkbox" id="temp-chat" checked /> Temporary chat (no history saved)</label><br /><br />
```

- [ ] **Step 2: Wire up tempChat in options.entry.js**

In `options/options.entry.js`, add `tempChat: true` to `DEFAULTS`:

```javascript
const DEFAULTS = { autoAttach: true, maxChars: 500000, preferFileType: 'md', tempChat: true };
```

Add `temp` to the `el` object:

```javascript
const el = {
  auto: document.getElementById('auto-attach'),
  temp: document.getElementById('temp-chat'),
  max: document.getElementById('max-chars'),
  type: document.getElementById('file-type'),
  save: document.getElementById('save'),
  saved: document.getElementById('saved'),
};
```

In the load section, add:

```javascript
  el.temp.checked = !!prefs.tempChat;
```

In the save handler, add `tempChat: el.temp.checked` to the prefs object:

```javascript
  const prefs = {
    autoAttach: el.auto.checked,
    tempChat: el.temp.checked,
    maxChars: Number(el.max.value) || DEFAULTS.maxChars,
    preferFileType: el.type.value,
  };
```

- [ ] **Step 3: Build and verify**

Run: `bun run build`
Expected: Build completes without errors.

Open `dist/firefox/options/options.html` in a browser — confirm the temp chat checkbox appears and is checked by default.

- [ ] **Step 4: Commit**

```bash
git add options/options.html options/options.entry.js
git commit -m "feat: add temporary chat toggle to options page"
```

---

### Task 2: Add GET_URL handler to injector

**Files:**
- Modify: `content/gemini-injector.entry.js`

**Interfaces:**
- Consumes: `GET_URL` message via `window.addEventListener('message')` from sidebar
- Produces: `{ type: 'CURRENT_URL', url: string }` via `window.postMessage` back to sidebar

- [ ] **Step 1: Add GET_URL handler to isolated-world message listener**

In `content/gemini-injector.entry.js`, find the `window.addEventListener('message', ...)` block at the bottom of the file. Add a handler for `GET_URL` alongside the existing `ATTACH_FILE` handler:

```javascript
window.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_URL') {
    window.postMessage({ type: 'CURRENT_URL', url: location.href }, '*');
  }
  if (event.data?.type === 'ATTACH_FILE' && (event.data.markdown || event.data.text)) {
    waitForGeminiReady().then(() => {
      handleAttach(event.data.markdown || event.data.text, event.data.filename || 'page.md');
    });
  }
});
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add content/gemini-injector.entry.js
git commit -m "feat: add GET_URL handler to injector"
```

---

### Task 3: Add tabs.onActivated listener to background

**Files:**
- Modify: `background/sw.js`

**Interfaces:**
- Produces: sends `{ type: 'TAB_CHANGED', tabId: number }` to sidebar via `browser.runtime.sendMessage`

- [ ] **Step 1: Add tabs.onActivated listener**

In `background/sw.js`, add at the end of the file (after the existing `browser.action.onClicked` listener):

```javascript
browser.tabs.onActivated.addListener((activeInfo) => {
  browser.runtime.sendMessage({ type: 'TAB_CHANGED', tabId: activeInfo.tabId }).catch(() => {});
});
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add background/sw.js
git commit -m "feat: add tabs.onActivated listener for tab change detection"
```

---

### Task 4: Implement per-tab chat management in sidebar

**Files:**
- Modify: `sidebar/sidebar.entry.js`

**Interfaces:**
- Consumes: `TAB_CHANGED` message from background, `CURRENT_URL` from injector, `prefs.tempChat` from storage
- Produces: iframe reload by setting `iframe.src`, `GET_URL` message to injector

- [ ] **Step 1: Replace sidebar.entry.js with per-tab logic**

Replace the entire contents of `sidebar/sidebar.entry.js`:

```javascript
import browser from 'webextension-polyfill';

const GEMINI_BASE = 'https://gemini.google.com/app';
const tabUrls = new Map();
let currentTabId = null;

async function getPrefs() {
  const result = await browser.storage.local.get('prefs');
  return { tempChat: true, ...result?.prefs };
}

async function getCurrentGeminiUrl() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return GEMINI_BASE;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(GEMINI_BASE), 1000);
    window.addEventListener('message', function handler(event) {
      if (event.data?.type === 'CURRENT_URL') {
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data.url);
      }
    });
    iframe.contentWindow.postMessage({ type: 'GET_URL' }, '*');
  });
}

async function reloadIframe(url) {
  const iframe = document.getElementById('gemini');
  if (!iframe) return;
  iframe.src = url;
}

async function tryClickTemporaryChat() {
  const iframe = document.getElementById('gemini');
  if (!iframe?.contentWindow) return;
  await new Promise((r) => setTimeout(r, 2000));
  iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
}

async function triggerUpload() {
  await new Promise((r) => setTimeout(r, 500));
  try {
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' });
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    await browser.runtime.sendMessage({ type: 'TRIGGER_UPLOAD' }).catch(() => {});
  }
}

async function onSidebarLoad() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) currentTabId = tabs[0].id;

  const prefs = await getPrefs();
  if (prefs.tempChat) {
    await tryClickTemporaryChat();
  }
  await triggerUpload();
}

async function onTabChanged(newTabId) {
  const prefs = await getPrefs();
  const iframe = document.getElementById('gemini');

  if (!prefs.tempChat && currentTabId !== null) {
    const url = await getCurrentGeminiUrl();
    tabUrls.set(currentTabId, url);
  }

  currentTabId = newTabId;

  let targetUrl = GEMINI_BASE;
  if (!prefs.tempChat && tabUrls.has(newTabId)) {
    targetUrl = tabUrls.get(newTabId);
  }

  await reloadIframe(targetUrl);
  await new Promise((r) => setTimeout(r, 2000));

  if (prefs.tempChat) {
    await tryClickTemporaryChat();
  }
  await triggerUpload();
}

onSidebarLoad();

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TAB_CHANGED') {
    onTabChanged(msg.tabId);
    return;
  }
  if (msg.type === 'ATTACH_FILE') {
    const iframe = document.getElementById('gemini');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: 'ATTACH_FILE', markdown: msg.markdown, filename: msg.filename },
        '*'
      );
    }
  }
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'INJECTOR_STATUS') {
    console.log('[gemini-sidebar] injector:', event.data.status, '-', event.data.detail);
  }
});
```

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Build completes without errors.

- [ ] **Step 3: Manual test — temporary mode**

1. Reload extension (remove + re-add in `about:debugging`)
2. Open a website tab, open sidebar
3. Verify temp chat button is clicked (check console for `TEMP_CLICKED`)
4. Switch to another tab
5. Verify sidebar iframe reloads (Gemini page flashes/reloads)
6. Verify temp chat is clicked again on the new tab

- [ ] **Step 4: Manual test — persistent mode**

1. Open options page, uncheck "Temporary chat", save
2. Open a website tab, open sidebar, send a message to Gemini
3. Switch to another tab — sidebar reloads with fresh chat
4. Send a different message on this tab
5. Switch back to the first tab
6. Verify the first tab's conversation is restored (previous messages visible)

- [ ] **Step 5: Commit**

```bash
git add sidebar/sidebar.entry.js
git commit -m "feat: per-tab chat isolation with URL tracking and iframe reload"
```

---

## Self-Review

**Spec coverage:**
- ✅ Tab switch closes/reloads sidebar — Task 3 (listener) + Task 4 (reload)
- ✅ Each tab has independent chat — Task 4 (per-tab URL map)
- ✅ Restore previous chat in persistent mode — Task 4 (`tabUrls` map)
- ✅ Fresh chat in temporary mode — Task 4 (skips URL map, clicks temp chat)
- ✅ User chooses mode — Task 1 (options toggle)

**Placeholder scan:** None — all code is complete.

**Type consistency:** `TAB_CHANGED` used in Task 3 (sender) and Task 4 (receiver). `GET_URL` / `CURRENT_URL` used in Task 2 (injector) and Task 4 (sidebar). `prefs.tempChat` used in Task 1 (writer) and Task 4 (reader). All match.
