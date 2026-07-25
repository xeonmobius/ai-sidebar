import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupCopyWebsite } from './copy-website.js';

function createMockEnv() {
  const messageListeners = [];
  const activeTab = { id: 42, url: 'https://example.com/page' };

  const browser = {
    tabs: {
      query: vi.fn().mockResolvedValue([activeTab]),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  };

  const chrome = {};
  return { browser, chrome, messageListeners, activeTab };
}

describe('setupCopyWebsite', () => {
  let env;
  beforeEach(() => { env = createMockEnv(); });

  it('injects extractor on EXTRACT_PAGE message', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(env.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content/extractor.bundle.js'],
      world: 'ISOLATED',
    });
  });

  it('forwards EXTRACT_RESULT to sidebar', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    const result = { title: 'Test', markdown: '# Test\ncontent', url: 'https://example.com' };
    await handler({ type: 'EXTRACT_RESULT', result });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', result });
  });

  it('forwards EXTRACT_RESULT errors', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_RESULT', error: 'boom' });

    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'boom' });
  });

  it('ignores unrelated messages', async () => {
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'SOMETHING_ELSE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('skips extraction on chrome:// URLs', async () => {
    env.browser.tabs.query = vi.fn().mockResolvedValue([{ id: 42, url: 'chrome://newtab/' }]);
    setupCopyWebsite(env.browser, env.chrome);
    const handler = env.messageListeners[0];

    await handler({ type: 'EXTRACT_PAGE' });

    expect(env.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(env.browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT_RESULT', error: 'Cannot extract from this page' });
  });
});
