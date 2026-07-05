# Gemini Sidebar

Open Google Gemini's webchat in a browser sidebar and attach the current page (as Markdown) or a PDF as conversation context — no API key required. Uses your existing Gemini login.

Chrome + Firefox. Manifest V3.

## Install (developer / sideload)

1. `bun install && bun run build`
2. **Chrome:** `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist/chrome/`.
3. **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/firefox/manifest.json`.
4. Log into `gemini.google.com` in a normal tab first.
5. Click the toolbar icon (or Ctrl/Cmd+Shift+G).

## Use
- **Attach current page:** click the toolbar icon. Page converts to Markdown and uploads to Gemini as `.md`.
- **Attach a PDF:** click "+ Attach PDF" in the sidebar, pick the file.

## How it works
Sidebar iframes `gemini.google.com`; `declarativeNetRequest` strips framing headers so the iframe loads with your cookies. A content script inside the iframe attaches files via `DataTransfer` on Gemini's file input. Page content is HTML→Markdown via Turndown.

## When Gemini UI changes
Auto-attach may break when Google ships UI updates. Fix = one edit to the `SELECTORS` const in `content/gemini-injector.entry.js`, then rebuild. Clipboard fallback keeps the extension usable in the meantime.

## Privacy
No telemetry. No remote requests except to `gemini.google.com`. All data stays local. No API keys.

## Develop
- `bun test` — vitest unit tests
- `bun run lint` — eslint
- `bun run build` — bundle to `dist/chrome/` and `dist/firefox/`
- `bun run lint:ext:chrome` — web-ext manifest validation (Chrome)
- `bun run lint:ext:firefox` — web-ext manifest validation (Firefox)
