import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMarkdown } from './extract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const article = readFileSync(resolve(__dirname, '../../tests/fixtures/html/article.html'), 'utf8');

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
