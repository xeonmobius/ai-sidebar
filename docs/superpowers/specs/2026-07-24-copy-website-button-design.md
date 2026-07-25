# Copy Website Button — Design Spec

**Date**: 2026-07-24

## Goal

Add a "Copy Website" button to the sidebar toolbar. When clicked, extracts the active tab's page content as markdown and copies it to the system clipboard.

## Context

Auto-copy/monkey-patch code was removed. The sidebar now shows only Gemini. Users need a manual way to grab page content.

## Design

### Layout

A thin toolbar at the top of the sidebar containing one button labeled "Copy Website". The Gemini iframe fills the remaining vertical space below the toolbar. The dead `#pdf-picker` div and its CSS are removed.

### Flow

1. User clicks "Copy Website" button in sidebar
2. Sidebar sends `{ type: 'EXTRACT_PAGE' }` message to background SW
3. SW queries the active tab, injects `content/extractor.bundle.js` via `scripting.executeScript`
4. Extractor runs on the page, extracts DOM as markdown via Turndown, sends `{ type: 'EXTRACT_RESULT', result }` back to SW
5. SW forwards `{ type: 'EXTRACT_RESULT', result }` to the sidebar
6. Sidebar calls `navigator.clipboard.writeText(result.markdown)`
7. Button text changes to "Copied!" for 2 seconds, then reverts

### Permissions

Add `clipboardWrite` to `manifest.json` permissions so the async round-trip doesn't lose user gesture context.

### Files Changed

| File | Change |
|------|--------|
| `sidebar/sidebar.html` | Add toolbar with "Copy Website" button, remove `#pdf-picker` |
| `sidebar/sidebar.css` | Toolbar + button styles, remove picker styles |
| `sidebar/sidebar.entry.js` | Button click handler, clipboard write, listen for `EXTRACT_RESULT` |
| `background/sw.js` | `EXTRACT_PAGE` handler (inject extractor), `EXTRACT_RESULT` forwarder |
| `manifest.json` | Add `clipboardWrite` permission |

### Not Changed

- Extractor code (`content/extractor.entry.js`, `src/extractor/`)
- `background/setup-sidepanel.js`
- `content/gemini-injector.entry.js`

### Error Handling

- If extraction fails (chrome:// URLs, restricted pages), button shows "Failed" for 2s
- If clipboard write fails, button shows "Failed" for 2s
