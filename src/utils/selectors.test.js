import { describe, it, expect } from 'vitest';
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
