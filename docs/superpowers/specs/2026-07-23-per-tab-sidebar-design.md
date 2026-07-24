# Per-tab Sidebar (Chrome) — Design

**Date:** 2026-07-23
**Status:** Approved (brainstorm)
**Scope:** Chrome only. Firefox unchanged.

## Problem

Current behavior: opening the AI Sidebar shows it across every tab in the window. Switching tabs keeps it visible. Three previous attempts at per-tab behavior were reverted because they relied on in-panel show/hide — Firefox's `sidebarAction.close()` cannot be called programmatically, so "closed" meant an empty panel was still visible (bad UX).

Additional symptom: opening a new tab in window B closed the panel in window A. Root cause was the service worker broadcasting a `TAB_CHANGED` message to every panel page across every window.

## Goals

1. **Per-tab enabled state.** Each tab independently tracks whether the sidebar is enabled.
2. **Click = toggle.** Toolbar icon click toggles enable on/off for the active tab.
3. **Tab switch in same window.** Switching to a tab where sidebar is enabled shows the panel; switching to a tab where it is not hides the panel. Chrome handles this natively once `setOptions({tabId, enabled})` is set.
4. **Window switch.** Switching focus between Chrome windows never affects either window's panel state. Each window's panel tracks its own active tab.
5. **Cross-window isolation.** Acting in window B has zero effect on window A's panel. No broadcast messages.
6. **Navigation persistence.** Navigating within a tab (same `tabId`, new URL) keeps the sidebar enabled.
7. **Session preservation.** Existing iframe-per-tab Gemini session pattern preserved. Switching back to a previously-enabled tab restores its Gemini conversation.

## Non-Goals

- Firefox per-tab behavior. Firefox keeps current global sidebar.
- Cross-session persistence of enabled state (closing browser loses state). Acceptable.
- Per-tab panel content customization. All enabled tabs use the same `sidebar.html`.

## Approach

Use Chrome's native per-tab `enabled` flag in the sidePanel API. `chrome.sidePanel.setOptions({tabId, enabled})` causes Chrome to auto-hide the panel when that tab is active and `enabled: false`. We write zero hide/show logic — Chrome owns it.

### Why this approach

| Alt | Why rejected |
|-----|--------------|
| Manual `open()`/`close()` on tab activation | Reinvents what `setOptions({enabled})` does. Race conditions on rapid switches. |
| Per-tab panel path (`setOptions({tabId, path})`) | Spins up a panel page per tab. Many Gemini iframes. Memory blowup. |
| In-panel show/hide (reverted approach) | Panel stays visible when "closed". UX fail. |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Service Worker (background/sw.js)                      │
│    enabledTabs: Set<tabId>                              │
│                                                         │
│    action.onClicked(tab)                                │
│      → toggle in set                                   │
│      → setOptions({tabId, enabled})                    │
│      → if enabling: sidePanel.open({windowId})         │
│                                                         │
│    tabs.onRemoved(tabId)                                │
│      → setOptions({tabId, enabled: true})  // reset    │
│      → set.delete(tabId)                               │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
  ┌──────────────────┐            ┌──────────────────┐
  │ Window A panel   │            │ Window B panel   │
  │ (own page inst)  │            │ (own page inst)  │
│  iframes: Map      │            │ iframes: Map     │
│   └ T1 iframe      │            │   └ T3 iframe    │
  └──────────────────┘            └──────────────────┘
```

Each Chrome window owns its own panel page instance with its own iframe Map. No cross-window messages are sent.

## Service Worker Changes (`background/sw.js`)

Replace the current sidePanel setup block (lines ~138–148) and the existing `action.onClicked` listener with a Chrome/Firefox branch:

```js
const hasSidePanel = typeof chrome !== 'undefined' && chrome?.sidePanel;

if (hasSidePanel) {
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
} else {
  browser.action.onClicked.addListener(() => { triggerUpload(); });
}
```

Additional changes:

- Remove the existing `setPanelBehavior` block (lines 138–144).
- Remove the `browser.tabs.onActivated` listener's `TAB_CHANGED` broadcast. Keep its `activeSession = null` reset. The new listener body becomes:

```js
browser.tabs.onActivated.addListener(() => {
  activeSession = null;
});
```

**Note on SW restarts:** `enabledTabs` is in-memory. If the service worker sleeps and loses it, the next click on an already-enabled tab is treated as a fresh enable — calling `setOptions({tabId, enabled: true})` (idempotent) and `open()`. Safe. `setOptions` is the source of truth for visibility; the set is an optimization for fast toggle checks.

## Sidebar Page Changes (`sidebar/sidebar.entry.js`)

1. **Delete** the `onTabChanged` function and its call site in the message listener:

```js
// DELETE:
if (msg.type === 'TAB_CHANGED') {
  onTabChanged(msg.tabId);
  return;
}
```

2. **Simplify `onSidebarLoad`** (remove parts that relied on `onTabChanged`):

```js
async function onSidebarLoad() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  currentTabId = tabs[0].id;

  const iframe = createIframe(currentTabId);
  showIframe(currentTabId);

  await new Promise((r) => setTimeout(r, 4000));

  const prefs = await getPrefs();
  if (prefs.tempChat && iframe?.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'CLICK_TEMP_CHAT' }, '*');
  }
  await triggerUpload();
}
```

3. **Add a `tabs.onActivated` listener in the sidebar page** to swap visible iframes when user switches tabs within the same window:

```js
browser.tabs.onActivated.addListener(async (activeInfo) => {
  if (activeInfo.tabId === currentTabId) return;
  currentTabId = activeInfo.tabId;
  lastUploadTab = null;

  // Chrome hides the whole panel when active tab has enabled:false, so this
  // code only runs when the new active tab also has the sidebar enabled.
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

4. **Unchanged:** `createIframe`, `showIframe`, `removeIframe`, PDF picker handlers, `ATTACH_FILE` / `ATTACH_PDF` / `PDF_PICKER_NEEDED` message handlers, `triggerUpload`, `getPrefs`.

## Firefox Behavior (Unchanged)

- Manifest `sidebar_action` stays.
- `hasSidePanel` is false in Firefox → SW uses the else-branch listener (current behavior).
- User opens sidebar via View menu or keyboard shortcut. Stays open globally across all tabs in the window. No per-tab enable.
- Accepted trade-off from the "Chrome only" scope decision.

## Click and Close Semantics

| Action | Effect |
|--------|--------|
| Click icon on tab where sidebar is not enabled | Add to set, `setOptions({enabled:true})`, `open({windowId})` |
| Click icon on tab where sidebar is enabled | Remove from set, `setOptions({enabled:false})`. Panel auto-hides because active tab no longer enabled. |
| Switch to enabled tab | Panel auto-shows (Chrome native) |
| Switch to non-enabled tab | Panel auto-hides (Chrome native) |
| Click native X close button on panel | Panel hides visually. Tab stays in `enabledTabs` set. Switching away and back → panel auto-shows again. X means "hide for now", not "permanently disable." |
| Navigate tab to new URL | Sidebar stays enabled. `tabId` unchanged. |
| Close tab that has sidebar enabled | `tabs.onRemoved` → `setOptions({tabId, enabled:true})` reset + remove from set |
| Tab with sidebar enabled dragged to another window | `tabId` unchanged, stays enabled. New window shows it natively. |

## Edge Cases

- **Rapid tab switching:** Chrome debounces panel visibility. Sidebar listener uses `iframes.has()` guard to prevent double-create. Idempotent.
- **Service worker sleep/wake:** `enabledTabs` set may be lost. `setOptions` is source of truth. Next click on already-enabled tab → treated as fresh enable → idempotent `setOptions({enabled:true})` + `open()`. Safe.
- **Cross-window leak (original "C" bug):** No `TAB_CHANGED` broadcast. Each window's panel page receives only its own `tabs.onActivated` events scoped to its window's active tab. Window A's panel is untouched by activity in window B.

## Testing

### Unit tests (`background/sw.test.js`, vitest)

Mock `chrome.sidePanel` (`setPanelBehavior`, `setOptions`, `open`), `browser.action.onClicked`, `browser.tabs.onRemoved`. Cases:

1. Click on disabled tab → adds to set, `setOptions({enabled:true})` called, `open({windowId})` called.
2. Click on enabled tab → removes from set, `setOptions({enabled:false})` called, `open` NOT called.
3. Tab removed (was in set) → `setOptions({enabled:true})` reset called, removed from set.
4. Tab removed (was not in set) → no `setOptions` call.
5. `hasSidePanel` false (Firefox) → else-branch: plain `triggerUpload` listener, no set logic.

### Manual test checklist (Chrome)

1. Open tab A, click icon → panel opens.
2. Open tab B in same window, switch to it → panel auto-hides.
3. Switch back to A → panel auto-shows, Gemini session preserved (iframe still there).
4. Click icon on tab B → panel opens for B.
5. Switch A↔B → panel follows active tab, both sessions preserved.
6. Open window 2, open tab C, click icon → panel opens in window 2.
7. Window 1 panel stays visible — **cross-window leak fixed**.
8. Click icon on enabled tab → panel closes (toggle works).
9. Close tab with panel enabled → reopen tab → fresh state, no stale `setOptions`.
10. Navigate tab A to new URL → panel stays enabled, no reload.
11. Firefox: open sidebar via menu → stays global across tabs (unchanged).

## Out of Scope

- Implementation plan (next step: `writing-plans` skill).
- Code changes (this doc is design only).
