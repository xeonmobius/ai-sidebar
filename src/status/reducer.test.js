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
