# Manual Test Matrix — Gemini Sidebar

Run for **both Chrome and Firefox** before each release. Load `dist/` as unpacked extension
(Chrome: chrome://extensions → Developer mode → Load unpacked → select dist/chrome/. Firefox: about:debugging →
This Firefox → Load Temporary Add-on → select dist/firefox/manifest.json).

## Setup
- [ ] Log into gemini.google.com in a normal browser tab first (work account with Gemini Pro).
- [ ] Open sidebar via toolbar action or Ctrl/Cmd+Shift+G.

## Page attach
- [ ] Article blog → status reaches ATTACHED, file chip appears in Gemini composer
- [ ] SPA dashboard (e.g. a React admin page) → SPA fallback fires, attaches as text
- [ ] Table-heavy page (Wikipedia article) → Markdown tables render in Gemini
- [ ] Huge page (>500k chars) → status shows "Uploading" then attached; truncation marker visible in file content (download and inspect)
- [ ] chrome:// page → status shows "can't extract" gracefully

## PDF attach
- [ ] Text-layer PDF → file chip appears, Gemini can answer questions about content
- [ ] Scanned/image-only PDF → file chip appears, Gemini vision handles
- [ ] Large PDF (>10MB) → either attaches or Gemini shows its own rejection (status relays)

## Fallback ladder
- [ ] Temporarily break SELECTORS in dist/content/gemini-injector.bundle.js (change to 'input.doesnotexist') → clipboard fallback fires, status reads "Auto-attach failed. Press ⌘V in Gemini."
- [ ] Restore selector. Force .md rejection by uploading a disallowed type — verify .txt retry path (check console for retry log).

## Resilience
- [ ] Logged-out Gemini → status times out with "Log into Gemini in the sidebar first." (or similar error)
- [ ] Rapid double-click action → second click ignored (debounce)
- [ ] Close sidebar mid-extract → no error storm in background console
- [ ] Keyboard shortcut opens sidebar

## Cross-browser parity
- [ ] Chrome: sidePanel opens on right
- [ ] Firefox: sidebar_action opens (View → Sidebar)
