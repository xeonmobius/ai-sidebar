# Copy Website Button — PDF Support Design Spec

**Date**: 2026-07-25

## Goal

Extend the "Copy Website" button to handle PDF pages. On regular websites, copies markdown to clipboard. On PDF pages, copies the PDF file to clipboard (with auto-download fallback).

## Context

The "Copy Website" button currently only handles HTML pages (extracts as markdown). Users want to grab PDF content and paste it into Gemini chat.

## Design

### Behavior

| Page Type | Action |
|-----------|--------|
| HTML page | Extract as markdown → `navigator.clipboard.writeText()` → "Copied!" |
| PDF page (URL ends with `.pdf` or `file://` PDF) | Fetch PDF as base64 → Blob → `navigator.clipboard.write([ClipboardItem])` → if fails, auto-download → "Copied!" / "Downloaded!" |

### Flow

1. User clicks "Copy Website" on a PDF tab
2. SW detects PDF URL (`isPdfUrl()`)
3. SW injects fetch script (not extractor) via `browser.scripting.executeScript`
4. Fetch script: `fetch(url)` → ArrayBuffer → base64 → returns base64 string
5. SW sends `{ type: 'EXTRACT_RESULT', pdf: { base64, filename, mimeType } }` to sidebar
6. Sidebar: `atob(base64)` → `Uint8Array` → `Blob` → `navigator.clipboard.write([new ClipboardItem({ 'application/pdf': blob })])`
7. If clipboard write fails (unsupported MIME type): create `<a download>`, click to download
8. Button feedback: "Copied!" (success) or "Downloaded!" (fallback)

### Files Changed

| File | Change |
|------|--------|
| `background/copy-website.js` | Add `isPdfUrl()`, PDF detection, fetch script injection |
| `sidebar/sidebar.entry.js` | Add `msg.pdf` handler: Blob creation, clipboard write, download fallback |
| `background/copy-website.test.js` | Test PDF URL detection, fetch script injection |

### Error Handling

- PDF fetch fails (network, CORS) → "Failed"
- Clipboard write fails (unsupported MIME) → auto-download
- Download fails → "Failed"

### Permissions

No new permissions needed. Existing `clipboardWrite` and `<all_urls>` host permission cover PDF fetch and clipboard operations.