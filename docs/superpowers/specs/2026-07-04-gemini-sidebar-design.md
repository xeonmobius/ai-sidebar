# Gemini Sidebar Extension — Design Spec

**Date:** 2026-07-04
**Status:** Approved (pending spec review)
**Target browsers:** Chrome (MV3 `sidePanel`) + Firefox (`sidebar_action`), shared codebase

---

## 1. Goal

A cross-browser (Chrome + Firefox) extension that opens Google Gemini's **webchat** (not the API) in a sidebar. On demand, it converts the current web page to Markdown and attaches it to the Gemini conversation as a file. It also supports attaching PDFs. Both paths use the same injection mechanism: programmatic file upload into Gemini's native file input.

### Hard constraints (set by user)

- **No Gemini API key.** Must use `gemini.google.com` webchat with the user's existing work-login session (Gemini Pro via employer).
- **No API call path at all.** All context injection happens through the webchat UI.
- **Full auto context attach** (user accepted the fragility tradeoff).
- **On-demand trigger** (button or keyboard shortcut), never background.
- **Full page as Markdown** for web pages (preserve structure, not article-only).
- **PDFs via native Gemini file upload** (leverages Gemini vision for scanned/layout-aware handling).
- **Both browsers from one codebase.**

---

## 2. Feasibility verdict

| Requirement | Feasible? | Mechanism |
|---|---|---|
| Sidebar in Chrome | Yes | `chrome.sidePanel` API (MV3, Chrome 114+) |
| Sidebar in Firefox | Yes | `sidebar_action` manifest key (Firefox-native) |
| Load `gemini.google.com` in sidebar iframe | Yes | `declarativeNetRequest` strips `X-Frame-Options` + frame-ancestors CSP for `gemini.google.com` only — proven technique (insidebar-ai uses it) |
| Use work-login session | Yes | Iframe loads with browser cookies; no credentials pass through the extension |
| Auto-attach page/PDF as context | Yes | `DataTransfer` API sets files on Gemini's `<input type="file">`, dispatches `change`. Works Chrome + Firefox |

**Core technique for context injection:** unify page and PDF through one code path — extract content into a `File`, programmatically attach via Gemini's file input. Avoids the more fragile contenteditable prompt manipulation entirely.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ BROWSER TAB (any web page)                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ extractor.js (injected on-demand via scripting)      │    │
│  │  HTML → strip noise → Turndown → Markdown string     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │ structured clone (File obj)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BACKGROUND SERVICE WORKER (background/sw.js)                │
│  action handler · extract orchestration · messaging hub     │
└─────────────────────────────────────────────────────────────┘
                          │ runtime.sendMessage
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ SIDEBAR (sidebar/sidebar.html — extension page)             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ <iframe src="https://gemini.google.com/app">          │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ gemini-injector.js (content script, all_frames) │  │  │
│  │  │  finds <input type=file> → DataTransfer attach  │  │  │
│  │  │  → dispatch change → file chip appears          │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  [+ Attach PDF] button (sidebar's own <input type=file>)    │
│  Status strip (1 line above iframe)                         │
└─────────────────────────────────────────────────────────────┘
```

### Why two content scripts

- **`extractor.js`** runs in the **source page** (cross-origin to the extension). Injected on-demand via `chrome.scripting.executeScript` under the transient `activeTab` grant triggered by the action click. Never loaded into pages the user didn't ask to extract.
- **`gemini-injector.js`** runs **inside the Gemini iframe** that lives in the sidebar. The sidebar's own JS cannot reach the cross-origin iframe DOM, so a content script with host permission on `gemini.google.com` does the manipulation. Registered declaratively via `content_scripts` in the manifest with `all_frames: true`.

### Why the iframe loads at all

`gemini.google.com` normally sends `X-Frame-Options: DENY` / a `frame-ancestors` CSP that blocks embedding. A single static `declarativeNetRequest` rule removes those response headers for `https://gemini.google.com/*` only. The iframe then loads normally with the user's login cookies. This is the same mechanism password-manager extensions use to embed pages, and is used by insidebar-ai for the same purpose.

---

## 4. Components

```
gemini-sidebar/
├── manifest.json
├── background/
│   └── sw.js                   # action handler, extract orchestration, msg hub
├── sidebar/
│   ├── sidebar.html            # iframe + attach-PDF btn + status strip
│   ├── sidebar.css
│   └── sidebar.js              # PDF picker, status state machine, fallback UI
├── content/
│   ├── extractor.js            # strip noise → Turndown → Markdown
│   └── gemini-injector.js      # DataTransfer upload + SELECTORS config
├── lib/                        # vendored build artifacts (bundled at build time)
│   ├── turndown.js             # turndown ^7.x
│   ├── turndown-plugin-gfm.js  # ^1.x — tables, strikethrough, task lists
│   └── browser-polyfill.js     # webextension-polyfill
├── rules/
│   └── remove_headers.json     # DNR rule: strip XFO/CSP for gemini.google.com
├── options/
│   └── options.html            # toggles: auto-attach, MAX_CHARS, file-type pref
├── icons/
├── tests/
│   ├── extractor.test.js
│   ├── injector.test.js
│   ├── fixtures/html/          # 6–8 real saved pages
│   └── MANUAL.md               # release manual test matrix
└── package.json                # devDeps: vitest, eslint, esbuild, web-ext
```

**Single selector maintenance surface:** the entire fragility of the injection path is concentrated in one config block at the top of `gemini-injector.js`. When Gemini ships a UI change, one edit restores auto-attach.

---

## 5. Manifest + Permissions

```jsonc
{
  "manifest_version": 3,
  "name": "Gemini Sidebar",
  "version": "0.1.0",
  "description": "Open Gemini webchat in the sidebar. Attach the current page or a PDF as context.",
  "permissions": [
    "sidePanel",
    "declarativeNetRequest",
    "activeTab",
    "scripting",
    "storage",
    "clipboardWrite"
  ],
  "host_permissions": [
    "https://gemini.google.com/*"
  ],
  "action": { "default_title": "Open Gemini Sidebar" },
  "side_panel": { "default_path": "sidebar/sidebar.html" },
  "background": { "service_worker": "background/sw.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://gemini.google.com/*"],
      "js": ["content/gemini-injector.bundle.js"],
      "all_frames": true,
      "run_at": "document_idle"
    }
  ],
  "declarativeNetRequest": {
    "rule_resources": [{
      "id": "strip_gemini_framing_headers",
      "enabled": true,
      "path": "rules/remove_headers.json"
    }]
  },
  "options_ui": { "page": "options/options.html" },
  "browser_specific_settings": {
    "gecko": { "id": "gemini-sidebar@example", "strict_min_version": "128.0" }
  },
  "sidebar_action": { "default_panel": "sidebar/sidebar.html", "default_title": "Gemini" },
  "commands": {
    "_execute_action": { "suggested_key": { "default": "Ctrl+Shift+G", "mac": "Command+Shift+G" } }
  }
}
```

### Permission justification (lean)

| Permission | Why needed |
|---|---|
| `sidePanel` | Chrome sidePanel API |
| `sidebar_action` (manifest) | Firefox sidebar; Chrome ignores the key |
| `declarativeNetRequest` | Strip XFO/CSP on `gemini.google.com` only |
| `activeTab` | Extract from current page on click — replaces a broad `<all_urls>` host grant |
| `scripting` | Inject `extractor.js` into the active tab |
| `storage` | Persist `SELECTORS` overrides, user prefs, last-error for debug |
| `clipboardWrite` | Fallback paste path |
| `host_permissions: https://gemini.google.com/*` | Injector content script + iframe host access |

**No `<all_urls>`.** `activeTab` covers page extraction only at the moment of user action.

### Cross-browser notes

- `webextension-polyfill` normalizes `chrome.*` / `browser.*`.
- Chrome: action handler calls `chrome.sidePanel.open({ tabId })`.
- Firefox: `browser.sidebarAction.open()` (Firefox 54+; sidebar_action is the supported path).
- `declarativeNetRequest` static `remove_headers` rules: supported in both Chrome (MV3) and Firefox 128+. `strict_min_version: 128.0` enforces this.

---

## 6. Data Flows

### Flow A — Web page → Gemini attachment

```
1. User clicks action icon (or Ctrl+Shift+G)
2. background/sw.js:
   ├─ chrome.sidePanel.open({ tabId }) / browser.sidebarAction.open()
   ├─ wait for sidebar "READY" message (sidebar.js pings on load)
   └─ chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content/extractor.bundle.js']
      })
3. extractor.js runs in source tab:
   ├─ clone document.documentElement
   ├─ remove: script, style, nav, noscript, svg, iframe, template, header, footer
   ├─ md = new TurndownService({ headingStyle:'atx', codeBlockStyle:'fenced' })
   │        .use(turndownPluginGfm.gfm)
   │        .turndown(clone.querySelector('body'))
   ├─ if md.trim().length < 50  →  md = document.body.innerText   (SPA fallback)
   ├─ prepend: "# {document.title}\nSource: {location.href}\n\n"
   ├─ truncate at MAX_CHARS (default 500_000)
   └─ return { title, url, markdown }   ← resolved via executeScript result
4. background/sw.js:
   ├─ file = new File([markdown], slug(title) + '.md', { type: 'text/markdown' })
   └─ runtime message → gemini-injector.js:  { type: 'ATTACH_FILE', file }
5. gemini-injector.js (already running in Gemini iframe):
   ├─ waitFor(SELECTORS.fileInput, timeout: 8s)
   ├─ dt = new DataTransfer()
   ├─ dt.items.add(file)
   ├─ input.files = dt.files
   ├─ input.dispatchEvent(new Event('change', { bubbles: true }))
   └─ ack: { ok: true } | { ok: false, reason }
6. Gemini renders file chip in composer. User types question → Send.
```

### Flow B — PDF → Gemini attachment

```
1. User clicks [+ Attach PDF] in sidebar
2. sidebar.js:
   ├─ hidden <input type=file accept=".pdf,application/pdf">.click()
   ├─ on change: file = input.files[0]
   └─ runtime message → gemini-injector.js:  { type: 'ATTACH_FILE', file }
3. Steps 5–6 of Flow A identical.   ← SAME injection path
```

One injector. One selector. One DataTransfer routine. Two entry points.

### File transfer across contexts

`File` and `Blob` are structured-cloneable, so they survive `runtime.sendMessage` without a blob-URL round trip. Pathological pages (>50 MB markdown) are truncated at `MAX_CHARS` before the `File` is constructed.

---

## 7. Extraction Library Choice

| Stage | Library | Version | Rationale |
|---|---|---|---|
| HTML → Markdown | `turndown` | ^7.x | De-facto standard, vanilla JS, ~30 KB, configurable rules |
| GFM extras | `turndown-plugin-gfm` | ^1.x | Tables, strikethrough, task lists, autolinks — Gemini renders GFM |
| Pre-clean | vanilla DOM strip | — | Remove non-content tags before conversion |
| SPA fallback | none | — | `document.body.innerText` when Turndown output is empty |

**Why not Readability:** the user chose *full page* Markdown, preserving structure. Readability extracts the main article only and would discard tables, secondary sections, and navigation-adjacent content the user wants preserved.

**Why not alternatives:**
- `node-html-markdown` — Node-oriented, heavier
- `defuddle` / `@mozilla/readability` — article-only, wrong fit
- `mercury-parser` — unmaintained
- hand-rolled — reinvents a solved problem

Turndown + GFM plugin is the proven combination used by Obsidian Web Clipper, MarkDownload, and similar extensions.

Libraries are **vendored at build time** via esbuild into `content/extractor.bundle.js` so the extension ships one bundle per context (no runtime module loading, no duplicate copies of shared deps).

---

## 8. Fallback Ladder

Auto-attach will break eventually — when Gemini ships a UI change, when a Workspace tenant blocks `.md` uploads, or when the iframe hasn't loaded yet. Every failure degrades gracefully:

```
injector: SELECTORS.fileInput not found within 8s
   → OR change event fires but Gemini rejects the file
   → OR Workspace tenant blocks .md upload
        │
        ▼
Step 1: retry as .txt
        rename blob, type:'text/plain', re-attach
        ├─ success → done
        └─ fail ↓
Step 2: clipboard fallback
        ├─ navigator.clipboard.writeText(markdown)
        ├─ sidebar status: "Auto-attach failed. Press ⌘V in Gemini."
        └─ Gemini prompt focused (iframe focus + click on prompt element)
        │
        ▼
Step 3: persistent error
        sidebar shows last-error + manual "Copy to clipboard" button
```

Every failure is local, silent to the outside, and recoverable. No telemetry. Last error is stashed in `storage.local` for an optional debug view only.

### Selector resilience

```js
// content/gemini-injector.js
const SELECTORS = {
  fileInput: [
    'input[type="file"]',                          // primary
    'input[accept*="pdf"]',                        // alt
    'rich-textarea input[type="file"]',            // observed variant
  ],
  promptFocus: 'rich-textarea div[contenteditable="true"]',
};
```

`waitFor` walks the array; first hit wins. When all miss, the fallback ladder fires. Adding a selector variant is one line. This config block is the *entire* selector maintenance surface.

### Sidebar status state machine

```
IDLE → EXTRACTING → UPLOADING → ATTACHED
                                 │
                   any failure → FALLBACK_CLIPBOARD → (manual paste)
                                 │
                      hard fail → ERROR (retry btn)
```

One line of status text in `sidebar.html`, above the iframe. Keeps the user oriented without UI clutter.

---

## 9. Edge Cases

| Case | Behavior |
|---|---|
| Source tab is `chrome://` / `about:` / `file://` | `scripting.executeScript` blocked → sidebar status: "Can't extract this page." |
| Source tab is a PDF in the browser viewer | Extractor finds no usable DOM → status prompts user to use [+ Attach PDF] instead |
| Gemini not logged in | Iframe shows login page → injector times out → status: "Log into Gemini in the sidebar first." |
| Multiple rapid action clicks | Debounce in service worker (1 s lock) |
| Sidebar closed mid-extract | Injector ack has no listener → no-op, GC'd |
| SPA route change in source tab after click | Irrelevant — extraction is a point-in-time snapshot |
| Page with frames | `executeScript` targets top frame only by default; acceptable for v0.1 |
| Markdown exceeds `MAX_CHARS` | Truncate, prepend a `[truncated]` marker |
| PDF exceeds Gemini's file size cap | Gemini shows its own error; status relays "Gemini rejected the file" |

---

## 10. Testing Strategy

No automated end-to-end on Gemini (requires a real work-login session, brittle, low ROI). Manual matrix covers that. Automated tests cover the pure logic.

### Unit tests — `vitest` + `jsdom`

| Target | Assertions |
|---|---|
| `extractor.js` extract function | Feed HTML fixtures → assert Markdown output, title/URL prepend, truncation at `MAX_CHARS`, SPA fallback to `innerText` when Turndown yields < 50 chars |
| Turndown config | Tables, fenced code, links, headings render as expected |
| `gemini-injector.js` DataTransfer helper | Mock `<input type=file>` in jsdom → assert `input.files[0]` set, `change` dispatched, `.md`→`.txt` retry path, fallback signal emitted on failure |
| Selector walker | Fake DOMs (selector present / absent / variant) → correct element returned or timeout |
| `slug(title)` | Title → safe cross-platform filename |

Fixtures (`tests/fixtures/html/`): article blog, SPA dashboard, table-heavy wiki, minimal page, huge page, non-Latin page, paywalled stub, AMP page.

### Manual release matrix — `tests/MANUAL.md`

Run for both Chrome and Firefox on each release:

```
[ ] Page attach — article blog
[ ] Page attach — SPA dashboard
[ ] Page attach — table-heavy (wiki)
[ ] Page attach — huge page (> 500k chars → truncation marker shows)
[ ] PDF attach — text-layer PDF
[ ] PDF attach — scanned PDF (Gemini vision)
[ ] PDF attach — large PDF (> 10 MB)
[ ] Fallback — break SELECTORS temporarily → clipboard path fires
[ ] Fallback — .md rejected → .txt retry → success
[ ] Logged-out state → correct status message
[ ] chrome:// page → graceful "can't extract"
[ ] Rapid double-click → debounce holds
[ ] Sidebar close mid-extract → no error storm
[ ] Keyboard shortcut fires action
[ ] Cross-browser parity (Chrome sidePanel + Firefox sidebar_action)
```

### Lint / build

| Tool | Purpose |
|---|---|
| `eslint` | Code quality |
| JSDoc on public functions (no TypeScript) | Light type signal without a build step |
| `web-ext lint` (Mozilla) | Cross-browser manifest validation |
| `esbuild` | Bundle `lib/` deps into one file per context |
| `npm run build` | Produce `.zip` artifacts for both stores |

### Verification discipline

Every claim of "done" or "works" must show evidence: unit test output pasted, manual-matrix checkboxes ticked. No "should work" assertions. (Per `verification-before-completion` skill.)

---

## 11. Scope Boundaries (YAGNI — explicit non-goals for v0.1)

| Out of scope | Why |
|---|---|
| Chat history save | Gemini's own history covers this |
| Prompt library / templates | Not requested |
| Multi-provider (ChatGPT, Claude, etc.) | Gemini only, per user constraint |
| Rich settings UI | Options page has only: auto-attach on/off, `MAX_CHARS`, file-type preference |
| Telemetry / analytics | Privacy-first, zero collection |
| Cross-device sync | Local-only storage |
| Selection-based right-click extraction | On-demand button covers the need; can be added later |
| Screenshot / vision capture of page | Out of scope; Gemini has its own screen-share |
| Multiple files in one attach action | One file per attach; action can be repeated |
| OAuth / account management | Uses existing browser login |
| Remote selector auto-update | Manual edit of `SELECTORS` is fine for v0.1 |

### Future hooks (not built, not blocked)

- Remote selector config (drop-in JSON, fetched periodically) — deferred
- Page screenshot as image attachment fallback — deferred
- Multi-tab batch attach — deferred

---

## 12. Risks + Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gemini UI change breaks `<input type=file>` selector | Medium | Selector array + clipboard fallback keeps the extension functional; one-line edit restores auto-attach |
| Gemini blocks `declarativeNetRequest` XFO strip | Low | Would break every sidebar extension (insidebar-ai included); unlikely; monitor |
| Workspace tenant blocks all file upload | Low–Medium | Clipboard fallback always available |
| `DataTransfer.items.add` future restriction | Very low | Stable spec, widely used |
| Programmatic file flagged as untrusted by Gemini | Low | Clipboard fallback covers it |
| Work laptop blocks extension install | Medium | Out of scope (user environment); document sideload steps in README |
| Turndown produces noisy Markdown on unusual DOMs | Medium | Pre-clean + SPA fallback + truncation; fixture tests catch regressions |

---

## 13. Open Questions Deferred to Implementation

These are resolved during implementation, not design:

1. **Exact Gemini file-input selector** — must be discovered live against the current Gemini DOM; documented in `SELECTORS` once known.
2. **Final `MAX_CHARS` value** — verify against live Gemini file upload cap during implementation.
3. **Firefox `declarativeNetRequest` `remove_headers` behavior** — confirm `web-ext lint` accepts the rule and Firefox honors it (expected: yes on 128+).
4. **Whether Gemini's iframe requires a specific entry URL** (`/app` vs `/prompt`) for the composer to be present on first load.
5. **Slug rules** — final character allowlist and length cap for generated filenames.

---

## 14. References

- `declarativeNetRequest` static rules: <https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest>
- Chrome sidePanel API: <https://developer.chrome.com/docs/extensions/reference/sidePanel>
- Firefox sidebar_action: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest_options/sidebar_action>
- `DataTransfer` API: <https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer>
- Turndown: <https://github.com/mixmark-io/turndown>
- turndown-plugin-gfm: <https://github.com/mixmark-io/turndown-plugin-gfm>
- Prior art: insidebar-ai (<https://github.com/xiaolai/insidebar-ai>) — proves the iframe + DNR + cookie-session technique works for Gemini without an API key.
