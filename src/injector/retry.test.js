import { describe, it, expect } from 'vitest';
import { buildTxtRetryFile } from './retry.js';

describe('buildTxtRetryFile', () => {
  it('renames .md to .txt with text/plain type', () => {
    const original = new File(['# hi'], 'page.md', { type: 'text/markdown' });
    const retry = buildTxtRetryFile(original);
    expect(retry.name).toBe('page.txt');
    expect(retry.type).toBe('text/plain');
    expect(retry.size).toBe(original.size);
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
