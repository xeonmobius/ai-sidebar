# Per-tab Sidebar (Chrome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar open per-tab on Chrome (toggle via toolbar icon), with per-window isolation and no cross-window state leak. Firefox unchanged.

**Architecture:** Chrome's `chrome.sidePanel.setOptions({tabId, enabled})` controls per-tab visibility natively. Service worker tracks an in-memory `Set<tabId>` for toggle state and calls `setOptions` + `open`. Sidebar page swaps iframes on `tabs.onActivated`. No broadcast messages — each window's panel page is isolated.

**Tech Stack:** Chrome extension MV3, `webextension-polyfill` (`browser.*`) + raw `chrome.sidePanel` API, vitest + jsdom for tests, esbuild for bundling.

## Global Constraints

- Chrome only for per-tab behavior. Firefox keeps current global sidebar.
- `hasSidePanel` = `typeof chrome !== 'undefined' && chrome?.sidePanel` — false in Firefox build (esbuild strips `sidePanel` permission + `side_panel` key for Firefox).
- Vitest config includes only `src/**/*.test.js` — update to include `background/**/*.test.js`.
- SW in-memory `enabledTabs` set may be lost on SW sleep; `setOptions` is the source of truth.
- `tabId` is globally unique across windows — single `Set` covers all windows.
- Commit each task independently.

---

### Task 1: Extract testable sidePanel setup + unit tests

**Files:**
- Modify: `background/sw.js` — extract sidePanel setup into a named function `setupSidePanel(browser, chrome)` so it can be imported in tests
- Create: `background/sw.test.js` — unit tests for toggle behavior
- Modify: `vitest.config.js` — add `background/**/*.test.js` to include

**Interfaces:**
- Consumes: `browser` (webextension-polyfill), `chrome` (raw Chrome API), `triggerUpload` (existing function in sw.js)
- Produces: `setupSidePanel(browser, chrome)` — registers action.onClicked and tabs.onRemoved listeners with per-tab enable/disable logic

The current `sw.js` runs sidePanel setup at module top-level. To make it testable, wrap the sidePanel-specific logic in a function and call it at the bottom. The function takes `browser` and `chrome` as params (dependency injection for mocking).

**Implementation for `background/sw.js`:**

Replace the bottom section (lines 138–153) — the current `setPanelBehavior` block + `action.onClicked` + `tabs.onActivated` — with:

```js
const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
  setupSidePanel(browser, chrome);
} else {
  browser.action.onClicked.addListener(() => {
    triggerUpload();
  });
}

browser.tabs.onActivated.addListener(() => {
  activeSession = null;
});
```

And add the `setupSidePanel` function before it (after `triggerUpload` definition, before the message listener):

```js
function setupSidePanel(browser, chrome) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  const enabledTabs = new Set();

  browser.action.onClicked.addListener(async (tab) => {
    const wasEnabled = enabledTabs.has(tab.id);
    if (wasEnabled) {
      enabledTabs.delete(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    } else {
      enabledTabs.add(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    triggerUpload();
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    if (enabledTabs.has(tabId)) {
      enabledTabs.delete(tabId);
      await chrome.sidePanel.setOptions({ tabId, enabled: true }).catch(() => {});
    }
  });
}
```

**Test file `background/sw.test.js`:**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock triggerUpload — sw.js calls it but we don't need real extraction
const mockTriggerUpload = vi.fn();

// Minimal mock of browser API
function createBrowserMock() {
  const listeners = {};
  const browser = {
    action: { onClicked: { addListener: (fn) => { listeners.action = fn; } } },
    tabs: {
      onRemoved: { addListener: (fn) => { listeners.tabRemoved = fn; } },
      onActivated: { addListener: () => {} },
    },
    runtime: { onMessage: { addListener: () => {} } },
    storage: { local: { get: () => Promise.resolve({}) } },
    scripting: { executeScript: vi.fn() },
    tabs: {
      query: () => Promise.resolve([{ id: 1, url: 'https://example.com' }]),
      onRemoved: { addListener: (fn) => { listeners.tabRemoved = fn; } },
      onActivated: { addListener: () => {} },
    },
  };
  // Fix: tabs.query and tabs.onRemoved need to coexist
  browser.tabs.query = () => Promise.resolve([{ id: 1, url: 'https://example.com' }]);
  return { browser, listeners };
}
```

Wait — the mock above is messy (tabs defined twice). Let me restructure cleanly. Actually, the real challenge: `sw.js` imports `webextension-polyfill` and `../src/utils/slug.js`. To test `setupSidePanel` in isolation, I need to either:
- (a) Import the whole `sw.js` module (runs all top-level code, hard to mock)
- (b) Extract `setupSidePanel` to its own file and import it

Option (b) is cleaner but the spec said "Modify: `background/sw.js`". Let me reconsider.

Actually, the simplest testable approach: put `setupSidePanel` in a separate file `background/setup-sidepanel.js`, export it, import in `sw.js`. Test the separate file. This follows "smaller, focused files."

But the spec's architecture section shows `setupSidePanel` as part of `background/sw.js`. Hmm. Let me go with extracting to a separate file for testability — that's better engineering and the plan can note it.

Actually, re-reading the spec: "Service Worker Changes (`background/sw.js`)" shows the code inline. But the spec is design, not implementation. For the plan, I can deviate for testability.

Let me go with: create `background/setup-sidepanel.js` with the `setupSidePanel` function, import it in `sw.js`. Test the separate file.

Revised task:

- Create: `background/setup-sidepanel.js` — exports `setupSidePanel(browser, chrome, triggerUpload)`
- Modify: `background/sw.js` — import and call `setupSidePanel`, remove inline sidePanel code
- Create: `background/setup-sidepanel.test.js` — tests
- Modify: `vitest.config.js` — add `background/**/*.test.js`

`setupSidePanel` signature: `setupSidePanel(browser, chrome, triggerUpload)` — takes triggerUpload as param for testability.

**Test file:**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSidePanel } from './setup-sidepanel.js';

function createMockEnv() {
  const actionListeners = [];
  const tabRemovedListeners = [];

  const sidePanel = {
    setPanelBehavior: vi.fn(),
    setOptions: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
  };

  const browser = {
    action: { onClicked: { addListener: (fn) => actionListeners.push(fn) } },
    tabs: {
      onRemoved: { addListener: (fn) => tabRemovedListeners.push(fn) },
      onActivated: { addListener: () => {} },
    },
  };

  const triggerUpload = vi.fn();

  return { sidePanel, browser, triggerUpload, actionListeners, tabRemovedListeners };
}

describe('setupSidePanel', () => {
  let env;

  beforeEach(() => { env = createMockEnv(); });

  it('disables auto-open on action click', () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    expect(env.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it('enables and opens panel when clicking icon on disabled tab', async () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: true });
    expect(env.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(env.triggerUpload).toHaveBeenCalled();
  });

  it('disables panel when clicking icon on enabled tab', async () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });  // enable
    env.sidePanel.setOptions.mockClear();
    env.sidePanel.open.mockClear();
    await clickHandler({ id: 42, windowId: 7 });  // disable

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
    expect(env.sidePanel.open).not.toHaveBeenCalled();
  });

  it('resets setOptions on tab removal if tab was enabled', async () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 42, windowId: 7 });  // enable tab 42
    env.sidePanel.setOptions.mockClear();

    const removeHandler = env.tabRemovedListeners[0];
    await removeHandler(42);

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: true });
  });

  it('does not reset setOptions on tab removal if tab was not enabled', async () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    const removeHandler = env.tabRemovedListeners[0];
    await removeHandler(99);
    expect(env.sidePanel.setOptions).not.toHaveBeenCalled();
  });

  it('treats each tab independently', async () => {
    setupSidePanel(env.browser, env.sidePanel, env.triggerUpload);
    const clickHandler = env.actionListeners[0];
    await clickHandler({ id: 1, windowId: 7 });  // enable tab 1
    env.sidePanel.setOptions.mockClear();
    await clickHandler({ id: 2, windowId: 7 });  // enable tab 2 (different tab)

    expect(env.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 2, enabled: true });
    expect(env.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  });
});
```

- [ ] **Step 1: Create `background/setup-sidepanel.js`**

```js
export function setupSidePanel(browser, chrome, triggerUpload) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  const enabledTabs = new Set();

  browser.action.onClicked.addListener(async (tab) => {
    const wasEnabled = enabledTabs.has(tab.id);
    if (wasEnabled) {
      enabledTabs.delete(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    } else {
      enabledTabs.add(tab.id);
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true });
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    triggerUpload();
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    if (enabledTabs.has(tabId)) {
      enabledTabs.delete(tabId);
      await chrome.sidePanel.setOptions({ tabId, enabled: true }).catch(() => {});
    }
  });
}
```

- [ ] **Step 2: Create `background/setup-sidepanel.test.js`**

(See full test file above.)

- [ ] **Step 3: Update `vitest.config.js` to include background tests**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js', 'background/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bunx vitest run background/setup-sidepanel.test.js`
Expected: FAIL — `setupSidePanel` not exported from `./setup-sidepanel.js` (file doesn't exist yet... wait, we created it in step 1).

Actually, order: create file (step 1), create test (step 2), update config (step 3). Tests should pass after step 1+2. Let me reorder: write test first (TDD), run to see it fail, then implement.

Revised steps:
- [ ] **Step 1: Write the failing test** — create `background/setup-sidepanel.test.js`
- [ ] **Step 2: Run test to verify it fails** — `bunx vitest run background/setup-sidepanel.test.js` → FAIL "Cannot find module"
- [ ] **Step 3: Write minimal implementation** — create `background/setup-sidepanel.js`
- [ ] **Step 4: Update vitest.config.js** — add background include
- [ ] **Step 5: Run tests to verify they pass** — `bunx vitest run background/setup-sidepanel.test.js` → PASS
- [ ] **Step 6: Commit**

- [ ] **Step 1: Write the failing test**

Create `background/setup-sidepanel.test.js` with the content above.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run background/setup-sidepanel.test.js`
Expected: FAIL with "Cannot find module './setup-sidepanel.js'"

- [ ] **Step 3: Write minimal implementation**

Create `background/setup-sidepanel.js` (content above).

- [ ] **Step 4: Update `vitest.config.js`**

```js
include: ['src/**/*.test.js', 'background/**/*.test.js'],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run background/setup-sidepanel.test.js`
Expected: 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add background/setup-sidepanel.js background/setup-sidepanel.test.js vitest.config.js
git commit -m "test: add setupSidePanel unit tests"
```

---

### Task 2: Wire `setupSidePanel` into `background/sw.js`

**Files:**
- Modify: `background/sw.js` — import `setupSidePanel`, replace inline sidePanel code

**Interfaces:**
- Consumes: `setupSidePanel` from `./setup-sidepanel.js`, `browser` (global), `chrome` (global), `triggerUpload` (local function)
- Produces: sidePanel setup registered at SW load time

- [ ] **Step 1: Add import at top of `background/sw.js`**

After existing imports (line 2), add:
```js
import { setupSidePanel } from './setup-sidepanel.js';
```

- [ ] **Step 2: Replace bottom section (lines 138–153)**

Delete the current `setPanelBehavior` block + `action.onClicked` + `tabs.onActivated` listener. Replace with:

```js
const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
  setupSidePanel(browser, chrome, triggerUpload);
} else {
  browser.action.onClicked.addListener(() => {
    triggerUpload();
  });
}

browser.tabs.onActivated.addListener(() => {
  activeSession = null;
});
```

- [ ] **Step 3: Run lint to verify**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: All tests pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git add background/sw.js
git commit -m "refactor: extract sidePanel setup into testable module"
```

---

### Task 3: Update sidebar page — remove broadcast, add local tab activation

**Files:**
- Modify: `sidebar/sidebar.entry.js` — remove `TAB_CHANGED` handler + `onTabChanged`, add `tabs.onActivated` listener
- Modify: `sidebar/sidebar.html` — no changes needed (no `disabled-panel` div to remove — that was only in the reverted version)

**Interfaces:**
- Consumes: `browser.tabs.onActivated`, existing `createIframe`/`showIframe`/`getIframe`/`triggerUpload`/`getPrefs`
- Produces: iframe swap on tab switch within window

- [ ] **Step 1: Remove `onTabChanged` function**

Delete the entire `onTabChanged` function (lines 80–100).

- [ ] **Step 2: Remove `TAB_CHANGED` message handler**

Delete from the message listener:
```js
if (msg.type === 'TAB_CHANGED') {
  onTabChanged(msg.tabId);
  return;
}
```

- [ ] **Step 3: Add `tabs.onActivated` listener**

After the existing `browser.tabs.onRemoved.addListener` block (line 115–117), add:

```js
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeInfo.tabId === currentTabId) return;
  currentTabId = activeInfo.tabId;
  lastUploadTab = null;

  if (!iframes.has(activeInfo.tabId)) {
    createIframe(activeInfo.tabId);
    await new Promise((r) => setTimeout(r, 4000));
    const prefs = await getPrefs();
    const iframe = getIframe(activeInfo.tabId);
    if (prefs.tempChat && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
    }
  }
  showIframe(activeInfo.tabId);
  await triggerUpload();
});
```

- [ ] **Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add sidebar/sidebar.entry.js
git commit -m "refactor: remove cross-window TAB_CHANGED broadcast, use local tabs.onActivated"
```

---

### Task 4: Build + manual QA

**Files:**
- No new files — verify build output

**Interfaces:**
- Consumes: `bun run build`, Chrome extension dev mode

- [ ] **Step 1: Build for Chrome**

Run: `bun run build`
Expected: `dist/chrome/` and `dist/firefox/` created, no errors

- [ ] **Step 2: Verify Firefox build strips sidePanel**

Check: `dist/firefox/manifest.json` has no `side_panel` key, no `sidePanel` permission
Check: `dist/firefox/background/sw.js` has `hasSidePanel = false` path

- [ ] **Step 3: Load Chrome extension and manual test**

Load `dist/chrome/` via `chrome://extensions` → "Load unpacked".

Manual checklist (from spec):
1. Open tab A, click icon → panel opens
2. Open tab B in same window, switch to it → panel auto-hides
3. Switch back to A → panel auto-shows, Gemini session preserved
4. Click icon on tab B → panel opens for B
5. Switch A↔B → panel follows active tab, both sessions preserved
6. Open window 2, open tab C, click icon → panel opens in window 2
7. Window 1 panel stays visible (cross-window leak fixed)
8. Click icon on enabled tab → panel closes (toggle works)
9. Close tab with panel enabled → reopen tab → fresh state
10. Navigate tab A to new URL → panel stays enabled

- [ ] **Step 4: Verify Firefox build still works**

Load `dist/firefox/manifest.json` via `about:debugging`. Open sidebar via menu. Verify it stays global across tabs (unchanged behavior).

- [ ] **Step 5: Commit (no code changes, just verification)**

No commit needed — this is verification only.

---

## Self-Review

**1. Spec coverage:**
- Per-tab enabled state → Task 1 (`enabledTabs` Set + `setOptions`)
- Click = toggle → Task 1 (action.onClicked toggle logic)
- Tab switch auto-hide/show → Task 1 (Chrome native via `setOptions({enabled})`) + Task 3 (iframe swap)
- Window isolation → Task 1 (no broadcast) + Task 3 (removed `TAB_CHANGED`)
- Cross-window leak fixed → Task 3 (removed broadcast message)
- Navigation persistence → No code needed (tabId unchanged, `setOptions` persists)
- Session preservation → Task 3 (iframe-per-tab Map preserved)
- Firefox unchanged → Task 1 (`hasSidePanel` check) + Task 4 (verify Firefox build)
- Testing → Task 1 (unit tests) + Task 4 (manual QA)

All spec requirements covered. ✓

**2. Placeholder scan:** No TBD/TODO. All code blocks are complete. All commands have expected output. ✓

**3. Type consistency:** `setupSidePanel(browser, chrome, triggerUpload)` — consistent across Task 1 (definition) and Task 2 (call). `enabledTabs` Set internal to function. `activeInfo.tabId` matches `currentTabId` type (number). ✓
