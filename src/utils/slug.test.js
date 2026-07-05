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
