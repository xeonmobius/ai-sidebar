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
