# Gemini Sidebar Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cross-browser (Chrome + Firefox) MV3 extension that opens Gemini webchat in a sidebar and attaches the current page (as Markdown) or a user-selected PDF as a file context, using Gemini's native file upload — no API key.

**Architecture:** Sidebar is an extension page iframing `gemini.google.com` (X-Frame-Options stripped via `declarativeNetRequest`). Two content scripts: an on-demand extractor (source page → Markdown) and a resident injector (inside the Gemini iframe → `DataTransfer` file upload). Background service worker orchestrates. Pure logic lives in `src/` (unit-tested); entry points in `background/`, `content/`, `sidebar/`, `options/` wire logic into extension contexts. esbuild bundles to `dist/`, which is the loadable extension folder.

**Tech Stack:** Manifest V3, vanilla JS (ES modules + JSDoc), `webextension-polyfill`, `turndown` ^7, `turndown-plugin-gfm` ^1, esbuild ^0.23, vitest ^2, eslint ^9, `web-ext` (Mozilla) for lint/zip.

## Global Constraints

- **Manifest V3 only.** No MV2 fallback. Firefox `strict_min_version: 128.0` (required for `declarativeNetRequest` static `remove_headers`).
- **No `<all_urls>` host permission.** Page extraction uses `activeTab` + `scripting`.
- **Host permission scope:** `https://gemini.google.com/*` only.
- **No telemetry.** Zero outbound requests except to `gemini.google.com`.
- **No API keys, ever.** All context injection flows through the webchat UI.
- **Pure logic in `src/` is unit-tested (vitest + jsdom).** Entry points are verified manually via `tests/MANUAL.md`.
- **Build output is `dist/`.** Load `dist/` as the unpacked extension. Manifest paths reference `dist/`.
- **Selector maintenance surface is one `SELECTORS` const** in `content/gemini-injector.entry.js`.
- **MAX_CHARS default 500000.** Truncation marker is **appended** (refines spec section 9 which said "prepend" — append reads better after title/source header).
- **Vendor libraries via esbuild bundling**, not runtime import. Ship one bundle per context.
- **Commit after every green test cycle.** Conventional Commits format.

---

## File Structure

**Project root (scaffolding):**
- `package.json` — deps + scripts
- `eslint.config.js` — flat config
- `vitest.config.js` — jsdom env
- `esbuild.config.js` — bundling per entry
- `.gitignore` — `node_modules/`, `dist/`
- `README.md` — sideload install instructions
- `tests/MANUAL.md` — manual release matrix

**Extension manifest + static assets:**
- `manifest.json` — MV3, cross-browser
- `rules/remove_headers.json` — DNR rule
- `icons/icon-16.png`, `icon-48.png`, `icon-128.png` — placeholder PNGs

**Pure logic (unit-tested):**
- `src/utils/slug.js` + `slug.test.js` — title → safe filename
- `src/utils/truncate.js` + `truncate.test.js` — append-marker truncation
- `src/utils/selectors.js` + `selectors.test.js` — `waitForSelector` walker
- `src/extractor/turndown-config.js` — Turndown factory (no test — pure config)
- `src/extractor/extract.js` + `extract.test.js` — HTML string → `{title,url,markdown}`
- `src/extractor/strip-noise.js` + `strip-noise.test.js` — DOMParser-based noise removal
- `src/injector/retry.js` + `retry.test.js` — `.md`→`.txt` retry file builder
- `src/status/reducer.js` + `reducer.test.js` — sidebar status state machine

**Entry points (wiring, manually verified):**
- `background/sw.js` — action handler, orchestration, messaging hub
- `content/extractor.entry.js` — gathers DOM, calls `extractMarkdown`, messages result
- `content/gemini-injector.entry.js` — `SELECTORS` + `attachFileToInput` + message listener + fallback ladder
- `sidebar/sidebar.html` + `sidebar.css` + `sidebar.entry.js` — iframe + attach-PDF button + status strip
- `options/options.html` + `options.entry.js` — toggles UI

**Test fixtures:**
- `tests/fixtures/html/article.html`
- `tests/fixtures/html/spa-dashboard.html`
- `tests/fixtures/html/table-heavy.html`

**Build output (gitignored):**
- `dist/` — loadable extension

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `eslint.config.js`, `vitest.config.js`, `esbuild.config.js`
- Create dirs: `src/utils`, `src/extractor`, `src/injector`, `src/status`, `background`, `content`, `sidebar`, `options`, `rules`, `icons`, `tests/fixtures/html`, `dist`

**Interfaces:** Produces a runnable `npm test` (no tests yet) and `npm run build` (empty build).

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p src/utils src/extractor src/injector src/status \
         background content sidebar options rules icons \
         tests/fixtures/html dist
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "gemini-sidebar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Open Gemini webchat in the sidebar; attach current page or PDF as context.",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "build": "node esbuild.config.js",
    "lint:ext": "web-ext lint --source-dir dist"
  },
  "dependencies": {
    "turndown": "^7.2.0",
    "turndown-plugin-gfm": "^1.0.2",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "esbuild": "^0.23.0",
    "eslint": "^9.9.0",
    "jsdom": "^24.1.0",
    "vitest": "^2.0.0",
    "web-ext": "^8.2.0"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 5: Write `eslint.config.js`**

```js
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        chrome: 'readonly',
        browser: 'readonly',
        DOMParser: 'readonly',
        DataTransfer: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        console: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
```

Add `@eslint/js` to devDeps: `"@eslint/js": "^9.9.0"`.

- [ ] **Step 6: Write `esbuild.config.js`**

```js
import esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const ENTRY_POINTS = [
  { in: 'background/sw.js', out: 'background/sw.js' },
  { in: 'content/extractor.entry.js', out: 'content/extractor.bundle.js' },
  { in: 'content/gemini-injector.entry.js', out: 'content/gemini-injector.bundle.js' },
  { in: 'sidebar/sidebar.entry.js', out: 'sidebar/sidebar.bundle.js' },
  { in: 'options/options.entry.js', out: 'options/options.bundle.js' },
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const ep of ENTRY_POINTS) {
  esbuild.buildSync({
    entryPoints: [ep.in],
    bundle: true,
    outfile: `dist/${ep.out}`,
    format: 'iife',
    target: ['chrome120', 'firefox128'],
    legalComments: 'none',
  });
}

// Copy static assets
for (const p of [
  'manifest.json',
  'sidebar/sidebar.html',
  'sidebar/sidebar.css',
  'options/options.html',
  'rules/remove_headers.json',
]) {
  cpSync(p, `dist/${p}`);
}
mkdirSync('dist/icons', { recursive: true });
for (const sz of [16, 48, 128]) {
  cpSync(`icons/icon-${sz}.png`, `dist/icons/icon-${sz}.png`);
}

console.log('Build complete → dist/');
```

- [ ] **Step 7: Install deps**

```bash
npm install
```
Expected: `node_modules/` populated, lockfile written.

- [ ] **Step 8: Verify scaffold**

```bash
npm test && npm run lint
```
Expected: vitest reports "No test files found" (exit 0 if `--passWithNoTests` added; otherwise add it: `"test": "vitest run --passWithNoTests"`). eslint passes on zero files.

- [ ] **Step 9: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold project structure"
```

---

## Task 2: `slug` Utility (TDD)

**Files:**
- Create: `src/utils/slug.js`
- Test: `src/utils/slug.test.js`

**Interfaces:**
- Produces: `slug(title: string): string` — lowercases, strips diacritics, replaces non-alphanumerics with `-`, caps at 60 chars, falls back to `"page"` when empty.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/slug.test.js
import { describe, it, expect } from 'vitest';
import { slug } from './slug.js';

describe('slug', () => {
  it('lowercases and hyphenates', () => {
    expect(slug('Hello World')).toBe('hello-world');
  });
  it('collapses non-alphanumerics', () => {
    expect(slug('A/B:C?')).toBe('a-b-c');
  });
  it('strips diacritics', () => {
    expect(slug('Café résumé')).toBe('cafe-resume');
  });
  it('falls back to "page" when empty', () => {
    expect(slug('')).toBe('page');
    expect(slug(null)).toBe('page');
  });
  it('caps at 60 chars', () => {
    const out = slug('a'.repeat(120));
    expect(out.length).toBe(60);
  });
  it('falls back when only non-latin chars', () => {
    expect(slug('日本語')).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- slug
```
Expected: FAIL — `slug is not a function` / module not found.

- [ ] **Step 3: Implement `src/utils/slug.js`**

```js
export function slug(title) {
  const s = String(title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'page';
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- slug
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/slug.js src/utils/slug.test.js
git commit -m "feat(utils): add slug helper"
```

---

## Task 3: `truncate` Utility (TDD)

**Files:**
- Create: `src/utils/truncate.js`
- Test: `src/utils/truncate.test.js`

**Interfaces:**
- Produces: `truncate(text: string, maxChars: number): string` — returns text unchanged if within limit; otherwise slices to `maxChars` and **appends** `"\n\n[truncated]"`.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/truncate.test.js
import { describe, it, expect } from 'vitest';
import { truncate } from './truncate.js';

describe('truncate', () => {
  it('returns short text unchanged', () => {
    expect(truncate('hello', 100)).toBe('hello');
  });
  it('returns exact-length text unchanged', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
  it('slices and appends marker when over', () => {
    expect(truncate('hello world', 5)).toBe('hello\n\n[truncated]');
  });
  it('handles null/undefined', () => {
    expect(truncate(null, 10)).toBe('');
    expect(truncate(undefined, 10)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- truncate
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/utils/truncate.js`**

```js
export function truncate(text, maxChars) {
  const t = String(text ?? '');
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[truncated]`;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- truncate
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/truncate.js src/utils/truncate.test.js
git commit -m "feat(utils): add truncate helper"
```

---

## Task 4: `stripNoise` + Turndown Config

**Files:**
- Create: `src/extractor/strip-noise.js`
- Test: `src/extractor/strip-noise.test.js`
- Create: `src/extractor/turndown-config.js` (no unit test — pure factory)

**Interfaces:**
- Produces: `stripNoise(html: string): string` — DOMParser-parses, removes `script style nav noscript svg iframe template header footer`, returns `body.innerHTML`.
- Produces: `buildTurndownService(): TurndownService` — ATX headings, fenced code, GFM plugin.

- [ ] **Step 1: Write the failing test for `stripNoise`**

```js
// src/extractor/strip-noise.test.js
import { describe, it, expect } from 'vitest';
import { stripNoise } from './strip-noise.js';

describe('stripNoise', () => {
  it('removes script and style tags', () => {
    const html = '<body><p>keep</p><script>alert(1)</script><style>.x{}</style></body>';
    expect(stripNoise(html)).toBe('<p>keep</p>');
  });
  it('removes nav, header, footer, svg, iframe, noscript, template', () => {
    const html = '<body><header>H</header><nav>N</nav><main><p>x</p></main><footer>F</footer></body>';
    expect(stripNoise(html)).toBe('<main><p>x</p></main>');
  });
  it('returns empty string for empty body', () => {
    expect(stripNoise('<body></body>')).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- strip-noise
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/extractor/strip-noise.js`**

```js
const NOISE_SELECTORS = [
  'script', 'style', 'nav', 'noscript', 'svg', 'iframe',
  'template', 'header', 'footer',
];

export function stripNoise(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const sel of NOISE_SELECTORS) {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return doc.body ? doc.body.innerHTML : '';
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- strip-noise
```
Expected: 3 passed.

- [ ] **Step 5: Write `src/extractor/turndown-config.js`**

```js
import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';

export function buildTurndownService() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
  });
  td.use(turndownPluginGfm.gfm);
  return td;
}
```

- [ ] **Step 6: Lint + full test**

```bash
npm run lint && npm test
```
Expected: 0 errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/extractor/strip-noise.js src/extractor/strip-noise.test.js src/extractor/turndown-config.js
git commit -m "feat(extractor): add stripNoise and turndown config"
```

---

## Task 5: `extractMarkdown` (TDD)

**Files:**
- Create: `src/extractor/extract.js`
- Test: `src/extractor/extract.test.js`
- Test fixture: `tests/fixtures/html/article.html`

**Interfaces:**
- Consumes: `stripNoise`, `buildTurndownService`, `truncate`.
- Produces: `extractMarkdown({ html, title, url, fallbackText?, maxChars? }) -> { title, url, markdown }`.
  - Cleans HTML via `stripNoise`, converts via Turndown.
  - If `md.trim().length < 50`, uses `fallbackText` instead.
  - Prepends `"# {title}\nSource: {url}\n\n"`, truncates total to `maxChars` (default 500000).

- [ ] **Step 1: Write fixture `tests/fixtures/html/article.html`**

```html
<!doctype html>
<html><head><title>Example Article</title></head>
<body>
<header>Site Nav</header>
<main>
  <h1>Hello World</h1>
  <p>This is a paragraph with a <a href="https://example.com">link</a>.</p>
  <ul><li>one</li><li>two</li></ul>
  <table><tr><td>a</td><td>b</td></tr></table>
</main>
<footer>Foot</footer>
<script>var x = 1;</script>
</body></html>
```

- [ ] **Step 2: Write the failing test**

```js
// src/extractor/extract.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractMarkdown } from './extract.js';

const article = readFileSync(new URL('../../tests/fixtures/html/article.html', import.meta.url), 'utf8');

describe('extractMarkdown', () => {
  it('produces markdown with title and source header', () => {
    const { title, url, markdown } = extractMarkdown({
      html: article, title: 'Example Article', url: 'https://ex.com/a',
    });
    expect(title).toBe('Example Article');
    expect(url).toBe('https://ex.com/a');
    expect(markdown).toContain('# Example Article');
    expect(markdown).toContain('Source: https://ex.com/a');
  });

  it('strips noise tags and converts body to markdown', () => {
    const { markdown } = extractMarkdown({
      html: article, title: 'T', url: 'u',
    });
    expect(markdown).toContain('Hello World');
    expect(markdown).not.toContain('Site Nav');
    expect(markdown).not.toContain('Foot');
    expect(markdown).not.toContain('var x');
    expect(markdown).toMatch(/one|two/);
  });

  it('falls back to fallbackText when markdown is tiny', () => {
    const { markdown } = extractMarkdown({
      html: '<body></body>', title: 'T', url: 'u', fallbackText: 'SPA rendered text',
    });
    expect(markdown).toContain('SPA rendered text');
  });

  it('truncates when output exceeds maxChars', () => {
    const long = '<body><p>' + 'a'.repeat(1000) + '</p></body>';
    const { markdown } = extractMarkdown({
      html: long, title: 'T', url: 'u', maxChars: 100,
    });
    expect(markdown.length).toBeLessThanOrEqual(100 + '\n\n[truncated]'.length);
    expect(markdown).toContain('[truncated]');
  });

  it('defaults title to "page" when empty', () => {
    const { title } = extractMarkdown({ html: article, title: '', url: 'u' });
    expect(title).toBe('page');
  });
});
```

- [ ] **Step 3: Run to verify fail**

```bash
npm test -- extract
```
Expected: FAIL.

- [ ] **Step 4: Implement `src/extractor/extract.js`**

```js
import { stripNoise } from './strip-noise.js';
import { buildTurndownService } from './turndown-config.js';
import { truncate } from '../utils/truncate.js';

const MIN_MEANINGFUL_MD = 50;
const DEFAULT_MAX_CHARS = 500000;

export function extractMarkdown({ html, title, url, fallbackText = '', maxChars = DEFAULT_MAX_CHARS }) {
  const cleanTitle = (title && title.trim()) || 'page';
  let md = '';
  try {
    md = buildTurndownService().turndown(stripNoise(html));
  } catch {
    md = '';
  }
  if (!md || md.trim().length < MIN_MEANINGFUL_MD) {
    md = fallbackText || '';
  }
  const header = `# ${cleanTitle}\nSource: ${url || ''}\n\n`;
  return {
    title: cleanTitle,
    url: url || '',
    markdown: truncate(header + md, maxChars),
  };
}
```

- [ ] **Step 5: Run to verify pass**

```bash
npm test -- extract
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/extractor/extract.js src/extractor/extract.test.js tests/fixtures/html/article.html
git commit -m "feat(extractor): add extractMarkdown with SPA fallback and truncation"
```

---

## Task 6: `waitForSelector` (TDD)

**Files:**
- Create: `src/utils/selectors.js`
- Test: `src/utils/selectors.test.js`

**Interfaces:**
- Produces: `async function waitForSelector(selectors: string[], { timeout=8000, root=document, interval=100 }) -> Promise<Element>` — walks the array on each tick, returns first match. Rejects with `Error('selector not found')` after `timeout`ms.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/selectors.test.js
import { describe, it, expect, vi } from 'vitest';
import { waitForSelector } from './selectors.js';

describe('waitForSelector', () => {
  it('resolves immediately when selector matches', async () => {
    document.body.innerHTML = '<input type="file" id="f">';
    const el = await waitForSelector(['input[type="file"]'], { timeout: 500 });
    expect(el.id).toBe('f');
  });

  it('tries selectors in order, returns first match', async () => {
    document.body.innerHTML = '<input accept="pdf" id="alt">';
    const el = await waitForSelector(['input[type="file"]', 'input[accept="pdf"]'], { timeout: 500 });
    expect(el.id).toBe('alt');
  });

  it('rejects when no selector matches before timeout', async () => {
    document.body.innerHTML = '<div>nothing</div>';
    await expect(waitForSelector(['input[type="file"]'], { timeout: 200, interval: 50 }))
      .rejects.toThrow('selector not found');
  });

  it('finds element added after a delay', async () => {
    document.body.innerHTML = '';
    setTimeout(() => {
      document.body.innerHTML = '<input type="file" id="late">';
    }, 80);
    const el = await waitForSelector(['input[type="file"]'], { timeout: 500, interval: 30 });
    expect(el.id).toBe('late');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- selectors
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/utils/selectors.js`**

```js
export function waitForSelector(selectors, { timeout = 8000, root = document, interval = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el) return resolve(el);
      }
      if (Date.now() - start >= timeout) {
        return reject(new Error('selector not found'));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- selectors
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/selectors.js src/utils/selectors.test.js
git commit -m "feat(utils): add waitForSelector walker"
```

---

## Task 7: Retry File Builder + Attach Helpers

**Files:**
- Create: `src/injector/retry.js`
- Test: `src/injector/retry.test.js`
- Create: `src/injector/attach.js` (integration — no unit test, jsdom cannot stub `DataTransfer.items.add` + `input.files` setter)

**Interfaces:**
- Produces: `buildTxtRetryFile(file: File) -> File` — returns a new `File` with same content, name suffixed `.txt`, type `text/plain`.
- Produces: `attachFileToInput(input: HTMLInputElement, file: File) -> void` — uses `DataTransfer` to set `input.files` and dispatches a bubbling `change` event.

- [ ] **Step 1: Write the failing test for `buildTxtRetryFile`**

```js
// src/injector/retry.test.js
import { describe, it, expect } from 'vitest';
import { buildTxtRetryFile } from './retry.js';

describe('buildTxtRetryFile', () => {
  it('renames .md to .txt with text/plain type', () => {
    const original = new File(['# hi'], 'page.md', { type: 'text/markdown' });
    const retry = buildTxtRetryFile(original);
    expect(retry.name).toBe('page.txt');
    expect(retry.type).toBe('text/plain');
    return retry.text().then((t) => expect(t).toBe('# hi'));
  });

  it('appends .txt if name has no recognized extension', () => {
    const original = new File(['x'], 'page', { type: 'text/markdown' });
    expect(buildTxtRetryFile(original).name).toBe('page.txt');
  });

  it('preserves base name for .pdf', () => {
    const original = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    expect(buildTxtRetryFile(original).name).toBe('doc.txt');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- retry
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/injector/retry.js`**

```js
export function buildTxtRetryFile(file) {
  const base = file.name.replace(/\.(md|markdown|pdf|html|htm)$/i, '');
  return new File([file], `${base}.txt`, { type: 'text/plain' });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- retry
```
Expected: 3 passed.

- [ ] **Step 5: Write `src/injector/attach.js`** (integration — documented, verified manually in Task 11)

```js
export function attachFileToInput(input, file) {
  if (!input) throw new Error('attachFileToInput: input is null');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

- [ ] **Step 6: Commit**

```bash
git add src/injector/retry.js src/injector/retry.test.js src/injector/attach.js
git commit -m "feat(injector): add retry file builder and attach integration"
```

---

## Task 8: Status Reducer (TDD)

**Files:**
- Create: `src/status/reducer.js`
- Test: `src/status/reducer.test.js`

**Interfaces:**
- Produces: `statusReducer(state, event) -> state`. States: `IDLE | EXTRACTING | UPLOADING | ATTACHED | FALLBACK_CLIPBOARD | ERROR`. Events: `{ type: 'START_EXTRACT' }`, `{ type: 'EXTRACT_DONE' }`, `{ type: 'ATTACHED' }`, `{ type: 'FALLBACK' }`, `{ type: 'ERROR', message }`, `{ type: 'RESET' }`.

- [ ] **Step 1: Write the failing test**

```js
// src/status/reducer.test.js
import { describe, it, expect } from 'vitest';
import { statusReducer, INITIAL_STATUS } from './reducer.js';

describe('statusReducer', () => {
  it('starts IDLE', () => {
    expect(INITIAL_STATUS.state).toBe('IDLE');
  });
  it('IDLE → EXTRACTING on START_EXTRACT', () => {
    expect(statusReducer(INITIAL_STATUS, { type: 'START_EXTRACT' }).state).toBe('EXTRACTING');
  });
  it('EXTRACTING → UPLOADING on EXTRACT_DONE', () => {
    const s = { state: 'EXTRACTING' };
    expect(statusReducer(s, { type: 'EXTRACT_DONE' }).state).toBe('UPLOADING');
  });
  it('UPLOADING → ATTACHED on ATTACHED', () => {
    expect(statusReducer({ state: 'UPLOADING' }, { type: 'ATTACHED' }).state).toBe('ATTACHED');
  });
  it('any → FALLBACK_CLIPBOARD on FALLBACK', () => {
    expect(statusReducer({ state: 'UPLOADING' }, { type: 'FALLBACK' }).state).toBe('FALLBACK_CLIPBOARD');
  });
  it('any → ERROR with message', () => {
    const s = statusReducer({ state: 'UPLOADING' }, { type: 'ERROR', message: 'boom' });
    expect(s.state).toBe('ERROR');
    expect(s.message).toBe('boom');
  });
  it('any → IDLE on RESET', () => {
    expect(statusReducer({ state: 'ERROR', message: 'x' }, { type: 'RESET' })).toEqual(INITIAL_STATUS);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
npm test -- reducer
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/status/reducer.js`**

```js
export const INITIAL_STATUS = Object.freeze({ state: 'IDLE', message: '' });

export function statusReducer(_state, event) {
  switch (event.type) {
    case 'START_EXTRACT':    return { state: 'EXTRACTING', message: '' };
    case 'EXTRACT_DONE':     return { state: 'UPLOADING', message: '' };
    case 'ATTACHED':         return { state: 'ATTACHED', message: '' };
    case 'FALLBACK':         return { state: 'FALLBACK_CLIPBOARD', message: 'Auto-attach failed. Press ⌘V in Gemini.' };
    case 'ERROR':            return { state: 'ERROR', message: event.message || 'Unknown error' };
    case 'RESET':            return { ...INITIAL_STATUS };
    default:                 return _state;
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- reducer
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/status/reducer.js src/status/reducer.test.js
git commit -m "feat(status): add sidebar status state machine"
```

---

## Task 9: Manifest + DNR Rule

**Files:**
- Create: `manifest.json`
- Create: `rules/remove_headers.json`
- Create: `icons/icon-16.png`, `icon-48.png`, `icon-128.png` (placeholder PNGs — any small valid PNG)

**Interfaces:** None (static config). Loads as `dist/manifest.json` after build.

- [ ] **Step 1: Write `manifest.json`**

```json
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
  "host_permissions": ["https://gemini.google.com/*"],
  "action": {
    "default_title": "Open Gemini Sidebar",
    "default_icon": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
  },
  "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
  "side_panel": { "default_path": "sidebar/sidebar.html" },
  "sidebar_action": { "default_panel": "sidebar/sidebar.html", "default_title": "Gemini" },
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
    "rule_resources": [
      { "id": "strip_gemini_framing_headers", "enabled": true, "path": "rules/remove_headers.json" }
    ]
  },
  "options_ui": { "page": "options/options.html" },
  "commands": {
    "_execute_action": { "suggested_key": { "default": "Ctrl+Shift+G", "mac": "Command+Shift+G" } }
  },
  "browser_specific_settings": {
    "gecko": { "id": "gemini-sidebar@local", "strict_min_version": "128.0" }
  }
}
```

- [ ] **Step 2: Write `rules/remove_headers.json`**

```json
[
  {
    "id": 1,
    "priority": 1,
    "action": {
      "type": "modifyHeaders",
      "responseHeaders": [
        { "header": "X-Frame-Options", "operation": "remove" },
        { "header": "Content-Security-Policy", "operation": "remove" },
        { "header": "Frame-Options", "operation": "remove" }
      ]
    },
    "condition": {
      "urlFilter": "||gemini.google.com",
      "resourceTypes": ["main_frame", "sub_frame"]
    }
  }
]
```

- [ ] **Step 3: Add placeholder icons**

Generate three solid-color PNGs (any tool, e.g. ImageMagick):
```bash
magick -size 16x16 xc:#4285F4 icons/icon-16.png
magick -size 48x48 xc:#4285F4 icons/icon-48.png
magick -size 128x128 xc:#4285F4 icons/icon-128.png
```
If ImageMagick unavailable, copy any small valid PNG to each path.

- [ ] **Step 4: Lint manifest (after Task 14 build exists, but verify JSON now)**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"
node -e "JSON.parse(require('fs').readFileSync('rules/remove_headers.json','utf8')); console.log('rules OK')"
```
Expected: both print OK.

- [ ] **Step 5: Commit**

```bash
git add manifest.json rules/remove_headers.json icons/
git commit -m "feat(manifest): add MV3 manifest, DNR rule, placeholder icons"
```

---

## Task 10: Background Service Worker

**Files:**
- Create: `background/sw.js`

**Interfaces:**
- Consumes: `webextension-polyfill`, `extractMarkdown` (indirectly — the extractor entry imports it).
- Produces: handles `browser.action.onClicked` → opens sidebar, injects extractor, relays result to injector. Handles `runtime.onMessage` for `EXTRACT_RESULT` and `ATTACH_ACK`.

- [ ] **Step 1: Write `background/sw.js`**

```js
import browser from 'webextension-polyfill';

const EXTRACT_TIMEOUT_MS = 10000;
let activeSession = null;

async function openSidebar(tabId) {
  if (browser.sidePanel && browser.sidePanel.open) {
    await browser.sidePanel.open({ tabId, windowId: (await browser.tabs.get(tabId)).windowId });
  } else if (browser.sidebarAction && browser.sidebarAction.open) {
    await browser.sidebarAction.open();
  } else {
    throw new Error('No sidebar API available');
  }
}

async function runExtraction(tabId) {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    files: ['content/extractor.bundle.js'],
  });
  // Extractor entry sends a message; but executeScript with files returns [] on some browsers.
  // We rely on the entry messaging us back via EXTRACT_RESULT. See listener below.
  return results;
}

async function onActionClicked(tab) {
  if (activeSession) return;           // debounce (1 s effective via in-flight flag)
  activeSession = { tabId: tab.id };
  try {
    await openSidebar(tab.id);
    // Wait briefly for sidebar + injector to be ready; injector pings when loaded.
    await waitForInjectorReady(EXTRACT_TIMEOUT_MS);
    await runExtraction(tab.id);
    // Extraction result arrives async via EXTRACT_RESULT message.
  } catch (err) {
    activeSession = null;
    console.error('[gemini-sidebar] action failed:', err);
  }
}

let injectorReadyResolver = null;
function waitForInjectorReady(timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('injector not ready')), timeout);
    injectorReadyResolver = () => { clearTimeout(timer); resolve(); };
  });
}

async function buildFileFromResult(result) {
  const { slug } = await import('../src/utils/slug.js');
  const filename = `${slug(result.title)}.md`;
  return new File([result.markdown], filename, { type: 'text/markdown' });
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  switch (msg.type) {
    case 'INJECTOR_READY':
      if (injectorReadyResolver) injectorReadyResolver();
      return;
    case 'EXTRACT_RESULT': {
      const file = await buildFileFromResult(msg.result);
      await browser.runtime.sendMessage({ type: 'ATTACH_FILE', file }).catch(() => {});
      activeSession = null;
      return;
    }
    case 'ATTACH_ACK':
      activeSession = null;
      return;
  }
});

browser.action.onClicked.addListener(onActionClicked);
```

> Note: `File` construction in an MV3 service worker is supported (workers support `File`/`Blob`). Dynamic `import()` of `src/utils/slug.js` is resolved at build time by esbuild; if bundling complains, move the `slug` import to the top-level static import. Verify during Task 14 build.

- [ ] **Step 2: Manual verification (deferred to Task 14 + MANUAL.md)** — cannot unit-test service worker. Note in MANUAL.md.

- [ ] **Step 3: Commit**

```bash
git add background/sw.js
git commit -m "feat(background): action handler, sidebar opener, msg orchestrator"
```

---

## Task 11: Extractor Entry

**Files:**
- Create: `content/extractor.entry.js`

**Interfaces:**
- Consumes: `extractMarkdown`.
- Produces: an IIFE that reads the live document, calls `extractMarkdown`, and `runtime.sendMessage({ type: 'EXTRACT_RESULT', result })`.

- [ ] **Step 1: Write `content/extractor.entry.js`**

```js
import browser from 'webextension-polyfill';
import { extractMarkdown } from '../src/extractor/extract.js';

(async () => {
  try {
    const result = extractMarkdown({
      html: document.documentElement.outerHTML,
      title: document.title,
      url: location.href,
      fallbackText: (document.body && document.body.innerText) || '',
    });
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', result });
  } catch (err) {
    await browser.runtime.sendMessage({ type: 'EXTRACT_RESULT', error: String(err && err.message || err) });
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/extractor.entry.js
git commit -m "feat(content): extractor entry point"
```

---

## Task 12: Gemini Injector Entry

**Files:**
- Create: `content/gemini-injector.entry.js`

**Interfaces:**
- Consumes: `waitForSelector`, `attachFileToInput`, `buildTxtRetryFile`.
- Produces: a resident content script that announces `INJECTOR_READY`, listens for `ATTACH_FILE`, runs the fallback ladder (attach `.md` → retry `.txt` → clipboard fallback), and acks with `ATTACH_ACK`.

- [ ] **Step 1: Write `content/gemini-injector.entry.js`**

```js
import browser from 'webextension-polyfill';
import { waitForSelector } from '../src/utils/selectors.js';
import { attachFileToInput } from '../src/injector/attach.js';
import { buildTxtRetryFile } from '../src/injector/retry.js';

const SELECTORS = {
  fileInput: [
    'input[type="file"]',
    'input[accept*="pdf"]',
    'rich-textarea input[type="file"]',
  ],
  promptFocus: 'rich-textarea div[contenteditable="true"]',
};

const ATTACH_TIMEOUT_MS = 8000;

async function tryAttach(file) {
  const input = await waitForSelector(SELECTORS.fileInput, { timeout: ATTACH_TIMEOUT_MS });
  attachFileToInput(input, file);
  return input;
}

async function focusPrompt() {
  try {
    const el = await waitForSelector([SELECTORS.promptFocus], { timeout: 2000 });
    el.focus();
    el.click();
  } catch {
    /* best-effort */
  }
}

async function handleAttach(msg) {
  const file = msg.file;
  try {
    await tryAttach(file);
    ack(true);
  } catch (primaryErr) {
    try {
      await tryAttach(buildTxtRetryFile(file));
      ack(true);
    } catch (retryErr) {
      await clipboardFallback(file);
      ack(false, retryErr.message);
    }
  }
}

async function clipboardFallback(file) {
  try {
    const text = await file.text();
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may require user gesture; status will guide user */
  }
  await focusPrompt();
}

function ack(ok, message) {
  browser.runtime.sendMessage({ type: 'ATTACH_ACK', ok, message }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ATTACH_FILE') return handleAttach(msg);
});
browser.runtime.sendMessage({ type: 'INJECTOR_READY' }).catch(() => {});
```

- [ ] **Step 2: Commit**

```bash
git add content/gemini-injector.entry.js
git commit -m "feat(content): gemini injector with fallback ladder"
```

---

## Task 13: Sidebar UI

**Files:**
- Create: `sidebar/sidebar.html`, `sidebar/sidebar.css`, `sidebar/sidebar.entry.js`

**Interfaces:**
- Consumes: `statusReducer`, `INITIAL_STATUS`.
- Produces: extension page with status strip, Gemini iframe, and a hidden PDF `<input type=file>`.

- [ ] **Step 1: Write `sidebar/sidebar.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="sidebar.css" />
</head>
<body>
  <div id="status" class="status idle">Ready</div>
  <div class="toolbar">
    <button id="attach-pdf" type="button">+ Attach PDF</button>
    <input id="pdf-input" type="file" accept=".pdf,application/pdf" hidden />
  </div>
  <iframe id="gemini" src="https://gemini.google.com/app" allow="clipboard-read; clipboard-write"></iframe>
  <script src="sidebar.bundle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `sidebar/sidebar.css`**

```css
html, body { margin: 0; height: 100vh; display: flex; flex-direction: column; font: 12px system-ui, sans-serif; }
.status { padding: 4px 8px; background: #eee; }
.status.busy { background: #fff3cd; }
.status.ok { background: #d4edda; }
.status.error { background: #f8d7da; }
.toolbar { padding: 4px 8px; border-bottom: 1px solid #ddd; }
#attach-pdf { font: inherit; padding: 2px 8px; cursor: pointer; }
iframe#gemini { flex: 1; border: none; }
```

- [ ] **Step 3: Write `sidebar/sidebar.entry.js`**

```js
import browser from 'webextension-polyfill';
import { statusReducer, INITIAL_STATUS } from '../src/status/reducer.js';

const statusEl = document.getElementById('status');
const pdfInput = document.getElementById('pdf-input');
const attachPdfBtn = document.getElementById('attach-pdf');

let status = INITIAL_STATUS;

function setStatus(event) {
  status = statusReducer(status, event);
  statusEl.textContent = status.message || labelFor(status.state);
  statusEl.className = `status ${classNameFor(status.state)}`;
}

function labelFor(state) {
  return {
    IDLE: 'Ready',
    EXTRACTING: 'Extracting page…',
    UPLOADING: 'Uploading to Gemini…',
    ATTACHED: 'Attached ✓',
    FALLBACK_CLIPBOARD: 'Auto-attach failed. Press ⌘V in Gemini.',
    ERROR: `Error: ${status.message}`,
  }[state] || state;
}

function classNameFor(state) {
  return { IDLE: 'idle', EXTRACTING: 'busy', UPLOADING: 'busy', ATTACHED: 'ok',
           FALLBACK_CLIPBOARD: 'error', ERROR: 'error' }[state] || 'idle';
}

attachPdfBtn.addEventListener('click', () => pdfInput.click());
pdfInput.addEventListener('change', () => {
  const file = pdfInput.files && pdfInput.files[0];
  if (!file) return;
  setStatus({ type: 'START_EXTRACT' });
  browser.runtime.sendMessage({ type: 'ATTACH_FILE', file }).catch(() => {});
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ATTACH_ACK') {
    setStatus(msg.ok ? { type: 'ATTACHED' } : { type: 'FALLBACK' });
  }
});

setStatus({ type: 'RESET' });
```

- [ ] **Step 4: Commit**

```bash
git add sidebar/sidebar.html sidebar/sidebar.css sidebar/sidebar.entry.js
git commit -m "feat(sidebar): status strip, PDF attach button, Gemini iframe"
```

---

## Task 14: Options Page + Build Pipeline

**Files:**
- Create: `options/options.html`, `options/options.entry.js`
- Update `package.json` scripts if needed (already in Task 1).

**Interfaces:**
- Produces: options page persisting `{ autoAttach: bool, maxChars: number, preferFileType: 'md'|'txt' }` to `storage.local`.
- Produces: working `npm run build` producing `dist/`.

- [ ] **Step 1: Write `options/options.html`**

```html
<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Gemini Sidebar Options</title></head>
<body style="font: 14px system-ui; padding: 16px">
  <h2>Options</h2>
  <label><input type="checkbox" id="auto-attach" /> Auto-attach on sidebar open</label><br /><br />
  <label>Max chars: <input type="number" id="max-chars" min="1000" step="1000" /></label><br /><br />
  <label>Preferred file type:
    <select id="file-type"><option value="md">.md</option><option value="txt">.txt</option></select>
  </label><br /><br />
  <button id="save">Save</button>
  <div id="saved" style="color:green"></div>
  <script src="options.bundle.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `options/options.entry.js`**

```js
import browser from 'webextension-polyfill';

const DEFAULTS = { autoAttach: true, maxChars: 500000, preferFileType: 'md' };

const el = {
  auto: document.getElementById('auto-attach'),
  max: document.getElementById('max-chars'),
  type: document.getElementById('file-type'),
  save: document.getElementById('save'),
  saved: document.getElementById('saved'),
};

(async () => {
  const prefs = { ...DEFAULTS, ...(await browser.storage.local.get('prefs')).prefs };
  el.auto.checked = !!prefs.autoAttach;
  el.max.value = prefs.maxChars;
  el.type.value = prefs.preferFileType;
})();

el.save.addEventListener('click', async () => {
  const prefs = {
    autoAttach: el.auto.checked,
    maxChars: Number(el.max.value) || DEFAULTS.maxChars,
    preferFileType: el.type.value,
  };
  await browser.storage.local.set({ prefs });
  el.saved.textContent = 'Saved.';
  setTimeout(() => (el.saved.textContent = ''), 1500);
});
```

- [ ] **Step 3: Run the build**

```bash
npm run build
```
Expected: `dist/` populated with bundled JS, copied manifest, rules, html, css, icons. Prints `Build complete → dist/`.

- [ ] **Step 4: Lint the extension package**

```bash
npm run lint:ext
```
Expected: `web-ext lint` passes with no errors. (Warnings about `side_panel` being Chrome-only or `sidebar_action` being Firefox-only are acceptable — each browser ignores the other's key.)

- [ ] **Step 5: Run full test suite**

```bash
npm test && npm run lint
```
Expected: all unit tests pass; eslint clean.

- [ ] **Step 6: Commit**

```bash
git add options/options.html options/options.entry.js
git commit -m "feat(options): add options page and prefs persistence"
```

---

## Task 15: Manual Test Matrix + README

**Files:**
- Create: `tests/MANUAL.md`, `README.md`

- [ ] **Step 1: Write `tests/MANUAL.md`**

```markdown
# Manual Test Matrix — Gemini Sidebar

Run for **both Chrome and Firefox** before each release. Load `dist/` as unpacked extension
(Chrome: chrome://extensions → Developer mode → Load unpacked. Firefox: about:debugging →
This Firefox → Load Temporary Add-on → select dist/manifest.json).

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
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Gemini Sidebar

Open Google Gemini's webchat in a browser sidebar and attach the current page (as Markdown)
or a PDF as conversation context — no API key required. Uses your existing Gemini login.

Chrome + Firefox. Manifest V3.

## Install (developer / sideload)

1. `npm install && npm run build`
2. **Chrome:** `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist/`.
3. **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/manifest.json`.
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
- `npm test` — vitest unit tests
- `npm run lint` — eslint
- `npm run build` — bundle to `dist/`
- `npm run lint:ext` — web-ext manifest validation
```

- [ ] **Step 3: Final commit**

```bash
git add tests/MANUAL.md README.md
git commit -m "docs: add manual test matrix and README"
```

---

## Self-Review

### Spec coverage

| Spec section | Implemented by |
|---|---|
| §1 Goal | All tasks |
| §2 Feasibility — DNR iframe strip | Task 9 (DNR rule) |
| §3 Architecture — two content scripts | Task 11, Task 12 |
| §3 Architecture — background orchestrator | Task 10 |
| §3 Architecture — sidebar iframe | Task 13 |
| §4 Components | Task 1 file tree + per-task files |
| §5 Manifest + permissions | Task 9 |
| §6 Flow A (page) | Tasks 5, 10, 11, 12 |
| §6 Flow B (PDF) | Task 13 (PDF input) → Task 12 (injector) |
| §7 Extraction libraries | Tasks 4, 5 |
| §8 Fallback ladder | Task 12 (`.md`→`.txt`→clipboard) |
| §8 Selector resilience | Task 6 (`waitForSelector`) + Task 12 (`SELECTORS` array) |
| §8 Status state machine | Task 8 + Task 13 |
| §9 Edge cases | Task 10 (debounce), Task 11 (extract try/catch), Task 13 (status messages), MANUAL.md |
| §10 Testing | Tasks 2–8 (unit), Task 15 (manual matrix) |
| §11 Scope (YAGNI) | Reflected by absence — no history, no multi-provider, no telemetry tasks |
| §12 Risks | Task 12 fallback mitigates selector-break risk; clipboard fallback in MANUAL |
| §13 Open Qs | Deferred (resolved during live MANUAL run): selector discovery, MAX_CHARS verification, entry URL |

### Placeholder scan
No `TBD`/`TODO`/`add appropriate`/`similar to`/`fill in`. Every code step contains real code. Selector strings are concrete candidates with a documented live-discovery process (§13 + MANUAL).

### Type/name consistency
- `extractMarkdown` signature consistent across Task 5, Task 11.
- `waitForSelector(selectors, {timeout, root, interval})` consistent across Task 6, Task 12.
- `attachFileToInput(input, file)` consistent across Task 7, Task 12.
- `buildTxtRetryFile(file)` consistent across Task 7, Task 12.
- `statusReducer(state, event)` + `INITIAL_STATUS` consistent across Task 8, Task 13.
- `slug(title)` consistent across Task 2, Task 10.
- `truncate(text, maxChars)` consistent across Task 3, Task 5.
- Message types: `INJECTOR_READY`, `EXTRACT_RESULT`, `ATTACH_FILE`, `ATTACH_ACK` — consistent across Tasks 10, 11, 12, 13.

No mismatches found.

### Notes carried into plan
1. **Truncation marker appended** (spec §9 said "prepend" — append reads better after the title/source header; surfaced here so implementer doesn't deviate).
2. **`attachFileToInput` not unit-tested** — jsdom does not implement `DataTransfer.items.add` or `HTMLInputElement.files` setter. Pure logic (`buildTxtRetryFile`, `waitForSelector`) is tested; the integration call is covered by MANUAL.md.
3. **`slug` import in service worker** — dynamic `import()` flagged; if esbuild rejects it, switch to top-level static import (noted in Task 10).
4. **Live selector discovery** — `SELECTORS.fileInput[0]` is the most likely primary hit but must be confirmed by inspecting live Gemini DOM during first MANUAL run; updating it is a one-line change with clipboard fallback as the safety net.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-04-gemini-sidebar.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — execute tasks in this session, batched with checkpoints.

Which approach?
